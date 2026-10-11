import { decodeBinding } from './dynamic-data.ts';
import type { ContentBinding, DynamicResult } from './dynamic-data.ts';
import type { ArticleResult } from './article-data.ts';
if (window.top === window) {
  const MARKER = 'data-bili-ip-content', OWNED = '[data-bili-ip-region-body]';
  interface State { binding: ContentBinding; signature: string; result?: DynamicResult | ArticleResult; label?: HTMLElement; loading: boolean; epoch: number; nextRefresh: number; }
  const states = new Map<Element, State>();
  const visible = new Set<Element>();
  let dynamicsEnabled = false, articlesEnabled = false, timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = 0;
  function read(el: Element): ContentBinding | null { try { return decodeBinding(JSON.parse(el.getAttribute(MARKER) ?? 'null')); } catch { return null; } }
  function enabled(binding: ContentBinding): boolean { return binding.kind === 'article' ? articlesEnabled : dynamicsEnabled; }
  function clear(el: Element): void { const state = states.get(el); state?.label?.remove(); if (state) state.label = undefined; }
  function schedule(): void { if (timer === undefined) timer = setTimeout(() => { timer = undefined; void update(); }, 80); }
  const observer = new IntersectionObserver(entries => { for (const entry of entries) { if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target); } schedule(); }, { rootMargin: '600px' });
  function reset(): void { for (const [el,state] of states) { clear(el); state.epoch++; state.result = undefined; state.loading = false; state.nextRefresh = 0; } schedule(); }
  function place(el: Element, state: State): void {
    const { binding, result } = state;
    el.setAttribute('data-bili-ip-region-status', !enabled(binding) ? 'disabled' : state.loading ? 'pending' : result?.status ?? 'waiting');
    if (!enabled(binding) || result?.status !== 'ok' || !result.region) { clear(el); return; }
    let label = state.label;
    if (!label) { label = document.createElement('span'); label.dataset.biliIpRegionBody = ''; state.label = label; }
    label.dataset.contentId = binding.id; label.dataset.authorMid = result.authorMid ?? ''; label.dataset.contentRole = binding.role;
    if ('target' in result) label.dataset.articleId = result.articleId ?? ''; else delete label.dataset.articleId;
    label.textContent = binding.kind === 'article' ? `IP属地：${result.region}` : result.region;
    label.title = `${binding.role === 'original' ? '原动态' : binding.kind === 'article' ? '该专栏' : '该动态'}发表时的 IP 属地`;
    label.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;margin-inline-start:8px;padding:2px 8px;border-radius:999px;background:#61666d;color:#fff;text-shadow:none;font-size:inherit;font-weight:400;font-family:inherit;line-height:1.5;white-space:nowrap;vertical-align:middle;';
    if (el.matches('.bili-dyn-time')) { if (label.previousSibling !== el) el.after(label); }
    else if (label.parentNode !== el) el.append(label);
  }
  async function load(el: Element, state: State): Promise<void> {
    const epoch = state.epoch; state.loading = true; inFlight++;
    try {
      const binding = state.binding;
      const message = binding.kind === 'article' ? { type: 'article:get', target: { kind: 'opus', id: binding.id }, authorMid: binding.authorMid }
        : { type: 'dynamic:get', id: binding.id, authorMid: binding.authorMid };
      const response = await chrome.runtime.sendMessage(message);
      if (states.get(el) !== state || state.epoch !== epoch || !enabled(binding) || JSON.stringify(read(el)) !== state.signature) return;
      const result: DynamicResult | ArticleResult | undefined = response?.ok ? response.result : undefined;
      const id = result && ('target' in result ? result.target.id : result.id);
      state.result = id === binding.id && (!binding.authorMid || result?.authorMid === binding.authorMid) ? result : undefined;
      state.loading = false;
      state.nextRefresh = Date.now() + (state.result?.status === 'error' || !state.result ? 30000 : 5 * 60000);
      place(el, state);
    } catch { if (states.get(el) === state && state.epoch === epoch) { state.nextRefresh = Date.now() + 30000; el.setAttribute('data-bili-ip-region-status', 'error'); clear(el); } }
    finally { if (state.epoch === epoch) state.loading = false; inFlight--; schedule(); }
  }
  async function update(): Promise<void> {
    for (const [el] of states) if (!el.isConnected || !read(el)) { clear(el); observer.unobserve(el); visible.delete(el); states.delete(el); }
    for (const el of document.querySelectorAll(`[${MARKER}]`)) {
      const binding = read(el); if (!binding) continue;
      const signature = JSON.stringify(binding); let state = states.get(el);
      if (!state || state.signature !== signature) {
        if (state) clear(el);
        state = { binding, signature, loading: false, epoch: 0, nextRefresh: 0 }; states.set(el, state); observer.observe(el);
      }
      place(el, state);
      if (!enabled(binding) || !visible.has(el) || state.loading || Date.now() < state.nextRefresh || inFlight >= 3) continue;
      void load(el, state);
    }
  }
  chrome.runtime.onMessage.addListener((message, sender) => { if (sender.id === chrome.runtime.id && message?.type === 'profile:state-changed') reset(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || (!changes.dynamicsEnabled && !changes.articlesEnabled)) return;
    if (changes.dynamicsEnabled) dynamicsEnabled = changes.dynamicsEnabled.newValue !== false;
    if (changes.articlesEnabled) articlesEnabled = changes.articlesEnabled.newValue !== false;
    reset();
  });
  void chrome.runtime.sendMessage({ type: 'preferences:get' }).then(value => { dynamicsEnabled = value?.preferences?.dynamicsEnabled === true; articlesEnabled = value?.preferences?.articlesEnabled === true; schedule(); }).catch(() => {});
  new MutationObserver(mutations => {
    if (mutations.every(mutation => (mutation.target instanceof Element && mutation.target.closest(OWNED)) || (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes].every(node => node instanceof Element && node.matches(OWNED))))) return;
    schedule();
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: [MARKER] });
  setInterval(schedule, 1000); schedule();
}
