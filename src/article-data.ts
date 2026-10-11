import { normalizeProfileRegion, uidString } from './profile-data.ts';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue { return value && typeof value === 'object' ? value as RecordValue : {}; }
export interface ArticleTarget { kind: 'cv' | 'opus'; id: string; }
export interface ArticleIdentity { articleId: string; authorMid: string; opusId?: string; }
export interface ArticleResult {
  target: ArticleTarget; articleId: string | null; authorMid: string | null;
  status: 'ok' | 'empty' | 'not-article' | 'disabled' | 'error';
  region: string | null; source: 'article' | 'app-article' | null; error?: string;
}
export function articleTarget(input: string): ArticleTarget | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname !== 'www.bilibili.com') return null;
    const cv = url.pathname.match(/^\/read\/cv([1-9]\d*)\/?$/)?.[1];
    const opus = url.pathname.match(/^\/opus\/([1-9]\d*)\/?$/)?.[1];
    const id = uidString(cv ?? opus);
    return id ? { kind: cv ? 'cv' : 'opus', id } : null;
  } catch { return null; }
}
export function sameArticle(a: ArticleTarget | null | undefined, b: ArticleTarget | null | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}
export function resolveOpusArticle(value: unknown, opusId: string): ArticleIdentity | null {
  const json = record(value);
  if (json.code !== 0) throw new Error(`专栏映射接口返回错误（${json.code ?? '未知'}）`);
  const item = record(record(json.data).item), basic = record(item.basic);
  if (item.id_str !== opusId) throw new Error('返回的 Opus ID 与当前页面不一致');
  if (item.type !== 'DYNAMIC_TYPE_ARTICLE' && basic.comment_type !== 12) return null;
  const articleId = uidString(basic.rid_str), authorMid = uidString(record(record(item.modules).module_author).mid);
  if (!articleId || !authorMid) throw new Error('专栏缺少 CV ID 或作者 UID');
  return { articleId, authorMid, opusId };
}
export function decodeArticleInfo(value: unknown, cv: string, expectedMid?: string): { authorMid: string; region: string | null } {
  const json = record(value), data = record(json.data);
  if (json.code !== 0) throw new Error(`专栏接口返回错误（${json.code ?? '未知'}）`);
  const authorMid = uidString(data.mid);
  if (!authorMid || (expectedMid && authorMid !== expectedMid)) throw new Error('专栏作者 UID 与当前内容不一致');
  if (data.id !== undefined && uidString(data.id) !== cv) throw new Error('返回的 CV ID 与请求不一致');
  return { authorMid, region: normalizeProfileRegion(data.location) };
}
