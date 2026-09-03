// 阶段 3 题库：STP 与环路

export const questions = [
  {
    id: 'stage3-q1',
    stage: 3,
    type: 'single-choice',
    question: 'STP 的作用是？',
    options: [
      '提高网络速度',
      '防止广播风暴',
      '自动分配 IP 地址',
      '加密数据传输',
    ],
    answer: 1,
    explanation: 'STP（生成树协议）通过阻塞某些端口来打破环路，防止广播风暴。',
    lesson: { stage: 3, eventRange: [0, 10] },
  },

  {
    id: 'stage3-q2',
    stage: 3,
    type: 'single-choice',
    question: 'Bridge ID 由什么组成？',
    options: [
      'Priority + IP 地址',
      'Priority + MAC 地址',
      'MAC 地址 + 端口号',
      'VLAN ID + MAC 地址',
    ],
    answer: 1,
    explanation: 'Bridge ID = Priority（2 字节）+ MAC 地址（6 字节）。Priority 越小，优先级越高。',
    lesson: { stage: 3, eventRange: [5, 10] },
  },

  {
    id: 'stage3-q3',
    stage: 3,
    type: 'single-choice',
    question: '根桥（Root Bridge）是怎么选出来的？',
    options: [
      'Bridge ID 最大的',
      'Bridge ID 最小的',
      'MAC 地址最大的',
      '端口数量最多的',
    ],
    answer: 1,
    explanation: '所有交换机比较 Bridge ID，最小的成为根桥。',
    lesson: { stage: 3, eventRange: [10, 15] },
  },

  {
    id: 'stage3-q4',
    stage: 3,
    type: 'single-choice',
    question: 'STP 端口角色有哪些？',
    options: [
      'root、designated、blocked',
      'access、trunk、hybrid',
      'forwarding、learning、blocking',
      'master、slave、standby',
    ],
    answer: 0,
    explanation: 'STP 端口角色：root（到根桥的最短路径）、designated（负责转发）、blocked（阻塞，不转发数据帧）。',
    lesson: { stage: 3, eventRange: [15, 20] },
  },

  {
    id: 'stage3-q5',
    stage: 3,
    type: 'multiple-choice',
    question: 'Blocked 端口会做什么？（多选）',
    options: [
      '转发数据帧',
      '接收 BPDU',
      '发送 BPDU',
      '学习 MAC 地址',
    ],
    answer: [1, 2],
    explanation: 'Blocked 端口：不转发数据帧、不学习 MAC，但接收和发送 BPDU（用于拓扑变化检测）。',
    lesson: { stage: 3, eventRange: [20, 25] },
  },

  {
    id: 'stage3-q6',
    stage: 3,
    type: 'scenario',
    question: '三台交换机形成三角环路，STP 未启用。h1 发广播帧。会发生什么？',
    topology: 'sw1 — sw2 — sw3 — sw1（环路）',
    options: [
      '帧正常转发，h1 收到一次',
      '帧无限循环，产生广播风暴',
      '帧被丢弃',
      '帧只转发一圈后停止',
    ],
    answer: 1,
    explanation: '无 STP 时，广播帧会在环路中无限循环：sw1 → sw2 → sw3 → sw1 → ... 直到网络瘫痪。',
    lesson: { stage: 3, eventRange: [0, 50] },
  },

  {
    id: 'stage3-q7',
    stage: 3,
    type: 'scenario',
    question: '三台交换机形成三角环路，STP 已启用。sw2 的 Bridge ID 最小。sw1-sw2 和 sw2-sw3 之间的端口角色是？',
    topology: 'sw1 —[p1/p1] sw2 [p2/p1]— sw3',
    options: [
      'sw1.p1=root, sw2.p1=designated',
      'sw1.p1=designated, sw2.p1=root',
      'sw1.p1=blocked, sw2.p1=designated',
      'sw1.p1=root, sw2.p1=blocked',
    ],
    answer: 0,
    explanation: 'sw2 是根桥，所有连到 sw2 的端口都是其他交换机的 root 端口（sw1.p1、sw3.p1）。sw2 的所有端口都是 designated。',
    lesson: { stage: 3, eventRange: [10, 20] },
  },

  {
    id: 'stage3-q8',
    stage: 3,
    type: 'fill-in-blank',
    question: 'STP 通过交换 ____ 消息来选举根桥和计算端口角色。',
    answer: 'BPDU',
    explanation: 'BPDU（Bridge Protocol Data Unit）：STP 控制消息，包含 Bridge ID、根桥 ID、路径成本等信息。',
    lesson: { stage: 3, eventRange: [5, 15] },
  },

  {
    id: 'stage3-q9',
    stage: 3,
    type: 'true-false',
    question: 'STP 收敛后，拓扑中任意两点之间只有一条转发路径。',
    answer: true,
    explanation: '对。STP 的目标就是把有环拓扑变成无环树，每两点间只有一条路径。',
    lesson: { stage: 3, eventRange: [20, 30] },
  },

  {
    id: 'stage3-q10',
    stage: 3,
    type: 'true-false',
    question: 'Root 端口是根桥上的端口。',
    answer: false,
    explanation: '错。Root 端口是**非根桥**上到根桥最短路径的端口。根桥的所有端口都是 designated。',
    lesson: { stage: 3, eventRange: [15, 20] },
  },
];
