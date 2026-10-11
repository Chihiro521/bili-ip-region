import { ProfileApi, ProfileAuthorizationError, PROFILE_UA } from './profile-api.ts';
import { uidString } from './profile-data.ts';
import type { ProfileCredential, ProfileResult } from './profile-data.ts';
import { preferences } from './preferences.ts';
import { withWebSession, WEB_LOGIN_NAV } from './profile-web-session.ts';

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
    if (!await chrome.permissions.contains({ permissions: ['cookies'], origins: ['https://passport.bilibili.com/*'] })) throw new Error('请点击授权按钮，允许读取当前 B 站会话及访问登录接口');
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url ?? '');
    if (url.protocol !== 'https:' || !['www.bilibili.com', 't.bilibili.com', 'space.bilibili.com'].includes(url.hostname)) throw new Error('请先打开已登录的 B 站网页');
    const token = await withWebSession(tabId, tab.url!, async csrf => {
      const webAccount = async (): Promise<string | null> => {
        const response = await fetch(WEB_LOGIN_NAV, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`网页登录检查失败（HTTP ${response.status}）`);
        const json = await response.json();
        return json.code === 0 && json.data?.isLogin === true ? uidString(json.data.mid) : null;
      };
      const ownerUid = await webAccount();
      if (!ownerUid) throw new Error('当前网页登录会话已失效，请在 B 站页面重新登录后授权');
      try { return await (await client()).authorize(csrf, ownerUid, true); }
      catch (error) {
        if (error instanceof ProfileAuthorizationError && error.code === -101) {
          let currentUid: string | null;
          try { currentUid = await webAccount(); }
          catch {
            error.message += '；未能再次确认网页登录状态，请稍后重试';
            throw error;
          }
          error.message += currentUid === ownerUid
            ? '；当前网页登录仍有效，但授权接口未认可本次请求的登录凭据'
            : '；当前网页登录会话已变化，请刷新 B 站页面后重新授权';
          throw error;
        }
        throw error;
      }
    });
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
