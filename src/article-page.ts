import { articleTarget, sameArticle } from './article-data.ts';
import type { ArticleResult, ArticleTarget } from './article-data.ts';
import { normalizeProfileRegion } from './profile-data.ts';
import { metadataFontSize } from './region-style.ts';

// ISOLATED 世界：依据当前内容的 URL 取数，后台负责 Opus / CV / 作者对应关系。
if (window.top === window) {
  const OWNED = '[data-bili-ip-region-article]';
  let enabled = false, target: ArticleTarget | null = null, result: ArticleResult | null = null;
  let epoch = 0, loading = false, nextRefresh = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear(): void { document.querySelectorAll(OWNED).forEach(node => node.remove()); }
  function schedule(): void { if (timer === undefined) timer = setTimeout(() => { timer = undefined; void update(); }, 80); }
  function reset(): void { epoch++; loading = false; result = null; nextRefresh = 0; clear(); schedule(); }
  function place(): void {
    const anchor = target?.kind === 'cv' ? document.querySelector<HTMLElement>('.article-detail .publish-text')
      : document.querySelector<HTMLElement>('.opus-module-author__pub');
    const region = normalizeProfileRegion(result?.region);
    if (!enabled || !sameArticle(target, result?.target) || result?.status !== 'ok' || !region || !anchor?.parentNode) { clear(); return; }
    const labels = [...document.querySelectorAll<HTMLElement>(OWNED)];
    let label = labels.shift(); labels.forEach(node => node.remove());
    if (!label) { label = document.createElement('span'); label.dataset.biliIpRegionArticle = ''; }
    const text = `IP属地：${region}`;
    if (label.textContent !== text) label.textContent = text;
    label.dataset.articleId = result.articleId ?? ''; label.dataset.contentId = target!.id;
    label.title = '该专栏发表时的 IP 属地';
    label.style.cssText = `display:inline-flex;align-items:center;flex-shrink:0;margin-inline-start:6px;padding:1px 6px;border-radius:999px;background:#61666d;color:#fff;text-shadow:none;font-size:${metadataFontSize(anchor)};font-weight:400;font-family:inherit;line-height:1.25;white-space:nowrap;vertical-align:middle;`;
    if (target!.kind === 'opus') { if (label.parentNode !== anchor) anchor.append(label); }
    else if (label.previousSibling !== anchor) anchor.after(label);
  }
  async function update(): Promise<void> {
    const parsed = articleTarget(location.href);
    const next = parsed?.kind === 'cv' ? parsed : null;
    if (!sameArticle(next, target) && (next || target)) { target = next; reset(); }
    place();
    if (!enabled || !target || loading || (result && Date.now() < nextRefresh)) return;
    const requested = target, requestedEpoch = epoch;
    loading = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'article:get', target: requested });
      if (epoch !== requestedEpoch || !sameArticle(articleTarget(location.href), requested) || !enabled) return;
      result = response?.ok && sameArticle(response.result?.target, requested) ? response.result
        : { target: requested, articleId: null, authorMid: null, status: 'error', region: null, source: null };
      nextRefresh = Date.now() + (result?.status === 'error' ? 30000 : 5 * 60000);
      place();
    } catch { if (epoch === requestedEpoch) { result = { target: requested, articleId: null, authorMid: null, status: 'error', region: null, source: null }; nextRefresh = Date.now() + 30000; clear(); } }
    finally { if (epoch === requestedEpoch) loading = false; }
  }
  chrome.runtime.onMessage.addListener((message, sender) => { if (sender.id === chrome.runtime.id && message?.type === 'profile:state-changed') reset(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.articlesEnabled) return;
    enabled = changes.articlesEnabled.newValue !== false; reset();
  });
  void chrome.runtime.sendMessage({ type: 'preferences:get' }).then(value => { enabled = value?.preferences?.articlesEnabled === true; schedule(); }).catch(() => {});
  new MutationObserver(mutations => {
    if (mutations.every(mutation => {
      const node = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return !!node?.closest(OWNED) || (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes]
        .every(node => node instanceof Element && node.matches(OWNED)));
    })) return;
    schedule();
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
  for (const event of ['popstate', 'pageshow']) window.addEventListener(event, schedule);
  (window as unknown as { navigation?: EventTarget }).navigation?.addEventListener('navigatesuccess', schedule);
  setInterval(() => { const parsed = articleTarget(location.href), next = parsed?.kind === 'cv' ? parsed : null; if ((!sameArticle(next, target) && (next || target)) || (result && Date.now() >= nextRefresh)) schedule(); }, 1000);
  schedule();
}
