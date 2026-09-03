// 阶段 2 题库：VLAN 隔离

export const questions = [
  {
    id: 'stage2-q1',
    stage: 2,
    type: 'single-choice',
    question: 'VLAN 标签在以太网帧的哪个位置？',
    options: [
      '目的 MAC 之前',
      '源 MAC 和 EtherType 之间',
      'EtherType 之后',
      '帧尾 FCS 之前',
    ],
    answer: 1,
    explanation: 'VLAN 标签（4 字节：0x8100 + VLAN ID）插在源 MAC 之后、原 EtherType 之前。',
    lesson: { stage: 2, eventRange: [0, 5] },
  },

  {
    id: 'stage2-q2',
    stage: 2,
    type: 'single-choice',
    question: 'Access 端口的作用是？',
    options: [
      '允许多个 VLAN 的帧通过',
      '只允许一个 VLAN，入帧打 tag，出帧剥 tag',
      '只允许 native VLAN 通过',
      '转发所有 VLAN 的帧',
    ],
    answer: 1,
    explanation: 'Access 口接主机：入帧时按 PVID 打 tag（主机不懂 VLAN），出帧时剥 tag。',
    lesson: { stage: 2, eventRange: [5, 10] },
  },

  {
    id: 'stage2-q3',
    stage: 2,
    type: 'single-choice',
    question: 'Trunk 端口的作用是？',
    options: [
      '只允许一个 VLAN 通过',
      '连接两台交换机，允许多个 VLAN 的帧通过',
      '自动学习 VLAN 配置',
      '禁止所有 VLAN 通过',
    ],
    answer: 1,
    explanation: 'Trunk 口连交换机：允许多个 VLAN，帧带着 tag 传输。',
    lesson: { stage: 2, eventRange: [10, 15] },
  },

  {
    id: 'stage2-q4',
    stage: 2,
    type: 'single-choice',
    question: 'FDB 在 VLAN 环境下的键是？',
    options: [
      '(MAC)',
      '(MAC, 端口)',
      '(MAC, VLAN)',
      '(MAC, IP)',
    ],
    answer: 2,
    explanation: 'VLAN 环境下，FDB 键是 (MAC, VLAN)。同一个 MAC 在不同 VLAN 里是两条独立表项。',
    lesson: { stage: 2, eventRange: [15, 20] },
  },

  {
    id: 'stage2-q5',
    stage: 2,
    type: 'multiple-choice',
    question: 'Trunk 口配置包含哪些参数？（多选）',
    options: [
      'allowed VLAN 列表',
      'native VLAN',
      'PVID',
      '端口速率',
    ],
    answer: [0, 1],
    explanation: 'Trunk 口配置：allowed（允许哪些 VLAN）、native（哪个 VLAN 不打 tag）。Access 口才有 PVID。',
    lesson: { stage: 2, eventRange: [10, 15] },
  },

  {
    id: 'stage2-q6',
    stage: 2,
    type: 'scenario',
    question: 'h1（VLAN 10）向 h2（VLAN 20）发帧。两台主机连在同一台交换机上。帧会？',
    topology: 'h1 (VLAN 10) —[p1] sw1 [p2]— h2 (VLAN 20)',
    options: [
      '正常转发到 h2',
      '被丢弃（VLAN 不匹配）',
      '转发到所有 VLAN 20 端口',
      '改成 VLAN 20 后转发',
    ],
    answer: 1,
    explanation: 'h1 的帧进 sw1 时打 VLAN 10 tag，查表时用 (目的 MAC, VLAN 10) 做键，不会查到 VLAN 20 的表项 → 泛洪也只到 VLAN 10 的端口 → h2 收不到。',
    lesson: { stage: 2, eventRange: [0, 10] },
  },

  {
    id: 'stage2-q7',
    stage: 2,
    type: 'scenario',
    question: 'h1（VLAN 10）发广播帧，sw1-sw2 之间是 trunk（允许 VLAN 10 和 20）。h3（VLAN 10）和 h4（VLAN 20）都连在 sw2 上。谁能收到？',
    topology: 'h1 (VLAN 10) — sw1 —[trunk]— sw2 — h3 (VLAN 10) / h4 (VLAN 20)',
    options: [
      '只有 h3',
      '只有 h4',
      'h3 和 h4 都能',
      '谁都收不到',
    ],
    answer: 0,
    explanation: '帧在 trunk 上带 VLAN 10 tag，到 sw2 后只泛洪到 VLAN 10 的端口 → 只有 h3 收到。',
    lesson: { stage: 2, eventRange: [10, 20] },
  },

  {
    id: 'stage2-q8',
    stage: 2,
    type: 'fill-in-blank',
    question: 'Access 口的入帧动作是按 ____ 打 tag。',
    answer: 'PVID',
    explanation: 'PVID（Port VLAN ID）：Access 口的默认 VLAN，入帧时按这个值打 tag。',
    lesson: { stage: 2, eventRange: [5, 10] },
  },

  {
    id: 'stage2-q9',
    stage: 2,
    type: 'true-false',
    question: 'Native VLAN 的帧在 trunk 口上不带 tag。',
    answer: true,
    explanation: '对。Native VLAN 用于兼容不支持 VLAN 的设备，帧在 trunk 上不打 tag。',
    lesson: { stage: 2, eventRange: [15, 20] },
  },

  {
    id: 'stage2-q10',
    stage: 2,
    type: 'true-false',
    question: '同一个 MAC 地址可以同时出现在 VLAN 10 和 VLAN 20 的 FDB 表项中。',
    answer: true,
    explanation: '对。FDB 键是 (MAC, VLAN)，同一个 MAC 在不同 VLAN 里是独立表项（可能在不同端口）。',
    lesson: { stage: 2, eventRange: [20, 25] },
  },
];
