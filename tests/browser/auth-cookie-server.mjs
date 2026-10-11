import https from 'node:https';
import { readFileSync } from 'node:fs';

const [certificate, key, port = '18443'] = process.argv.slice(2);
if (!certificate || !key) throw Error('需要提供本地测试证书和密钥路径');
let mode = 'none', confirmCookiePresent = false;
const server = https.createServer({ cert: readFileSync(certificate), key: readFileSync(key) }, async (request, response) => {
  const path = new URL(request.url, 'https://127.0.0.1').pathname;
  const send = (data, status = 200, cookie) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store',
      'access-control-allow-origin': request.headers.origin ?? 'https://space.bilibili.com', 'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type',
      ...(cookie ? { 'set-cookie': cookie } : {}) });
    response.end(JSON.stringify(data));
  };
  if (request.method === 'OPTIONS') return send({});
  if (path === '/__fixture/stop') { send({ ok: true }); server.close(() => process.exit(0)); return; }
  if (path === '/__fixture/mode') {
    let body = '';for await (const chunk of request) body += chunk;
    mode = JSON.parse(body).mode;
    return send({ ok: true });
  }
  if (path === '/__fixture/status') return send({ confirmCookiePresent });
  // 模拟不同主机上同名 Cookie 冲突：登录接口读取首先出现的会话。
  const session = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('SESSDATA='));
  const loggedIn = session === 'SESSDATA=fixture-web-session';
  if (path === '/x/web-interface/nav') return send({ code: loggedIn ? 0 : -101, data: { isLogin: loggedIn, mid: loggedIn ? 999 : 0 } });
  if (!path.startsWith('/x/passport-tv-login/')) return send({ code: -404 }, 404);
  const confirm = path.endsWith('/confirm');
  if (confirm) confirmCookiePresent = loggedIn;
  const data = path.endsWith('/auth_code') ? { auth_code: 'fixture-auth-code' }
    : confirm ? {} : { mid: 999, access_token: 'fixture-only-access-token', expires_in: 3600 };
  const cookie = !['delete', 'overwrite', 'api-error', 'http-error'].includes(mode) ? undefined : mode === 'overwrite'
    ? 'SESSDATA=fixture-replaced-session; Domain=.bilibili.com; Path=/; Secure; HttpOnly; SameSite=None'
    : 'SESSDATA=; Domain=.bilibili.com; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=None';
  const code = confirm && (mode === 'api-error' || mode === 'session-required' && !loggedIn) ? -101 : 0;
  send({ code, message: code === -101 ? 'fixture-session-not-recognized' : '0', data }, confirm && mode === 'http-error' ? 503 : 200, cookie);
});
server.listen(Number(port), '127.0.0.1', () => console.log(`合成授权响应服务：127.0.0.1:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
