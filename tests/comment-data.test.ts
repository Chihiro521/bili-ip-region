import assert from 'node:assert/strict';
import test from 'node:test';
import { collectReplyLocations, replyId, replyLocation } from '../src/comment-data.ts';

test('评论 ID 使用字符串，拒绝已损失精度的数值 ID', () => {
  assert.equal(replyId({ rpid_str: '1251190976967344129', rpid: 1251190976967344000 }), '1251190976967344129');
  assert.equal(replyId({ rpid: 1251190976967344000 }), null);
});
test('同一账号的不同评论和楼中楼分别对应地区，空值覆盖旧缓存', () => {
  const cache = new Map<string, string | null>();
  collectReplyLocations({ data: { replies: [
    { rpid_str: '1001', mid: 9, reply_control: { location: 'IP属地：河北' }, replies: [
      { rpid_str: '1002', mid: 9, reply_control: { location: 'IP属地：浙江' } },
    ] },
  ] } }, cache);
  assert.equal(cache.get('1001'), '河北');
  assert.equal(cache.get('1002'), '浙江');
  collectReplyLocations({ rpid_str: '1001', reply_control: { location: '' } }, cache);
  assert.equal(cache.get('1001'), null);
  assert.equal(replyLocation({ reply_control: { location: 'IP属地：未知' } }), null);
});
