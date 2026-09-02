// 引擎测试：包含三个哨兵：JSON 往返、确定性、非法输入不留残渣。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTopology } from '../../src/engine/topology.js';
import { createFdb } from '../../src/engine/fdb.js';
import { simulate } from '../../src/engine/engine.js';
import { H2_MAC, injections, spec } from '../../src/lessons/stage0.js';

// 阶段 0 预期事件序列（新引擎下依然产出这 5 个，但顺序可能有学习事件插入）
const STAGE0_TYPES = ['frame.injected', 'frame.egress', 'frame.ingress', 'fdb.lookup', 'frame.consumed'];

function run(overrides = {}) {
  return simulate({
    topology: createTopology(spec),
    injections,
    ...overrides,
  });
}

describe('阶段 0 的事件序列', () => {
  it('产出核心 5 类事件：injected/egress/ingress/lookup/consumed', () => {
    const events = run();
    const types = events.map((e) => e.type);
    for (const expected of STAGE0_TYPES) {
      assert.ok(types.includes(expected), `缺少事件类型 ${expected}`);
    }
  });

  it('seq 从 0 连续递增，不跳号', () => {
    const events = run();
    const seqs = events.map((e) => e.seq);
    for (let i = 0; i < seqs.length; i++) {
      assert.equal(seqs[i], i, `seq 不连续：期望 ${i}，实际 ${seqs[i]}`);
    }
  });

  it('每个事件都带整数 t', () => {
    for (const event of run()) {
      assert.equal(Number.isInteger(event.t), true, `${event.type} 的 t 不是整数`);
    }
  });

  it('帧从 h1/eth0 出发，进 sw1/p1', () => {
    const events = run();
    const injected = events.find((e) => e.type === 'frame.injected');
    const ingress = events.find((e) => e.type === 'frame.ingress');
    assert.deepEqual(injected.from, { node: 'h1', port: 'eth0' });
    assert.deepEqual(ingress.at, { node: 'sw1', port: 'p1' });
  });
});

describe('查表与学习', () => {
  it('fdb.lookup 的结果是 miss', () => {
    const lookup = run().find((e) => e.type === 'fdb.lookup');
    assert.equal(lookup.result, 'miss');
    assert.equal(lookup.port, null);
    assert.equal(lookup.node, 'sw1');
    assert.equal(lookup.key, H2_MAC, '查的是目的 MAC');
  });

  it('新引擎会学习源 MAC（阶段 1 行为）', () => {
    const fdbs = new Map();
    run({ fdbs });
    const fdb = fdbs.get('sw1');
    assert.ok(fdb, 'sw1 应该有 FDB');
    assert.ok(fdb.size > 0, '新引擎会自动学习');
  });

  it('产生 fdb.learn 事件', () => {
    const events = run();
    const learn = events.find((e) => e.type === 'fdb.learn');
    assert.ok(learn, '新引擎应该产生学习事件');
    assert.equal(learn.action, 'added');
  });

  it('最后一个事件消耗帧（未命中导致无处转发）', () => {
    const events = run();
    const consumed = events.filter((e) => e.type === 'frame.consumed');
    assert.ok(consumed.length > 0, '应该有 frame.consumed');
  });
});

describe('哨兵 1 — 约束 2：事件必须能 JSON 往返', () => {
  // 事件里混进 Map、Set、类实例或函数，这条立刻红。重放、存盘、贴日志都指着它。
  it('JSON 往返后深等于原事件流', () => {
    const events = run();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), events);
  });

  it('帧的 bytes 是普通数组', () => {
    for (const event of run()) {
      if (event.frame !== undefined) {
        assert.equal(Array.isArray(event.frame.bytes), true, `${event.type} 的 bytes 不是数组`);
      }
    }
  });

  it('事件里没有函数和类实例', () => {
    const walk = (value, path) => {
      if (typeof value === 'function') {
        assert.fail(`${path} 是函数`);
      }
      if (value instanceof Map || value instanceof Set) {
        assert.fail(`${path} 是 Map/Set`);
      }
      if (value !== null && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        assert.ok(
          proto === Object.prototype || proto === Array.prototype,
          `${path} 是类实例（原型不是 Object/Array）`,
        );
        for (const [key, child] of Object.entries(value)) {
          walk(child, `${path}.${key}`);
        }
      }
    };
    run().forEach((event, i) => walk(event, `events[${i}]`));
  });

  it('约束 4：事件里不出现中文文案', () => {
    // 人话在 UI 层映射。引擎不认识自己被谁读。
    const serialized = JSON.stringify(run());
    const cjk = serialized.match(/[一-鿿]/g);
    assert.equal(cjk, null, `事件里出现了中文：${cjk?.join('')}`);
  });
});

describe('哨兵 2 — 约束 1：确定性', () => {
  // 引擎里摸了 Date.now() 或 Math.random()，这条会以「偶尔失败」的方式红 ——
  // 所以它值得一开始就写。跑 20 遍是为了把偶发概率放大。
  it('同输入跑两次，事件流深等于', () => {
    assert.deepStrictEqual(run(), run());
  });

  it('跑 20 遍结果全一致', () => {
    const first = JSON.stringify(run());
    for (let i = 0; i < 20; i += 1) {
      assert.equal(JSON.stringify(run()), first, `第 ${i + 2} 次结果不同`);
    }
  });

  it('t 完全来自调用方，不来自系统时钟', () => {
    const topology = createTopology(spec);
    const events = simulate({
      topology,
      injections: [{ ...injections[0], t: 42 }],
    });
    for (const event of events) {
      assert.equal(event.t, 42, `${event.type} 的 t 不是传进来的值`);
    }
  });
});

describe('哨兵 3 — 非法输入不留残渣', () => {
  // 半截事件流会让 UI 画出一个停在半空的帧，而且只在重放时暴露，很难查。
  // 所以先把所有输入校验完，再产事件。
  it('注入不存在的端口则抛', () => {
    assert.throws(
      () => run({ injections: [{ ...injections[0], port: 'p99' }] }),
      /unknown port/,
    );
  });

  it('注入不存在的节点则抛', () => {
    assert.throws(
      () => run({ injections: [{ ...injections[0], node: 'ghost' }] }),
      /unknown port/,
    );
  });

  it('多个注入里有一个非法，前面合法的也不产生事件', () => {
    const fdbs = new Map();
    assert.throws(() =>
      simulate({
        topology: createTopology(spec),
        injections: [injections[0], { ...injections[0], port: 'p99' }],
        fdbs,
      }),
    );
    // FDB 一张都没建出来，说明校验阶段就停住了，没跑到产事件那步。
    assert.equal(fdbs.size, 0, '不该留下半截状态');
  });

  it('t 不是整数则抛', () => {
    assert.throws(() => run({ injections: [{ ...injections[0], t: 1.5 }] }), /integer t/);
    assert.throws(() => run({ injections: [{ ...injections[0], t: undefined }] }), /integer t/);
  });

  it('帧不足 14 字节则抛', () => {
    assert.throws(() => run({ injections: [{ ...injections[0], frame: '00'.repeat(13) }] }));
  });

  it('缺少拓扑或注入则抛', () => {
    assert.throws(() => simulate({ injections }), /needs a topology/);
    assert.throws(() => run({ injections: [] }), /at least one injection/);
    assert.throws(() => run({ injections: 'nope' }), /at least one injection/);
  });
});

describe('阶段边界', () => {
  it('对端是主机时正常消耗帧', () => {
    const topology = createTopology({
      nodes: [
        { id: 'h1', kind: 'host', mac: 'aa:bb:cc:00:00:01', ports: ['eth0'], x: 0, y: 0 },
        { id: 'h2', kind: 'host', mac: 'aa:bb:cc:00:00:02', ports: ['eth0'], x: 0, y: 0 },
      ],
      links: [{ a: { node: 'h1', port: 'eth0' }, b: { node: 'h2', port: 'eth0' } }],
    });
    const events = simulate({
      topology,
      injections: [{ node: 'h1', port: 'eth0', t: 0, frame: injections[0].frame }]
    });
    const consumed = events.find((e) => e.type === 'frame.consumed');
    assert.ok(consumed, '帧应该被主机消耗');
    assert.equal(consumed.reason, 'reached-host');
  });

  it('端口没接线时消耗帧', () => {
    const topology = createTopology({
      nodes: [{ id: 'h1', kind: 'host', mac: 'aa:bb:cc:00:00:01', ports: ['eth0'], x: 0, y: 0 }],
      links: [],
    });
    const events = simulate({
      topology,
      injections: [{ node: 'h1', port: 'eth0', t: 0, frame: injections[0].frame }]
    });
    const consumed = events.find((e) => e.type === 'frame.consumed');
    assert.ok(consumed, '没有链路时帧应该被消耗');
    assert.equal(consumed.reason, 'no-link');
  });
});

describe('多次注入', () => {
  it('两个帧产出多个事件，seq 跨注入连续', () => {
    const events = run({
      injections: [injections[0], { ...injections[0], t: 5 }],
    });
    assert.ok(events.length > 5, '两个注入应该产生更多事件');
    const seqs = events.map((e) => e.seq);
    for (let i = 0; i < seqs.length; i++) {
      assert.equal(seqs[i], i, `seq 应该连续`);
    }
  });

  it('第二个帧带自己的 t', () => {
    const events = run({ injections: [injections[0], { ...injections[0], t: 5 }] });
    const firstBatch = events.filter((e) => e.t === 0);
    const secondBatch = events.filter((e) => e.t === 5);
    assert.ok(firstBatch.length > 0, '应该有 t=0 的事件');
    assert.ok(secondBatch.length > 0, '应该有 t=5 的事件');
  });

  it('共用外部传进来的 FDB', () => {
    const fdbs = new Map([['sw1', createFdb()]]);
    run({ fdbs });
    assert.equal(fdbs.size, 1, '不该另建一张表');
  });
});
