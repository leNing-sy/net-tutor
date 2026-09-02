// STP 测试：根桥选举、端口角色、BPDU 比较。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as stp from '../../src/engine/stp.js';

describe('compareBridgeId（内部逻辑，通过 BPDU 比较间接验证）', () => {
  it('priority 小的赢', () => {
    const a = { root: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, cost: 0, sender: { priority: 100, mac: 'aa:bb:cc:00:00:01' } };
    const b = { root: { priority: 200, mac: 'aa:bb:cc:00:00:02' }, cost: 0, sender: { priority: 200, mac: 'aa:bb:cc:00:00:02' } };
    // a 的 priority 小，所以 a 更优，期望 a < b
    const inst = stp.createStp({ bridgeId: { priority: 300, mac: 'cc:cc:cc:00:00:03' }, ports: ['p1', 'p2'] });
    inst.receiveBpdu('p1', a);
    inst.receiveBpdu('p2', b);
    const state = inst.recompute();
    assert.deepEqual(state.root, a.root, 'priority 小的应该被选为根');
  });

  it('priority 相同时 MAC 小的赢', () => {
    const a = { root: { priority: 100, mac: 'bb:bb:cc:00:00:01' }, cost: 0, sender: { priority: 100, mac: 'bb:bb:cc:00:00:01' } };
    const b = { root: { priority: 100, mac: 'aa:bb:cc:00:00:02' }, cost: 0, sender: { priority: 100, mac: 'aa:bb:cc:00:00:02' } };
    const inst = stp.createStp({ bridgeId: { priority: 300, mac: 'cc:cc:cc:00:00:03' }, ports: ['p1', 'p2'] });
    inst.receiveBpdu('p1', a);
    inst.receiveBpdu('p2', b);
    const state = inst.recompute();
    assert.deepEqual(state.root, b.root, 'MAC 小的应该赢');
  });
});

describe('初始状态：自己是根', () => {
  it('没收到任何 BPDU 时认为自己是根', () => {
    const inst = stp.createStp({ bridgeId: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, ports: ['p1', 'p2'] });
    const state = inst.recompute();
    assert.deepEqual(state.root, { priority: 100, mac: 'aa:bb:cc:00:00:01' });
    assert.equal(state.rootCost, 0);
    assert.equal(state.rootPort, null);
  });

  it('根桥的所有口都是 designated', () => {
    const inst = stp.createStp({ bridgeId: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, ports: ['p1', 'p2', 'p3'] });
    const state = inst.recompute();
    assert.equal(state.roles.get('p1'), 'designated');
    assert.equal(state.roles.get('p2'), 'designated');
    assert.equal(state.roles.get('p3'), 'designated');
  });
});

describe('收到更优 BPDU：选新根', () => {
  it('收到 priority 更小的 BPDU 就换根', () => {
    const inst = stp.createStp({ bridgeId: { priority: 200, mac: 'bb:bb:cc:00:00:02' }, ports: ['p1', 'p2'] });
    const bpdu = { root: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, cost: 0, sender: { priority: 100, mac: 'aa:bb:cc:00:00:01' } };
    const changed = inst.receiveBpdu('p1', bpdu);
    assert.equal(changed, true);
    const state = inst.recompute();
    assert.deepEqual(state.root, bpdu.root);
    assert.equal(state.rootPort, 'p1');
  });

  it('root port 变 root，其他口看情况', () => {
    const inst = stp.createStp({ bridgeId: { priority: 200, mac: 'bb:bb:cc:00:00:02' }, ports: ['p1', 'p2'] });
    const bpdu = { root: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, cost: 0, sender: { priority: 100, mac: 'aa:bb:cc:00:00:01' } };
    inst.receiveBpdu('p1', bpdu);
    const state = inst.recompute();
    assert.equal(state.roles.get('p1'), 'root');
    assert.equal(state.roles.get('p2'), 'designated');
  });
});

describe('端口角色：blocked', () => {
  it('收到的 BPDU 优于自己要发的，口变 blocked', () => {
    const inst = stp.createStp({ bridgeId: { priority: 300, mac: 'cc:cc:cc:00:00:03' }, ports: ['p1', 'p2'] });
    // p1 收到根是 100 开销 0
    inst.receiveBpdu('p1', { root: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, cost: 0, sender: { priority: 100, mac: 'aa:bb:cc:00:00:01' } });
    // p2 收到根也是 100 但开销 4（说明对端离根更近）
    inst.receiveBpdu('p2', { root: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, cost: 4, sender: { priority: 200, mac: 'bb:bb:cc:00:00:02' } });
    const state = inst.recompute();
    assert.equal(state.rootPort, 'p1', 'p1 是 root port');
    // 自己会从 p2 发：root=100 cost=4+4=8 sender=300/cc。
    // 但 p2 收到的是 root=100 cost=4 sender=200/bb，比自己要发的优，所以 p2 被阻塞。
    assert.equal(state.roles.get('p2'), 'blocked');
  });
});

describe('makeBpdu', () => {
  it('生成的 BPDU 包含当前根和开销', () => {
    const inst = stp.createStp({ bridgeId: { priority: 200, mac: 'bb:bb:cc:00:00:02' }, ports: ['p1'] });
    inst.receiveBpdu('p1', { root: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, cost: 0, sender: { priority: 100, mac: 'aa:bb:cc:00:00:01' } });
    inst.recompute();
    const bpdu = inst.makeBpdu();
    assert.deepEqual(bpdu.root, { priority: 100, mac: 'aa:bb:cc:00:00:01' });
    assert.equal(bpdu.cost, stp.DEFAULT_PORT_COST); // 0 + 4
    assert.deepEqual(bpdu.sender, { priority: 200, mac: 'bb:bb:cc:00:00:02' });
  });
});

describe('encodeBpdu / decodeBpdu', () => {
  it('编码后能解码回来', () => {
    const bpdu = {
      root: { priority: 100, mac: 'aa:bb:cc:00:00:01' },
      cost: 42,
      sender: { priority: 200, mac: 'bb:bb:cc:00:00:02' },
    };
    const bytes = stp.encodeBpdu('bb:bb:cc:00:00:02', bpdu);
    const decoded = stp.decodeBpdu(bytes);
    assert.deepEqual(decoded, bpdu);
  });

  it('非 BPDU 帧返回 null', () => {
    const bytes = [
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0xaa, 0xbb, 0xcc, 0x00, 0x00, 0x01,
      0x08, 0x00, // IPv4
    ];
    assert.equal(stp.decodeBpdu(bytes), null);
  });

  it('长度不足返回 null', () => {
    assert.equal(stp.decodeBpdu([0x01, 0x80, 0xc2]), null);
  });
});

describe('多交换机收敛场景（集成）', () => {
  it('三台交换机选出根桥', () => {
    // sw1: priority=100, sw2: priority=200, sw3: priority=300
    const sw1 = stp.createStp({ bridgeId: { priority: 100, mac: 'aa:bb:cc:00:00:01' }, ports: ['p1', 'p2'] });
    const sw2 = stp.createStp({ bridgeId: { priority: 200, mac: 'bb:bb:cc:00:00:02' }, ports: ['p1', 'p2'] });
    const sw3 = stp.createStp({ bridgeId: { priority: 300, mac: 'cc:cc:cc:00:00:03' }, ports: ['p1', 'p2'] });

    // sw1 是根，发 BPDU 给 sw2 和 sw3
    const bpdu1 = sw1.makeBpdu();
    sw2.receiveBpdu('p1', bpdu1);
    sw3.receiveBpdu('p1', bpdu1);

    const state2 = sw2.recompute();
    const state3 = sw3.recompute();

    assert.deepEqual(state2.root, { priority: 100, mac: 'aa:bb:cc:00:00:01' });
    assert.deepEqual(state3.root, { priority: 100, mac: 'aa:bb:cc:00:00:01' });
  });
});
