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
