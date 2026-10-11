async (page) => {
  const worker = page.context().serviceWorkers().find(worker => worker.url().endsWith('/background.js'));
  if (!worker) throw new Error('扩展后台未加载');
  const version = await worker.evaluate(() => chrome.runtime.getManifest().version);
  const native = await worker.evaluate(async () => {
    const isNative = Function.prototype.toString.call(fetch).includes('[native code]');
    try { await ({ fetcher: fetch }).fetcher('data:application/json,%7B%7D'); return { isNative, oldCallFails: false }; }
    catch (error) { return { isNative, oldCallFails: /Illegal invocation/.test(error.message) }; }
  });
  const calls = [];
  // 只替换网络响应，保留扩展后台的原生 fetch。
  await page.context().route('https://app.bilibili.com/x/v2/space?**', async route => {
    const uid = route.request().url().match(/[?&]vmid=(\d+)(?:&|$)/)?.[1];
    calls.push(uid);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data: { card: {
      mid: uid, space_tag: [{ type: 'location', title: 'IP属地：河南' }],
    } } }) });
  });
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ profileAuth: { accessToken: 'fixture-native-fetch-token', ownerUid: '999', expiresAt: Date.now()+3600000 } });
    await chrome.storage.session.remove('profileCache');
    await chrome.storage.sync.set({ commentsEnabled: true, profilesEnabled: true });
  });
  try {
    await page.route('https://space.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: __FIXTURE_HTML__ }));
    await page.goto('https://space.bilibili.com/987');
    const labels = page.locator('[data-bili-ip-region-profile]');
    await labels.filter({ hasText: '河南' }).waitFor({ timeout: 12000 });
    const checks = { nativeWorkerFetchUsed: native.isNative, oldInvocationReproduced: native.oldCallFails,
      fixedNativeFetchDisplaysTargetRegion: calls.length === 1 && calls[0] === '987' && await labels.getAttribute('data-profile-uid') === '987' };
    const report = { version, source: 'isolated Chromium; native Worker fetch retained; network response fulfilled with synthetic profile data', testedAt: new Date().toISOString(), checks, allPassed: Object.values(checks).every(Boolean), realAppAuthorizationVerified: false };
    if (!report.allPassed) throw new Error(JSON.stringify(report));
    return report;
  } finally {
    await worker.evaluate(async () => { await chrome.storage.local.remove('profileAuth'); await chrome.storage.session.remove('profileCache'); });
    await page.context().unroute('https://app.bilibili.com/x/v2/space?**');
    await page.context().clearCookies({ name: 'bili_jct', domain: 'space.bilibili.com' });
  }
}
