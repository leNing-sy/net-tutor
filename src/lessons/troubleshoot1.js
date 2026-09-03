// 故障排查场景 1：VLAN 配置错误

export const scenario = {
  title: '场景 1：VLAN 配置错误',
  description: 'h1 (VLAN 10) 无法 ping 通 h3 (VLAN 10)，但两者应该在同一个 VLAN。',

  spec: {
    nodes: [
      { id: 'h1', kind: 'host', mac: 'aa:bb:cc:00:00:01', ports: ['eth0'], x: 100, y: 200 },
      { id: 'sw1', kind: 'switch', ports: ['p1', 'trunk1'], x: 300, y: 300 },
      { id: 'sw2', kind: 'switch', ports: ['trunk2', 'p3'], x: 600, y: 300 },
      { id: 'h3', kind: 'host', mac: 'aa:bb:cc:00:00:03', ports: ['eth0'], x: 800, y: 200 },
    ],
    links: [
      { a: { node: 'h1', port: 'eth0' }, b: { node: 'sw1', port: 'p1' } },
      { a: { node: 'sw1', port: 'trunk1' }, b: { node: 'sw2', port: 'trunk2' } },
      { a: { node: 'sw2', port: 'p3' }, b: { node: 'h3', port: 'eth0' } },
    ],
    portConfigs: [
      // sw1
      { node: 'sw1', port: 'p1', mode: 'access', vlan: 10 },
      { node: 'sw1', port: 'trunk1', mode: 'trunk', native: 1, allowed: [10, 20] },
      // sw2 - 故意配错：p3 配成了 VLAN 20
      { node: 'sw2', port: 'trunk2', mode: 'trunk', native: 1, allowed: [10, 20] },
      { node: 'sw2', port: 'p3', mode: 'access', vlan: 20 }, // ❌ 应该是 VLAN 10
    ],
  },

  injections: [
    {
      node: 'h1',
      port: 'eth0',
      t: 0,
      frame:
        'ffffffffffff' + // 广播
        'aabbcc000001' + // h1
        '0806' + // ARP
        '0001080006040001' +
        'aabbcc000001' +
        'c0a8010a' + // 192.168.1.10
        '000000000000' +
        'c0a8010b', // 192.168.1.11 (h3)
    },
  ],

  hints: [
    '检查 h1 和 h3 的 VLAN 配置',
    '查看 FDB 表：h1 的 MAC 在哪个 VLAN？',
    '观察 trunk 口的事件日志：帧带的是什么 VLAN tag？',
    'sw2 的 p3 口配置是否正确？',
  ],

  solution: {
    rootCause: 'sw2 的 p3 口配置成了 VLAN 20，应该是 VLAN 10',
    fix: '修改 sw2 的 p3 口配置：{ node: "sw2", port: "p3", mode: "access", vlan: 10 }',
  },

  maxEvents: 100,
};
