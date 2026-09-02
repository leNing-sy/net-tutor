// 以太网帧头解析：前 14 字节 = 目的 MAC(6) + 源 MAC(6) + EtherType(2)。
//
// 阶段 0 只解析不解释。EtherType 是 0x8100 时认得出这是 VLAN tag，但绝不
// 往下拆 —— 那是阶段 2 的活。

import * as mac from './mac.js';

/** 帧头长度。 */
export const HEADER_LENGTH = 14;

/**
 * 帧头的字段布局。UI 靠它把十六进制按字段分组，别在渲染层另写一份偏移量。
 */
export const FIELDS = [
  { name: 'dst', offset: 0, length: 6 },
  { name: 'src', offset: 6, length: 6 },
  { name: 'ethertype', offset: 12, length: 2 },
];

/** 认得的 EtherType。值是技术标识符，不是给人看的文案。 */
export const ETHERTYPES = {
  0x0800: 'IPv4',
  0x0806: 'ARP',
  0x86dd: 'IPv6',
  0x8100: 'VLAN',
};

/** 拿一个短标识，认不出就退回 `0x****`。 */
export function ethertypeLabel(value) {
  return ETHERTYPES[value] ?? `0x${value.toString(16).padStart(4, '0')}`;
}

/** 十六进制字符串 → 字节数组。允许空格和冒号当分隔。 */
export function fromHex(input) {
  if (typeof input !== 'string') {
    throw new TypeError(`expected a hex string, got ${typeof input}`);
  }
  const cleaned = input.replace(/[\s:-]/g, '').toLowerCase();
  if (cleaned.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${cleaned.length}`);
  }
  if (cleaned.length > 0 && !/^[0-9a-f]+$/.test(cleaned)) {
    throw new Error('hex string contains non-hex characters');
  }
  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(Number.parseInt(cleaned.slice(i, i + 2), 16));
  }
  return bytes;
}

/** 字节数组 → 小写十六进制字符串。 */
export function toHex(bytes, separator = '') {
  return Array.from(bytes)
    .map((b) => {
      if (!Number.isInteger(b) || b < 0 || b > 255) {
        throw new Error(`not a byte: ${b}`);
      }
      return b.toString(16).padStart(2, '0');
    })
    .join(separator);
}

/**
 * 解析帧头。
 *
 * 返回的对象必须能 JSON 往返（约束 2）：`bytes` 是普通 number 数组，不是
 * Uint8Array —— 后者 JSON.stringify 之后变成 `{"0":255,...}`，重放就废了。
 *
 * @param {number[]|Uint8Array|string} input 字节数组或十六进制字符串
 * @returns {{dst:string, src:string, ethertype:number, bytes:number[], payload:number[]}}
 */
export function parse(input) {
  const bytes = typeof input === 'string' ? fromHex(input) : Array.from(input);

  for (const b of bytes) {
    if (!Number.isInteger(b) || b < 0 || b > 255) {
      throw new Error(`frame contains a non-byte value: ${b}`);
    }
  }
  if (bytes.length < HEADER_LENGTH) {
    throw new Error(`frame needs at least ${HEADER_LENGTH} bytes, got ${bytes.length}`);
  }

  return {
    dst: mac.fromBytes(bytes, 0),
    src: mac.fromBytes(bytes, 6),
    ethertype: (bytes[12] << 8) | bytes[13],
    bytes,
    // 载荷为空不是错误：14 字节的裸帧头是合法输入。
    payload: bytes.slice(HEADER_LENGTH),
  };
}

/** 从字段拼一个帧，给课程数据用。 */
export function build({ dst, src, ethertype, payload = [] }) {
  return parse([
    ...mac.toBytes(dst),
    ...mac.toBytes(src),
    (ethertype >> 8) & 0xff,
    ethertype & 0xff,
    ...payload,
  ]);
}
