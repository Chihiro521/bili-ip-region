import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { uidString, spaceUid, decodeProfileResponse, decodeCredential, normalizeProfileRegion } from '../src/profile-data.ts';
import { ProfileApi, signAppQuery } from '../src/profile-api.ts';
import { APP_SIGN_KEY } from '../src/profile-client-constants.ts';

test('主页 UID 从目标地址获取，拒绝外站和损失精度的数值', () => {
  assert.equal(spaceUid('https://space.bilibili.com/946974/dynamic?x=1'), '946974');
  for (const url of ['https://space.bilibili.com.evil/946974', 'http://space.bilibili.com/946974', 'https://space.bilibili.com/0', 'https://space.bilibili.com/9223372036854775808']) assert.equal(spaceUid(url), null);
  assert.equal(uidString(9007199254740993), null);
});
test('只读取对应主页卡片的 location 标签，兼容上下两处标签', () => {
  const data = { code: 0, data: { card: { mid: '100', space_tag: [{ type: 'location', title: 'IP属地：河北' }], space_tag_bottom: [{ type: 'location', title: '河北' }] }, archive: { pub_location: '上海' } } };
  assert.deepEqual(decodeProfileResponse(data, '100'), { uid: '100', status: 'ok', region: '河北' });
  assert.equal(decodeProfileResponse({ code: 0, data: { card: { mid: '200', space_tag_bottom: [{ type: 'location', title: 'IP属地: 浙江' }] } } }, '200').region, '浙江');
  assert.throws(() => decodeProfileResponse(data, '200'), /UID/);
});
test('空属地不显示，冲突地区及失败响应不沿用已有标签', () => {
  for (const title of ['', 'IP属地：', '未知']) assert.equal(decodeProfileResponse({ code: 0, data: { card: { mid: '100', space_tag: [{ type: 'location', title }] } } }, '100').status, 'empty');
  assert.throws(() => decodeProfileResponse({ code: 0, data: { card: { mid: '100', space_tag: [{ type: 'location', title: '河北' }], space_tag_bottom: [{ type: 'location', title: '浙江' }] } } }, '100'), /不一致/);
  assert.equal(decodeProfileResponse({ code: -101 }, '100').status, 'expired');
  assert.throws(() => decodeProfileResponse({ code: -400 }, '100'), /错误/);
});

test('属地文字排除浏览次数，只保留地区', () => {
  for (const value of ['63浏览 IP属地：河北', '63浏览IP属地: 河北', 'IP属地：河北 · 1.2万浏览', '63浏览 · 河北']) {
    assert.equal(normalizeProfileRegion(value), '河北');
  }
  assert.equal(normalizeProfileRegion('IP属地：Hong Kong'), 'Hong Kong');
  for (const value of ['63浏览', '1.2万次阅读', '63浏览 IP属地：', '63浏览 IP属地：未知']) {
    assert.equal(normalizeProfileRegion(value), null);
  }
});
test('App 请求使用排序后的参数和正确签名，不丢失目标 UID', () => {
  const query = signAppQuery({ vmid: '946974', build: '6720300', appkey: 'fixture' }, false, 123);
  const params = new URLSearchParams(query), sign = params.get('sign'); params.delete('sign');
  assert.equal(params.get('vmid'), '946974');
  assert.equal(sign, createHash('md5').update(params.toString() + APP_SIGN_KEY).digest('hex'));
});
test('仅保存必要的授权字段，授权账号必须与当前网页登录一致', () => {
  const value = { mid: 100, access_token: 'fixture-token-123', refresh_token: 'unused-refresh', cookie_info: { cookies: ['unused'] }, expires_in: 3600 };
  const decoded = decodeCredential(value, '100', 1000);
  assert.deepEqual(Object.keys(decoded).sort(), ['accessToken', 'expiresAt', 'ownerUid']);
  assert.equal(decoded.expiresAt, 3601000);
  assert.throws(() => decodeCredential(value, '200'), /不一致/);
  assert.throws(() => decodeCredential({ ...value, expires_in: 0 }, '100'), /有效/);
});
test('设备授权按申请、当前网页登录确认、轮询的顺序执行', async () => {
  const requests: { path: string; credentials?: RequestCredentials }[] = [];
  const api = new ProfileApi('XXFIXTURE', async (url, init) => {
    requests.push({ path: new URL(url).pathname, credentials: init?.credentials });
    const data = url.endsWith('/auth_code') ? { auth_code: 'fixture-auth-code' } : url.endsWith('/confirm') ? { gourl: 'unused' } : { mid: 100, access_token: 'fixture-token-123', expires_in: 3600 };
    return Response.json({ code: 0, data });
  });
  const result = await api.authorize('0'.repeat(32), '100');
  assert.equal(result.ownerUid, '100');
  assert.deepEqual(requests.map(r => r.path.split('/').at(-1)), ['auth_code', 'confirm', 'poll']);
  assert.deepEqual(requests.map(r => r.credentials), ['omit', 'include', 'omit']);
});
test('默认 fetch 保留全局调用上下文，授权请求不会触发 Illegal invocation', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async function (input) {
    assert.ok(this === globalThis, '原生浏览器 fetch 需要全局对象作为调用上下文');
    requests++;
    const path = String(input);
    const data = path.endsWith('/auth_code') ? { auth_code: 'fixture-auth-code' }
      : path.endsWith('/confirm') ? {} : { mid: 100, access_token: 'fixture-token-123', expires_in: 3600 };
    return Response.json({ code: 0, data });
  };
  try {
    const result = await new ProfileApi('XXFIXTURE').authorize('0'.repeat(32), '100');
    assert.equal(result.ownerUid, '100');
    assert.equal(requests, 3);
  } finally { globalThis.fetch = originalFetch; }
});
test('授权失败立即停止，不进行后续轮询或查询', async () => {
  let requests = 0;
  const api = new ProfileApi('XXFIXTURE', async () => Response.json(++requests === 1 ? { code: 0, data: { auth_code: 'fixture-auth-code' } } : { code: -101 }));
  await assert.rejects(api.authorize('0'.repeat(32), '100'), /网页登录授权失败/);
  assert.equal(requests, 2);
});
test('主页接口用查看者凭据查询目标 UID，返回账号必须对应目标', async () => {
  const api = new ProfileApi('XXFIXTURE', async url => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('vmid'), '200');
    assert.equal(parsed.searchParams.get('access_key'), 'fixture-token-123');
    return Response.json({ code: 0, data: { card: { mid: '200', space_tag: [{ type: 'location', title: '上海' }] } } });
  });
  assert.deepEqual(await api.profile('200', 'fixture-token-123'), { uid: '200', status: 'ok', region: '上海' });
});
