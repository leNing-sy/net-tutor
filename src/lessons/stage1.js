// 阶段 1：单机转发与学习
//
// 拓扑：两主机一交换机
//   h1 (aa:bb:cc:00:00:01) ---- sw1 ---- h2 (aa:bb:cc:00:00:02)
//
// 场景：
// 1. h1 → h2：学习 h1 的 MAC，查表未命中，泛洪，h2 收到
// 2. h2 → h1：学习 h2 的 MAC，查表命中，单播转发到 p1，h1 收到
// 3. h1 → h2：查表命中，单播转发到 p2，h2 收到
//
// 验收标准：
// - FDB 表从空变到有两条表项
// - 第一个帧泛洪（未命中）
// - 后续帧命中转发（不泛洪）
// - 表项有老化时间，300 秒后过期

export const H1_MAC = 'aa:bb:cc:00:00:01';
export const H2_MAC = 'aa:bb:cc:00:00:02';

export const spec = {
  nodes: [
    { id: 'h1', kind: 'host', mac: H1_MAC, ports: ['eth0'], x: 100, y: 300 },
    { id: 'sw1', kind: 'switch', ports: ['p1', 'p2'], x: 400, y: 300 },
    { id: 'h2', kind: 'host', mac: H2_MAC, ports: ['eth0'], x: 700, y: 300 },
  ],
  links: [
    { a: { node: 'h1', port: 'eth0' }, b: { node: 'sw1', port: 'p1' } },
    { a: { node: 'sw1', port: 'p2' }, b: { node: 'h2', port: 'eth0' } },
  ],
};

// 三个注入：h1 → h2，h2 → h1，h1 → h2
export const injections = [
  {
    node: 'h1',
    port: 'eth0',
    t: 0,
    frame:
      H2_MAC.replace(/:/g, '') + // dst
      H1_MAC.replace(/:/g, '') + // src
      '0800' + // IPv4
      '45000028000040004006000000000000000000000000000000000000', // IP header + payload
  },
  {
    node: 'h2',
    port: 'eth0',
    t: 10,
    frame:
      H1_MAC.replace(/:/g, '') +
      H2_MAC.replace(/:/g, '') +
      '0800' +
      '45000028000040004006000000000000000000000000000000000000',
  },
  {
    node: 'h1',
    port: 'eth0',
    t: 20,
    frame:
      H2_MAC.replace(/:/g, '') +
      H1_MAC.replace(/:/g, '') +
      '0800' +
      '45000028000040004006000000000000000000000000000000000000',
  },
];
