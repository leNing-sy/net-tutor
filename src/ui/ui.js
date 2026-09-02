// UI：事件流驱动的渲染。订阅事件，画出拓扑、帧的移动、FDB 的变化、VLAN 的着色、STP 的端口角色。
//
// 单步播放：用户点「下一步」时，UI 从事件数组里取下一个，调用对应的渲染器，更新 DOM。
// 不做连续动画（方案 D2 决策），只做离散步进。每步之间状态完全确定。
//
// 架构约束：UI 层只读事件，不修改它们。事件是引擎的输出，UI 是消费者。

/**
 * 创建 UI 控制器。
 *
 * @param {object} config
 * @param {HTMLElement} config.container 渲染容器
 * @param {object} config.topology 拓扑对象
 * @param {object[]} config.events 事件数组
 * @param {object} config.spec 课程规格（含 portConfigs）
 * @param {object} [config.options]
 * @param {boolean} [config.options.showVlan=true] 是否显示 VLAN 着色
 * @param {boolean} [config.options.showStp=false] 是否显示 STP 端口角色
 */
export function createUi({ container, topology, events, spec, options = {} }) {
  const { showVlan = true, showStp = false } = options;

  let currentStep = -1; // 当前播放到哪一步（-1 表示还没开始）
  const state = {
    fdbs: new Map(), // 节点 id → FDB 状态（内存中的表）
    frames: new Map(), // 帧 id → 当前位置
    stpRoles: new Map(), // 节点 id → 端口 id → 角色
    vlanState: new Map(), // 节点 id → 端口 id → 当前 VLAN
  };

  // 构建端口到 VLAN 的映射
  const portVlanMap = new Map();
  if (spec.portConfigs) {
    for (const cfg of spec.portConfigs) {
      const key = `${cfg.node}:${cfg.port}`;
      portVlanMap.set(key, cfg.vlan || cfg.native || 1);
    }
  }

  // VLAN 配色方案
  const vlanColors = {
    1: { node: '#457b9d', link: '#666' }, // 默认 VLAN：蓝灰
    10: { node: '#38BDF8', link: '#38BDF8' }, // VLAN 10：青
    20: { node: '#6EE7B7', link: '#6EE7B7' }, // VLAN 20：翠绿
    30: { node: '#E9A568', link: '#E9A568' }, // VLAN 30：琥珀
  };

  // DOM 元素引用
  const elements = {
    svg: null,
    controls: null,
    stepInfo: null,
    fdbTable: null,
    eventLog: null,
  };

  /**
   * 初始化 UI。
   */
  function init() {
    container.innerHTML = '';
    container.classList.add('net-tutor-ui');

    // 控制面板
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
      <button id="btn-prev" disabled>上一步</button>
      <button id="btn-next">下一步</button>
      <button id="btn-reset">重置</button>
      <span id="step-info">步骤: 0 / ${events.length}</span>
    `;
    container.appendChild(controls);

    elements.controls = controls;
    elements.stepInfo = controls.querySelector('#step-info');

    // 拓扑画布
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 600');
    svg.setAttribute('width', '800');
    svg.setAttribute('height', '600');
    svg.classList.add('topology');
    container.appendChild(svg);
    elements.svg = svg;

    // FDB 表格
    const fdbSection = document.createElement('div');
    fdbSection.className = 'fdb-section';
    fdbSection.innerHTML = '<h3>FDB 表</h3><div id="fdb-table"></div>';
    container.appendChild(fdbSection);
    elements.fdbTable = fdbSection.querySelector('#fdb-table');

    // 事件日志
    const logSection = document.createElement('div');
    logSection.className = 'event-log';
    logSection.innerHTML = '<h3>事件日志</h3><ul id="event-list"></ul>';
    container.appendChild(logSection);
    elements.eventLog = logSection.querySelector('#event-list');

    // 绑定事件
    controls.querySelector('#btn-prev').addEventListener('click', () => stepBackward());
    controls.querySelector('#btn-next').addEventListener('click', () => stepForward());
    controls.querySelector('#btn-reset').addEventListener('click', () => reset());

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stepBackward();
          break;
        case 'Home':
          e.preventDefault();
          reset();
          break;
        case 'End':
          e.preventDefault();
          // 快进到最后一步
          while (currentStep < events.length - 1) {
            stepForward();
          }
          break;
      }
    });

    // 绘制拓扑
    renderTopology();
    updateControls();
  }

  /**
   * 绘制拓扑（节点和链路）。
   */
  function renderTopology() {
    elements.svg.innerHTML = '';

    // 绘制链路
    for (const link of topology.links()) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const aNode = topology.node(link.a.node);
      const bNode = topology.node(link.b.node);
      line.setAttribute('x1', aNode.x);
      line.setAttribute('y1', aNode.y);
      line.setAttribute('x2', bNode.x);
      line.setAttribute('y2', bNode.y);

      // VLAN 着色：如果两端都是 access 口且 VLAN 相同，用 VLAN 颜色
      let linkColor = '#666';
      if (showVlan) {
        const aKey = `${link.a.node}:${link.a.port}`;
        const bKey = `${link.b.node}:${link.b.port}`;
        const aVlan = portVlanMap.get(aKey);
        const bVlan = portVlanMap.get(bKey);

        if (aVlan && bVlan && aVlan === bVlan && vlanColors[aVlan]) {
          linkColor = vlanColors[aVlan].link;
        }
      }

      line.setAttribute('stroke', linkColor);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('data-link-id', link.id);
      elements.svg.appendChild(line);
    }

    // 绘制节点
    for (const node of topology.nodes()) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-node-id', node.id);
      g.setAttribute('transform', `translate(${node.x}, ${node.y})`);

      if (node.kind === 'host') {
        // 主机：矩形，access 口用 VLAN 颜色
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', -30);
        rect.setAttribute('y', -20);
        rect.setAttribute('width', 60);
        rect.setAttribute('height', 40);

        let fillColor = '#a8dadc';
        let strokeColor = '#457b9d';

        if (showVlan && node.ports.length > 0) {
          const portKey = `${node.id}:${node.ports[0]}`;
          const vlan = portVlanMap.get(portKey);
          if (vlan && vlanColors[vlan]) {
            fillColor = vlanColors[vlan].node;
            strokeColor = vlanColors[vlan].node;
          }
        }

        rect.setAttribute('fill', fillColor);
        rect.setAttribute('stroke', strokeColor);
        rect.setAttribute('stroke-width', 2);
        rect.setAttribute('rx', 4);
        g.appendChild(rect);
      } else if (node.kind === 'switch') {
        // 交换机：圆角矩形
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', -40);
        rect.setAttribute('y', -25);
        rect.setAttribute('width', 80);
        rect.setAttribute('height', 50);
        rect.setAttribute('fill', '#457b9d');
        rect.setAttribute('stroke', '#1d3557');
        rect.setAttribute('stroke-width', 2);
        rect.setAttribute('rx', 8);
        g.appendChild(rect);
      }

      // 标签
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', 5);
      text.setAttribute('fill', '#fff');
      text.setAttribute('font-size', 14);
      text.setAttribute('font-weight', 'bold');
      text.textContent = node.id;
      g.appendChild(text);

      elements.svg.appendChild(g);
    }
  }

  /**
   * 前进一步。
   */
  function stepForward() {
    if (currentStep >= events.length - 1) return;
    currentStep += 1;
    const event = events[currentStep];
    processEvent(event);
    updateControls();
    updateViews();
  }

  /**
   * 后退一步。
   */
  function stepBackward() {
    if (currentStep < 0) return;
    currentStep -= 1;
    // 回退 = 从 0 重放到 currentStep
    reset(false);
    for (let i = 0; i <= currentStep; i++) {
      processEvent(events[i]);
    }
    updateControls();
    updateViews();
  }

  /**
   * 重置。
   */
  function reset(updateUI = true) {
    currentStep = -1;
    state.fdbs.clear();
    state.frames.clear();
    state.stpRoles.clear();
    state.vlanState.clear();
    if (updateUI) {
      updateControls();
      updateViews();
    }
  }

  /**
   * 处理一个事件。
   */
  function processEvent(event) {
    const handlers = {
      'frame.injected': handleFrameInjected,
      'frame.egress': handleFrameEgress,
      'frame.ingress': handleFrameIngress,
      'frame.consumed': handleFrameConsumed,
      'frame.forwarded': handleFrameForwarded,
      'frame.flooded': handleFrameFlooded,
      'frame.dropped': handleFrameDropped,
      'fdb.learn': handleFdbLearn,
      'fdb.lookup': handleFdbLookup,
      'fdb.aged': handleFdbAged,
      'vlan.tagged': handleVlanTagged,
      'vlan.untagged': handleVlanUntagged,
      'stp.bpdu-received': handleStpBpduReceived,
      'stp.topology-change': handleStpTopologyChange,
    };

    const handler = handlers[event.type];
    if (handler) {
      handler(event);
    }
  }

  // ========== 事件处理器 ==========

  function handleFrameInjected(event) {
    // 帧注入：记录帧的起点
    const frameId = `frame-${event.seq}`;
    state.frames.set(frameId, { at: event.from, frame: event.frame });
    logEvent(`帧注入: ${event.from.node}/${event.from.port} → ${event.frame.dst}`);
  }

  function handleFrameEgress(event) {
    logEvent(`帧出口: ${event.at.node}/${event.at.port}`);
  }

  function handleFrameIngress(event) {
    logEvent(`帧入口: ${event.at.node}/${event.at.port}`);
  }

  function handleFrameConsumed(event) {
    logEvent(`帧消耗: ${event.at.node}/${event.at.port} (${event.reason})`);
  }

  function handleFrameForwarded(event) {
    logEvent(`单播转发: ${event.at.node} → port ${event.to}`);
  }

  function handleFrameFlooded(event) {
    logEvent(`泛洪: ${event.at.node} → ports [${event.ports.join(', ')}]`);
  }

  function handleFrameDropped(event) {
    logEvent(`丢弃: ${event.at.node}/${event.at.port} (${event.reason})`);
  }

  function handleFdbLearn(event) {
    // 学习：更新内存中的 FDB
    if (!state.fdbs.has(event.node)) {
      state.fdbs.set(event.node, []);
    }
    const fdb = state.fdbs.get(event.node);
    const existing = fdb.findIndex((e) => e.address === event.address && e.vlan === event.vlan);
    if (event.action === 'added') {
      fdb.push({ address: event.address, port: event.port, vlan: event.vlan });
      logEvent(`FDB 学习: ${event.node} 学到 ${event.address} → ${event.port} (VLAN ${event.vlan})`);
    } else if (event.action === 'moved') {
      if (existing >= 0) {
        fdb[existing].port = event.port;
      }
      logEvent(`FDB 移动: ${event.node} ${event.address} 从 ${event.previousPort} 移到 ${event.port}`);
    } else if (event.action === 'refreshed') {
      logEvent(`FDB 刷新: ${event.node} ${event.address} → ${event.port}`);
    }
  }

  function handleFdbLookup(event) {
    logEvent(`FDB 查询: ${event.node} 查 ${event.key} → ${event.result}`);
  }

  function handleFdbAged(event) {
    if (state.fdbs.has(event.node)) {
      const fdb = state.fdbs.get(event.node);
      const index = fdb.findIndex((e) => e.address === event.address && e.vlan === event.vlan);
      if (index >= 0) {
        fdb.splice(index, 1);
      }
    }
    logEvent(`FDB 老化: ${event.node} ${event.address} 过期`);
  }

  function handleVlanTagged(event) {
    logEvent(`VLAN 打标签: ${event.at.node}/${event.at.port} VLAN ${event.vlan}`);
  }

  function handleVlanUntagged(event) {
    logEvent(`VLAN 剥标签: ${event.at.node}/${event.at.port} VLAN ${event.vlan}`);
  }

  function handleStpBpduReceived(event) {
    logEvent(`STP BPDU: ${event.at.node}/${event.at.port} 收到 root=${event.bpdu.root.priority}`);
  }

  function handleStpTopologyChange(event) {
    // 更新端口角色
    state.stpRoles.set(event.node, event.roles);
    logEvent(`STP 拓扑变化: ${event.node} root=${event.root.priority} rootPort=${event.rootPort}`);
  }

  // ========== 视图更新 ==========

  function updateViews() {
    updateFdbTable();
    renderStpRoles();
  }

  function updateFdbTable() {
    elements.fdbTable.innerHTML = '';
    for (const [nodeId, entries] of state.fdbs) {
      const section = document.createElement('div');
      section.className = 'fdb-node-section';
      const title = document.createElement('h4');
      title.textContent = nodeId;
      section.appendChild(title);

      if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = '(空)';
        empty.className = 'fdb-empty';
        section.appendChild(empty);
      } else {
        const table = document.createElement('table');
        table.className = 'fdb-table';
        table.innerHTML = `
          <thead><tr><th>MAC</th><th>端口</th><th>VLAN</th></tr></thead>
          <tbody>
            ${entries.map((e) => `<tr><td>${e.address}</td><td>${e.port}</td><td>${e.vlan}</td></tr>`).join('')}
          </tbody>
        `;
        section.appendChild(table);
      }
      elements.fdbTable.appendChild(section);
    }
  }

  function renderStpRoles() {
    if (!showStp) return;
    // 在拓扑上标注端口角色（root / designated / blocked）
    for (const [nodeId, roles] of state.stpRoles) {
      const nodeGroup = elements.svg.querySelector(`[data-node-id="${nodeId}"]`);
      if (!nodeGroup) continue;

      // 在每个端口位置标注角色
      const node = topology.node(nodeId);
      const ports = node.ports || [];

      // 清理旧标注
      const oldLabels = nodeGroup.querySelectorAll('.stp-port-role');
      oldLabels.forEach((l) => l.remove());

      // 每个端口一个角色标识
      ports.forEach((portId, idx) => {
        const role = roles[portId];
        if (!role) return;

        const roleLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        roleLabel.classList.add('stp-port-role');

        // 角色符号
        const symbols = {
          root: '🌳', // 根端口：通往根桥
          designated: '✓', // 指定端口：转发
          blocked: '✗', // 阻塞端口：不转发
        };

        const symbol = symbols[role] || role[0].toUpperCase();
        roleLabel.textContent = `${portId}:${symbol}`;

        // 根据端口索引安排位置（简化：环绕节点）
        const angle = (idx / ports.length) * 2 * Math.PI - Math.PI / 2;
        const radius = 50;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        roleLabel.setAttribute('x', x);
        roleLabel.setAttribute('y', y);
        roleLabel.setAttribute('text-anchor', 'middle');
        roleLabel.setAttribute('font-size', 10);
        roleLabel.setAttribute('font-weight', 'bold');

        // 颜色：blocked 用红色，其他用绿色
        const color = role === 'blocked' ? '#e63946' : '#6EE7B7';
        roleLabel.setAttribute('fill', color);

        // 背景圆盘
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        bg.classList.add('stp-port-role');
        bg.setAttribute('cx', x);
        bg.setAttribute('cy', y);
        bg.setAttribute('r', 12);
        bg.setAttribute('fill', '#0A0D12');
        bg.setAttribute('stroke', color);
        bg.setAttribute('stroke-width', 1.5);

        nodeGroup.appendChild(bg);
        nodeGroup.appendChild(roleLabel);
      });
    }
  }

  function logEvent(message) {
    const li = document.createElement('li');
    li.textContent = `[${currentStep + 1}] ${message}`;
    elements.eventLog.appendChild(li);
    elements.eventLog.scrollTop = elements.eventLog.scrollHeight;
  }

  function updateControls() {
    elements.stepInfo.textContent = `步骤: ${currentStep + 1} / ${events.length}`;
    elements.controls.querySelector('#btn-prev').disabled = currentStep < 0;
    elements.controls.querySelector('#btn-next').disabled = currentStep >= events.length - 1;
  }

  // ========== 公开 API ==========

  init();

  return {
    stepForward,
    stepBackward,
    reset,
    get currentStep() {
      return currentStep;
    },
    get state() {
      return state;
    },
  };
}
