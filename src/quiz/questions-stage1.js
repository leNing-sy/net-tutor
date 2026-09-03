// 阶段 1 题库：学习与转发

export const questions = [
  {
    id: 'stage1-q1',
    stage: 1,
    type: 'single-choice',
    question: 'FDB 表项包含哪些字段？',
    options: [
      'MAC 地址、端口、学习时间',
      'MAC 地址、IP 地址、端口',
      'MAC 地址、端口、TTL',
      'MAC 地址、VLAN、IP 地址',
    ],
    answer: 0,
    explanation: 'FDB 表项包含 MAC 地址、端口号和学习时间。阶段 2 引入 VLAN 后会加上 VLAN ID。',
    lesson: { stage: 1, eventRange: [0, 10] },
  },

  {
    id: 'stage1-q2',
    stage: 1,
    type: 'single-choice',
    question: '交换机收到帧后，先做什么？',
    options: [
      '学习源 MAC 地址',
      '查表找目的 MAC 地址',
      '检查 CRC 校验',
      '剥除 VLAN 标签',
    ],
    answer: 0,
    explanation: '交换机先学习源 MAC（记录"这个 MAC 在这个端口上"），然后查表转发目的 MAC。',
    lesson: { stage: 1, eventRange: [5, 8] },
  },

  {
    id: 'stage1-q3',
    stage: 1,
    type: 'single-choice',
    question: 'FDB 查表未命中时，交换机会？',
    options: [
      '丢弃帧',
      '泛洪到所有端口（除入端口）',
      '发送 ARP 请求',
      '转发到默认网关',
    ],
    answer: 1,
    explanation: '未命中时泛洪：发到除入端口外的所有端口。这样目的主机能收到，并且回复时交换机能学到它的 MAC。',
    lesson: { stage: 1, eventRange: [10, 15] },
  },

  {
    id: 'stage1-q4',
    stage: 1,
    type: 'single-choice',
    question: 'FDB 表项的老化时间默认是多少？',
    options: ['30 秒', '60 秒', '300 秒', '600 秒'],
    answer: 2,
    explanation: '默认 300 秒（5 分钟）。超过这个时间没刷新的表项会被删除，下次查表就未命中了。',
    lesson: { stage: 1, eventRange: [20, 25] },
  },

  {
    id: 'stage1-q5',
    stage: 1,
    type: 'multiple-choice',
    question: '以下哪些情况会触发 FDB 学习？（多选）',
    options: [
      '收到单播帧',
      '收到广播帧',
      '收到组播帧',
      '收到 BPDU',
    ],
    answer: [0, 1, 2],
    explanation: '所有数据帧（单播/广播/组播）都会学习源 MAC。BPDU 是控制帧，不学习（阶段 3 内容）。',
    lesson: { stage: 1, eventRange: [0, 10] },
  },

  {
    id: 'stage1-q6',
    stage: 1,
    type: 'scenario',
    question: 'h1 向 h2 发送第一个帧。此时 FDB 为空。帧会？',
    topology: 'h1 —[p1] sw1 [p2]— h2',
    options: [
      '被丢弃（FDB 空，无法转发）',
      '泛洪到 p2，h2 收到',
      '转发到 p2（查表命中）',
      '在 sw1 内部循环',
    ],
    answer: 1,
    explanation: '查表未命中 → 泛洪到除 p1 外的所有端口（只有 p2）→ h2 收到。同时学习 h1 的 MAC 到 p1。',
    lesson: { stage: 1, eventRange: [0, 5] },
  },

  {
    id: 'stage1-q7',
    stage: 1,
    type: 'scenario',
    question: 'h2 收到 h1 的帧后回复。此时 FDB 已有 h1 的表项。回复帧会？',
    topology: 'h1 —[p1] sw1 [p2]— h2',
    options: [
      '泛洪到 p1 和 p2',
      '单播转发到 p1',
      '单播转发到 p2',
      '被丢弃',
    ],
    answer: 1,
    explanation: '学习 h2 的 MAC 到 p2，查表命中 h1 的 MAC（在 p1）→ 单播转发到 p1。',
    lesson: { stage: 1, eventRange: [10, 15] },
  },

  {
    id: 'stage1-q8',
    stage: 1,
    type: 'fill-in-blank',
    question: 'FDB 学习的 action 有四种：added（新学）、____（刷新）、moved（迁移）、ignored（忽略）。',
    answer: 'refreshed',
    explanation: 'refreshed：MAC 地址已在表中，端口没变，只刷新学习时间。',
    lesson: { stage: 1, eventRange: [5, 10] },
  },

  {
    id: 'stage1-q9',
    stage: 1,
    type: 'true-false',
    question: '交换机会学习目的 MAC 地址。',
    answer: false,
    explanation: '错。交换机只学习**源 MAC 地址**（记录"这个 MAC 在这个端口"），然后查表转发**目的 MAC 地址**。',
    lesson: { stage: 1, eventRange: [0, 5] },
  },

  {
    id: 'stage1-q10',
    stage: 1,
    type: 'true-false',
    question: '广播帧（目的 MAC = ff:ff:ff:ff:ff:ff）会被泛洪到所有端口（除入端口）。',
    answer: true,
    explanation: '对。广播 MAC 永远查表未命中 → 泛洪。',
    lesson: { stage: 1, eventRange: [15, 20] },
  },
];
