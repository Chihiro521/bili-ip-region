import { webSessionFromCookies, WEB_SESSION_COOKIE_NAMES } from './profile-session-data.ts';
export const WEB_LOGIN_NAV = 'https://api.bilibili.com/x/web-interface/nav';
const SESSION_RULE_ID = 3;

export async function clearWebSessionHeaders(): Promise<void> {
  try { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [SESSION_RULE_ID] }); }
  catch { throw new Error('未能清理临时授权请求，请刷新扩展后重试'); }
}
// Session 规则不会跨浏览器重启保存，后台重启时也移除中断请求留下的规则。
const resetHeaders = clearWebSessionHeaders();

export async function withWebSession<T>(tabId: number, url: string, task: (csrf: string) => Promise<T>): Promise<T> {
  await resetHeaders;
  const stores = await chrome.cookies.getAllCookieStores();
  const store = stores.find(value => value.tabIds.includes(tabId));
  if (!store) throw new Error('无法读取当前 B 站窗口的登录会话，请重新打开扩展');
  // getAll 可能因父域权限过滤掉 .bilibili.com 的 Cookie；按已授权页面 URL 逐项读取。
  const cookies = await Promise.all(WEB_SESSION_COOKIE_NAMES.map(name => chrome.cookies.get({ name, url, storeId: store.id })));
  const session = webSessionFromCookies(cookies.filter((cookie): cookie is chrome.cookies.Cookie => !!cookie));
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [SESSION_RULE_ID], addRules: [{
      id: SESSION_RULE_ID, priority: 10,
      action: { type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [{ header: 'cookie', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: session.cookieHeader }],
        responseHeaders: [{ header: 'set-cookie', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE }],
      },
      condition: {
        regexFilter: '^https://(api\\.bilibili\\.com/x/web-interface/nav|passport\\.bilibili\\.com/x/passport-tv-login/h5/qrcode/confirm)$',
        initiatorDomains: [chrome.runtime.id], resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
      },
    }] });
  } catch { throw new Error('未能准备当前网页登录授权，请刷新扩展后重试'); }
  try { return await task(session.csrf); }
  finally { await clearWebSessionHeaders(); }
}
