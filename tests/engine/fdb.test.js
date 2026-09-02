// FDB 测试：空表、查询、学习、老化、VLAN 键。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFdb, DEFAULT_VLAN } from '../../src/engine/fdb.js';

describe('新建的 FDB 是空的', () => {
  it('size 为 0，entries 返回空数组', () => {
    const fdb = createFdb();
    assert.equal(fdb.size, 0);
    assert.deepEqual(fdb.entries(), []);
  });

  it('查任意 MAC 都是 miss，不抛错', () => {
    const fdb = createFdb();
    for (const address of ['aa:bb:cc:dd:ee:ff', 'ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00']) {
      assert.deepEqual(fdb.lookup(address), { result: 'miss', port: null }, address);
    }
  });
});

describe('查询无副作用', () => {
  // 现在看着是废话，阶段 1 会救命：加了学习之后很容易在查询路径里顺手学一下，
  // 那样表就会因为「看了一眼」而变化。届时这条会立刻红。
  it('连查两次同一个 MAC，表还是空的', () => {
    const fdb = createFdb();
    const first = fdb.lookup('aa:bb:cc:dd:ee:ff');
    const second = fdb.lookup('aa:bb:cc:dd:ee:ff');
    assert.deepEqual(first, second);
    assert.equal(fdb.size, 0, '查表不能建表项');
    assert.deepEqual(fdb.entries(), []);
  });

  it('查很多个不同的 MAC，表还是空的', () => {
    const fdb = createFdb();
    for (let i = 0; i < 20; i += 1) {
      fdb.lookup(`aa:bb:cc:00:00:${i.toString(16).padStart(2, '0')}`);
    }
    assert.equal(fdb.size, 0);
  });
});

describe('输入校验', () => {
  it('查非法 MAC 抛错（复用 mac.parse 的校验）', () => {
    const fdb = createFdb();
    for (const bad of ['aa:bb:cc:dd:ee', 'gg:bb:cc:dd:ee:ff', '', null, undefined]) {
      assert.throws(() => fdb.lookup(bad), `应该拒绝 ${String(bad)}`);
    }
  });

  it('查表前先归一化，大小写和分隔符不影响结果', () => {
    const fdb = createFdb();
    assert.deepEqual(fdb.lookup('AA-BB-CC-DD-EE-FF'), { result: 'miss', port: null });
  });
});

describe('entries 的快照语义', () => {
  it('每次返回新数组，外面改不到表里', () => {
    const fdb = createFdb();
    const snapshot = fdb.entries();
    snapshot.push({ address: 'aa:bb:cc:dd:ee:ff', port: 'p9', learnedAt: 0 });
    assert.equal(fdb.size, 0, '改快照不该影响表');
    assert.deepEqual(fdb.entries(), []);
  });

  it('两次调用互不影响', () => {
    const fdb = createFdb();
    assert.notEqual(fdb.entries(), fdb.entries(), '应该是两个不同的数组');
    assert.deepEqual(fdb.entries(), fdb.entries());
  });
});

describe('多张表互相独立', () => {
  it('两台交换机各有自己的 FDB', () => {
    const a = createFdb();
    const b = createFdb();
    a.lookup('aa:bb:cc:dd:ee:ff');
    assert.equal(a.size, 0);
    assert.equal(b.size, 0);
    assert.notEqual(a, b);
  });
});

describe('方法不依赖 this', () => {
  // 用闭包而不是 class，就是为了这个：解构出来单独用不该丢绑定。
  it('解构出来的 lookup 照样能用', () => {
    const { lookup } = createFdb();
    assert.deepEqual(lookup('aa:bb:cc:dd:ee:ff'), { result: 'miss', port: null });
  });
});

describe('学习：added', () => {
  it('第一次见到 MAC，返回 added', () => {
    const fdb = createFdb();
    const result = fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    assert.equal(result.action, 'added');
    assert.equal(result.previousPort, null);
    assert.equal(fdb.size, 1);
  });

  it('学完之后能查到', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    const hit = fdb.lookup('aa:bb:cc:00:00:01');
    assert.equal(hit.result, 'hit');
    assert.equal(hit.port, 'p1');
  });

  it('学多条不同的 MAC', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    fdb.learn('aa:bb:cc:00:00:02', 'p2', 1);
    fdb.learn('aa:bb:cc:00:00:03', 'p1', 2);
    assert.equal(fdb.size, 3);
    assert.equal(fdb.lookup('aa:bb:cc:00:00:02').port, 'p2');
  });
});

describe('学习：refreshed', () => {
  it('同一个 MAC 从同一个口再进来，返回 refreshed', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    const result = fdb.learn('aa:bb:cc:00:00:01', 'p1', 10);
    assert.equal(result.action, 'refreshed');
    assert.equal(result.previousPort, 'p1');
    assert.equal(fdb.size, 1, 'refreshed 不新增表项');
  });

  it('refreshed 会更新 learnedAt', () => {
    const fdb = createFdb({ ttl: 30 });
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 20);
    const entries = fdb.entries();
    assert.equal(entries[0].learnedAt, 20);
  });
});

describe('学习：moved', () => {
  it('同一个 MAC 从不同口进来，返回 moved', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    const result = fdb.learn('aa:bb:cc:00:00:01', 'p2', 5);
    assert.equal(result.action, 'moved');
    assert.equal(result.previousPort, 'p1');
    assert.equal(fdb.size, 1, 'moved 是改口，不新增表项');
  });

  it('moved 后查表返回新口', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    fdb.learn('aa:bb:cc:00:00:01', 'p2', 5);
    assert.equal(fdb.lookup('aa:bb:cc:00:00:01').port, 'p2');
  });
});

describe('学习：ignored', () => {
  it('源 MAC 是组播，返回 ignored', () => {
    const fdb = createFdb();
    const result = fdb.learn('01:00:5e:00:00:01', 'p1', 0);
    assert.equal(result.action, 'ignored');
    assert.equal(fdb.size, 0, '组播不学');
  });

  it('源 MAC 是广播，返回 ignored', () => {
    const fdb = createFdb();
    const result = fdb.learn('ff:ff:ff:ff:ff:ff', 'p1', 0);
    assert.equal(result.action, 'ignored');
    assert.equal(fdb.size, 0);
  });
});

describe('老化', () => {
  it('表项过期后被删除', () => {
    const fdb = createFdb({ ttl: 30 });
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    fdb.learn('aa:bb:cc:00:00:02', 'p2', 10);
    const expired = fdb.age(31);
    assert.equal(expired.length, 1);
    assert.equal(expired[0].address, 'aa:bb:cc:00:00:01');
    assert.equal(fdb.size, 1, '只剩一条');
    assert.equal(fdb.lookup('aa:bb:cc:00:00:01').result, 'miss');
    assert.equal(fdb.lookup('aa:bb:cc:00:00:02').result, 'hit');
  });

  it('没有过期表项时返回空数组', () => {
    const fdb = createFdb({ ttl: 30 });
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 10);
    const expired = fdb.age(20);
    assert.deepEqual(expired, []);
    assert.equal(fdb.size, 1);
  });

  it('多条同时过期', () => {
    const fdb = createFdb({ ttl: 10 });
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    fdb.learn('aa:bb:cc:00:00:02', 'p2', 0);
    fdb.learn('aa:bb:cc:00:00:03', 'p3', 5);
    const expired = fdb.age(11);
    assert.equal(expired.length, 2);
    assert.equal(fdb.size, 1);
  });
});

describe('VLAN 键', () => {
  it('同一个 MAC 在不同 VLAN 里是两条表项', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0, 10);
    fdb.learn('aa:bb:cc:00:00:01', 'p2', 0, 20);
    assert.equal(fdb.size, 2);
  });

  it('查表时 VLAN 不对，miss', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0, 10);
    assert.equal(fdb.lookup('aa:bb:cc:00:00:01', 20).result, 'miss');
    assert.equal(fdb.lookup('aa:bb:cc:00:00:01', 10).result, 'hit');
  });

  it('默认 VLAN 是 1', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    assert.equal(fdb.lookup('aa:bb:cc:00:00:01', DEFAULT_VLAN).port, 'p1');
    assert.equal(fdb.lookup('aa:bb:cc:00:00:01').port, 'p1');
  });
});

describe('clear 和 forget', () => {
  it('clear 清空表', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    fdb.learn('aa:bb:cc:00:00:02', 'p2', 0);
    fdb.clear();
    assert.equal(fdb.size, 0);
  });

  it('forget 删一条', () => {
    const fdb = createFdb();
    fdb.learn('aa:bb:cc:00:00:01', 'p1', 0);
    fdb.learn('aa:bb:cc:00:00:02', 'p2', 0);
    const deleted = fdb.forget('aa:bb:cc:00:00:01');
    assert.equal(deleted, true);
    assert.equal(fdb.size, 1);
    assert.equal(fdb.lookup('aa:bb:cc:00:00:01').result, 'miss');
  });
});
