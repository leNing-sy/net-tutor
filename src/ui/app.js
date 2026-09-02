// 单步控制 + 事件流投影。
//
// 约束 3 落在这里：回退不写反向操作，而是把光标调小、从 0 重新投影一次。
// project() 是纯函数，同一个 cursor 永远得到同一个画面 —— 画面和引擎状态不可能
// 悄悄分叉。事件流才几个元素，重放没有成本。

import { createTopology } from '../engine/topology.js';
import { simulate } from '../engine/engine.js';
import { scenario } from '../lessons/stage0.js';
import { renderTopology } from '../topology/render.js';
import { describe, renderFdb, renderHex, renderLog } from './panels.js';

const topology = createTopology(scenario.spec);
const events = simulate({ topology, injections: scenario.injections });

/**
 * 把「前 cursor+1 个事件」投影成一个画面状态。纯函数，不看 DOM，不改外部。
 *
 * @param {number} cursor -1 = 还没开始
 */
export function project(cursor) {
  const state = {
    frame: null,
    position: null,
    activePorts: [],
    activeNodes: [],
    lookup: null,
    fdbEntries: [],
  };

  for (const event of events.slice(0, cursor + 1)) {
    switch (event.type) {
      case 'frame.injected':
        state.frame = event.frame;
        state.position = { kind: 'node', node: event.from.node };
        state.activeNodes = [event.from.node];
        state.activePorts = [`${event.from.node}/${event.from.port}`];
        break;
      case 'frame.egress':
        state.position = { kind: 'wire', link: event.link };
        state.activeNodes = [];
        state.activePorts = [`${event.at.node}/${event.at.port}`];
        break;
      case 'frame.ingress':
        state.frame = event.frame;
        state.position = { kind: 'port', node: event.at.node, port: event.at.port };
        state.activeNodes = [event.at.node];
        state.activePorts = [`${event.at.node}/${event.at.port}`];
        break;
      case 'fdb.lookup':
        state.lookup = event;
        state.activeNodes = [event.node];
        break;
      case 'frame.consumed':
        state.position = null;
        state.activePorts = [];
        break;
      default:
        break;
    }
  }
  return state;
}

/** 启动。只有这个函数碰 DOM。 */
export function start(root = document) {
  const svg = root.querySelector('#topology');
  const view = renderTopology(svg, topology);

  const logHost = root.querySelector('#log');
  const hexHost = root.querySelector('#hex');
  const fdbHost = root.querySelector('#fdb');
  const stepLabel = root.querySelector('#step-label');
  const btnPrev = root.querySelector('#btn-prev');
  const btnNext = root.querySelector('#btn-next');
  const btnReset = root.querySelector('#btn-reset');

  let cursor = -1;

  function paint() {
    const state = project(cursor);

    // 帧标记的位置
    if (state.position === null) {
      view.hideFrame();
    } else if (state.position.kind === 'node') {
      view.showFrameAt(view.centerOf(state.position.node));
    } else if (state.position.kind === 'wire') {
      view.showFrameAt(view.midpointOf(state.position.link));
    } else {
      view.showFrameAt(view.anchorOf(state.position.node, state.position.port));
    }

    view.highlightPorts(state.activePorts);
    view.highlightNodes(state.activeNodes);

    const current = cursor < 0 ? null : events[cursor];
    view.setDescription(current === null ? '拓扑图，还没开始' : describe(current));

    renderLog(logHost, events, cursor);
    renderHex(hexHost, state.frame);
    renderFdb(fdbHost, state.fdbEntries, state.lookup);

    stepLabel.textContent = `第 ${cursor + 1} / ${events.length} 步`;
    btnPrev.disabled = cursor < 0;
    btnNext.disabled = cursor >= events.length - 1;
    btnReset.disabled = cursor < 0;
  }

  function goto(next) {
    cursor = Math.max(-1, Math.min(events.length - 1, next));
    paint();
  }

  btnNext.addEventListener('click', () => goto(cursor + 1));
  btnPrev.addEventListener('click', () => goto(cursor - 1));
  btnReset.addEventListener('click', () => goto(-1));

  root.addEventListener('keydown', (event) => {
    // 输入框里按方向键不该翻步骤。阶段 0 还没有输入框，先把规矩立着。
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      goto(cursor + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goto(cursor - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goto(-1);
    } else if (event.key === 'End') {
      event.preventDefault();
      goto(events.length - 1);
    }
  });

  paint();
}
