// CV 字段与布局参考 BiliReveal (MIT)，见 licenses/BiliReveal-MIT.txt。
import { decodeArticleInfo, resolveOpusArticle } from './article-data.ts';
import type { ArticleResult, ArticleTarget } from './article-data.ts';
import { articleRequestBody, decodeArticleResponse } from './protocol.ts';
import { metadataHeaders } from './probe.ts';
import { normalizeProfileRegion } from './profile-data.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export interface ArticleAuthorization { accessToken: string; deviceId: string; }
export class ArticleApi {
  private fetcher: Fetcher;
  constructor(fetcher: Fetcher = globalThis.fetch.bind(globalThis)) { this.fetcher = fetcher; }
  private async json(url: string): Promise<unknown> {
    const response = await this.fetcher(url, { credentials: 'include', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`专栏请求失败（HTTP ${response.status}）`);
    return response.json();
  }
  async article(target: ArticleTarget, authorization?: ArticleAuthorization): Promise<ArticleResult> {
    let articleId: string | null = target.kind === 'cv' ? target.id : null, authorMid: string | null = null;
    if (target.kind === 'opus') {
      const identity = resolveOpusArticle(await this.json(`https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=${target.id}`), target.id);
      if (!identity) return { target, articleId, authorMid, status: 'not-article', region: null, source: null };
      articleId = identity.articleId; authorMid = identity.authorMid;
    }
    const info = decodeArticleInfo(await this.json(`https://api.bilibili.com/x/article/viewinfo?id=${articleId}`), articleId!, authorMid ?? undefined);
    authorMid = info.authorMid;
    if (info.region) return { target, articleId, authorMid, status: 'ok', region: info.region, source: 'article' };
    if (authorization) {
      const response = await this.fetcher('https://app.bilibili.com/bilibili.app.dynamic.v2.Opus/OpusDetail', {
        method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: metadataHeaders(authorization.deviceId, authorization.accessToken),
        body: articleRequestBody(articleId!) as Uint8Array<ArrayBuffer>, signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`App 专栏请求失败（HTTP ${response.status}）`);
      const status = response.headers.get('grpc-status');
      if (status && status !== '0') throw new Error(`App 专栏返回错误（gRPC ${status}）`);
      const decoded = decodeArticleResponse(new Uint8Array(await response.arrayBuffer()), articleId!, target.kind === 'opus' ? target.id : undefined);
      if (decoded.authorMid !== authorMid) throw new Error('App 专栏作者 UID 与当前内容不一致');
      const region = normalizeProfileRegion(decoded.location);
      if (region) return { target, articleId, authorMid, status: 'ok', region, source: 'app-article' };
    }
    return { target, articleId, authorMid, status: 'empty', region: null, source: null };
  }
}
