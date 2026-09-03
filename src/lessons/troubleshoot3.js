// 故障排查场景 3：广播风暴

export const scenario = {
  title: '场景 3：广播风暴',
  description: '三台交换机形成环路，但 STP 未启用，导致广播帧无限循环。',

  spec: {
    nodes: [
      { id: 'sw1', kind: 'switch', mac: '00:00:00:00:00:01', ports: ['p1', 'p2', 'p3'], x: 400, y: 100 },
      { id: 'sw2', kind: 'switch', mac: '00:00:00:00:00:02', ports: ['p1', 'p2', 'p3'], x: 200, y: 400 },
      { id: 'sw3', kind: 'switch', mac: '00:00:00:00:00:03', ports: ['p1', 'p2'], x: 600, y: 400 },
      { id: 'h1', kind: 'host', mac: 'aa:bb:cc:00:00:01', ports: ['eth0'], x: 400, y: 500 },
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
      enabled: false, // ❌ STP 未启用
      priorities: {
        sw1: 32768,
        sw2: 16384,
        sw3: 32768,
      },
    },
  },

  injections: [
    {
      node: 'h1',
      port: 'eth0',
      t: 0,
      frame:
        'ffffffffffff' + // 广播
        'aabbcc000001' +
        '0806' +
        '0001080006040001' +
        'aabbcc000001' +
        'c0a8010a' +
        '000000000000' +
        'c0a801ff',
    },
  ],

  hints: [
    '观察事件日志：同一个帧是否多次出现在同一个端口？',
    '检查拓扑：是否存在环路（三角形）？',
    'STP 配置中 enabled 是 true 还是false？',
    '广播帧的 TTL 是否递减？（以太网帧没有 TTL，无法自动停止）',
  ],

  solution: {
    rootCause: '三台交换机形成物理环路，且 STP 未启用，导致广播帧在 sw1-sw2-sw3 之间无限循环',
    fix: '启用 STP：将 stpConfig.enabled 改为 true，让 sw2 成为根桥（priority 最小），某个端口会被 blocked',
  },

  maxEvents: 50, // 限制事件数量，防止浏览器卡死
};
