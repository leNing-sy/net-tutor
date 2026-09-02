// 阶段 0 的课程数据：h1 —[p1] sw1 [p2]— h2，h1 给 h2 发一个单播帧。
//
// 空的是 FDB，不是端口。故事讲到「sw1 查表，一条表项都没有」为止 —— 交换机
// 什么都不知道，所以什么也做不了。这是阶段 1 的开场白。

import * as frame from '../engine/frame.js';

export const H1_MAC = 'aa:bb:cc:00:00:01';
export const H2_MAC = 'aa:bb:cc:00:00:02';

/** 拓扑规格。x/y 是渲染坐标，阶段 0 位置写死，不做拖拽。 */
export const spec = {
  nodes: [
    { id: 'h1', kind: 'host', mac: H1_MAC, ports: ['eth0'], x: 90, y: 150 },
    { id: 'sw1', kind: 'switch', ports: ['p1', 'p2'], x: 320, y: 130 },
    { id: 'h2', kind: 'host', mac: H2_MAC, ports: ['eth0'], x: 590, y: 150 },
  ],
  links: [
    { id: 'wire-h1', a: { node: 'h1', port: 'eth0' }, b: { node: 'sw1', port: 'p1' } },
    { id: 'wire-h2', a: { node: 'sw1', port: 'p2' }, b: { node: 'h2', port: 'eth0' } },
  ],
};

/**
 * 注入的帧：h1 → h2 的单播。
 *
 * 目的地址是 h2 的真实 MAC，但 sw1 还没学到它 —— 这就是「未知单播」，阶段 1
 * 泛洪的正主。载荷用明显是占位的字节，别让人误以为里头有个 IP 包。
 */
export const injections = [
  {
    node: 'h1',
    port: 'eth0',
    t: 0,
    frame: frame.build({
      dst: H2_MAC,
      src: H1_MAC,
      ethertype: 0x0800,
      payload: [0xde, 0xad, 0xbe, 0xef],
    }),
  },
];

export const scenario = { spec, injections };
