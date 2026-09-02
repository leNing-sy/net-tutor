// MAC 地址的解析、归一化与类型判定。
//
// 只做解析，不做合法性校验：全 0 的 MAC、源地址是组播这类畸形情况一律照收。
// 教学工具要能构造畸形帧来演示真设备怎么处理，引擎替用户拦就演不了了。

const HEX_BYTE = /^[0-9a-f]{2}$/;

/** MAC 地址的字节数。 */
export const LENGTH = 6;

/** 广播地址。 */
export const BROADCAST = 'ff:ff:ff:ff:ff:ff';

/**
 * 解析并归一化成小写冒号形式。
 * 收三种写法：`aa:bb:cc:dd:ee:ff`、`aa-bb-cc-dd-ee-ff`、`aabbccddeeff`。
 * @param {string} input
 * @returns {string} 形如 `aa:bb:cc:dd:ee:ff`
 */
export function parse(input) {
  if (typeof input !== 'string') {
    throw new TypeError(`MAC must be a string, got ${typeof input}`);
  }
  const cleaned = input.trim().toLowerCase().replace(/[:-]/g, '');
  if (cleaned.length !== LENGTH * 2) {
    throw new Error(`MAC must be ${LENGTH} bytes, got ${cleaned.length / 2}: "${input}"`);
  }
  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    const pair = cleaned.slice(i, i + 2);
    if (!HEX_BYTE.test(pair)) {
      throw new Error(`MAC contains non-hex characters: "${input}"`);
    }
    bytes.push(pair);
  }
  return bytes.join(':');
}

/**
 * 从字节数组读一个 MAC。
 * @param {number[]|Uint8Array} bytes
 * @param {number} [offset=0]
 */
export function fromBytes(bytes, offset = 0) {
  const slice = Array.from(bytes).slice(offset, offset + LENGTH);
  if (slice.length !== LENGTH) {
    throw new Error(`need ${LENGTH} bytes at offset ${offset}, got ${slice.length}`);
  }
  return parse(slice.map((b) => byteToHex(b)).join(''));
}

/** 转成字节数组。 */
export function toBytes(input) {
  return parse(input)
    .split(':')
    .map((pair) => Number.parseInt(pair, 16));
}

function byteToHex(byte) {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    throw new Error(`not a byte: ${byte}`);
  }
  return byte.toString(16).padStart(2, '0');
}

// ---- 类型判定 ----
//
// 判定看首字节最低位（I/G 位）：0 单播，1 组播。
// 广播是组播的特例（全 1），不是和它并列的第三类 —— isBroadcast 为真时
// isMulticast 也必然为真。这里不写成互斥，是因为真设备也不这么分。

/** 首字节最低位为 1。广播也算组播。 */
export function isMulticast(input) {
  return (toBytes(input)[0] & 0x01) === 1;
}

/** 全 1，即 ff:ff:ff:ff:ff:ff。 */
export function isBroadcast(input) {
  return parse(input) === BROADCAST;
}

/** 首字节最低位为 0。 */
export function isUnicast(input) {
  return !isMulticast(input);
}

/**
 * 归类，给 UI 用。广播优先于组播报告，因为讲解时它是更具体的说法。
 * @returns {'broadcast'|'multicast'|'unicast'}
 */
export function kindOf(input) {
  if (isBroadcast(input)) return 'broadcast';
  if (isMulticast(input)) return 'multicast';
  return 'unicast';
}
