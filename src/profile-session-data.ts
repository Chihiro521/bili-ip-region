export const WEB_SESSION_COOKIE_NAMES = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5'] as const;
type LoginCookie = Pick<chrome.cookies.Cookie, 'name' | 'value' | 'session' | 'expirationDate'>;

// Cookie API 按当前标签页的路径与创建时间选值；每个字段只发送一次。
export function webSessionFromCookies(cookies: LoginCookie[], now = Date.now() / 1000): { csrf: string; cookieHeader: string } {
  const current = cookies.filter(cookie => cookie.session || cookie.expirationDate === undefined || cookie.expirationDate > now);
  const values = new Map(WEB_SESSION_COOKIE_NAMES.map(name => [name, current.find(cookie => cookie.name === name)?.value]));
  if (!values.get('SESSDATA')) throw new Error('当前 B 站页面没有有效登录会话，请刷新页面确认登录状态');
  const csrf = values.get('bili_jct');
  if (!csrf || !/^[a-f\d]{32}$/i.test(csrf)) throw new Error('当前 B 站页面缺少授权校验信息，请刷新页面后重试');
  const fields = WEB_SESSION_COOKIE_NAMES.flatMap(name => {
    const value = values.get(name);
    if (!value) return [];
    if (value.length > 8192 || /[\x00-\x20\x7f;,]/.test(value)) throw new Error('当前 B 站登录会话格式无效，请刷新页面后重试');
    return [`${name}=${value}`];
  });
  return { csrf, cookieHeader: fields.join('; ') };
}
