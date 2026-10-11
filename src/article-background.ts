import { ArticleApi } from './article-api.ts';
import { contentAuthorization, contentAuthGeneration } from './profile-background.ts';
import type { ArticleResult, ArticleTarget } from './article-data.ts';
import { preferences } from './preferences.ts';
import { configureHeaders } from './request-headers.ts';

const pending = new Map<string, Promise<ArticleResult>>();
const cache = new Map<string, { result: ArticleResult; expiresAt: number }>();
export async function getArticle(target: ArticleTarget): Promise<ArticleResult> {
  const empty = (status: ArticleResult['status'], error?: string): ArticleResult => ({ target, articleId: null, authorMid: null, region: null, source: null, status, ...(error ? { error } : {}) });
  if (!(await preferences()).articlesEnabled) return empty('disabled');
  const generation = contentAuthGeneration(), key = `${generation}:${target.kind}:${target.id}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    try {
      const authorization = await contentAuthorization();
      if (authorization) await configureHeaders();
      const result = await new ArticleApi().article(target, authorization ?? undefined);
      if (generation !== contentAuthGeneration() || !(await preferences()).articlesEnabled) return empty('disabled');
      // 只保存对应内容的结果；换授权后键变更，旧请求不能污染新的会话。
      for (const [cacheKey, entry] of cache) if (entry.expiresAt <= Date.now() || !cacheKey.startsWith(`${generation}:`)) cache.delete(cacheKey);
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { result, expiresAt: Date.now() + (result.region ? 30 : 5) * 60000 });
      return result;
    } catch (error) { return empty('error', error instanceof Error ? error.message : '专栏请求失败'); }
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
