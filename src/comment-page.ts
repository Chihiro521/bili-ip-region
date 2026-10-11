// Lit / bbComment hooks adapted from MaxChang3/BiliReveal (MIT).
// Copyright (c) 2023-present MaxChang3. See licenses/BiliReveal-MIT.txt.
import { collectReplyLocations, replyId, replyLocation } from './comment-data.ts';
import type { Reply } from './comment-data.ts';

const CHANNEL = 'bili-ip-region:comments:v1';
const TAG = 'bili-comment-action-buttons-renderer';
const OWNED = '[data-bili-ip-region]';
const LEGACY = '.reply-item,.sub-reply-item,.list-item[data-id],.reply-wrap[data-id],.reply-wrap[data-rpid]';
type CommentElement = HTMLElement & { data?: Reply; update?: (...args: unknown[]) => unknown; __vue__?: unknown; __vueParentComponent?: unknown };
let enabled = false;
const regions = new Map<string, string | null>();
const roots = new Map<ParentNode, MutationObserver>();
const pending = new Set<ParentNode>();
const patched = new WeakSet<object>();
let timer: ReturnType<typeof setTimeout> | undefined;

function owned(node: Node): boolean {
  return (node instanceof Element ? node : node.parentElement)?.closest(OWNED) != null;
}
function schedule(node: ParentNode = document): void {
  pending.add(node);
  if (timer !== undefined) return;
  timer = setTimeout(() => {
    timer = undefined;
    const batch = [...pending]; pending.clear();
    for (const root of batch) try { scan(root); } catch { /* 页面更换节点时忽略已失效节点。 */ }
    for (const [root, observer] of roots) {
      if (root instanceof ShadowRoot && !root.host.isConnected) { observer.disconnect(); roots.delete(root); }
    }
  }, 80);
}
function observe(root: ParentNode): void {
  if (roots.has(root)) return;
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (owned(mutation.target)) continue;
      if (mutation.type === 'childList') {
        const changes = [...mutation.addedNodes, ...mutation.removedNodes];
        if (changes.length && changes.every(owned)) continue;
        for (const node of mutation.addedNodes) if (node instanceof Element) schedule(node);
      }
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target === document.documentElement || target === document.body) {
        if (mutation.type === 'attributes') schedule(document); // 明暗主题、字号变化。
      } else if (target) schedule(target.closest(LEGACY) ?? target.getRootNode() as ParentNode);
    }
  });
  observer.observe(root as Node, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['data-id', 'data-rpid', 'class', 'style'] });
  roots.set(root, observer);
}

function place(time: HTMLElement | null, region: string | null, id: string | null): void {
  const parent = time?.parentNode;
  // 当前 Lit 组件的 #pubdate 是 ShadowRoot 的直接子节点，没有 parentElement。
  if (!time || !(parent instanceof Element || parent instanceof ShadowRoot)) return;
  const siblings = [...parent.children].filter(el => el.matches(OWNED));
  if (!enabled || !region || !id) { siblings.forEach(el => el.remove()); return; }
  let label = siblings.shift() as HTMLElement | undefined;
  siblings.forEach(el => el.remove());
  if (!label) { label = document.createElement('span'); label.dataset.biliIpRegion = ''; }
  if (label.dataset.replyId !== id) label.dataset.replyId = id;
  if (label.textContent !== region) label.textContent = region;
  const style = getComputedStyle(time);
  const css = `display:inline-block;margin-inline-start:8px;color:${style.color};font-size:${style.fontSize};font-family:inherit;line-height:inherit;white-space:nowrap;`;
  if (label.style.cssText !== css) label.style.cssText = css;
  if (time.nextElementSibling !== label) time.after(label);
}
function renderLit(node: CommentElement): void {
  const root = node.shadowRoot;
  if (!root) return;
  const id = replyId(node.data);
  const region = node.data?.reply_control && 'location' in node.data.reply_control
    ? replyLocation(node.data) : id ? regions.get(id) ?? null : null;
  place(root.querySelector<HTMLElement>('#pubdate'), region, id);
  // 时间节点被客户端替换时也清理旧标签。
  for (const label of root.querySelectorAll<HTMLElement>(OWNED)) {
    if (!enabled || !id || label.dataset.replyId !== id || !label.previousElementSibling?.matches('#pubdate')) label.remove();
  }
}
function componentReply(node: CommentElement): Reply | undefined {
  const isSubReply = node.matches('.sub-reply-item');
  const vue = node.__vue__ as { vnode?: { props?: { reply?: Reply; subReply?: Reply } } } | undefined;
  const props = vue?.vnode?.props;
  const direct = isSubReply ? props?.subReply : props?.reply;
  if (direct) return direct;
  let component = node.__vueParentComponent as { props?: { reply?: Reply; subReply?: Reply }; parent?: unknown } | undefined;
  for (let i = 0; component && i < 8; i++) {
    const reply = isSubReply ? component.props?.subReply : component.props?.reply;
    if (reply) return reply;
    component = component.parent as typeof component;
  }
  return undefined;
}
function renderLegacy(node: CommentElement): void {
  const reply = componentReply(node);
  const attributeId = node.getAttribute('data-rpid') ?? node.getAttribute('data-id');
  const id = reply ? replyId(reply) : replyId({ rpid_str: attributeId });
  const region = reply ? replyLocation(reply) : id ? regions.get(id) ?? null : null;
  const time = [...node.querySelectorAll<HTMLElement>('.reply-time,.sub-reply-time,.reply-info .time,.sub-reply-info .time,.info .time')]
    .find(el => el.closest(LEGACY) === node) ?? null;
  place(time, region, id);
  for (const label of node.querySelectorAll<HTMLElement>(OWNED)) {
    if (label.closest(LEGACY) !== node) continue;
    if (!enabled || !id || label.dataset.replyId !== id || label.previousElementSibling !== time) label.remove();
  }
}
function scan(root: ParentNode): void {
  if (root instanceof Element && !root.isConnected) return;
  if (root === document || root instanceof ShadowRoot) observe(root);
  const elements = [...root.querySelectorAll<HTMLElement>('*')];
  if (root instanceof HTMLElement) elements.unshift(root);
  for (const node of elements) {
    if (node.localName === TAG) renderLit(node as CommentElement);
    else if (node.matches(LEGACY)) renderLegacy(node as CommentElement);
    if (node.shadowRoot) { observe(node.shadowRoot); scan(node.shadowRoot); }
  }
}

function patchLit(constructor: CustomElementConstructor | undefined): void {
  const prototype = constructor?.prototype as CommentElement | undefined;
  if (!prototype || patched.has(prototype) || typeof prototype.update !== 'function') return;
  const original = prototype.update;
  prototype.update = new Proxy(original, { apply(target, receiver: CommentElement, args) {
    const result = Reflect.apply(target, receiver, args);
    try { renderLit(receiver); } catch { /* 保持组件原生命周期结果。 */ }
    return result;
  } });
  patched.add(prototype);
}
const originalDefine = customElements.define;
customElements.define = new Proxy(originalDefine, { apply(target, receiver, args: Parameters<typeof originalDefine>) {
  if (args[0] === TAG) patchLit(args[1]);
  return Reflect.apply(target, receiver, args);
} });
patchLit(customElements.get(TAG));

const originalAttach = Element.prototype.attachShadow;
Element.prototype.attachShadow = new Proxy(originalAttach, { apply(target, receiver: Element, args: [ShadowRootInit]) {
  const root = Reflect.apply(target, receiver, args) as ShadowRoot;
  if (args[0].mode === 'open') { observe(root); schedule(root); }
  return root;
} });

type LegacyConstructor = { prototype?: Record<string, unknown> };
function patchLegacy(value: LegacyConstructor | undefined): void {
  const prototype = value?.prototype;
  if (!prototype) return;
  for (const name of ['_createListCon', '_createSubReplyItem']) {
    const original = prototype[name];
    if (typeof original !== 'function' || patched.has(original)) continue;
    const wrapper = new Proxy(original, { apply(target, receiver, args) {
      const result = Reflect.apply(target, receiver, args);
      try { collectReplyLocations(args[0], regions); schedule(); } catch { /* 不改变原 HTML。 */ }
      return result;
    } });
    prototype[name] = wrapper;
    patched.add(wrapper);
  }
}
const pageWindow = window as unknown as { bbComment?: LegacyConstructor };
patchLegacy(pageWindow.bbComment);
const descriptor = Object.getOwnPropertyDescriptor(window, 'bbComment');
if (!descriptor || (descriptor.configurable && !descriptor.get && !descriptor.set)) {
  let value = pageWindow.bbComment;
  Object.defineProperty(window, 'bbComment', { configurable: true, enumerable: descriptor?.enumerable ?? true,
    get: () => value, set: next => { value = next; patchLegacy(next); } });
}

function isReplyRequest(input: string): boolean {
  try {
    const url = new URL(input, location.href);
    return url.hostname === 'api.bilibili.com' && /^\/x\/v2\/reply(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}
function remember(data: unknown): void { collectReplyLocations(data, regions); schedule(); }
const originalFetch = window.fetch;
window.fetch = new Proxy(originalFetch, { apply(target, receiver, args: Parameters<typeof fetch>) {
  const result: Promise<Response> = Reflect.apply(target, receiver, args);
  const input = args[0];
  const url = input instanceof Request ? input.url : String(input);
  if (isReplyRequest(url)) void result.then(response => {
    if (response.ok) void response.clone().json().then(remember).catch(() => {});
  }).catch(() => {});
  return result;
} });
const xhrUrls = new WeakMap<XMLHttpRequest, string>();
const xhrObserved = new WeakSet<XMLHttpRequest>();
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = new Proxy(originalOpen, { apply(target, receiver: XMLHttpRequest, args) {
  const result = Reflect.apply(target, receiver, args);
  xhrUrls.set(receiver, String(args[1]));
  if (!xhrObserved.has(receiver)) {
    xhrObserved.add(receiver);
    receiver.addEventListener('load', () => {
      if (!isReplyRequest(xhrUrls.get(receiver) ?? '') || receiver.status < 200 || receiver.status >= 300) return;
      try { remember(receiver.responseType === 'json' ? receiver.response : JSON.parse(receiver.responseText)); } catch { /* 失败响应不插入标签。 */ }
    });
  }
  return result;
} });

window.addEventListener('message', event => {
  if (event.source !== window || event.data?.channel !== CHANNEL || event.data.type !== 'settings' || typeof event.data.commentsEnabled !== 'boolean') return;
  enabled = event.data.commentsEnabled;
  schedule();
});
window.postMessage({ channel: CHANNEL, type: 'ready' }, location.origin);
schedule();
