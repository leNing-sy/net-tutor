// 阶段 3：多机与 STP
//
// 拓扑：三台交换机形成环路
//        sw1 (priority 32768)
//       /   \
//      /     \
//    sw2 --- sw3
//  (priority 16384, 会成为根桥)
//
// 场景：
// 1. 初始状态：没有 STP，注入一个广播帧，会无限循环（广播风暴）
// 2. 启用 STP：sw2 成为根桥，某个端口被 block，环路断开
// 3. 再注入广播帧，不会风暴，被正常转发
//
// 验收标准：
// - 没有 STP 时，广播帧会产生大量重复的 frame.ingress 事件
// - 启用 STP 后，某些端口角色变成 blocked
// - blocked 端口不转发数据帧（但转发 BPDU）
// - 拓扑收敛后，任意两点之间只有一条路径

export const SW1_MAC = '00:00:00:00:00:01';
export const SW2_MAC = '00:00:00:00:00:02';
export const SW3_MAC = '00:00:00:00:00:03';
export const H1_MAC = 'aa:bb:cc:00:00:01';
export const BROADCAST = 'ff:ff:ff:ff:ff:ff';

export const spec = {
  nodes: [
    { id: 'sw1', kind: 'switch', mac: SW1_MAC, ports: ['p1', 'p2', 'p3'], x: 400, y: 100 },
    { id: 'sw2', kind: 'switch', mac: SW2_MAC, ports: ['p1', 'p2', 'p3'], x: 200, y: 400 },
    { id: 'sw3', kind: 'switch', mac: SW3_MAC, ports: ['p1', 'p2', 'p3'], x: 600, y: 400 },
    { id: 'h1', kind: 'host', mac: H1_MAC, ports: ['eth0'], x: 400, y: 500 },
  ],
  links: [
    // 环路
    { a: { node: 'sw1', port: 'p1' }, b: { node: 'sw2', port: 'p1' } },
    { a: { node: 'sw1', port: 'p2' }, b: { node: 'sw3', port: 'p1' } },
    { a: { node: 'sw2', port: 'p2' }, b: { node: 'sw3', port: 'p2' } },
    // 主机
    { a: { node: 'sw2', port: 'p3' }, b: { node: 'h1', port: 'eth0' } },
  ],
  stpConfig: {
    enabled: true,
    priorities: {
      sw1: 32768,
      sw2: 16384, // 最小，会成为根桥
      sw3: 32768,
    },
  },
};

// 注入一个广播帧
export const injections = [
  {
    node: 'h1',
    port: 'eth0',
    t: 0,
    frame:
      BROADCAST.replace(/:/g, '') +
      H1_MAC.replace(/:/g, '') +
      '0806' + // ARP
      '0001080006040001' +
      H1_MAC.replace(/:/g, '') +
      'c0a8010a' +
      '000000000000' +
      'c0a801ff',
  },
];

// 对比场景：禁用 STP 的版本（用于演示广播风暴）
export const specWithoutStp = {
  ...spec,
  stpConfig: {
    enabled: false,
  },
};
