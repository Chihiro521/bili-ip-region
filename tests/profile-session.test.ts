import test from 'node:test';
import assert from 'node:assert/strict';
import { webSessionFromCookies } from '../src/profile-session-data.ts';

const cookie = (name: string, value: string, expirationDate?: number) => ({ name, value, session: expirationDate === undefined, expirationDate });
const csrf = cookie('bili_jct', '0'.repeat(32));
test('授权会话只包含当前标签页的登录字段，保留编码后的原始值', () => {
  const result = webSessionFromCookies([cookie('SESSDATA', 'fixture-session%2C123'), csrf, cookie('DedeUserID', '999'), cookie('unrelated', 'fixture-unused')]);
  assert.equal(result.csrf, csrf.value);
  assert.equal(result.cookieHeader, `SESSDATA=fixture-session%2C123; bili_jct=${csrf.value}; DedeUserID=999`);
  assert.equal(result.cookieHeader.includes('unrelated'), false);
});
test('同名 Cookie 沿用 API 返回的当前页面匹配顺序，每个字段只发送一次', () => {
  const result = webSessionFromCookies([cookie('SESSDATA', 'fixture-current'), cookie('SESSDATA', 'fixture-other'), csrf]);
  assert.equal(result.cookieHeader.match(/SESSDATA=/g)?.length, 1);
  assert.equal(result.cookieHeader.includes('fixture-current'), true);
  assert.equal(result.cookieHeader.includes('fixture-other'), false);
});
test('排除过期会话，缺少会话或 CSRF 时停止授权', () => {
  assert.throws(() => webSessionFromCookies([cookie('SESSDATA', 'fixture-expired', 99), csrf], 100), /登录会话/);
  assert.throws(() => webSessionFromCookies([cookie('SESSDATA', 'fixture-current')]), /校验信息/);
  const result = webSessionFromCookies([cookie('SESSDATA', 'fixture-expired', 99), cookie('SESSDATA', 'fixture-current', 101), csrf], 100);
  assert.equal(result.cookieHeader.includes('fixture-current'), true);
});
test('无效 Cookie 字符不进入请求头，错误文字不暴露字段值', () => {
  for (const value of ['fixture-session;extra=yes', 'fixture-session\r\nextra:yes', 'fixture session']) {
    assert.throws(() => webSessionFromCookies([cookie('SESSDATA', value), csrf]), error => error instanceof Error && /格式无效/.test(error.message) && !error.message.includes(value));
  }
});
