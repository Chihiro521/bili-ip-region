import { runProbe, SAMPLES } from './probe.ts';
import { parseDynamicId } from './protocol.ts';
import { initializeStorage, preferences } from './preferences.ts';
import { authorizeProfile, clearProfileCredential, getProfile, profileAuthStatus, contentAuthorization } from './profile-background.ts';
import { spaceUid } from './profile-data.ts';
import { articleTarget, sameArticle } from './article-data.ts';
import { getArticle } from './article-background.ts';
import { configureHeaders } from './request-headers.ts';
import { dynamicPage } from './dynamic-data.ts';
import { uidString } from './profile-data.ts';
import { getDynamic } from './dynamic-background.ts';
import { ProfileAuthorizationError } from './profile-api.ts';

let activeProbe: Promise<unknown> | null = null;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const popup = sender.url?.split('#')[0] === chrome.runtime.getURL('popup.html');
  let page = false;
  try { const url = new URL(sender.url ?? ''); page = url.protocol === 'https:' && ['www.bilibili.com', 't.bilibili.com', 'space.bilibili.com'].includes(url.hostname); } catch { /* 非 B 站页面。 */ }
  const respond = (task: Promise<unknown>) => {
    task.then(value => sendResponse({ ok: true, ...value as object })).catch(error => sendResponse({ ok: false,
      error: error instanceof Error ? error.message : '请求失败',
      ...(error instanceof ProfileAuthorizationError ? { errorCode: error.code ?? null, errorStage: error.stage, serverMessage: error.serverMessage } : {}) }));
  };
  if (message?.type === 'preferences:get' && (popup || page)) {
    respond(initializeStorage.then(async () => ({ preferences: await preferences(), version: chrome.runtime.getManifest().version }))); return true;
  }
  // SPA 切换时 sender.url 仍是脚本初次注入的 URL，tab.url 才是当前主页。
  if (message?.type === 'profile:get' && page && sender.frameId === 0 && typeof message.uid === 'string'
    && spaceUid(sender.tab?.url ?? sender.url ?? '') === message.uid) {
    respond(initializeStorage.then(async () => ({ result: await getProfile(message.uid) }))); return true;
  }
  if (message?.type === 'article:get' && page && sender.frameId === 0) {
    const url = sender.tab?.url ?? sender.url ?? '', current = articleTarget(url);
    const target = sameArticle(current, message.target) ? current : dynamicPage(url) && message.target?.kind === 'opus' && uidString(message.target.id)
      ? { kind: 'opus' as const, id: message.target.id } : null;
    if (!target) return;
    respond(initializeStorage.then(async () => ({ result: await getArticle(target) }))); return true;
  }
  if (message?.type === 'dynamic:get' && page && sender.frameId === 0 && dynamicPage(sender.tab?.url ?? sender.url ?? '')
    && uidString(message.id) && (message.authorMid === null || uidString(message.authorMid))) {
    respond(initializeStorage.then(async () => ({ result: await getDynamic(message.id, message.authorMid) }))); return true;
  }
  if (popup && message?.type === 'profile:status') {
    respond(initializeStorage.then(async () => ({ auth: await profileAuthStatus() }))); return true;
  }
  if (popup && message?.type === 'profile:auth:start' && message.confirmed === true && Number.isSafeInteger(message.tabId)) {
    respond(initializeStorage.then(async () => { await authorizeProfile(message.tabId); return { auth: await profileAuthStatus() }; })); return true;
  }
  if (popup && message?.type === 'profile:auth:clear') {
    respond(initializeStorage.then(async () => { await clearProfileCredential(); return { auth: await profileAuthStatus() }; })); return true;
  }
  if (!popup) return;
  if (message?.type !== 'probe:run') return;
  if (!activeProbe) {
    activeProbe = (async () => {
      const values = Array.isArray(message.ids) ? message.ids : SAMPLES;
      const article = typeof message.articleUrl === 'string' && message.articleUrl.trim() ? articleTarget(message.articleUrl.trim()) : null;
      if (message.articleUrl && !article) throw new Error('专栏请输入完整的 cv 或 opus 网页链接');
      if ((!values.length && !article) || values.length > 4 || values.some((value: unknown) => typeof value !== 'string')) {
        throw new Error('每次请输入 1–4 条动态链接或 ID');
      }
      const ids = [...new Set(values.map((value: string) => parseDynamicId(value)))] as string[];
      await configureHeaders();
      const stored = await chrome.storage.local.get('probeDeviceId');
      const deviceId = typeof stored.probeDeviceId === 'string' ? stored.probeDeviceId
        : `XU${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`;
      await chrome.storage.local.set({ probeDeviceId: deviceId });
      const authorization = await contentAuthorization();
      const report = await runProbe(ids, authorization?.deviceId ?? deviceId, authorization?.accessToken);
      if (article) report.articles = [await getArticle(article)];
      await chrome.storage.local.set({ lastProbe: report });
      return report;
    })().finally(() => { activeProbe = null; });
  }
  activeProbe.then(report => sendResponse({ ok: true, report }))
    .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : '验证失败' }));
  return true;
});
