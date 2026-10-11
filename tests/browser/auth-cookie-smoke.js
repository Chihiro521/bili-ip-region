async (page) => {
  const context = page.context();
  const worker = context.serviceWorkers().find(w => w.url().endsWith('/background.js'));
  if (!worker) throw Error('扩展后台未加载');
  const version = await worker.evaluate(() => chrome.runtime.getManifest().version);
  const popupUrl = worker.url().replace(/\/background\.js$/, '/popup.html');
  const checks = {};
  let mode = 'none', appCookieAbsent = false;
  const setMode = async value => { mode = value; await context.request.post('https://127.0.0.1:18443/__fixture/mode', { data: { mode: value }, ignoreHTTPSErrors: true }); };
  const resetCookie = async (sameSite = 'None') => context.addCookies([
    { name: 'SESSDATA', value: 'fixture-web-session', domain: '.bilibili.com', path: '/', secure: true, httpOnly: true, sameSite },
    { name: 'bili_jct', value: '0'.repeat(32), domain: '.bilibili.com', path: '/', secure: true, sameSite },
  ]);
  const noSessionRule = () => worker.evaluate(async () => !(await chrome.declarativeNetRequest.getSessionRules()).some(rule => rule.id === 3));
  const cookieIsOriginal = async () => (await context.cookies('https://space.bilibili.com/')).some(c => c.name === 'SESSDATA' && c.value === 'fixture-web-session');
  const cookieIsGone = async () => !(await context.cookies('https://space.bilibili.com/')).some(c => c.name === 'SESSDATA');
  const changedCookie = () => mode === 'overwrite'
    ? 'SESSDATA=fixture-replaced-session; Domain=.bilibili.com; Path=/; Secure; HttpOnly; SameSite=None'
    : 'SESSDATA=; Domain=.bilibili.com; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=None';
  // 授权响应经本地 HTTPS 服务和浏览器网络层，不能使用 route.fulfill 绕过响应规则。
  await setMode('none');
  await page.route('https://space.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>设备授权 Cookie 隔离验证（合成账号）</h1></body></html>' }));
  await resetCookie();
  await page.goto('https://space.bilibili.com/100');
  const settings = await context.newPage();
  await settings.goto(popupUrl);
  await worker.evaluate(async () => { await chrome.storage.local.remove('profileAuth'); await chrome.storage.sync.set({ profilesEnabled: false, dynamicsEnabled: true }); });
  checks.nativeFetch = await worker.evaluate(() => Function.prototype.toString.call(fetch).includes('[native code]'));
  checks.hostPermission = await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://passport.bilibili.com/*'] }));
  checks.sessionPermission = await worker.evaluate(() => chrome.permissions.contains({ permissions: ['cookies'] }));
  await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({ hasText: '已授权' }).waitFor();
  checks.successRemovesTemporarySessionRule = await noSessionRule();
  const guard = await worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).find(r => r.id === 2));
  checks.guardInstalled = guard?.action.responseHeaders?.some(h => h.header === 'set-cookie' && h.operation === 'remove') === true;
  // 对照旧行为：仅在隔离测试浏览器中暂时移除响应隔离。
  await worker.evaluate(async rule => { delete rule.action.responseHeaders; await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [2], addRules: [rule] }); }, JSON.parse(JSON.stringify(guard)));
  await setMode('delete');
  await worker.evaluate(() => fetch('https://passport.bilibili.com/x/passport-tv-login/h5/qrcode/confirm', { method: 'POST', credentials: 'include' }).then(r => r.json()));
  checks.oldResponseCanDeleteWebCookie = await cookieIsGone();
  await worker.evaluate(rule => chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [2], addRules: [rule] }), guard);
  await resetCookie();
  await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({ hasText: '已授权' }).waitFor();
  checks.confirmStillSendsWebCookie = (await (await context.request.get('https://127.0.0.1:18443/__fixture/status', { ignoreHTTPSErrors: true })).json()).confirmCookiePresent;
  checks.authorizationIgnoresCookieDeletion = await cookieIsOriginal();
  await setMode('overwrite');
  await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({ hasText: '已授权' }).waitFor();
  checks.authorizationIgnoresCookieOverwrite = await cookieIsOriginal();
  await setMode('http-error');
  await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({ hasText: 'HTTP 503' }).waitFor();
  checks.httpFailureKeepsWebCookie = await cookieIsOriginal();
  checks.httpFailureRemovesTemporarySessionRule = await noSessionRule();
  checks.failedReauthorizationKeepsPreviousToken = await worker.evaluate(async () => (await chrome.storage.local.get('profileAuth')).profileAuth?.accessToken === 'fixture-only-access-token');
  await setMode('api-error');
  await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({ hasText: '授权接口未认可本次请求的登录凭据' }).waitFor();
  const failure = await settings.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://space.bilibili.com/*' });
    return chrome.runtime.sendMessage({ type: 'profile:auth:start', tabId: tab.id, confirmed: true });
  });
  checks.confirmFailurePreservesCodeAndStage = failure.ok === false && failure.errorCode === -101 && failure.errorStage === 'confirm';
  checks.confirmFailurePreservesServerMessage = failure.serverMessage === 'fixture-session-not-recognized'
    && failure.error.includes('fixture-session-not-recognized') && !failure.error.includes('拒绝了设备授权');
  checks.apiFailureKeepsWebCookie = await cookieIsOriginal();
  checks.apiFailureRemovesTemporarySessionRule = await noSessionRule();
  // 同名旧会话仅匹配 passport，网页仍能正常登录；旧传输会在确认时返回 -101。
  await setMode('session-required');
  await context.addCookies([{ name: 'SESSDATA', value: 'fixture-stale-session', domain: 'passport.bilibili.com', path: '/x/passport-tv-login', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const oldConfirm = await worker.evaluate(async () => (await (await fetch('https://passport.bilibili.com/x/passport-tv-login/h5/qrcode/confirm', { method: 'POST', credentials: 'include' })).json()).code);
  checks.oldHostCookieReproduces101 = oldConfirm === -101;
  await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({ hasText: '已授权' }).waitFor();
  checks.currentTabSessionResolvesHostCookieConflict = (await (await context.request.get('https://127.0.0.1:18443/__fixture/status', { ignoreHTTPSErrors: true })).json()).confirmCookiePresent;
  checks.conflictFixKeepsBothWebCookies = await cookieIsOriginal() && (await context.cookies('https://passport.bilibili.com/x/passport-tv-login/h5/qrcode/confirm')).some(c => c.name === 'SESSDATA' && c.value === 'fixture-stale-session');
  checks.conflictSuccessRemovesTemporarySessionRule = await noSessionRule();
  await context.clearCookies({ name: 'SESSDATA', domain: 'passport.bilibili.com' });
  for (const sameSite of ['Lax', 'Strict']) {
    await resetCookie(sameSite);
    await settings.locator('#profile-authorize').click();
    await settings.locator('#profile-status').filter({ hasText: '已授权' }).waitFor();
    checks[`authorizes${sameSite}WebCookie`] = await cookieIsOriginal() && await noSessionRule();
  }
  const stored = await worker.evaluate(async () => {
    const values = { ...await chrome.storage.local.get(null), ...await chrome.storage.session.get(null) };
    return JSON.stringify(values).includes('fixture-web-session');
  });
  checks.webCookiesNotSavedToExtensionStorage = !stored;
  // 普通网页发起的请求仍可正常更新其 Cookie，规则只匹配本扩展。
  await setMode('delete');
  await page.goto('https://passport.bilibili.com/x/passport-tv-login/h5/qrcode/confirm');
  checks.pageRequestsUnaffected = await cookieIsGone();
  await page.goto('https://space.bilibili.com/100');
  await resetCookie();
  const join = (...parts) => { const out = new Uint8Array(parts.reduce((n,p) => n+p.length,0)); let i=0; for (const p of parts) {out.set(p,i);i+=p.length;} return out; };
  const vi = value => { let n=BigInt(value),a=[];do { const b=Number(n&127n);n>>=7n;a.push(b|(n?128:0)); } while(n);return Uint8Array.from(a); };
  const bytes = (f,p) => join(vi(f*8+2),vi(p.length),p), text = (f,t) => bytes(f,Uint8Array.from([...t].map(c=>c.charCodeAt(0)))), num=(f,n)=>join(vi(f*8),vi(n));
  const id = '1245177092906156001';
  const payload = bytes(1,join(bytes(3,bytes(2,join(num(1,10),text(14,'Hebei')))),bytes(4,text(1,id))));
  const header = new Uint8Array(5);new DataView(header.buffer).setUint32(1,payload.length);
  await context.route('https://app.bilibili.com/bilibili.app.dynamic.v2.Dynamic/DynDetail', async route => {
    appCookieAbsent = !(await route.request().allHeaders()).cookie;
    // 此合成帧全部为 ASCII 字节，可在 CLI 的受限 VM 中无损作为字符串返回。
    await route.fulfill({ headers: { 'content-type': 'application/grpc', 'grpc-status': '0', 'set-cookie': changedCookie() }, body: String.fromCharCode(...join(header,payload)) });
  });
  await page.evaluate(postId => {
    const card=document.createElement('section');card.className='bili-dyn-item';card.innerHTML='<div class="bili-dyn-time">刚刚</div>';
    const author={mid:'10'},data={id_str:postId,modules:{module_author:author}};
    card.__vue__={$props:{data}};card.firstElementChild.__vue__={$props:{id:postId,author}};document.body.append(card);
  },id);
  await page.locator('[data-bili-ip-region-body]').filter({hasText:'Hebei'}).waitFor();
  checks.appRequestUsesTokenWithoutWebCookie = appCookieAbsent;
  checks.appResponseCannotDeleteWebCookie = await cookieIsOriginal();
  await settings.close();
  const report={version,source:'isolated browser; native network fetch; synthetic cookies and server responses',checks,allPassed:Object.values(checks).every(Boolean),realAccountAuthorizationTested:false};
  if(!report.allPassed)throw Error(JSON.stringify(report));return report;
}
