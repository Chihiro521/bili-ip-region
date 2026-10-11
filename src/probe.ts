import { concat, decodeResponse, intField, requestBody, stringField } from './protocol.ts';
import type { Decoded, Method } from './protocol.ts';

export const MOBILE_UA = 'Dalvik/2.1.0 (Linux; U; Android 11) 9.14.0 mobi_app/android build/9140400 grpc-java-cronet/1.36.1';
// 第一条由用户的手机截图确认：正文底部显示 IP 属地浙江。
export const SAMPLES = ['1251190976967344129', '1232186887046692873'];
export const HOSTS = ['app.bilibili.com', 'grpc.biliapi.net'] as const;
export const METHODS: Method[] = ['DynDetail', 'OpusDetail'];
export type ProbeResult = {
  requestedId: string; method: Method; endpoint: string;
  httpStatus: number | null; grpcStatus: string | null; bytes: number;
  idMatches: boolean; elapsedMs: number; error: string | null;
  decoded: Decoded | null;
};
export type Report = {
  version: '0.3.4'; testedAt: string; browser: string;
  webLoggedIn: boolean | null; credentialsMode: 'include';
  results: ProbeResult[]; successfulAuthorCount: number; gatePassed: boolean;
};

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function metadataHeaders(deviceId: string): Record<string, string> {
  return {
    'content-type': 'application/grpc',
    'grpc-accept-encoding': 'identity',
    'x-bili-metadata-bin': base64(concat(
      stringField(2, 'android'), stringField(3, 'phone'), intField(4, 9140400n),
      stringField(5, 'yingyongbao'), stringField(6, deviceId), stringField(7, 'android'),
    )),
    'x-bili-device-bin': base64(concat(
      intField(1, 1n), intField(2, 9140400n), stringField(3, deviceId),
      stringField(4, 'android'), stringField(5, 'android'), stringField(6, 'phone'),
      stringField(7, 'yingyongbao'), stringField(10, '11'), stringField(13, '9.14.0'),
    )),
    'x-bili-network-bin': 'CAEaBTQ2MDAx',
    'x-bili-locale-bin': 'CggKAnpoGgJDThIICgJ6aBoCQ04',
    'x-bili-fawkes-req-bin': 'CglhbmRyb2lkNjQSBHByb2QaCDlhMjU2NWM2',
    'buvid': deviceId,
    'bili-http-engine': 'cronet',
  };
}

export async function probeOne(id: string, method: Method, host: typeof HOSTS[number], deviceId: string): Promise<ProbeResult> {
  const service = method === 'DynDetail' ? 'Dynamic' : 'Opus';
  const endpoint = `https://${host}/bilibili.app.dynamic.v2.${service}/${method}`;
  const startedAt = performance.now();
  const result: ProbeResult = {
    requestedId: id, method, endpoint,
    httpStatus: null, grpcStatus: null, bytes: 0,
    idMatches: false, elapsedMs: 0, error: null, decoded: null,
  };
  try {
    const response = await fetch(endpoint, {
      method: 'POST', credentials: 'include',
      headers: metadataHeaders(deviceId),
      body: requestBody(method, id) as Uint8Array<ArrayBuffer>,
      signal: AbortSignal.timeout(12000),
    });
    result.httpStatus = response.status;
    result.grpcStatus = response.headers.get('grpc-status');
    const bytes = new Uint8Array(await response.arrayBuffer());
    result.bytes = bytes.length;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (result.grpcStatus && result.grpcStatus !== '0') throw new Error(`gRPC ${result.grpcStatus}`);
    result.decoded = decodeResponse(method, bytes);
    result.idMatches = result.decoded.returnedId === id;
    if (!result.idMatches) result.error = '返回 ID 与请求动态不一致';
  } catch (error) {
    result.error = error instanceof Error ? error.message : '请求失败';
  }
  result.elapsedMs = Math.round(performance.now() - startedAt);
  return result;
}

export function countSuccessfulAuthors(results: ProbeResult[]): number {
  return new Set(results.filter(result =>
    !result.error && result.idMatches && result.decoded?.location &&
    !/^(未知|未知地区|未知属地|暂无|无)$/.test(result.decoded.location) &&
    result.decoded.authorMid && result.decoded.authorMid !== '0',
  ).map(result => result.decoded!.authorMid)).size;
}

export async function runProbe(ids: string[], deviceId: string): Promise<Report> {
  let webLoggedIn: boolean | null = null;
  try {
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      credentials: 'include', signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (typeof data.data?.isLogin === 'boolean') webLoggedIn = data.data.isLogin;
  } catch { /* 登录状态未知，与明确未登录分开记录。 */ }
  const results: ProbeResult[] = [];
  // 有限顺序请求；每个样本、端点只尝试一次，避免循环重试。
  for (const id of ids) for (const host of HOSTS) for (const method of METHODS) {
    results.push(await probeOne(id, method, host, deviceId));
  }
  const successfulAuthorCount = countSuccessfulAuthors(results);
  return {
    version: '0.3.4', testedAt: new Date().toISOString(), browser: navigator.userAgent,
    webLoggedIn, credentialsMode: 'include', results, successfulAuthorCount,
    gatePassed: successfulAuthorCount >= 2,
  };
}
