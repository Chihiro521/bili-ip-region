import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBinding, dynamicPage, itemBinding } from '../src/dynamic-data.ts';
import { fetchDynamic } from '../src/dynamic-api.ts';
import { bytesField, concat, grpcFrame, intField, stringField } from '../src/protocol.ts';
const id = '1245177092906156001';
function frame(method: string, region: string | null, mid = '10', returnedId = id) {
  const author = concat(intField(1, BigInt(mid)), ...(region === null ? [] : [stringField(14, region)]));
  return grpcFrame(bytesField(1, concat(...(method==='OpusDetail'?[intField(1,BigInt(returnedId))]:[]),
    bytesField(method==='DynDetail'?3:4, bytesField(2,author)),bytesField(method==='DynDetail'?4:5,stringField(1,returnedId)))));
}
test('动态绑定保持内容 ID 与发布者，转发和原动态独立', () => {
  const original = { id_str: '1245177092906156002', modules: { module_author: { mid: '20' } } };
  const forward = { id_str: id, modules: { module_author: { mid: '10' } }, orig: original };
  assert.deepEqual(itemBinding(forward), { id, authorMid: '10', kind: 'dynamic', role: 'post' });
  assert.deepEqual(itemBinding(original, 'original'), { id: original.id_str, authorMid: '20', kind: 'dynamic', role: 'original' });
  assert.equal(itemBinding({ ...forward, type: 'DYNAMIC_TYPE_ARTICLE' })?.kind, 'article');
  assert.equal(itemBinding({ id_str: Number(id) }), null);
  assert.equal(decodeBinding({ id: '0', authorMid: null, kind: 'dynamic', role: 'post' }), null);
});
test('动态页面范围覆盖列表、详情和个人空间', () => {
  for (const url of ['https://t.bilibili.com/', `https://t.bilibili.com/${id}`, 'https://space.bilibili.com/100/dynamic', `https://www.bilibili.com/opus/${id}`]) assert.equal(dynamicPage(url), true);
  for (const url of ['https://www.bilibili.com/video/BV1xx','https://t.bilibili.com.example/','http://t.bilibili.com/']) assert.equal(dynamicPage(url),false);
});
test('动态查询携带已有授权，并核对返回 ID 和作者', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'),'identify_v1 fixture-only-access-token');
    return new Response(frame(String(input).split('/').at(-1)!, 'IP属地：河北'), { headers: { 'grpc-status': '0' } });
  };
  try {
    const result=await fetchDynamic(id,'10',{accessToken:'fixture-only-access-token',deviceId:'fixture-device'});
    assert.equal(result.region,'河北');assert.equal(result.authorMid,'10');assert.ok(!JSON.stringify(result).includes('fixture-only-access-token'));
    assert.equal((await fetchDynamic(id,'20',{accessToken:'fixture-only-access-token',deviceId:'fixture-device'})).status,'error');
    globalThis.fetch=async()=>new Response(frame('DynDetail','浙江','10','1245177092906156002'));
    assert.equal((await fetchDynamic(id,'10',{accessToken:'fixture-only-access-token',deviceId:'fixture-device'})).status,'error');
  } finally { globalThis.fetch=original; }
});
test('动态作者字段为空时查 Opus，仍为空时不借用嵌套地区', async () => {
  const original=globalThis.fetch;const methods:string[]=[];
  globalThis.fetch=async input=>{const method=String(input).split('/').at(-1)!;methods.push(method);return new Response(frame(method,method==='OpusDetail'?'上海':null));};
  try { assert.equal((await fetchDynamic(id,'10',{accessToken:'fixture-only-access-token',deviceId:'fixture-device'})).region,'上海');assert.deepEqual(methods,['DynDetail','OpusDetail']);
    globalThis.fetch=async input=>new Response(frame(String(input).split('/').at(-1)!,null));
    assert.equal((await fetchDynamic(id,'10',{accessToken:'fixture-only-access-token',deviceId:'fixture-device'})).status,'empty');
  } finally { globalThis.fetch=original; }
});
