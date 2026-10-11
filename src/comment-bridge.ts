// ISOLATED 世界只负责扩展设置；评论数据和渲染留在 MAIN 世界。
const CHANNEL = 'bili-ip-region:comments:v1';
let commentsEnabled = false;
function publish(): void { window.postMessage({ channel: CHANNEL, type: 'settings', commentsEnabled }, location.origin); }
window.addEventListener('message', event => {
  if (event.source === window && event.data?.channel === CHANNEL && event.data.type === 'ready') publish();
});
void chrome.runtime.sendMessage({ type: 'preferences:get' }).then(settings => {
  commentsEnabled = settings?.preferences?.commentsEnabled === true;
  publish();
}).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.commentsEnabled) return;
  commentsEnabled = changes.commentsEnabled.newValue !== false;
  publish();
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'profile:auth-context' || window.top !== window) return;
  // 只在用户点击扩展授权按钮后，由后台请求当前网页的 CSRF 值。
  const csrf = document.cookie.match(/(?:^|;\s*)bili_jct=([a-f\d]{32})(?:;|$)/i)?.[1] ?? null;
  respond({ csrf });
});
