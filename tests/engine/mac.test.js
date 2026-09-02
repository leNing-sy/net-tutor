// 测试表 6.1（stage-0.md）。表驱动。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as mac from '../../src/engine/mac.js';

describe('mac.parse', () => {
  const cases = [
    ['aa:bb:cc:dd:ee:ff', 'aa:bb:cc:dd:ee:ff', 'unicast', '标准写法'],
    ['AA:BB:CC:DD:EE:FF', 'aa:bb:cc:dd:ee:ff', 'unicast', '大小写归一'],
    ['aa-bb-cc-dd-ee-ff', 'aa:bb:cc:dd:ee:ff', 'unicast', '连字符'],
    ['aabbccddeeff', 'aa:bb:cc:dd:ee:ff', 'unicast', '无分隔'],
    ['ff:ff:ff:ff:ff:ff', 'ff:ff:ff:ff:ff:ff', 'broadcast', '广播'],
    ['01:00:5e:00:00:01', '01:00:5e:00:00:01', 'multicast', 'IPv4 组播'],
    ['02:00:00:00:00:01', '02:00:00:00:00:01', 'unicast', '本地管理位不影响判定'],
    ['00:00:00:00:00:00', '00:00:00:00:00:00', 'unicast', '全 0 合法'],
    ['  aa:bb:cc:dd:ee:ff  ', 'aa:bb:cc:dd:ee:ff', 'unicast', '首尾空白'],
  ];

  for (const [input, expected, kind, note] of cases) {
    it(`${note}：${input} → ${expected}`, () => {
      assert.equal(mac.parse(input), expected);
      assert.equal(mac.kindOf(input), kind);
    });
  }

  const bad = [
    ['aa:bb:cc:dd:ee', '长度不足'],
    ['aa:bb:cc:dd:ee:ff:00', '长度超'],
    ['gg:bb:cc:dd:ee:ff', '非十六进制'],
    ['', '空串'],
    [null, 'null'],
    [undefined, 'undefined'],
    [123456, '不是字符串'],
    [['aa'], '数组'],
  ];

  for (const [input, note] of bad) {
    it(`拒绝：${note}`, () => {
      assert.throws(() => mac.parse(input));
    });
  }
});

describe('类型判定', () => {
  // 容易写错的点：广播是组播的特例，不是并列的第三类。写成互斥就错了。
  it('广播同时也是组播', () => {
    assert.equal(mac.isBroadcast('ff:ff:ff:ff:ff:ff'), true);
    assert.equal(mac.isMulticast('ff:ff:ff:ff:ff:ff'), true, '广播必须同时是组播');
    assert.equal(mac.isUnicast('ff:ff:ff:ff:ff:ff'), false);
  });

  it('组播不一定是广播', () => {
    assert.equal(mac.isMulticast('01:00:5e:00:00:01'), true);
    assert.equal(mac.isBroadcast('01:00:5e:00:00:01'), false);
  });

  it('单播和组播互斥', () => {
    for (const address of ['aa:bb:cc:dd:ee:ff', '01:00:5e:00:00:01', 'ff:ff:ff:ff:ff:ff']) {
      assert.equal(mac.isUnicast(address), !mac.isMulticast(address), address);
    }
  });

  it('判定看首字节最低位', () => {
    assert.equal(mac.isMulticast('01:00:00:00:00:00'), true, '首字节 0x01，最低位 1');
    assert.equal(mac.isMulticast('02:00:00:00:00:00'), false, '首字节 0x02，最低位 0');
    assert.equal(mac.isMulticast('03:00:00:00:00:00'), true, '首字节 0x03，最低位 1');
  });
});

describe('字节互转', () => {
  it('toBytes / fromBytes 往返', () => {
    const address = 'aa:bb:cc:dd:ee:ff';
    assert.deepEqual(mac.toBytes(address), [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
    assert.equal(mac.fromBytes(mac.toBytes(address)), address);
  });

  it('fromBytes 认偏移量', () => {
    const bytes = [0, 0, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff];
    assert.equal(mac.fromBytes(bytes, 2), 'aa:bb:cc:dd:ee:ff');
  });

  it('fromBytes 字节不够就抛', () => {
    assert.throws(() => mac.fromBytes([1, 2, 3]));
    assert.throws(() => mac.fromBytes([0, 0, 0xaa, 0xbb], 2));
  });

  it('fromBytes 拒绝越界的值', () => {
    assert.throws(() => mac.fromBytes([256, 0, 0, 0, 0, 0]));
    assert.throws(() => mac.fromBytes([-1, 0, 0, 0, 0, 0]));
    assert.throws(() => mac.fromBytes([1.5, 0, 0, 0, 0, 0]));
  });
});
