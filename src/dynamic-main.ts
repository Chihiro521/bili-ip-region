import { decodeBinding, itemBinding, record } from './dynamic-data.ts';
import type { ContentBinding } from './dynamic-data.ts';
import { parseDynamicId } from './protocol.ts';
import { uidString } from './profile-data.ts';

// MAIN 世界仅读取公开内容的 ID / UID，ISOLATED 世界负责与后台通信。
if (window.top === window) {
  const MARKER = 'data-bili-ip-content';
  const SELECTOR = '.bili-dyn-time,.bili-dyn-content__orig__author,.opus-module-author__pub';
  let timer: ReturnType<typeof setTimeout> | undefined;
  function component(el: Element): Record<string, unknown> {
    const value = el as Element & { __vue__?: unknown; __vueParentComponent?: unknown };
    return record(value.__vue__ ?? value.__vueParentComponent);
  }
  function props(el: Element): Record<string, unknown> { const value = component(el); return record(value.$props ?? value.props); }
  function binding(el: Element): ContentBinding | null {
    const original = el.matches('.bili-dyn-content__orig__author');
    const local = props(el), comp = component(el);
    if (!original) {
      const id = uidString(local.id ?? comp.id), author = record(local.author ?? comp.author);
      if (id) {
        const card = el.closest('.bili-dyn-item'), data = card ? props(card).data ?? component(card).data : undefined;
        const item = itemBinding(data);
        return decodeBinding({ id, authorMid: uidString(author.mid), kind: item?.id === id ? item.kind : 'dynamic', role: 'post' });
      }
    }
    // 只在当前卡片内查找 data；转发中的原动态使用 data.orig。
    const card = el.closest('.bili-dyn-item');
    for (let node: Element | null = el; node; node = node.parentElement) {
      const values = props(node), owner = component(node);
      const data = values.data ?? values.item ?? owner.data;
      const candidate = itemBinding(original ? record(data).orig : data, original ? 'original' : 'post');
      if (candidate) return candidate;
      if (node === card || (!card && node.matches('.opus-module-author'))) break;
    }
    if (original) return null;
    // 详情页的 SSR 数据必须与地址 ID 一致，避免 SPA 留下上一条内容。
    try {
      const id = parseDynamicId(location.href), state = record((window as Window & { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__);
      const detail = record(state.detail);
      if (detail.id_str !== id) return null;
      const author = record(props(el.closest('.opus-module-author') ?? el).data);
      const basic = record(detail.basic);
      return decodeBinding({ id, authorMid: uidString(author.mid ?? basic.uid), kind: basic.comment_type === 12 ? 'article' : 'dynamic', role: 'post' });
    } catch { return null; }
  }
  function scan(): void {
    document.querySelectorAll(`[${MARKER}]`).forEach(el => { if (!el.matches(SELECTOR)) el.removeAttribute(MARKER); });
    document.querySelectorAll(SELECTOR).forEach(el => {
      const value = binding(el), text = value ? JSON.stringify(value) : null;
      if (text) { if (el.getAttribute(MARKER) !== text) el.setAttribute(MARKER, text); }
      else if (el.hasAttribute(MARKER)) el.removeAttribute(MARKER);
    });
  }
  function schedule(): void { if (timer === undefined) timer = setTimeout(() => { timer = undefined; scan(); }, 80); }
  new MutationObserver(mutations => {
    if (mutations.every(mutation => (mutation.target instanceof Element && mutation.target.closest('[data-bili-ip-region-body]'))
      || (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes].every(node => node instanceof Element && node.matches('[data-bili-ip-region-body]'))))) return;
    schedule();
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  for (const event of ['popstate', 'pageshow']) window.addEventListener(event, schedule);
  setInterval(schedule, 1000); schedule();
}
