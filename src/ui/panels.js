// 三个面板：事件日志、十六进制、FDB。
//
// 约束 4 的落点：引擎只给机器码，中文全部在这里映射。所以引擎不认识自己被谁读，
// 以后换语言也不用碰逻辑。
//
// D5 要求「每个事件配一句人话」。这还是个自检 —— 某个事件写不出一句清楚的中文
// 解释，说明那个事件的设计有问题。

import * as frame from '../engine/frame.js';
import * as mac from '../engine/mac.js';

const MAC_KIND = { unicast: '单播', multicast: '组播', broadcast: '广播' };

/** 帧被丢弃/终止的原因。机器码 → 人话。 */
const CONSUMED_REASON = {
  'no-forwarding-yet': '阶段 0 到此为止：转发和泛洪是阶段 1 的内容',
};

/**
 * 把一个事件翻成一句话。
 * @returns {string}
 */
export function describe(event) {
  switch (event.type) {
    case 'frame.injected': {
      const kind = MAC_KIND[mac.kindOf(event.frame.dst)];
      return `${event.from.node} 造好一个${kind}帧，准备从 ${event.from.port} 发出，目的 MAC 是 ${event.frame.dst}`;
    }
    case 'frame.egress':
      return `帧离开 ${event.at.node} 的 ${event.at.port}，进入线缆`;
    case 'frame.ingress':
      return `帧到达 ${event.at.node} 的 ${event.at.port}，交换机读出帧头前 14 字节`;
    case 'fdb.lookup': {
      if (event.result === 'miss') {
        return `${event.node} 拿 ${event.key} 查 FDB：未命中。表里没有这个 MAC，交换机不知道它在哪个口`;
      }
      return `${event.node} 拿 ${event.key} 查 FDB：命中，对应 ${event.port}`;
    }
    case 'frame.consumed':
      return CONSUMED_REASON[event.reason] ?? `帧终止：${event.reason}`;
    default:
      return event.type;
  }
}

/**
 * 事件日志。已走过的步骤全列出来，当前那步标出来。
 * @param {HTMLElement} host
 * @param {object[]} events
 * @param {number} cursor 已执行到的下标，-1 表示还没开始
 */
export function renderLog(host, events, cursor) {
  host.replaceChildren();
  if (cursor < 0) {
    host.append(hint('还没开始。按「下一步」或方向键 → 走第一步。'));
    return;
  }
  const list = document.createElement('ol');
  list.className = 'log';
  events.slice(0, cursor + 1).forEach((event, index) => {
    const item = document.createElement('li');
    item.className = 'log__item';
    const current = index === cursor;
    if (current) {
      item.classList.add('is-current');
      item.setAttribute('aria-current', 'step');
    }
    // 「▶」是给灰度和色盲的第二重编码，不能只靠背景色标当前行。
    item.append(
      span('log__marker', current ? '▶' : ' '),
      span('log__seq', `#${event.seq}`),
      span('log__type', event.type),
      span('log__text', describe(event)),
    );
    list.append(item);
  });
  host.append(list);
  list.lastElementChild?.scrollIntoView({ block: 'nearest' });
}

/**
 * 十六进制面板：14 字节帧头按字段分组，载荷单列一行。
 */
export function renderHex(host, wire) {
  host.replaceChildren();
  if (wire === null || wire === undefined) {
    host.append(hint('帧还没生成。'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'hex';
  table.append(
    row('th', ['字段', '偏移', '十六进制', '含义']),
  );

  const meaning = {
    dst: `目的 MAC（${MAC_KIND[mac.kindOf(wire.dst)]}）`,
    src: '源 MAC',
    ethertype: `类型 = ${frame.ethertypeLabel(wire.ethertype)}`,
  };
  for (const field of frame.FIELDS) {
    const bytes = wire.bytes.slice(field.offset, field.offset + field.length);
    table.append(
      row('td', [
        field.name,
        `${field.offset}..${field.offset + field.length - 1}`,
        frame.toHex(bytes, ' '),
        meaning[field.name] ?? '',
      ]),
    );
  }

  const payload = wire.bytes.slice(frame.HEADER_LENGTH);
  table.append(
    row('td', [
      'payload',
      payload.length === 0 ? '—' : `${frame.HEADER_LENGTH}..${wire.bytes.length - 1}`,
      payload.length === 0 ? '（空）' : frame.toHex(payload, ' '),
      `载荷 ${payload.length} 字节，阶段 0 不解析`,
    ]),
  );
  host.append(table);
}

/**
 * FDB 面板。阶段 0 永远是空表，重点是把「空」这件事说清楚。
 * @param {HTMLElement} host
 * @param {object[]} entries 表项快照
 * @param {object|null} lookup 最近一次查表事件
 */
export function renderFdb(host, entries, lookup) {
  host.replaceChildren();

  if (entries.length === 0) {
    host.append(hint('空表：一条表项都没有。交换机还不知道任何 MAC 在哪个口。'));
  } else {
    const table = document.createElement('table');
    table.className = 'fdb';
    table.append(row('th', ['MAC', '端口', '学到于']));
    for (const entry of entries) {
      const tr = row('td', [entry.address, entry.port, String(entry.learnedAt)]);
      if (lookup?.result === 'hit' && lookup.key === entry.address) {
        tr.classList.add('is-hit');
      }
      table.append(tr);
    }
    host.append(table);
  }

  if (lookup !== null && lookup !== undefined) {
    const box = document.createElement('p');
    box.className = `fdb__result fdb__result--${lookup.result}`;
    // 「✗ / ✓」是第二重编码，不靠红绿区分。
    box.textContent =
      lookup.result === 'miss'
        ? `✗ 查 ${lookup.key} → 未命中`
        : `✓ 查 ${lookup.key} → 命中，${lookup.port}`;
    host.append(box);
  }
}

// ---- 小工具 ----

function hint(text) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = text;
  return p;
}

function span(className, text) {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = text;
  return s;
}

function row(cellTag, values) {
  const tr = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement(cellTag);
    cell.textContent = value;
    tr.append(cell);
  }
  return tr;
}
