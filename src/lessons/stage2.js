// 阶段 2：VLAN
//
// 拓扑：四主机两交换机，两个 VLAN
//   h1 (VLAN 10) ---- sw1 ---- sw2 ---- h3 (VLAN 10)
//   h2 (VLAN 20) ----/          \----- h4 (VLAN 20)
//
// sw1-sw2 之间是 trunk，允许 VLAN 10 和 20
//
// 场景：
// 1. h1 (VLAN 10) 广播，只有 h3 收到，h2/h4 收不到
// 2. h2 (VLAN 20) 广播，只有 h4 收到，h1/h3 收不到
// 3. h1 → h3 单播（FDB 学习后），帧在 trunk 上带 tag
//
// 验收标准：
// - FDB 的键是 (MAC, VLAN)
// - 不同 VLAN 的主机互相看不见
// - trunk 口出去的帧带 tag，access 口出去的帧不带 tag

export const H1_MAC = 'aa:bb:cc:00:00:01';
export const H2_MAC = 'aa:bb:cc:00:00:02';
export const H3_MAC = 'aa:bb:cc:00:00:03';
export const H4_MAC = 'aa:bb:cc:00:00:04';
export const BROADCAST = 'ff:ff:ff:ff:ff:ff';

export const spec = {
  nodes: [
    { id: 'h1', kind: 'host', mac: H1_MAC, ports: ['eth0'], x: 100, y: 200 },
    { id: 'h2', kind: 'host', mac: H2_MAC, ports: ['eth0'], x: 100, y: 400 },
    { id: 'sw1', kind: 'switch', ports: ['p1', 'p2', 'trunk1'], x: 300, y: 300 },
    { id: 'sw2', kind: 'switch', ports: ['trunk2', 'p3', 'p4'], x: 600, y: 300 },
    { id: 'h3', kind: 'host', mac: H3_MAC, ports: ['eth0'], x: 800, y: 200 },
    { id: 'h4', kind: 'host', mac: H4_MAC, ports: ['eth0'], x: 800, y: 400 },
  ],
  links: [
    { a: { node: 'h1', port: 'eth0' }, b: { node: 'sw1', port: 'p1' } },
    { a: { node: 'h2', port: 'eth0' }, b: { node: 'sw1', port: 'p2' } },
    { a: { node: 'sw1', port: 'trunk1' }, b: { node: 'sw2', port: 'trunk2' } },
    { a: { node: 'sw2', port: 'p3' }, b: { node: 'h3', port: 'eth0' } },
    { a: { node: 'sw2', port: 'p4' }, b: { node: 'h4', port: 'eth0' } },
  ],
  portConfigs: [
    // sw1
    { node: 'sw1', port: 'p1', mode: 'access', vlan: 10 },
    { node: 'sw1', port: 'p2', mode: 'access', vlan: 20 },
    { node: 'sw1', port: 'trunk1', mode: 'trunk', native: 1, allowed: [10, 20] },
    // sw2
    { node: 'sw2', port: 'trunk2', mode: 'trunk', native: 1, allowed: [10, 20] },
    { node: 'sw2', port: 'p3', mode: 'access', vlan: 10 },
    { node: 'sw2', port: 'p4', mode: 'access', vlan: 20 },
  ],
};

// h1 (VLAN 10) 广播，h2 (VLAN 20) 广播
export const injections = [
  {
    node: 'h1',
    port: 'eth0',
    t: 0,
    frame:
      BROADCAST.replace(/:/g, '') + // dst
      H1_MAC.replace(/:/g, '') + // src
      '0806' + // ARP
      '0001080006040001' + // ARP request
      H1_MAC.replace(/:/g, '') +
      'c0a8010a' + // sender IP 192.168.1.10
      '000000000000' +
      'c0a8010b', // target IP 192.168.1.11
  },
  {
    node: 'h2',
    port: 'eth0',
    t: 10,
    frame:
      BROADCAST.replace(/:/g, '') +
      H2_MAC.replace(/:/g, '') +
      '0806' +
      '0001080006040001' +
      H2_MAC.replace(/:/g, '') +
      'c0a80114' + // 192.168.1.20
      '000000000000' +
      'c0a80115', // 192.168.1.21
  },
];
