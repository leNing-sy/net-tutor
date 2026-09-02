// 生成树协议（STP）：根桥选举、端口角色、阻塞。
//
// 教学简化版：只实现能看见的三件事（选根、分角色、阻塞转发），不走完整的
// 802.1D 状态机。计时器简化成「收到 BPDU 就立刻重算」，不模拟 20 秒 listening
// + 15 秒 learning。目标是让「环路风暴 → 打开 STP → 端口变色 → 风暴停」这个
// 过程能在几步内看完。

/** BPDU 的 EtherType（实际上是 LLC + SNAP 封装，这里简化成一个标识）。 */
export const BPDU_ETHERTYPE = 0x4242; // 占位值，真实是 LLC

/** STP 使用的组播 MAC。 */
export const STP_MULTICAST = '01:80:c2:00:00:00';

/** 桥优先级默认值。小的赢。 */
export const DEFAULT_BRIDGE_PRIORITY = 32768;

/** 端口开销默认值。 */
export const DEFAULT_PORT_COST = 4;

/**
 * 比较两个桥 ID。桥 ID = (priority, MAC)，priority 小的赢，平手看 MAC 小的赢。
 * @returns {-1|0|1} a < b 返回 -1，a > b 返回 1，相等返回 0
 */
function compareBridgeId(a, b) {
  if (a.priority !== b.priority) return a.priority < b.priority ? -1 : 1;
  // MAC 已归一化成小写冒号形式，字典序比较就是字节序比较。
  if (a.mac < b.mac) return -1;
  if (a.mac > b.mac) return 1;
  return 0;
}

/**
 * 比较两个 BPDU。先看根桥 ID，再看到根开销，最后看发送者桥 ID。
 * @returns {-1|0|1}
 */
function compareBpdu(a, b) {
  const root = compareBridgeId(a.root, b.root);
  if (root !== 0) return root;
  if (a.cost !== b.cost) return a.cost < b.cost ? -1 : 1;
  return compareBridgeId(a.sender, b.sender);
}

/**
 * 建一个 STP 实例，管一台交换机的 STP 状态。
 *
 * @param {{
 *   bridgeId: {priority:number, mac:string},
 *   ports: string[],
 *   portCost?: Map<string, number>
 * }} config
 */
export function createStp(config) {
  const { bridgeId, ports } = config;
  const portCost = config.portCost ?? new Map();

  // 每个口最后收到的最优 BPDU。
  const bestBpdu = new Map();

  // 当前认为的根桥。初始每台都认为自己是根。
  let root = { ...bridgeId };

  // 到根的开销。初始自己是根，开销为 0。
  let rootCost = 0;

  // 到根的路径是从哪个口听说的（root port）。初始没有。
  let rootPort = null;

  /**
   * 收到一个 BPDU。
   * @param {string} port 从哪个口收到的
   * @param {{root:{priority:number, mac:string}, cost:number, sender:{priority:number, mac:string}}} bpdu
   * @returns {boolean} 拓扑是否有变化（需要重新计算角色）
   */
  function receiveBpdu(port, bpdu) {
    const existing = bestBpdu.get(port);
    // 这个口上收到更优的 BPDU，或者第一次收到。
    if (existing === undefined || compareBpdu(bpdu, existing) < 0) {
      bestBpdu.set(port, { ...bpdu });
      return true; // 触发重算
    }
    return false;
  }

  /**
   * 重新计算：谁是根、root port 是谁、各口角色。
   * @returns {{
   *   root: {priority:number, mac:string},
   *   rootCost: number,
   *   rootPort: string|null,
   *   roles: Map<string, 'root'|'designated'|'blocked'>
   * }}
   */
  function recompute() {
    // 1. 找最优的 BPDU（即找到根的最短路）。
    let bestPort = null;
    let bestFromPeer = null;
    for (const [port, bpdu] of bestBpdu) {
      if (bestFromPeer === null || compareBpdu(bpdu, bestFromPeer) < 0) {
        bestFromPeer = bpdu;
        bestPort = port;
      }
    }

    // 2. 跟自己当根比。如果所有邻居的 BPDU 都不如「自己当根」，那就是根桥。
    const selfAsRoot = { root: bridgeId, cost: 0, sender: bridgeId };
    if (bestFromPeer === null || compareBpdu(selfAsRoot, bestFromPeer) <= 0) {
      root = { ...bridgeId };
      rootCost = 0;
      rootPort = null;
    } else {
      root = { ...bestFromPeer.root };
      rootCost = bestFromPeer.cost + (portCost.get(bestPort) ?? DEFAULT_PORT_COST);
      rootPort = bestPort;
    }

    // 3. 分配角色。
    const roles = new Map();
    for (const port of ports) {
      if (port === rootPort) {
        roles.set(port, 'root');
        continue;
      }
      // 这个口上收到的 BPDU 是否优于「我从 root port 学到的 + 我发出去的」。
      const receivedHere = bestBpdu.get(port);
      const wouldSend = { root, cost: rootCost, sender: bridgeId };
      if (receivedHere === undefined || compareBpdu(wouldSend, receivedHere) <= 0) {
        roles.set(port, 'designated');
      } else {
        roles.set(port, 'blocked');
      }
    }

    return { root, rootCost, rootPort, roles };
  }

  /**
   * 生成这台交换机要发出的 BPDU 内容（在 designated 口上发）。
   */
  function makeBpdu() {
    return {
      root: { ...root },
      cost: rootCost,
      sender: { ...bridgeId },
    };
  }

  return {
    receiveBpdu,
    recompute,
    makeBpdu,
    get root() {
      return { ...root };
    },
    get rootPort() {
      return rootPort;
    },
  };
}

/**
 * 编码一个 BPDU 成字节数组。
 * 格式简化：前 14 字节是以太网帧头（dst=STP 组播, src=发送者, type=BPDU_ETHERTYPE），
 * 后面 20 字节是 BPDU 内容（root priority 2B + root MAC 6B + cost 4B + sender priority 2B + sender MAC 6B）。
 */
export function encodeBpdu(srcMac, bpdu) {
  const bytes = [
    // 目的 MAC：STP 组播
    0x01, 0x80, 0xc2, 0x00, 0x00, 0x00,
    // 源 MAC：发送者
    ...srcMac.split(':').map((b) => Number.parseInt(b, 16)),
    // EtherType
    (BPDU_ETHERTYPE >> 8) & 0xff,
    BPDU_ETHERTYPE & 0xff,
    // root priority
    (bpdu.root.priority >> 8) & 0xff,
    bpdu.root.priority & 0xff,
    // root MAC
    ...bpdu.root.mac.split(':').map((b) => Number.parseInt(b, 16)),
    // cost
    (bpdu.cost >> 24) & 0xff,
    (bpdu.cost >> 16) & 0xff,
    (bpdu.cost >> 8) & 0xff,
    bpdu.cost & 0xff,
    // sender priority
    (bpdu.sender.priority >> 8) & 0xff,
    bpdu.sender.priority & 0xff,
    // sender MAC
    ...bpdu.sender.mac.split(':').map((b) => Number.parseInt(b, 16)),
  ];
  return bytes;
}

/**
 * 解码 BPDU。
 * @returns {{root:{priority:number, mac:string}, cost:number, sender:{priority:number, mac:string}}|null}
 */
export function decodeBpdu(bytes) {
  if (bytes.length < 34) return null; // 14 帧头 + 20 BPDU
  const ethertype = (bytes[12] << 8) | bytes[13];
  if (ethertype !== BPDU_ETHERTYPE) return null;

  const macAt = (offset) =>
    bytes
      .slice(offset, offset + 6)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(':');

  return {
    root: {
      priority: (bytes[14] << 8) | bytes[15],
      mac: macAt(16),
    },
    cost: (bytes[22] << 24) | (bytes[23] << 16) | (bytes[24] << 8) | bytes[25],
    sender: {
      priority: (bytes[26] << 8) | bytes[27],
      mac: macAt(28),
    },
  };
}
