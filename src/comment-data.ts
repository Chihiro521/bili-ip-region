export type Reply = {
  rpid_str?: unknown; rpid?: unknown;
  reply_control?: { location?: unknown };
};

export function replyId(reply: Reply | undefined): string | null {
  const value = reply?.rpid_str ?? reply?.rpid;
  if (typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value)) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

export function replyLocation(reply: Reply | undefined): string | null {
  const value = reply?.reply_control?.location;
  if (typeof value !== 'string') return null;
  const region = value.replace(/^\s*IP\s*属地\s*[:：]\s*/i, '').trim();
  return region && region.length <= 80 && !/^(未知|未知地区|未知属地|暂无|无)$/.test(region) ? region : null;
}

// 只缓存评论 ID -> 地区；不按用户 ID 缓存，也不保留正文或账号资料。
export function collectReplyLocations(value: unknown, cache: Map<string, string | null>): void {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  let count = 0;
  while (pending.length && count++ < 10000) {
    const item = pending.pop();
    if (!item || typeof item !== 'object' || visited.has(item)) continue;
    visited.add(item);
    const id = replyId(item as Reply);
    if (id && 'reply_control' in item) {
      cache.delete(id);
      cache.set(id, replyLocation(item as Reply));
    }
    for (const child of Object.values(item)) if (child && typeof child === 'object') pending.push(child);
  }
  while (cache.size > 5000) cache.delete(cache.keys().next().value!);
}
