// Device authorization sequence and public client parameters adapted from
// lzghzr/libBilibiliToken (MIT). See licenses/libBilibiliToken-MIT.txt.
import { md5 } from 'js-md5';
import { APP_KEY, APP_SIGN_KEY, LOGIN_APP_KEY, LOGIN_SIGN_KEY } from './profile-client-constants.ts';
import { decodeCredential, decodeProfileResponse } from './profile-data.ts';
import type { ProfileCredential, ProfileResult } from './profile-data.ts';
export class ProfileAuthorizationError extends Error {
  readonly code: number | undefined;
  readonly stage = 'confirm';
  readonly serverMessage: string | null;
  constructor(code: number | undefined, message?: unknown) {
    const serverMessage = typeof message === 'string' ? message.trim().slice(0, 300) : '';
    const detail = serverMessage && serverMessage !== '0' ? serverMessage : null;
    super(`授权确认失败（${code ?? '未知'}）${detail ? `：${detail}` : ''}`);
    this.name = 'ProfileAuthorizationError';
    this.code = code;
    this.serverMessage = detail;
  }
}
export const PROFILE_UA = 'Mozilla/5.0 BiliDroid/6.72.0 os/android mobi_app/android build/6720300 channel/bilih5';
export function signAppQuery(params: Record<string, string>, login = false, timestamp = Math.floor(Date.now() / 1000)): string {
  const query = new URLSearchParams({ ...params, ts: String(timestamp) });
  query.sort();
  const body = query.toString();
  return `${body}&sign=${md5(body + (login ? LOGIN_SIGN_KEY : APP_SIGN_KEY))}`;
}
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type JsonResponse = { code?: number; message?: unknown; msg?: unknown; data?: Record<string, unknown> };
export class ProfileApi {
  private deviceId: string;
  private fetcher: Fetcher;
  // 原生 Worker fetch 不能以 ProfileApi 实例作为 this 调用。
  constructor(deviceId: string, fetcher: Fetcher = globalThis.fetch.bind(globalThis)) { this.deviceId = deviceId; this.fetcher = fetcher; }
  private async request(path: string, body?: string, withWebLogin = false): Promise<JsonResponse> {
    const response = await this.fetcher(path, { method: body === undefined ? 'GET' : 'POST',
      body, credentials: withWebLogin ? 'include' : 'omit', redirect: 'error', cache: 'no-store',
      headers: { buvid: this.deviceId, ...(body === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }) },
      signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
    try { return await response.json() as JsonResponse; } catch { throw new Error('接口返回的数据无法解析'); }
  }
  private loginQuery(extra: Record<string, string> = {}): string {
    return signAppQuery({ appkey: LOGIN_APP_KEY, build: '6720300', c_locale: 'zh-Hans_CN', channel: 'website',
      local_id: this.deviceId, mobi_app: 'android', platform: 'android', s_locale: 'zh-Hans_CN', ...extra }, true);
  }
  async authorize(csrf: string, ownerUid: string, isolatedWebSession = false): Promise<ProfileCredential> {
    if (!/^[a-f\d]{32}$/i.test(csrf)) throw new Error('请先在当前 B 站网页登录');
    const auth = await this.request('https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code', this.loginQuery());
    const code = auth.data?.auth_code;
    if (auth.code !== 0 || typeof code !== 'string' || !/^[\w-]{8,256}$/.test(code)) throw new Error('申请设备授权失败');
    const confirm = await this.request('https://passport.bilibili.com/x/passport-tv-login/h5/qrcode/confirm',
      new URLSearchParams({ auth_code: code, csrf, scanning_type: '1' }).toString(), !isolatedWebSession);
    if (confirm.code !== 0) throw new ProfileAuthorizationError(confirm.code, confirm.message ?? confirm.msg);
    const poll = await this.request('https://passport.bilibili.com/x/passport-tv-login/qrcode/poll', this.loginQuery({ auth_code: code }));
    if (poll.code !== 0) throw new Error(`授权未完成（${poll.code ?? '未知'}）`);
    return decodeCredential(poll.data, ownerUid);
  }
  async profile(uid: string, accessToken: string): Promise<ProfileResult> {
    const query = signAppQuery({ appkey: APP_KEY, build: '6720300', mobi_app: 'android', vmid: uid, access_key: accessToken });
    return decodeProfileResponse(await this.request(`https://app.bilibili.com/x/v2/space?${query}`), uid);
  }
}
