// 故障排查场景 4：单向链路

export const scenario = {
  title: '场景 4：单向链路',
  description: 'h1 能发帧到 h2，但 h2 的回复到不了 h1。',

  spec: {
    nodes: [
      { id: 'h1', kind: 'host', mac: 'aa:bb:cc:00:00:01', ports: ['eth0'], x: 100, y: 300 },
      { id: 'sw1', kind: 'switch', ports: ['p1', 'p2'], x: 300, y: 300 },
      { id: 'sw2', kind: 'switch', ports: ['p1', 'p2'], x: 500, y: 300 },
      { id: 'h2', kind: 'host', mac: 'aa:bb:cc:00:00:02', ports: ['eth0'], x: 700, y: 300 },
    ],
    links: [
      { a: { node: 'h1', port: 'eth0' }, b: { node: 'sw1', port: 'p1' } },
      // ❌ 单向链路：sw1 → sw2 可通，sw2 → sw1 不通
      { a: { node: 'sw1', port: 'p2' }, b: { node: 'sw2', port: 'p1' }, direction: 'a-to-b' },
      { a: { node: 'sw2', port: 'p2' }, b: { node: 'h2', port: 'eth0' } },
    ],
    portConfigs: [],
  },

  injections: [
    // h1 → h2：可以到达
    {
      node: 'h1',
      port: 'eth0',
      t: 0,
      frame:
        'aabbcc000002' + // 目的 h2
        'aabbcc000001' + // 源 h1
        '0800' +
        '450000280001000040010000c0a8010ac0a8010b',
    },
    // h2 → h1：会被困在 sw2（sw2 学到了 h1 在 p1，但 p1 → sw1 不通）
    {
      node: 'h2',
      port: 'eth0',
      t: 10,
      frame:
        'aabbcc000001' + // 目的 h1
        'aabbcc000002' + // 源 h2
        '0800' +
        '450000280002000040010000c0a8010bc0a8010a',
    },
  ],

  hints: [
    '观察第一个帧的路径：h1 → sw1 → sw2 → h2',
    '观察第二个帧（h2 的回复）：在哪里停止了？',
    '检查 sw2 的 FDB：h1 的 MAC 学到了哪个端口？',
    'sw2 向 p1 转发帧后，帧有没有到达 sw1？',
    '检查链路配置：是否所有链路都是双向的？',
  ],

  solution: {
    rootCause: 'sw1-sw2 之间的链路是单向的（sw1 → sw2 可通，sw2 → sw1 不通）。h1 的帧能到 h2，但 sw2 学到的 h1 在 p1，回复帧无法从 sw2.p1 传回 sw1',
    fix: '修复物理链路，确保 sw1-sw2 之间双向连通。检查链路配置中的 direction 字段是否为 "bidirectional"',
  },

  maxEvents: 100,
};
