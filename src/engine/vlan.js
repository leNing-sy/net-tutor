// 802.1Q VLAN：tag 的打与剥，端口的 access/trunk 语义。
//
// 打 tag 就是往帧头中间**插 4 个字节**：原来 12..13 是 EtherType，插入后 12..13
// 变成 0x8100，14..15 是 TCI（优先级 3 位 + DEI 1 位 + VID 12 位），原来的
// EtherType 挪到 16..17。这件事必须能在十六进制面板上看见，所以这里只管字节，
// 不产生任何文案。

import * as frame from './frame.js';
import { DEFAULT_VLAN } from './fdb.js';

/** VLAN tag 的 EtherType。 */
export const TPID = 0x8100;

/** tag 占的字节数。 */
export const TAG_LENGTH = 4;

/** 合法 VID 范围。0 和 4095 保留，不给用户配。 */
export const MIN_VID = 1;
export const MAX_VID = 4094;

export function isValidVid(vid) {
  return Number.isInteger(vid) && vid >= MIN_VID && vid <= MAX_VID;
}

function requireVid(vid, what) {
  if (!isValidVid(vid)) {
    throw new Error(`${what} must be a VID in ${MIN_VID}..${MAX_VID}, got ${vid}`);
  }
  return vid;
}

/**
 * 读帧上的 tag。
 * @returns {{tagged:boolean, vid:number|null, priority:number, dei:number, ethertype:number}}
 */
export function readTag(wire) {
  const bytes = wire.bytes;
  if (wire.ethertype !== TPID) {
    return { tagged: false, vid: null, priority: 0, dei: 0, ethertype: wire.ethertype };
  }
  if (bytes.length < frame.HEADER_LENGTH + TAG_LENGTH) {
    throw new Error('frame claims 0x8100 but is too short to hold a tag');
  }
  const tci = (bytes[14] << 8) | bytes[15];
  return {
    tagged: true,
    vid: tci & 0x0fff,
    priority: (tci >> 13) & 0x07,
    dei: (tci >> 12) & 0x01,
    ethertype: (bytes[16] << 8) | bytes[17],
  };
}

/**
 * 打 tag。已经有 tag 就抛 —— 双层 tag（QinQ）不在教学范围内，静默接受会让
 * 「同一根线上两个 VLAN 互相看不见」这个演示变得难解释。
 * @returns {object} 新的 wire，原对象不动
 */
export function pushTag(wire, vid, { priority = 0, dei = 0 } = {}) {
  requireVid(vid, 'pushTag vid');
  if (wire.ethertype === TPID) {
    throw new Error('frame already carries a VLAN tag');
  }
  const tci = ((priority & 0x07) << 13) | ((dei & 0x01) << 12) | (vid & 0x0fff);
  const bytes = [
    ...wire.bytes.slice(0, 12),
    (TPID >> 8) & 0xff,
    TPID & 0xff,
    (tci >> 8) & 0xff,
    tci & 0xff,
    ...wire.bytes.slice(12),
  ];
  return toWire(bytes);
}

/**
 * 剥 tag。没有 tag 就抛 —— 这属于调用方逻辑错误，静默返回原帧会让 access 口
 * 的行为在测试里看起来「碰巧对」。
 */
export function popTag(wire) {
  if (wire.ethertype !== TPID) {
    throw new Error('frame carries no VLAN tag');
  }
  const bytes = [...wire.bytes.slice(0, 12), ...wire.bytes.slice(12 + TAG_LENGTH)];
  return toWire(bytes);
}

function toWire(bytes) {
  const parsed = frame.parse(bytes);
  return {
    dst: parsed.dst,
    src: parsed.src,
    ethertype: parsed.ethertype,
    bytes: parsed.bytes,
  };
}

// ---- 端口的 VLAN 配置 ----

/**
 * 归一化一个端口的 VLAN 配置。
 *
 * access 口：属于一个 VLAN，收发都不带 tag。主机接的就是这种。
 * trunk 口：交换机之间的干道，带 tag 传多个 VLAN。native VLAN 的帧不带 tag。
 *
 * 没配的口按 access + VLAN 1 处理，这是真设备的默认行为，也让阶段 1 的场景
 * 不用写任何 VLAN 配置就能跑。
 */
export function normalizePort(config = {}) {
  const mode = config.mode ?? 'access';
  if (mode === 'access') {
    const vlan = config.vlan ?? config.pvid ?? DEFAULT_VLAN;
    requireVid(vlan, `access port vlan`);
    return { mode: 'access', vlan, allowed: [vlan], native: vlan };
  }
  if (mode === 'trunk') {
    const native = config.native ?? DEFAULT_VLAN;
    requireVid(native, 'trunk native vlan');
    const allowed = config.allowed ?? [native];
    for (const vid of allowed) requireVid(vid, 'trunk allowed vlan');
    // native 必须在允许列表里，否则 native 帧进得来出不去，表现是「莫名丢包」。
    const full = allowed.includes(native) ? [...allowed] : [native, ...allowed];
    return { mode: 'trunk', vlan: native, allowed: full, native };
  }
  throw new Error(`unknown port mode "${mode}"`);
}

/**
 * 入口处理：算出这个帧属于哪个 VLAN，并把帧统一成「带 tag」的内部形式。
 *
 * 交换机内部一律按带 tag 处理，出口再决定要不要剥。这是真设备的做法，也让
 * 转发逻辑不必到处判断「这个口是什么模式」。
 *
 * @returns {{ok:true, vlan:number, wire:object, action:'tagged'|'kept'}
 *          |{ok:false, reason:string, vlan:number|null}}
 */
export function ingress(wire, portConfig) {
  const config = normalizePort(portConfig);
  const tag = readTag(wire);

  if (!tag.tagged) {
    // 不带 tag 的帧按 PVID 归类。access 口的 PVID 就是它的 VLAN，trunk 口是
    // native VLAN。
    return { ok: true, vlan: config.native, wire: pushTag(wire, config.native), action: 'tagged' };
  }

  if (config.mode === 'access') {
    // access 口收到带 tag 的帧：真设备的行为随厂商而异。这里按「tag 与本口
    // VLAN 不符就丢」处理，这是最容易讲清楚的一种，也是阶段 5 的故障素材。
    if (tag.vid !== config.vlan) {
      return { ok: false, reason: 'access-vlan-mismatch', vlan: tag.vid };
    }
    return { ok: true, vlan: tag.vid, wire, action: 'kept' };
  }

  if (!config.allowed.includes(tag.vid)) {
    return { ok: false, reason: 'vlan-not-allowed-on-trunk', vlan: tag.vid };
  }
  return { ok: true, vlan: tag.vid, wire, action: 'kept' };
}

/**
 * 出口处理：这个 VLAN 能不能从这个口出去，出去要不要带 tag。
 *
 * @returns {{ok:true, wire:object, action:'untagged'|'tagged'}
 *          |{ok:false, reason:string}}
 */
export function egress(wire, portConfig, vlan) {
  const config = normalizePort(portConfig);

  if (!config.allowed.includes(vlan)) {
    return {
      ok: false,
      reason: config.mode === 'access' ? 'access-vlan-mismatch' : 'vlan-not-allowed-on-trunk',
    };
  }

  // access 口和 trunk 的 native VLAN 都不带 tag 出去。
  const stripTag = config.mode === 'access' || vlan === config.native;
  if (stripTag) {
    const tag = readTag(wire);
    return { ok: true, wire: tag.tagged ? popTag(wire) : wire, action: 'untagged' };
  }
  return { ok: true, wire, action: 'tagged' };
}
