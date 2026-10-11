import test from 'node:test';
import assert from 'node:assert/strict';
import { articleTarget, decodeArticleInfo, resolveOpusArticle } from '../src/article-data.ts';
import { ArticleApi } from '../src/article-api.ts';
import { articleRequestBody, bytesField, concat, decodeArticleResponse, grpcFrame, intField, stringField } from '../src/protocol.ts';
import { metadataHeaders } from '../src/probe.ts';

const opusId = '9223372036854775601', cv = '100', mid = '10';
function mapping(id = opusId, articleId = cv, author = mid, type = 'DYNAMIC_TYPE_ARTICLE') {
  return { code: 0, data: { item: { id_str: id, type, basic: { rid_str: articleId }, modules: { module_author: { mid: author } } } } };
}
function appResponse(oid = cv, id = opusId, author = mid, type = 1n, region = 'IP属地：广东') {
  return grpcFrame(bytesField(1, concat(intField(1, BigInt(id)), intField(2, type), intField(3, BigInt(oid)),
    bytesField(4, bytesField(2, intField(1, BigInt(author)))), bytesField(4, bytesField(31, stringField(1, region))),
    bytesField(5, stringField(1, id)))));
}
test('专栏 URL 区分 CV 与 Opus，保留大整数并拒绝视频或外站', () => {
  assert.deepEqual(articleTarget(`https://www.bilibili.com/opus/${opusId}?from=test`), { kind: 'opus', id: opusId });
  assert.deepEqual(articleTarget(`https://www.bilibili.com/read/cv${cv}`), { kind: 'cv', id: cv });
  for (const value of ['https://www.bilibili.com/read/cv0', 'https://www.bilibili.com/opus/9223372036854775808', 'https://www.bilibili.com/video/BV1xx', 'https://www.bilibili.com.example/opus/100']) assert.equal(articleTarget(value), null);
});
test('Opus 映射核对当前内容、CV 与发布者，不把普通动态当专栏', () => {
  assert.deepEqual(resolveOpusArticle(mapping(), opusId), { articleId: cv, authorMid: mid, opusId });
  assert.equal(resolveOpusArticle(mapping(opusId, cv, mid, 'DYNAMIC_TYPE_DRAW'), opusId), null);
  assert.throws(() => resolveOpusArticle(mapping('9223372036854775602'), opusId), /Opus ID/);
  assert.throws(() => resolveOpusArticle(mapping(opusId, '0'), opusId), /CV ID/);
  assert.throws(() => resolveOpusArticle({ code: -352 }, opusId), /错误/);
});
test('专栏只读取文章自身 location，同一作者不同内容各自对应', () => {
  const info = (location: unknown) => ({ code: 0, data: { mid, location, space_tag: [{ type: 'location', title: 'IP属地：浙江' }] } });
  assert.equal(decodeArticleInfo(info('IP属地：河北'), cv, mid).region, '河北');
  assert.equal(decodeArticleInfo(info('广东'), '200', mid).region, '广东');
  for (const value of ['', null, '未知']) assert.equal(decodeArticleInfo(info(value), cv, mid).region, null);
  assert.throws(() => decodeArticleInfo(info('河北'), cv, '20'), /UID/);
  assert.throws(() => decodeArticleInfo({ code: 0, data: { id: '200', mid, location: '河北' } }, cv), /CV ID/);
});
test('App 文章响应核对文章类型、CV、Opus 和顶层作者', () => {
  const result = decodeArticleResponse(appResponse(), cv, opusId);
  assert.equal(result.location, '广东'); assert.equal(result.authorMid, mid);
  assert.throws(() => decodeArticleResponse(appResponse('200'), cv, opusId), /CV ID/);
  assert.throws(() => decodeArticleResponse(appResponse(cv, '9223372036854775602'), cv, opusId), /Opus ID/);
  assert.throws(() => decodeArticleResponse(appResponse(cv, opusId, mid, 0n), cv, opusId), /类型/);
  assert.throws(() => articleRequestBody('9223372036854775808'));
});
test('App 授权同时放入请求头和 protobuf 元数据，未授权时不发送', () => {
  const headers = metadataHeaders('fixture-device', 'fixture-only-access-token');
  assert.equal(headers.authorization, 'identify_v1 fixture-only-access-token');
  assert.ok(Buffer.from(headers['x-bili-metadata-bin'], 'base64').includes(Buffer.from('fixture-only-access-token')));
  assert.equal(metadataHeaders('fixture-device').authorization, undefined);
});
test('文章 API 从 Opus 对应 CV 取发表属地，非空网页数据不触发 App 请求', async () => {
  const paths: string[] = [];
  const api = new ArticleApi(async (input, init) => {
    paths.push(input); assert.equal(init?.credentials, 'include');
    return Response.json(input.includes('web-dynamic') ? mapping() : { code: 0, data: { mid, location: '河北' } });
  });
  const result = await api.article({ kind: 'opus', id: opusId }, { accessToken: 'fixture-only-access-token', deviceId: 'fixture-device' });
  assert.equal(result.region, '河北'); assert.equal(result.articleId, cv); assert.equal(result.source, 'article');
  assert.equal(paths.length, 2); assert.ok(paths[1].endsWith('id=100'));
});
test('空文章字段在已授权时尝试 App，输出只包含内容对应的地区', async () => {
  const calls: { input: string; init?: RequestInit }[] = [];
  const api = new ArticleApi(async (input, init) => {
    calls.push({ input, init });
    if (input.includes('web-dynamic')) return Response.json(mapping());
    if (input.includes('viewinfo')) return Response.json({ code: 0, data: { mid, location: '' } });
    assert.equal(init?.credentials, 'omit');
    return new Response(appResponse(), { headers: { 'grpc-status': '0' } });
  });
  const result = await api.article({ kind: 'opus', id: opusId }, { accessToken: 'fixture-only-access-token', deviceId: 'fixture-device' });
  assert.equal(result.region, '广东'); assert.equal(result.source, 'app-article');
  assert.equal(new Headers(calls[2].init?.headers).get('authorization'), 'identify_v1 fixture-only-access-token');
  assert.ok(!JSON.stringify(result).includes('fixture-only-access-token'));
});
test('未授权的空文章、普通动态和失败请求不生成文章地区', async () => {
  let calls = 0;
  const emptyApi = new ArticleApi(async () => { calls++; return Response.json({ code: 0, data: { mid, location: '' } }); });
  assert.equal((await emptyApi.article({ kind: 'cv', id: cv })).status, 'empty'); assert.equal(calls, 1);
  const dynamicApi = new ArticleApi(async () => Response.json(mapping(opusId, cv, mid, 'DYNAMIC_TYPE_DRAW')));
  assert.equal((await dynamicApi.article({ kind: 'opus', id: opusId })).status, 'not-article');
  const failingApi = new ArticleApi(async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(failingApi.article({ kind: 'cv', id: cv }), /HTTP 503/);
});
test('默认文章请求保留 Worker fetch 调用上下文', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = function () { assert.equal(this, globalThis); return Promise.resolve(Response.json({ code: 0, data: { mid, location: '河北' } })); };
  try { assert.equal((await new ArticleApi().article({ kind: 'cv', id: cv })).region, '河北'); }
  finally { globalThis.fetch = original; }
});
