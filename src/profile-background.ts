import { ProfileApi, PROFILE_UA } from './profile-api.ts';
import { uidString } from './profile-data.ts';
import type { ProfileCredential, ProfileResult } from './profile-data.ts';
import { preferences } from './preferences.ts';

const AUTH_KEY = 'profileAuth';
let authTask: Promise<void> | null = null;
let generation = 0;
export function contentAuthGeneration(): number { return generation; }
const pending = new Map<string, Promise<ProfileResult>>();
let headerTask: Promise<void> | null = null;
let cacheWrite: Promise<void> = Promise.resolve();
export async function configureProfileHeaders(): Promise<void> {
  if (headerTask) return headerTask;
  headerTask = chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [2], addRules: [{ id: 2, priority: 1,
    action: { type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS, requestHeaders: [
      { header: 'user-agent', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: PROFILE_UA },
      { header: 'origin', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
    ], responseHeaders: [
      // 确认设备授权要发送网页登录 Cookie，但不能让响应覆盖或删除它。
      { header: 'set-cookie', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
    ] }, condition: {
      regexFilter: '^https://(app\\.bilibili\\.com/x/v2/space(?:\\?|$)|passport\\.bilibili\\.com/x/passport-tv-login/)',
      initiatorDomains: [chrome.runtime.id], resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
    } }] }).catch(error => { headerTask = null; throw error; });
  return headerTask;
}
async function client(): Promise<ProfileApi> {
  await configureProfileHeaders();
  const stored = await chrome.storage.local.get('profileDeviceId');
  const deviceId = typeof stored.profileDeviceId === 'string' ? stored.profileDeviceId : `XX${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`;
  if (stored.profileDeviceId !== deviceId) await chrome.storage.local.set({ profileDeviceId: deviceId });
  return new ProfileApi(deviceId);
}
async function credential(): Promise<ProfileCredential | null> {
  const stored = await chrome.storage.local.get(AUTH_KEY);
  const value = stored[AUTH_KEY] as Partial<ProfileCredential> | undefined;
  return value && typeof value.accessToken === 'string' && uidString(value.ownerUid) && typeof value.expiresAt === 'number'
    ? value as ProfileCredential : null;
}
// 仅供后台请求复用用户已授权的会话，不返回给页面脚本。
export async function contentAuthorization(): Promise<{ accessToken: string; deviceId: string } | null> {
  const requestedGeneration = generation;
  const auth = await credential();
  if (!auth || auth.expiresAt <= Date.now() + 60000) return null;
  const stored = await chrome.storage.local.get('profileDeviceId');
  return requestedGeneration === generation && typeof stored.profileDeviceId === 'string' ? { accessToken: auth.accessToken, deviceId: stored.profileDeviceId } : null;
}
async function announce(): Promise<void> {
  generation++;
  await chrome.storage.session.remove(['profileCache', 'dynamicCache']);
  const tabs = await chrome.tabs.query({ url: ['https://space.bilibili.com/*', 'https://www.bilibili.com/*', 'https://t.bilibili.com/*'] });
  await Promise.allSettled(tabs.flatMap(tab => tab.id ? [chrome.tabs.sendMessage(tab.id, { type: 'profile:state-changed' }, { frameId: 0 })] : []));
}
export async function clearProfileCredential(): Promise<void> { await chrome.storage.local.remove(AUTH_KEY); await announce(); }
export async function profileAuthStatus(): Promise<{ state: string; expiresAt?: number }> {
  const value = await credential();
  return !value ? { state: authTask ? 'authorizing' : 'unavailable' }
    : value.expiresAt <= Date.now() + 60000 ? { state: 'expired' } : { state: 'ready', expiresAt: value.expiresAt };
}
export async function authorizeProfile(tabId: number): Promise<void> {
  if (authTask) return authTask;
  const currentGeneration = generation;
  authTask = (async () => {
    if (!await chrome.permissions.contains({ origins: ['https://passport.bilibili.com/*'] })) throw new Error('请在扩展弹窗中允许主页查询授权');
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url ?? '');
    if (url.protocol !== 'https:' || !['www.bilibili.com', 't.bilibili.com', 'space.bilibili.com'].includes(url.hostname)) throw new Error('请先打开已登录的 B 站网页');
    const context = await chrome.tabs.sendMessage(tabId, { type: 'profile:auth-context' }, { frameId: 0 });
    if (typeof context?.csrf !== 'string') throw new Error('请刷新 B 站网页并确认已经登录');
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include', signal: AbortSignal.timeout(12000) });
    const json = await response.json();
    const ownerUid = uidString(json.data?.mid);
    if (json.code !== 0 || json.data?.isLogin !== true || !ownerUid) throw new Error('请先登录当前浏览器中的 B 站账号');
    const token = await (await client()).authorize(context.csrf, ownerUid);
    if (generation !== currentGeneration) throw new Error('本次授权已取消');
    await chrome.storage.local.set({ [AUTH_KEY]: token });
    await announce();
  })().finally(() => { authTask = null; });
  return authTask;
}
interface Cached { value: ProfileResult; expiresAt: number; ownerUid: string; }
export async function getProfile(uid: string): Promise<ProfileResult> {
  if (!uidString(uid)) throw new Error('主页 UID 无效');
  if (!(await preferences()).profilesEnabled) return { uid, status: 'disabled', region: null };
  const auth = await credential();
  if (!auth) return { uid, status: 'auth-required', region: null };
  if (auth.expiresAt <= Date.now() + 60000) return { uid, status: 'expired', region: null };
  const stored = await chrome.storage.session.get('profileCache');
  const cache = (stored.profileCache ?? {}) as Record<string, Cached>;
  const cached = cache[uid];
  if (cached?.ownerUid === auth.ownerUid && cached.expiresAt > Date.now()) return cached.value;
  const requestKey = `${generation}:${uid}`;
  const existing = pending.get(requestKey);
  if (existing) return existing;
  const currentGeneration = generation;
  const task = (async () => {
    const result = await (await client()).profile(uid, auth.accessToken);
    if (generation !== currentGeneration) return { uid, status: 'disabled', region: null } as ProfileResult;
    if (result.status === 'expired') {
      await clearProfileCredential();
      return result;
    }
    if (!(await preferences()).profilesEnabled) return { uid, status: 'disabled', region: null } as ProfileResult;
    if (result.status !== 'ok' && result.status !== 'empty') return result;
    // 每项按目标 UID 保存，不按查看者账号或评论属地推断。
    const write = cacheWrite.catch(() => {}).then(async () => {
      if (generation !== currentGeneration) return;
      const latest = await chrome.storage.session.get('profileCache');
      if (generation !== currentGeneration) return;
      const entries = Object.entries((latest.profileCache ?? {}) as Record<string, Cached>)
        .filter(([key, value]) => key !== uid && value.expiresAt > Date.now()).slice(-199);
      entries.push([uid, { value: result, ownerUid: auth.ownerUid, expiresAt: Date.now() + (result.region ? 30 : 5) * 60000 }]);
      await chrome.storage.session.set({ profileCache: Object.fromEntries(entries) });
    });
    cacheWrite = write;
    await write;
    return result;
  })().finally(() => { pending.delete(requestKey); });
  pending.set(requestKey, task);
  return task;
}
