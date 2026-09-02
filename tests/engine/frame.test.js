// 测试表 6.2（stage-0.md）。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as frame from '../../src/engine/frame.js';

const DST_BCAST = 'ffffffffffff';
const DST_UCAST = '001122334455';
const SRC = 'aabbccddeeff';

describe('frame.parse', () => {
  const cases = [
    {
      note: '广播 + IPv4',
      hex: `${DST_BCAST}${SRC}0800`,
      dst: 'ff:ff:ff:ff:ff:ff',
      src: 'aa:bb:cc:dd:ee:ff',
      ethertype: 0x0800,
      label: 'IPv4',
    },
    {
      note: '单播 + ARP',
      hex: `${DST_UCAST}${SRC}0806`,
      dst: '00:11:22:33:44:55',
      src: 'aa:bb:cc:dd:ee:ff',
      ethertype: 0x0806,
      label: 'ARP',
    },
    {
      note: 'VLAN tag：只解析不处理',
      hex: `${DST_UCAST}${SRC}8100`,
      dst: '00:11:22:33:44:55',
      src: 'aa:bb:cc:dd:ee:ff',
      ethertype: 0x8100,
      label: 'VLAN',
    },
    {
      note: '认不出的 ethertype',
      hex: `${DST_UCAST}${SRC}1234`,
      dst: '00:11:22:33:44:55',
      src: 'aa:bb:cc:dd:ee:ff',
      ethertype: 0x1234,
      label: '0x1234',
    },
  ];

  for (const c of cases) {
    it(c.note, () => {
      const parsed = frame.parse(c.hex);
      assert.equal(parsed.dst, c.dst);
      assert.equal(parsed.src, c.src);
      assert.equal(parsed.ethertype, c.ethertype);
      assert.equal(frame.ethertypeLabel(parsed.ethertype), c.label);
    });
  }
});

describe('长度边界', () => {
  it('13 字节：不足 14，抛', () => {
    assert.throws(() => frame.parse('00'.repeat(13)), /at least 14/);
  });

  it('14 字节：正常解析，载荷为空不是错误', () => {
    const parsed = frame.parse(`${DST_UCAST}${SRC}0800`);
    assert.equal(parsed.bytes.length, 14);
    assert.deepEqual(parsed.payload, []);
  });

  it('64 字节：多出来的字节原样留着', () => {
    const payload = Array.from({ length: 50 }, (_, i) => i);
    const parsed = frame.parse([...frame.fromHex(`${DST_UCAST}${SRC}0800`), ...payload]);
    assert.equal(parsed.bytes.length, 64);
    assert.deepEqual(parsed.payload, payload, '载荷不能被截断');
  });

  it('0 字节：抛', () => {
    assert.throws(() => frame.parse([]));
  });
});

describe('阶段边界哨兵', () => {
  // 阶段 0 认得出 0x8100 是 VLAN tag，但绝不去解释它。这条测试在阶段 2 之前
  // 必须一直绿着 —— 一旦 parse 开始吐 vid/pcp 之类的字段，说明阶段边界破了。
  it('0x8100 不产生任何 VLAN 字段', () => {
    const parsed = frame.parse(`${DST_UCAST}${SRC}8100000a0800`);
    assert.equal(parsed.ethertype, 0x8100);
    for (const key of ['vid', 'vlan', 'pcp', 'dei', 'innerEthertype']) {
      assert.equal(key in parsed, false, `阶段 0 不该有 ${key} 字段`);
    }
    // tag 那 4 个字节此刻只是载荷的一部分。
    assert.deepEqual(parsed.payload, [0x00, 0x0a, 0x08, 0x00]);
  });
});

describe('引擎不做合法性校验', () => {
  // 教学工具要能构造畸形帧来演示真设备怎么处理。引擎替用户拦就演不了了。
  it('源 MAC 全 0 不报错', () => {
    assert.equal(frame.parse(`${DST_UCAST}0000000000000800`).src, '00:00:00:00:00:00');
  });

  it('源 MAC 是广播地址也照收', () => {
    assert.equal(frame.parse(`${DST_UCAST}${DST_BCAST}0800`).src, 'ff:ff:ff:ff:ff:ff');
  });

  it('目的和源相同也照收', () => {
    const parsed = frame.parse(`${SRC}${SRC}0800`);
    assert.equal(parsed.dst, parsed.src);
  });
});

describe('十六进制互转', () => {
  it('fromHex 认空格和冒号', () => {
    const expected = [0xaa, 0xbb, 0xcc];
    assert.deepEqual(frame.fromHex('aabbcc'), expected);
    assert.deepEqual(frame.fromHex('aa bb cc'), expected);
    assert.deepEqual(frame.fromHex('aa:bb:cc'), expected);
    assert.deepEqual(frame.fromHex('AA-BB-CC'), expected);
  });

  it('fromHex 拒绝奇数长度和非十六进制', () => {
    assert.throws(() => frame.fromHex('aabbc'), /odd length/);
    assert.throws(() => frame.fromHex('aabbzz'), /non-hex/);
    assert.throws(() => frame.fromHex(42));
  });

  it('toHex 往返', () => {
    const hex = `${DST_UCAST}${SRC}0800`;
    assert.equal(frame.toHex(frame.fromHex(hex)), hex);
  });

  it('toHex 认分隔符', () => {
    assert.equal(frame.toHex([0xaa, 0xbb], ' '), 'aa bb');
  });

  it('parse 拒绝越界的字节值', () => {
    const bytes = frame.fromHex(`${DST_UCAST}${SRC}0800`);
    assert.throws(() => frame.parse([...bytes.slice(0, 13), 999]), /non-byte/);
  });
});

describe('约束 2：能 JSON 往返', () => {
  // bytes 必须是普通 number 数组。用 Uint8Array 的话 JSON.stringify 会变成
  // {"0":255,...}，重放和存盘就废了。
  it('parse 的结果 JSON 往返后深等于', () => {
    const parsed = frame.parse(`${DST_BCAST}${SRC}0800deadbeef`);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), parsed);
  });

  it('bytes 是普通数组，不是 Uint8Array', () => {
    const parsed = frame.parse(`${DST_UCAST}${SRC}0800`);
    assert.equal(Array.isArray(parsed.bytes), true);
    assert.equal(Array.isArray(parsed.payload), true);
  });

  it('接受 Uint8Array 输入但输出普通数组', () => {
    const parsed = frame.parse(new Uint8Array(frame.fromHex(`${DST_UCAST}${SRC}0800`)));
    assert.equal(Array.isArray(parsed.bytes), true);
  });
});

describe('frame.build', () => {
  it('拼出来的帧再解析回去一致', () => {
    const built = frame.build({
      dst: '00:11:22:33:44:55',
      src: 'aa:bb:cc:dd:ee:ff',
      ethertype: 0x0800,
      payload: [0xde, 0xad],
    });
    assert.equal(built.dst, '00:11:22:33:44:55');
    assert.equal(built.src, 'aa:bb:cc:dd:ee:ff');
    assert.equal(built.ethertype, 0x0800);
    assert.deepEqual(built.payload, [0xde, 0xad]);
    assert.equal(frame.toHex(built.bytes), '001122334455aabbccddeeff0800dead');
  });

  it('载荷默认为空', () => {
    const built = frame.build({ dst: DST_BCAST, src: SRC, ethertype: 0x0806 });
    assert.equal(built.bytes.length, 14);
  });

  it('ethertype 高低字节顺序正确', () => {
    const built = frame.build({ dst: DST_BCAST, src: SRC, ethertype: 0x86dd });
    assert.equal(built.bytes[12], 0x86);
    assert.equal(built.bytes[13], 0xdd);
  });
});
