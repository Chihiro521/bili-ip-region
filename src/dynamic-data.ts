import { uidString } from './profile-data.ts';
type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue { return value && typeof value === 'object' ? value as RecordValue : {}; }
export interface ContentBinding { id: string; authorMid: string | null; kind: 'dynamic' | 'article'; role: 'post' | 'original'; }
export interface DynamicResult { id: string; authorMid: string | null; status: 'ok' | 'empty' | 'auth-required' | 'disabled' | 'error'; region: string | null; source?: string; error?: string; }
export function itemBinding(value: unknown, role: ContentBinding['role'] = 'post'): ContentBinding | null {
  const item = record(value), id = uidString(item.id_str);
  if (!id) return null;
  return { id, authorMid: uidString(record(record(item.modules).module_author).mid), kind: item.type === 'DYNAMIC_TYPE_ARTICLE' || record(item.basic).comment_type === 12 ? 'article' : 'dynamic', role };
}
export function decodeBinding(value: unknown): ContentBinding | null {
  const data = record(value), id = uidString(data.id);
  const authorMid = data.authorMid === null ? null : uidString(data.authorMid);
  return id && (data.authorMid === null || authorMid) && (data.kind === 'dynamic' || data.kind === 'article') && (data.role === 'post' || data.role === 'original')
    ? { id, authorMid, kind: data.kind, role: data.role } : null;
}
export function dynamicPage(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && ((url.hostname === 't.bilibili.com' && /^\/(?:[1-9]\d*\/?)?$/.test(url.pathname))
      || (url.hostname === 'space.bilibili.com' && /^\/[1-9]\d*(?:\/|$)/.test(url.pathname))
      || (url.hostname === 'www.bilibili.com' && /^\/opus\/[1-9]\d*\/?$/.test(url.pathname)));
  } catch { return false; }
}
