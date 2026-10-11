const OWNED = '[data-bili-ip-region-body],[data-bili-ip-region-article]';

// 时间行的容器和内部文字可能使用不同字号；以标签旁实际可见的文字为准。
export function metadataFontSize(anchor: Element): string {
  let fontSize = getComputedStyle(anchor).fontSize;
  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || parent.closest(OWNED) || !parent.getClientRects().length) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === 'visible') fontSize = style.fontSize;
  }
  return fontSize;
}
