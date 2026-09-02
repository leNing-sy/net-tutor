// VLAN 测试：tag 的打剥、端口配置、ingress/egress 处理。

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as vlan from '../../src/engine/vlan.js';
import * as frame from '../../src/engine/frame.js';

describe('readTag', () => {
  it('不带 tag 的帧', () => {
    const wire = frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 });
    const tag = vlan.readTag(wire);
    assert.equal(tag.tagged, false);
    assert.equal(tag.vid, null);
    assert.equal(tag.ethertype, 0x0800);
  });

  it('带 VLAN tag 的帧', () => {
    const bytes = [
      0xaa, 0xbb, 0xcc, 0x00, 0x00, 0x01, // dst
      0xaa, 0xbb, 0xcc, 0x00, 0x00, 0x02, // src
      0x81, 0x00, // TPID
      0x00, 0x0a, // TCI: VID=10
      0x08, 0x00, // ethertype
    ];
    const wire = frame.parse(bytes);
    const tag = vlan.readTag(wire);
    assert.equal(tag.tagged, true);
    assert.equal(tag.vid, 10);
    assert.equal(tag.ethertype, 0x0800);
  });
});

describe('pushTag', () => {
  it('给不带 tag 的帧打 tag', () => {
    const wire = frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 });
    const tagged = vlan.pushTag(wire, 10);
    assert.equal(tagged.ethertype, vlan.TPID);
    assert.equal(tagged.bytes.length, wire.bytes.length + vlan.TAG_LENGTH);
    const tag = vlan.readTag(tagged);
    assert.equal(tag.vid, 10);
  });

  it('已有 tag 再打就抛错', () => {
    const wire = frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 });
    const tagged = vlan.pushTag(wire, 10);
    assert.throws(() => vlan.pushTag(tagged, 20), /already carries/);
  });

  it('非法 VID 抛错', () => {
    const wire = frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 });
    assert.throws(() => vlan.pushTag(wire, 0));
    assert.throws(() => vlan.pushTag(wire, 4095));
    assert.throws(() => vlan.pushTag(wire, -1));
  });
});

describe('popTag', () => {
  it('剥掉 tag', () => {
    const wire = frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 });
    const tagged = vlan.pushTag(wire, 10);
    const untagged = vlan.popTag(tagged);
    assert.equal(untagged.ethertype, 0x0800);
    assert.equal(untagged.bytes.length, wire.bytes.length);
    assert.equal(vlan.readTag(untagged).tagged, false);
  });

  it('没有 tag 就抛错', () => {
    const wire = frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 });
    assert.throws(() => vlan.popTag(wire), /no VLAN tag/);
  });
});

describe('normalizePort: access', () => {
  it('默认 access + VLAN 1', () => {
    const config = vlan.normalizePort();
    assert.equal(config.mode, 'access');
    assert.equal(config.vlan, 1);
    assert.deepEqual(config.allowed, [1]);
  });

  it('access VLAN 10', () => {
    const config = vlan.normalizePort({ mode: 'access', vlan: 10 });
    assert.equal(config.vlan, 10);
    assert.deepEqual(config.allowed, [10]);
  });
});

describe('normalizePort: trunk', () => {
  it('trunk native=1 allowed=[1,10,20]', () => {
    const config = vlan.normalizePort({ mode: 'trunk', native: 1, allowed: [1, 10, 20] });
    assert.equal(config.mode, 'trunk');
    assert.equal(config.native, 1);
    assert.deepEqual(config.allowed, [1, 10, 20]);
  });

  it('native 不在 allowed 里会自动补上', () => {
    const config = vlan.normalizePort({ mode: 'trunk', native: 5, allowed: [10, 20] });
    assert.ok(config.allowed.includes(5));
  });
});

describe('ingress: access 口', () => {
  it('不带 tag 的帧按 PVID 打 tag', () => {
    const wire = frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 });
    const result = vlan.ingress(wire, { mode: 'access', vlan: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.vlan, 10);
    assert.equal(result.action, 'tagged');
    assert.equal(vlan.readTag(result.wire).vid, 10);
  });

  it('带 tag 且 VID 匹配就放行', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 10);
    const result = vlan.ingress(wire, { mode: 'access', vlan: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.vlan, 10);
    assert.equal(result.action, 'kept');
  });

  it('带 tag 但 VID 不匹配就丢', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 20);
    const result = vlan.ingress(wire, { mode: 'access', vlan: 10 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'access-vlan-mismatch');
  });
});

describe('ingress: trunk 口', () => {
  it('不带 tag 按 native VLAN 打 tag', () => {
    const wire = frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 });
    const result = vlan.ingress(wire, { mode: 'trunk', native: 1, allowed: [1, 10] });
    assert.equal(result.ok, true);
    assert.equal(result.vlan, 1);
  });

  it('带 tag 且在 allowed 里就放行', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 10);
    const result = vlan.ingress(wire, { mode: 'trunk', native: 1, allowed: [1, 10] });
    assert.equal(result.ok, true);
    assert.equal(result.vlan, 10);
  });

  it('带 tag 但不在 allowed 里就丢', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 99);
    const result = vlan.ingress(wire, { mode: 'trunk', native: 1, allowed: [1, 10] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'vlan-not-allowed-on-trunk');
  });
});

describe('egress: access 口', () => {
  it('VLAN 匹配就剥 tag 出去', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 10);
    const result = vlan.egress(wire, { mode: 'access', vlan: 10 }, 10);
    assert.equal(result.ok, true);
    assert.equal(result.action, 'untagged');
    assert.equal(vlan.readTag(result.wire).tagged, false);
  });

  it('VLAN 不匹配就丢', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 20);
    const result = vlan.egress(wire, { mode: 'access', vlan: 10 }, 20);
    assert.equal(result.ok, false);
  });
});

describe('egress: trunk 口', () => {
  it('native VLAN 剥 tag', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 1);
    const result = vlan.egress(wire, { mode: 'trunk', native: 1, allowed: [1, 10] }, 1);
    assert.equal(result.ok, true);
    assert.equal(result.action, 'untagged');
  });

  it('非 native VLAN 带 tag 出去', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 10);
    const result = vlan.egress(wire, { mode: 'trunk', native: 1, allowed: [1, 10] }, 10);
    assert.equal(result.ok, true);
    assert.equal(result.action, 'tagged');
    assert.equal(vlan.readTag(result.wire).vid, 10);
  });

  it('不在 allowed 里就丢', () => {
    const wire = vlan.pushTag(frame.build({ dst: 'aa:bb:cc:00:00:01', src: 'aa:bb:cc:00:00:02', ethertype: 0x0800 }), 99);
    const result = vlan.egress(wire, { mode: 'trunk', native: 1, allowed: [1, 10] }, 99);
    assert.equal(result.ok, false);
  });
});
