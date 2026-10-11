import { probeOne } from './probe.ts';
import { normalizeProfileRegion } from './profile-data.ts';
import type { DynamicResult } from './dynamic-data.ts';
import type { ArticleAuthorization } from './article-api.ts';

export async function fetchDynamic(id: string, expectedMid: string | null, authorization: ArticleAuthorization): Promise<DynamicResult> {
  let error: string | null = null;
  for (const method of ['DynDetail', 'OpusDetail'] as const) {
    const response = await probeOne(id, method, 'app.bilibili.com', authorization.deviceId, authorization.accessToken);
    if (response.error) { error = response.error; continue; }
    const decoded = response.decoded!;
    if (!decoded.authorMid || decoded.authorMid === '0' || (expectedMid && decoded.authorMid !== expectedMid)) {
      return { id, authorMid: null, status: 'error', region: null, error: '动态发布者 UID 与当前内容不一致' };
    }
    const region = normalizeProfileRegion(decoded.location);
    if (region) return { id, authorMid: decoded.authorMid, status: 'ok', region, source: method };
  }
  return { id, authorMid: expectedMid, status: error ? 'error' : 'empty', region: null, ...(error ? { error } : {}) };
}
