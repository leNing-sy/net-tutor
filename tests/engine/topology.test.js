// 测试表 6.4（stage-0.md）。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTopology } from '../../src/engine/topology.js';
import { spec } from '../../src/lessons/stage0.js';

/** 阶段 0 的拓扑：h1 —[p1] sw1 [p2]— h2。 */
function stage0() {
  return createTopology(spec);
}

describe('阶段 0 的拓扑', () => {
  it('3 个节点，sw1 有 2 个口', () => {
    const topo = stage0();
    assert.equal(topo.nodes().length, 3);
    assert.deepEqual(
      topo.nodes().map((n) => n.id),
      ['h1', 'sw1', 'h2'],
    );
    assert.deepEqual(topo.ports('sw1'), ['p1', 'p2']);
    assert.deepEqual(topo.ports('h1'), ['eth0']);
  });

  it('空的是 FDB 不是端口：交换机确实有口', () => {
    assert.equal(stage0().ports('sw1').length, 2);
  });

  it('节点类型正确', () => {
    const topo = stage0();
    assert.equal(topo.node('h1').kind, 'host');
    assert.equal(topo.node('sw1').kind, 'switch');
    assert.equal(topo.node('h2').kind, 'host');
  });
});

describe('端口对端查询是对称的', () => {
  it('sw1/p1 的对端是 h1/eth0，反过来也成立', () => {
    const topo = stage0();
    assert.deepEqual(topo.peer('sw1', 'p1'), { node: 'h1', port: 'eth0' });
    assert.deepEqual(topo.peer('h1', 'eth0'), { node: 'sw1', port: 'p1' });
  });

  it('sw1/p2 一侧同样对称', () => {
    const topo = stage0();
    assert.deepEqual(topo.peer('sw1', 'p2'), { node: 'h2', port: 'eth0' });
    assert.deepEqual(topo.peer('h2', 'eth0'), { node: 'sw1', port: 'p2' });
  });

  it('返回的是副本，改它影响不到拓扑', () => {
    const topo = stage0();
    const peer = topo.peer('sw1', 'p1');
    peer.node = 'tampered';
    assert.equal(topo.peer('sw1', 'p1').node, 'h1');
  });

  it('没接线的口返回 null，不抛', () => {
    const topo = createTopology({
      nodes: [{ id: 'sw1', kind: 'switch', ports: ['p1', 'p2'], x: 0, y: 0 }],
      links: [],
    });
    assert.equal(topo.peer('sw1', 'p1'), null);
    assert.equal(topo.linkAt('sw1', 'p1'), null);
  });

  it('端口本身不存在则抛（编程错误，不该静默返回空）', () => {
    const topo = stage0();
    assert.throws(() => topo.peer('sw1', 'p99'), /unknown port/);
    assert.throws(() => topo.peer('nope', 'p1'), /unknown port/);
  });
});

describe('构造时校验', () => {
  const base = { id: 'sw1', kind: 'switch', ports: ['p1'], x: 0, y: 0 };

  it('节点 id 重复则抛', () => {
    assert.throws(
      () => createTopology({ nodes: [base, { ...base }], links: [] }),
      /duplicate node id/,
    );
  });

  it('同一节点端口 id 重复则抛', () => {
    assert.throws(
      () => createTopology({ nodes: [{ ...base, ports: ['p1', 'p1'] }], links: [] }),
      /duplicate port/,
    );
  });

  it('未知节点类型则抛', () => {
    assert.throws(
      () => createTopology({ nodes: [{ ...base, kind: 'router' }], links: [] }),
      /unknown node kind/,
    );
  });

  it('链路引用不存在的节点则抛', () => {
    assert.throws(
      () =>
        createTopology({
          nodes: [base],
          links: [{ a: { node: 'sw1', port: 'p1' }, b: { node: 'ghost', port: 'p1' } }],
        }),
      /unknown node/,
    );
  });

  it('链路引用不存在的端口则抛', () => {
    assert.throws(
      () =>
        createTopology({
          nodes: [base, { ...base, id: 'sw2' }],
          links: [{ a: { node: 'sw1', port: 'p1' }, b: { node: 'sw2', port: 'p9' } }],
        }),
      /unknown port/,
    );
  });

  it('一个口接两条线则抛（否则 peer 无法返回单一结果）', () => {
    assert.throws(
      () =>
        createTopology({
          nodes: [
            { id: 'sw1', kind: 'switch', ports: ['p1'], x: 0, y: 0 },
            { id: 'sw2', kind: 'switch', ports: ['p1'], x: 0, y: 0 },
            { id: 'sw3', kind: 'switch', ports: ['p1'], x: 0, y: 0 },
          ],
          links: [
            { a: { node: 'sw1', port: 'p1' }, b: { node: 'sw2', port: 'p1' } },
            { a: { node: 'sw1', port: 'p1' }, b: { node: 'sw3', port: 'p1' } },
          ],
        }),
      /already has a link/,
    );
  });
});

describe('顺序稳定', () => {
  it('多次调用 nodes/ports/links 顺序一致', () => {
    const topo = stage0();
    assert.deepEqual(topo.nodes(), topo.nodes());
    assert.deepEqual(topo.ports('sw1'), topo.ports('sw1'));
    assert.deepEqual(topo.links(), topo.links());
  });

  it('两次构造得到相同顺序（渲染顺序不能每次刷新都变）', () => {
    assert.deepEqual(
      stage0().nodes().map((n) => n.id),
      stage0().nodes().map((n) => n.id),
    );
  });

  it('ports 返回副本', () => {
    const topo = stage0();
    topo.ports('sw1').push('p99');
    assert.deepEqual(topo.ports('sw1'), ['p1', 'p2']);
  });
});
