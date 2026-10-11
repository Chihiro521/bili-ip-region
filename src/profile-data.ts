type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue { return value && typeof value === 'object' ? value as RecordValue : {}; }
export function uidString(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) return null;
  return BigInt(value) <= 9223372036854775807n ? value : null;
}
export function spaceUid(input: string): string | null {
  try { const url = new URL(input); return url.protocol === 'https:' && url.hostname === 'space.bilibili.com'
    ? uidString(url.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1]) : null; } catch { return null; }
}
export function normalizeProfileRegion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const location = text.match(/IP\s*(?:归属地|属地)\s*[：:]\s*(.*)$/i)?.[1] ?? text;
  const region = location.replace(/\d+(?:[.,]\d+)*\s*(?:万|亿)?\s*(?:次)?(?:浏览|阅读)/g, '')
    .replace(/^[\s·•|｜,，]+|[\s·•|｜,，]+$/g, '').trim();
  return region && region.length <= 80 && !/^(未知|未知地区|未知属地|暂无|无)$/.test(region) ? region : null;
}
export type ProfileStatus = 'ok' | 'empty' | 'auth-required' | 'expired' | 'disabled' | 'error';
export interface ProfileResult { uid: string; status: ProfileStatus; region: string | null; error?: string; }
export function decodeProfileResponse(value: unknown, uid: string): ProfileResult {
  const json = record(value);
  if (json.code === -101 || json.code === -4003 || json.code === -4004) return { uid, status: 'expired', region: null };
  if (json.code !== 0) throw new Error(`主页接口返回错误（${Number.isFinite(json.code) ? json.code : '未知'}）`);
  const card = record(record(json.data).card);
  if (uidString(card.mid) !== uid) throw new Error('返回的主页 UID 与请求不一致');
  const regions = new Set<string>();
  for (const key of ['space_tag', 'space_tag_bottom']) {
    const tags = card[key];
    if (!Array.isArray(tags)) continue;
    for (const value of tags.slice(0, 64)) {
      const tag = record(value);
      if (tag.type !== 'location') continue;
      const region = normalizeProfileRegion(tag.title);
      if (region) regions.add(region);
    }
  }
  if (regions.size > 1) throw new Error('主页返回的属地标签不一致');
  const region = [...regions][0] ?? null;
  return { uid, status: region ? 'ok' : 'empty', region };
}
export interface ProfileCredential { accessToken: string; ownerUid: string; expiresAt: number; }
export function decodeCredential(value: unknown, expectedUid: string, now = Date.now()): ProfileCredential {
  const data = record(value), nested = record(data.token_info);
  const ownerUid = uidString(nested.mid ?? data.mid);
  const accessToken = nested.access_token ?? data.access_token;
  const seconds = Number(nested.expires_in ?? data.expires_in);
  if (ownerUid !== expectedUid) throw new Error('授权账号与当前网页登录账号不一致');
  if (typeof accessToken !== 'string' || !/^[\w.-]{8,256}$/.test(accessToken)
    || !Number.isFinite(seconds) || seconds <= 60 || seconds > 366 * 86400) throw new Error('授权接口没有返回有效凭据');
  return { accessToken, ownerUid, expiresAt: now + seconds * 1000 };
}
