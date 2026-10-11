async (page) => {
  const worker = page.context().serviceWorkers().find(worker => worker.url().endsWith('/background.js'));
  if (!worker) throw new Error('扩展后台未加载');
  const popupUrl = worker.url().replace(/\/background\.js$/, '/popup.html');
  const extId = worker.url().split('/')[2];
  const version = await worker.evaluate(() => chrome.runtime.getManifest().version);
  for (const tab of page.context().pages()) if (tab !== page && tab.url() === popupUrl) await tab.close();
  await worker.evaluate(async () => {
    await chrome.storage.local.remove('profileAuth');
    await chrome.storage.session.remove('profileCache');
    await chrome.storage.sync.set({ commentsEnabled: true, profilesEnabled: true });
    self.fixtureProfileCalls = {};
    self.fixtureAuthSteps = [];
    chrome.permissions.contains = async () => true; // 仅在此独立测试浏览器中模拟权限。
    const originalFetch = self.fetch;
    self.fetch = async function (input, init) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      const url = new URL(String(input));
      if (url.pathname === '/x/web-interface/nav') return Response.json({ code: 0, data: { isLogin: true, mid: 999 } });
      if (url.hostname === 'passport.bilibili.com') {
        self.fixtureAuthSteps.push({ step: url.pathname.split('/').at(-1), credentials: init?.credentials });
        if (url.pathname.endsWith('/auth_code')) return Response.json({ code: 0, data: { auth_code: 'fixture-auth-code' } });
        if (url.pathname.endsWith('/confirm')) return Response.json({ code: 0, data: { gourl: 'unused' } });
        return Response.json({ code: 0, data: { mid: 999, access_token: 'fixture-only-access-token', expires_in: 3600 } });
      }
      if (url.hostname === 'app.bilibili.com' && url.pathname === '/x/v2/space') {
        const mid = url.searchParams.get('vmid');
        self.fixtureProfileCalls[mid] = (self.fixtureProfileCalls[mid] ?? 0) + 1;
        if (mid === '400') return Response.json({ code: -400 });
        if (mid === '800' && self.fixtureProfileCalls[mid] === 1) { await new Promise(resolve => setTimeout(resolve, 900)); return Response.json({ code: -101 }); }
        if (mid === '600') await new Promise(resolve => setTimeout(resolve, 900));
        const region = { '100': '河北', '200': '浙江', '600': '广东', '700': '上海' }[mid];
        return Response.json({ code: 0, data: { card: { mid: mid === '500' ? '888' : mid,
          space_tag: mid === '200' ? [] : region ? [{ type: 'location', title: 'IP属地：'+region }] : [],
          space_tag_bottom: mid === '200' ? [{ type: 'location', title: '浙江' }] : [],
        } } });
      }
      return originalFetch(input, init);
    };
  });
  await page.route('https://space.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: __FIXTURE_HTML__ }));
  await page.context().addCookies([
    { name: 'SESSDATA', value: 'fixture-web-session', domain: '.bilibili.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' },
    { name: 'bili_jct', value: '0'.repeat(32), domain: '.bilibili.com', path: '/', secure: true, sameSite: 'Lax' },
  ]);
  await page.goto('https://space.bilibili.com/100');
  const checks = {};
  const labels = page.locator('[data-bili-ip-region-profile]');
  const settings = await page.context().newPage();
  await settings.goto(popupUrl);
  await settings.locator('#profile-status').filter({ hasText: '尚未授权' }).waitFor();
  checks.noAuthorizationNoLabel = await labels.count() === 0;
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://space.bilibili.com/100' }))[0].id);
  await settings.evaluate(tabId => {
    chrome.permissions.request = async () => true; // 模拟用户已允许权限，不调用真实设备授权。
    chrome.tabs.query = async () => [{ id: tabId, url: 'https://space.bilibili.com/100' }];
  }, tabId);
  await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({ hasText: '已授权' }).waitFor();
  await labels.filter({ hasText: '河北' }).waitFor();
  checks.authorizationAndLegacyHeader = await labels.getAttribute('data-profile-uid') === '100';
  const steps = await worker.evaluate(() => self.fixtureAuthSteps);
  checks.authorizationSequence = steps.map(s => s.step).join(',') === 'auth_code,confirm,poll' && steps.every(step => step.credentials === 'omit');
  checks.noCredentialInDom = !(await page.content()).includes('fixture-only-access-token') && !(await settings.content()).includes('fixture-only-access-token');

  const cdp = await page.context().newCDPSession(page);
  const contexts = [];
  cdp.on('Runtime.executionContextCreated', event => contexts.push(event.context));
  await cdp.send('Runtime.enable');
  const contentContext = contexts.find(context => context.origin === `chrome-extension://${extId}` && context.auxData?.type === 'isolated');
  if (!contentContext) throw new Error('未找到扩展的 ISOLATED 评论/主页上下文');
  const access = await cdp.send('Runtime.evaluate', { contextId: contentContext.id, awaitPromise: true, returnByValue: true,
    expression: "chrome.storage.local.get('profileAuth').then(value=>({canRead:!!value.profileAuth})).catch(()=>({canRead:false}))" });
  checks.contentCannotReadCredential = access.result.value?.canRead === false;
  await cdp.detach();

  await page.evaluate(() => fixtureProfile.switch('200', true));
  await labels.filter({ hasText: '浙江' }).waitFor();
  checks.freshHeaderAndTargetUid = await labels.getAttribute('data-profile-uid') === '200' && await labels.count() === 1;
  await page.evaluate(() => { for (let i=0;i<10;i++) document.querySelector('#app').classList.toggle('refresh'); });
  checks.noDuplicates = await labels.count() === 1;
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  checks.theme = await labels.evaluate(label => {
    const style = getComputedStyle(label);
    return style.color === 'rgb(255, 255, 255)' && style.backgroundColor === 'rgb(97, 102, 109)' && style.borderRadius === '999px' && style.fontSize === '12px' && label.getBoundingClientRect().height === 18;
  });
  await settings.locator('#profiles-enabled').uncheck();
  await labels.waitFor({ state: 'detached' });
  checks.switchOff = true;
  await settings.locator('#profiles-enabled').check();
  await labels.filter({ hasText: '浙江' }).waitFor();
  checks.switchOn = true;
  await page.evaluate(() => fixtureProfile.switch('100'));
  await labels.filter({ hasText: '河北' }).waitFor();
  const calls = await worker.evaluate(() => self.fixtureProfileCalls);
  checks.cacheByTargetUid = calls['100'] === 1 && calls['200'] === 1;
  for (const mid of ['300','400','500']) {
    await page.evaluate(mid => fixtureProfile.switch(mid), mid);
    await labels.waitFor({ state: 'detached' });
    await worker.evaluate(async mid => {
      for (let i=0;i<60 && !self.fixtureProfileCalls[mid];i++) await new Promise(resolve => setTimeout(resolve, 50));
      if (!self.fixtureProfileCalls[mid]) throw new Error('查询没有触发');
    }, mid);
    checks[{ '300':'emptyRemoves','400':'requestFailureRemoves','500':'uidMismatchRemoves' }[mid]] = await labels.count() === 0;
  }
  await page.evaluate(() => fixtureProfile.switch('600'));
  await worker.evaluate(async () => { while (!self.fixtureProfileCalls['600']) await new Promise(resolve => setTimeout(resolve, 30)); });
  await page.evaluate(() => fixtureProfile.switch('700', true));
  await labels.filter({ hasText: '上海' }).waitFor();
  await worker.evaluate(() => new Promise(resolve => setTimeout(resolve, 1100)));
  checks.staleResponseDoesNotCrossAccounts = await labels.getAttribute('data-profile-uid') === '700' && (await labels.innerText()) === 'IP属地：上海';
  await page.evaluate(() => fixtureProfile.switch('800'));
  await worker.evaluate(async () => { while (!self.fixtureProfileCalls['800']) await new Promise(resolve => setTimeout(resolve, 30)); });
  await settings.locator('#profile-clear').click();
  await settings.locator('#profile-status').filter({ hasText: '尚未授权' }).waitFor();
  await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({ hasText: '已授权' }).waitFor();
  await page.evaluate(() => fixtureProfile.switch('700', true));
  await labels.filter({ hasText: '上海' }).waitFor();
  await worker.evaluate(() => new Promise(resolve => setTimeout(resolve, 1100)));
  checks.oldExpiredResponseDoesNotClearNewAuthorization = await settings.evaluate(async () =>
    (await chrome.runtime.sendMessage({ type: 'profile:status' })).auth.state === 'ready') && await labels.count() === 1;
  await settings.locator('#profile-clear').click();
  await settings.locator('#profile-status').filter({ hasText: '尚未授权' }).waitFor();
  await labels.waitFor({ state: 'detached' });
  checks.clearCredentialRemoves = true;
  await worker.evaluate(async () => { await chrome.storage.local.set({ profileAuth: { accessToken: 'fixture-only-access-token', ownerUid: '999', expiresAt: Date.now()-1 } }); });
  await settings.reload();
  await settings.locator('#profile-status').filter({ hasText: '已过期' }).waitFor();
  await page.reload();
  checks.expiredDoesNotDisplay = await labels.count() === 0;
  await settings.locator('#profile-clear').click();
  await settings.locator('#profile-status').filter({ hasText: '尚未授权' }).waitFor();
  await settings.setViewportSize({ width: 460, height: 850 });
  await settings.screenshot({ path: `outputs/主页设置-${version}.png`, fullPage: true });
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ profileAuth: { accessToken: 'fixture-only-access-token', ownerUid: '999', expiresAt: Date.now()+3600000 } });
    const tabs = await chrome.tabs.query({ url: 'https://space.bilibili.com/*' });
    await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'profile:state-changed' }, { frameId: 0 })));
  });
  await labels.filter({ hasText: '上海' }).waitFor();
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.screenshot({ path: `outputs/主页显示合成验证-${version}.png`, fullPage: true });
  await worker.evaluate(async () => { await chrome.storage.local.remove('profileAuth'); await chrome.storage.session.remove('profileCache'); });
  await page.context().clearCookies({ name: /^(SESSDATA|bili_jct)$/, domain: '.bilibili.com' });
  await settings.close();
  const report = { version, testedAt: new Date().toISOString(), source: 'isolated Chromium; actual unpacked extension; synthetic App/auth responses with receiver checks; no real device authorization',
    checks, allPassed: Object.values(checks).every(Boolean), realAppAuthorizationVerified: false };
  if (!report.allPassed) throw new Error(JSON.stringify(report));
  return report;
}
