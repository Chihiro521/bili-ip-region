import { spaceUid } from './profile-data.ts';
import type { ProfileResult } from './profile-data.ts';
// ISOLATED 世界：仅接收后台返回的目标 UID 和地区，不接触 App 凭据。
if (window.top === window) {
  const OWNED = '[data-bili-ip-region-profile]';
  let enabled = false, uid: string | null = null, result: ProfileResult | null = null;
  let epoch = 0, loading = false, nextRefresh = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear(): void { document.querySelectorAll(OWNED).forEach(node => node.remove()); }
  function schedule(): void { if (timer === undefined) timer = setTimeout(() => { timer = undefined; void update(); }, 80); }
  function reset(): void { epoch++; loading = false; result = null; nextRefresh = 0; clear(); schedule(); }
  function place(): void {
    const labels = [...document.querySelectorAll<HTMLElement>(OWNED)];
    const parent = document.querySelector<HTMLElement>('.upinfo-detail__top')
      ?? document.querySelector<HTMLElement>('.h-basic > div');
    if (!enabled || !uid || result?.uid !== uid || result.status !== 'ok' || !result.region || !parent) { clear(); return; }
    let label = labels.shift(); labels.forEach(node => node.remove());
    if (!label) { label = document.createElement('span'); label.dataset.biliIpRegionProfile = ''; }
    const text = `IP属地：${result.region}`;
    if (label.textContent !== text) label.textContent = text;
    if (label.dataset.profileUid !== uid) label.dataset.profileUid = uid;
    label.title = '该账号个人主页的 IP 属地';
    const style = 'display:inline-flex;align-items:center;flex-shrink:0;margin-inline-start:6px;padding:1px 6px;border-radius:999px;background:#61666d;color:#fff;text-shadow:none;font-size:12px;font-weight:400;font-family:inherit;line-height:16px;white-space:nowrap;vertical-align:middle;';
    if (label.style.cssText !== style) label.style.cssText = style;
    if (label.parentElement !== parent) parent.append(label);
  }
  async function update(): Promise<void> {
    const nextUid = spaceUid(location.href);
    if (nextUid !== uid) { uid = nextUid; reset(); }
    place();
    if (!enabled || !uid || loading || (result && Date.now() < nextRefresh)) return;
    const requestedUid = uid, requestedEpoch = epoch;
    loading = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'profile:get', uid: requestedUid });
      if (epoch !== requestedEpoch || spaceUid(location.href) !== requestedUid || !enabled) return;
      result = response?.ok && response.result?.uid === requestedUid ? response.result
        : { uid: requestedUid, status: 'error', region: null };
      nextRefresh = Date.now() + (result?.status === 'error' ? 30000 : 5 * 60000);
      place();
    } catch { if (epoch === requestedEpoch) { result = { uid: requestedUid, status: 'error', region: null }; nextRefresh = Date.now() + 30000; clear(); } }
    finally { if (epoch === requestedEpoch) loading = false; }
  }
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message?.type === 'profile:state-changed') reset();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.profilesEnabled) return;
    enabled = changes.profilesEnabled.newValue !== false; reset();
  });
  void chrome.runtime.sendMessage({ type: 'preferences:get' }).then(value => { enabled = value?.preferences?.profilesEnabled === true; schedule(); }).catch(() => {});
  const observer = new MutationObserver(mutations => {
    if (mutations.every(mutation => {
      const node = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return !!node?.closest(OWNED) || (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes]
        .every(node => node instanceof Element && node.matches(OWNED)));
    })) return;
    schedule();
  });
  observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
  navigation?.addEventListener('navigatesuccess', schedule);
  setInterval(() => { if (spaceUid(location.href) !== uid || (result && Date.now() >= nextRefresh)) schedule(); }, 1000);
  schedule();
}
