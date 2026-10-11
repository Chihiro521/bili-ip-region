import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesField, concat, decodeResponse, grpcFrame, intField, parseDynamicId, requestBody, stringField } from '../src/protocol.ts';
import { countSuccessfulAuthors } from '../src/probe.ts';
import type { Method } from '../src/protocol.ts';
import type { ProbeResult } from '../src/probe.ts';

const id = '1245177092906156041';
function response(method: Method, location: string | null, mid = 15773384n, returnedId = id, footer: string | null = null): Uint8Array {
  const author = concat(intField(1, mid), stringField(2, '10月5日'), ...(location === null ? [] : [stringField(14, location)]));
  const module = bytesField(2, author);
  const item = concat(
    ...(method === 'OpusDetail' ? [intField(1, BigInt(returnedId))] : []),
    bytesField(method === 'DynDetail' ? 3 : 4, module),
    ...(footer === null ? [] : [bytesField(method === 'DynDetail' ? 3 : 4, bytesField(31, stringField(1, footer)))]),
    bytesField(method === 'DynDetail' ? 4 : 5, stringField(1, returnedId)),
  );
  return grpcFrame(bytesField(1, item));
}

for (const method of ['DynDetail', 'OpusDetail'] as Method[]) {
  test(`${method} 保留大整数 ID，并读取顶层发布属地`, () => {
    const data = decodeResponse(method, response(method, 'IP属地：安徽'));
    assert.equal(data.returnedId, id);
    assert.equal(data.authorMid, '15773384');
    assert.equal(data.location, '安徽');
    assert.equal(data.locationFieldPresent, true);
  });
  test(`${method} 区分属地缺失与空字符串`, () => {
    assert.equal(decodeResponse(method, response(method, null)).locationFieldPresent, false);
    assert.equal(decodeResponse(method, response(method, '')).locationFieldPresent, true);
    assert.equal(decodeResponse(method, response(method, '')).location, null);
  });
  test(`${method} 作者时间无属地时读取详情底部的 IP 标签`, () => {
    const data = decodeResponse(method, response(method, null, 946974n, id, 'IP属地：浙江'));
    assert.equal(data.location, '浙江');
    assert.equal(data.authorMid, '946974');
    assert.equal(data.returnedId, id);
    assert.equal(data.locationSource, 'copyright');
    assert.equal(data.authorLocationFieldPresent, false);
    assert.equal(data.copyrightModulePresent, true);
  });
  test(`${method} 不把普通版权文案当属地，拒绝冲突的来源`, () => {
    assert.equal(decodeResponse(method, response(method, null, 1n, id, '版权所有')).location, null);
    assert.equal(decodeResponse(method, response(method, null, 1n, id, '浙江')).location, null);
    assert.equal(decodeResponse(method, response(method, '', 1n, id, 'IP属地：')).location, null);
    assert.throws(() => decodeResponse(method, response(method, '上海', 1n, id, 'IP属地：浙江')), /来源不一致/);
  });
  test(`${method} 取出混合浏览次数字段中的属地，并核对两个来源`, () => {
    const data = decodeResponse(method, response(method, '63浏览 IP属地：河北', 1n, id, 'IP属地：河北'));
    assert.equal(data.location, '河北');
    assert.equal(decodeResponse(method, response(method, null, 1n, id, '63浏览 IP属地：河北')).location, '河北');
    assert.equal(decodeResponse(method, response(method, '63浏览')).location, null);
  });
}

test('拒绝截断帧、压缩帧和溢出的 protobuf varint', () => {
  assert.throws(() => decodeResponse('DynDetail', new Uint8Array(4)));
  const compressed = response('DynDetail', '河北'); compressed[0] = 1;
  assert.throws(() => decodeResponse('DynDetail', compressed), /压缩/);
  assert.throws(() => decodeResponse('DynDetail', response('DynDetail', '河北').subarray(0, 10)), /帧长度/);
  assert.throws(() => decodeResponse('DynDetail', grpcFrame(Uint8Array.from(Array(10).fill(255)))), /uint64/);
});

test('转发中的嵌套原作者不能成为顶层属地', () => {
  const nested = bytesField(3, bytesField(2, concat(intField(1, 3n), stringField(14, '上海'))));
  const item = concat(
    bytesField(3, bytesField(5, bytesField(6, bytesField(1, nested)))),
    bytesField(4, stringField(1, id)),
  );
  const data = decodeResponse('DynDetail', grpcFrame(bytesField(1, item)));
  assert.equal(data.returnedId, id);
  assert.equal(data.location, null);
  assert.equal(data.authorMid, null);
  const nestedCopyright = concat(nested, bytesField(3, bytesField(31, stringField(1, 'IP属地：浙江'))));
  const forwarded = concat(bytesField(3, bytesField(5, bytesField(6, bytesField(1, nestedCopyright)))), bytesField(4, stringField(1, id)));
  assert.equal(decodeResponse('DynDetail', grpcFrame(bytesField(1, forwarded))).location, null);
});

test('链接解析保留完整 ID，拒绝外站、短链和无效 int64', () => {
  assert.equal(parseDynamicId(`https://www.bilibili.com/opus/${id}?spm_id_from=333`), id);
  assert.equal(parseDynamicId(`https://t.bilibili.com/${id}`), id);
  assert.equal(parseDynamicId(`https://m.bilibili.com/dynamic/${id}`), id);
  assert.equal(parseDynamicId(id), id);
  assert.throws(() => parseDynamicId(`https://bilibili.com.example.com/opus/${id}`));
  assert.throws(() => parseDynamicId('https://b23.tv/abc'));
  assert.throws(() => requestBody('OpusDetail', '9223372036854775808'));
  assert.throws(() => requestBody('DynDetail', '0'));
});

test('同一发布者的多个成功响应不能满足两个账号条件', () => {
  const make = (mid: bigint, location: string | null, matches = true): ProbeResult => ({
    requestedId: id, method: 'DynDetail', endpoint: 'https://app.bilibili.com/test',
    httpStatus: 200, grpcStatus: '0', bytes: 100, elapsedMs: 1, error: null,
    idMatches: matches, decoded: decodeResponse('DynDetail', response('DynDetail', location, mid)),
  });
  assert.equal(countSuccessfulAuthors([make(1n, '河北'), make(1n, '河北')]), 1);
  assert.equal(countSuccessfulAuthors([make(1n, '河北'), make(2n, '')]), 1);
  assert.equal(countSuccessfulAuthors([make(1n, '河北'), make(2n, '未知')]), 1);
  assert.equal(countSuccessfulAuthors([make(1n, '河北'), make(2n, '上海', false)]), 1);
  assert.equal(countSuccessfulAuthors([make(1n, '河北'), make(2n, '上海')]), 2);
});
