// 故障排查场景 2：MAC 地址飘移

export const scenario = {
  title: '场景 2：MAC 地址飘移',
  description: 'h1 的 MAC 地址同时出现在 sw1 的两个端口上，导致转发混乱。',

  spec: {
    nodes: [
      { id: 'h1', kind: 'host', mac: 'aa:bb:cc:00:00:01', ports: ['eth0'], x: 100, y: 100 },
      { id: 'h2', kind: 'host', mac: 'aa:bb:cc:00:00:01', ports: ['eth0'], x: 100, y: 400 }, // ❌ MAC 与 h1 冲突
      { id: 'sw1', kind: 'switch', ports: ['p1', 'p2', 'p3'], x: 400, y: 250 },
      { id: 'h3', kind: 'host', mac: 'aa:bb:cc:00:00:03', ports: ['eth0'], x: 700, y: 250 },
    ],
    links: [
      { a: { node: 'h1', port: 'eth0' }, b: { node: 'sw1', port: 'p1' } },
      { a: { node: 'h2', port: 'eth0' }, b: { node: 'sw1', port: 'p2' } },
      { a: { node: 'sw1', port: 'p3' }, b: { node: 'h3', port: 'eth0' } },
    ],
    portConfigs: [],
  },

  injections: [
    // h1 先发帧，学到 p1
    {
      node: 'h1',
      port: 'eth0',
      t: 0,
      frame:
        'aabbcc000003' + // 目的 h3
        'aabbcc000001' + // 源 h1
        '0800' +
        '450000280001000040010000c0a8010ac0a8010b',
    },
    // h2 发帧，同样的 MAC，学到 p2（触发 moved）
    {
      node: 'h2',
      port: 'eth0',
      t: 10,
      frame:
        'aabbcc000003' + // 目的 h3
        'aabbcc000001' + // 源 h1（冲突）
        '0800' +
        '450000280002000040010000c0a8010cc0a8010b',
    },
    // h3 回复 h1，但 FDB 里 h1 的 MAC 现在在 p2（错的）
    {
      node: 'h3',
      port: 'eth0',
      t: 20,
      frame:
        'aabbcc000001' + // 目的 h1
        'aabbcc000003' + // 源 h3
        '0800' +
        '450000280003000040010000c0a8010bc0a8010a',
    },
  ],

  hints: [
    '观察 FDB 学习事件：aa:bb:cc:00:00:01 学到了哪些端口？',
    '注意 fdb.learn 事件的 action：added、refreshed、moved？',
    'moved 表示 MAC 地址从一个端口迁移到另一个端口',
    '检查网络中是否有重复的 MAC 地址',
  ],

  solution: {
    rootCause: 'h1 和 h2 使用了相同的 MAC 地址 aa:bb:cc:00:00:01，导致 FDB 表项在 p1 和 p2 之间反复迁移',
    fix: '修改 h2 的 MAC 地址为唯一值，例如 aa:bb:cc:00:00:02',
  },

  maxEvents: 100,
};
