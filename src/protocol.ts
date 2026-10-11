// 字段依据 bilibili-API-collect 的 dynamic.proto / opus.proto。
// 仅解析顶层动态的作者及详情底部模块，避免串用转发内原动态的属地。
export type Method = 'DynDetail' | 'OpusDetail';
type Field = { number: number; wire: number; integer?: bigint; bytes?: Uint8Array };
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_BYTES = 16 * 1024 * 1024;

export function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export function varint(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error('整数超出 uint64 范围');
  const bytes: number[] = [];
  do {
    const byte = Number(value & 127n);
    value >>= 7n;
    bytes.push(byte | (value ? 128 : 0));
  } while (value);
  return Uint8Array.from(bytes);
}

export function intField(number: number, value: bigint): Uint8Array {
  return concat(varint(BigInt(number * 8)), varint(value));
}

export function bytesField(number: number, value: Uint8Array): Uint8Array {
  return concat(varint(BigInt(number * 8 + 2)), varint(BigInt(value.length)), value);
}

export function stringField(number: number, value: string): Uint8Array {
  return bytesField(number, encoder.encode(value));
}

function fields(input: Uint8Array): Field[] {
  if (input.length > MAX_BYTES) throw new Error('响应超过 16 MiB');
  let offset = 0;
  function readVarint(): bigint {
    let value = 0n;
    for (let i = 0; i < 10; i++) {
      if (offset >= input.length) throw new Error('protobuf 整数被截断');
      const byte = input[offset++];
      if (i === 9 && byte > 1) throw new Error('protobuf 整数超过 uint64');
      value |= BigInt(byte & 127) << BigInt(i * 7);
      if (!(byte & 128)) return value;
    }
    throw new Error('protobuf 整数过长');
  }
  const result: Field[] = [];
  while (offset < input.length) {
    const tag = readVarint();
    const number = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (!number || number > 536870911) throw new Error('protobuf 字段编号无效');
    const field: Field = { number, wire };
    if (wire === 0) field.integer = readVarint();
    else if (wire === 2) {
      const size = readVarint();
      if (size > BigInt(input.length - offset)) throw new Error('protobuf 字段被截断');
      field.bytes = input.subarray(offset, offset + Number(size));
      offset += Number(size);
    } else if (wire === 1 || wire === 5) {
      offset += wire === 1 ? 8 : 4;
      if (offset > input.length) throw new Error('protobuf 固定长度字段被截断');
    } else throw new Error(`不支持的 protobuf wire type: ${wire}`);
    result.push(field);
  }
  return result;
}

export function grpcFrame(message: Uint8Array): Uint8Array {
  const header = new Uint8Array(5);
  new DataView(header.buffer).setUint32(1, message.length);
  return concat(header, message);
}

export function requestBody(method: Method, id: string): Uint8Array {
  if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 0x7fffffffffffffffn) {
    throw new Error('动态 ID 必须是正 int64 字符串');
  }
  const identity = method === 'DynDetail' ? stringField(2, id) : intField(2, BigInt(id));
  return grpcFrame(concat(identity, intField(10, 8n)));
}

export function articleRequestBody(cv: string): Uint8Array {
  requestBody('OpusDetail', cv);
  return grpcFrame(concat(intField(1, 1n), intField(2, BigInt(cv)), intField(10, 8n)));
}

export type Decoded = {
  returnedId: string | null;
  authorMid: string | null;
  publishedAt: string | null;
  rawLocation: string | null;
  location: string | null;
  locationFieldPresent: boolean;
  authorLocationFieldPresent: boolean;
  copyrightModulePresent: boolean;
  locationSource: 'author' | 'copyright' | null;
};

function replyItem(frame: Uint8Array): Field[] {
  if (frame.length < 5) throw new Error('gRPC 响应没有完整消息帧');
  if (frame[0] !== 0) throw new Error('gRPC 返回压缩帧，当前原型只接受 identity');
  const length = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(1);
  if (length > MAX_BYTES || length + 5 > frame.length) throw new Error('gRPC 帧长度无效');
  const outer = fields(frame.subarray(5, length + 5));
  const itemBytes = outer.find(field => field.number === 1 && field.wire === 2)?.bytes;
  if (!itemBytes) throw new Error('响应缺少动态主体');
  return fields(itemBytes);
}

export function decodeResponse(method: Method, frame: Uint8Array): Decoded {
  const item = replyItem(frame);
  const extendNumber = method === 'DynDetail' ? 4 : 5;
  const extendBytes = item.find(field => field.number === extendNumber && field.wire === 2)?.bytes;
  const extendedId = extendBytes
    ? fields(extendBytes).find(field => field.number === 1 && field.wire === 2)?.bytes : undefined;
  const opusId = method === 'OpusDetail'
    ? item.find(field => field.number === 1 && field.wire === 0)?.integer : undefined;
  const opusIdText = opusId === undefined ? null : opusId.toString();
  const extendedIdText = extendedId ? decoder.decode(extendedId) : null;
  if (opusIdText && extendedIdText && opusIdText !== extendedIdText) {
    throw new Error('Opus ID 与动态 ID 不一致');
  }
  return decodeItem(method, item, extendedIdText || opusIdText);
}

export function decodeArticleResponse(frame: Uint8Array, cv: string, expectedOpusId?: string): Decoded {
  const item = replyItem(frame);
  const type = item.find(field => field.number === 2 && field.wire === 0)?.integer;
  const oid = item.find(field => field.number === 3 && field.wire === 0)?.integer?.toString();
  if (type !== 1n || oid !== cv) throw new Error('返回的专栏类型或 CV ID 与请求不一致');
  const opusId = item.find(field => field.number === 1 && field.wire === 0)?.integer;
  const extend = item.find(field => field.number === 5 && field.wire === 2)?.bytes;
  const extendedId = extend ? fields(extend).find(field => field.number === 1 && field.wire === 2)?.bytes : undefined;
  const ids = [opusId && opusId > 0n ? opusId.toString() : null, extendedId ? decoder.decode(extendedId) : null].filter(Boolean);
  if (new Set(ids).size > 1 || (expectedOpusId && (!ids.length || ids.some(id => id !== expectedOpusId)))) {
    throw new Error('返回的 Opus ID 与当前专栏不一致');
  }
  return decodeItem('OpusDetail', item, ids[0] ?? null);
}

function decodeItem(method: Method, item: Field[], returnedId: string | null): Decoded {
  const moduleNumber = method === 'DynDetail' ? 3 : 4;
  let author: Field[] = [];
  const footerLocations: string[] = [];
  let copyrightModulePresent = false;
  for (const module of item.filter(field => field.number === moduleNumber && field.wire === 2)) {
    const moduleFields = fields(module.bytes!);
    const authorBytes = moduleFields.find(field => field.number === 2 && field.wire === 2)?.bytes;
    if (authorBytes && !author.length) author = fields(authorBytes);
    const copyrightBytes = moduleFields.find(field => field.number === 31 && field.wire === 2)?.bytes;
    if (!copyrightBytes) continue;
    copyrightModulePresent = true;
    // left_text / right_text 可以包含版权等其他信息，只接受明确标注 IP 属地的文字。
    for (const caption of fields(copyrightBytes).filter(field =>
      (field.number === 1 || field.number === 2) && field.wire === 2)) {
      const text = decoder.decode(caption.bytes!);
      if (/^\s*IP\s*属地\s*[:：]/i.test(text)) footerLocations.push(text);
    }
  }
  const authorMid = author.find(field => field.number === 1 && field.wire === 0)?.integer;
  const time = author.find(field => field.number === 2 && field.wire === 2)?.bytes;
  const region = author.find(field => field.number === 14 && field.wire === 2);
  const normalize = (text: string | null): string | null =>
    text?.replace(/^\s*IP\s*属地\s*[:：]\s*/i, '').trim() || null;
  const authorLocation = region?.bytes ? decoder.decode(region.bytes) : null;
  const knownRegions = new Set([authorLocation, ...footerLocations].map(normalize).filter(Boolean));
  if (knownRegions.size > 1) throw new Error('同一动态的属地来源不一致');
  const footerLocation = footerLocations.find(text => normalize(text)) ?? footerLocations[0] ?? null;
  const rawLocation = footerLocation ?? authorLocation;
  const location = normalize(rawLocation);
  return {
    returnedId,
    authorMid: authorMid?.toString() ?? null,
    publishedAt: time ? decoder.decode(time) : null,
    rawLocation, location,
    locationFieldPresent: !!region || footerLocations.length > 0,
    authorLocationFieldPresent: !!region,
    copyrightModulePresent,
    locationSource: footerLocation !== null ? 'copyright' : region ? 'author' : null,
  };
}

export function parseDynamicId(input: string): string {
  const value = input.trim();
  if (/^\d+$/.test(value)) { requestBody('DynDetail', value); return value; }
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['www.bilibili.com', 't.bilibili.com', 'm.bilibili.com'].includes(url.hostname)) {
    throw new Error('请输入 B 站动态链接或动态 ID');
  }
  const match = url.pathname.match(/^\/(?:opus\/|dynamic\/)?([1-9]\d*)\/?$/);
  if (!match) throw new Error('链接中没有动态 ID，请复制完整动态链接');
  requestBody('DynDetail', match[1]);
  return match[1];
}
