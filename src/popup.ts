import { SAMPLES } from './probe.ts';
import type { Report } from './probe.ts';

const input = document.querySelector<HTMLTextAreaElement>('#ids')!;
const runButton = document.querySelector<HTMLButtonElement>('#run')!;
const copyButton = document.querySelector<HTMLButtonElement>('#copy')!;
const status = document.querySelector<HTMLElement>('#status')!;
const results = document.querySelector<HTMLElement>('#results')!;
let current: Report | null = null;
input.value = SAMPLES.join('\n');
const commentsToggle = document.querySelector<HTMLInputElement>('#comments-enabled')!;
const profilesToggle = document.querySelector<HTMLInputElement>('#profiles-enabled')!;
const articlesToggle = document.querySelector<HTMLInputElement>('#articles-enabled')!;
const dynamicsToggle = document.querySelector<HTMLInputElement>('#dynamics-enabled')!;
const runtimeVersion = chrome.runtime.getManifest().version;
document.querySelector('#version')!.textContent = `评论 · 动态 · 专栏 · 主页 · ${runtimeVersion}`;
void chrome.runtime.sendMessage({ type: 'preferences:get' }).then(settings => {
  commentsToggle.checked = settings?.preferences?.commentsEnabled === true;
  profilesToggle.checked = settings?.preferences?.profilesEnabled === true;
  articlesToggle.checked = settings?.preferences?.articlesEnabled === true;
  dynamicsToggle.checked = settings?.preferences?.dynamicsEnabled === true;
  if (settings?.version !== runtimeVersion) status.textContent = '页面与后台版本不一致，请在扩展管理页刷新后重新打开设置。';
});
commentsToggle.addEventListener('change', () => { void chrome.storage.sync.set({ commentsEnabled: commentsToggle.checked }); });
profilesToggle.addEventListener('change', () => { void chrome.storage.sync.set({ profilesEnabled: profilesToggle.checked }); });
articlesToggle.addEventListener('change', () => { void chrome.storage.sync.set({ articlesEnabled: articlesToggle.checked }); });
dynamicsToggle.addEventListener('change', () => { void chrome.storage.sync.set({ dynamicsEnabled: dynamicsToggle.checked }); });
const authButton = document.querySelector<HTMLButtonElement>('#profile-authorize')!;
const clearAuthButton = document.querySelector<HTMLButtonElement>('#profile-clear')!;
const authStatus = document.querySelector<HTMLElement>('#profile-status')!;
async function authTab(): Promise<chrome.tabs.Tab> {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!/^https:\/\/(www|space|t)\.bilibili\.com\//.test(tab?.url ?? '')) {
    const candidates = await chrome.tabs.query({ url: ['https://www.bilibili.com/*', 'https://space.bilibili.com/*', 'https://t.bilibili.com/*'] });
    tab = candidates.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  }
  if (!tab?.id) throw new Error('请先打开已登录的 B 站主页');
  return tab;
}
function renderAuth(auth: { state?: string; expiresAt?: number }): void {
  authStatus.textContent = auth.state === 'ready' ? '已授权，打开任意 UP 主主页即可查询属地。'
    : auth.state === 'expired' ? '授权已过期，请重新授权。'
    : auth.state === 'authorizing' ? '正在授权，请稍候……' : '尚未授权主页查询。';
  clearAuthButton.disabled = auth.state !== 'ready' && auth.state !== 'expired';
  authButton.textContent = auth.state === 'ready' ? '重新授权主页查询' : '授权主页查询';
}
void chrome.runtime.sendMessage({ type: 'profile:status' }).then(response => {
  if (response?.ok) renderAuth(response.auth);
  else authStatus.textContent = response?.error || '未能读取主页授权状态，请刷新扩展后重试。';
}).catch(() => { authStatus.textContent = '扩展后台未响应，请刷新扩展后重试。'; });
authButton.addEventListener('click', async () => {
  authButton.disabled = true;
  authStatus.textContent = '正在授权，请保持 B 站网页已登录……';
  try {
    const allowed = await chrome.permissions.request({ permissions: ['cookies'], origins: ['https://passport.bilibili.com/*'] });
    if (!allowed) { authStatus.textContent = '未取得当前会话与登录接口权限，可以再次点击授权。'; return; }
    const tab = await authTab();
    const response = await chrome.runtime.sendMessage({ type: 'profile:auth:start', tabId: tab.id, confirmed: true });
    if (!response?.ok) throw new Error(response?.error || '主页授权失败');
    renderAuth(response.auth);
  } catch (error) { authStatus.textContent = error instanceof Error ? error.message : '主页授权失败，请重新尝试'; }
  finally { authButton.disabled = false; }
});
clearAuthButton.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'profile:auth:clear' });
  if (response?.ok) renderAuth(response.auth);
});
if (location.hash === '#diagnostics') document.querySelector<HTMLDetailsElement>('#diagnostics')!.open = true;

function render(report: Report): void {
  if (report.version !== runtimeVersion) {
    current = null; copyButton.disabled = true; results.replaceChildren();
    status.textContent = `报告版本 ${report.version} 与当前 ${runtimeVersion} 不一致，请重新验证。`;
    return;
  }
  current = report;
  copyButton.disabled = false;
  status.textContent = !report.results.length ? '专栏查询已完成。' : report.gatePassed ? '通过：至少两个发布者的动态返回有效属地。'
    : '尚未通过：未取得两个发布者的有效动态属地。';
  const session = report.webLoggedIn === true ? '已登录' : report.webLoggedIn === false ? '未登录' : '未确认';
  document.querySelector('#session')!.textContent = `网页登录：${session} · App 会话：${report.appAuthorized ? '已授权' : '未授权'}`;
  results.replaceChildren();
  for (const result of report.results) {
    const row = document.createElement('article');
    const title = document.createElement('strong');
    title.textContent = `${result.method} · ${new URL(result.endpoint).hostname}`;
    const body = document.createElement('p');
    const data = result.decoded;
    body.textContent = [
      `动态：${result.requestedId}`,
      `返回 ID：${data?.returnedId ?? '无'}${result.idMatches ? ' ✓' : ''}`,
      `发布者：${data?.authorMid ?? '无'}`,
      `属地：${data ? data.location ?? (data.locationFieldPresent ? '空字符串' : '字段未返回') : '未取得可解析的数据'}`,
      `来源：${data?.locationSource === 'copyright' ? '动态详情底部' : data?.locationSource === 'author' ? '作者时间信息' : '无'} · 底部模块：${data?.copyrightModulePresent ? '已返回' : '未返回'}`,
      `HTTP：${result.httpStatus ?? '无'} · 响应：${result.bytes} 字节`,
      result.error ? `结果：${result.error}` : '结果：已解析响应',
    ].join('\n');
    row.append(title, body);
    results.append(row);
  }
  for (const article of report.articles ?? []) {
    const row = document.createElement('article'), title = document.createElement('strong'), body = document.createElement('p');
    title.textContent = `专栏 · ${article.target.kind}/${article.target.id}`;
    body.textContent = [`CV ID：${article.articleId ?? '无'}`, `作者：${article.authorMid ?? '无'}`,
      `发表属地：${article.region ?? '未返回'}`, `来源：${article.source === 'article' ? '文章接口' : article.source === 'app-article' ? 'App 文章详情' : '无'}`,
      `结果：${article.error ?? ({ ok: '已取得属地', empty: '属地为空', 'not-article': '该内容不是专栏', disabled: '专栏开关已关闭', error: '请求失败' }[article.status])}`].join('\n');
    row.append(title, body); results.append(row);
  }
}

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  status.textContent = '正在验证两种动态接口，请保持此页面打开……';
  try {
    const ids = input.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    const articleUrl = document.querySelector<HTMLInputElement>('#article-url')!.value.trim();
    const response = await chrome.runtime.sendMessage({ type: 'probe:run', ids, articleUrl });
    if (!response?.ok) throw new Error(response?.error || '扩展后台没有返回结果');
    render(response.report);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : '验证失败';
  } finally { runButton.disabled = false; }
});

copyButton.addEventListener('click', async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(current, null, 2));
    copyButton.textContent = '已复制报告';
  } catch { status.textContent = '复制失败，可以在完整验证页面重试。'; }
});

document.querySelector<HTMLAnchorElement>('#open')!.href = chrome.runtime.getURL('popup.html#diagnostics');
void chrome.storage.local.get<{ lastProbe?: Report }>('lastProbe')
  .then(stored => {
    if (stored.lastProbe?.version === chrome.runtime.getManifest().version) render(stored.lastProbe);
    else if (stored.lastProbe) status.textContent = '检测到旧版本诊断报告，请重新验证。';
  });
