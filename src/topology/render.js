// 把拓扑画成 SVG。位置写死，阶段 0 不做拖拽。
//
// 这一层在事件流下游，只认「状态」不认「事件」。高亮一律双编码（颜色 + 描边
// 加粗 + 文字），灰度截图和色盲用户都能读 —— 见方案 D5。

const SVG_NS = 'http://www.w3.org/2000/svg';

const HOST = { w: 120, h: 64 };
const SWITCH = { w: 170, h: 96 };
const PORT = 20;

/** 节点类型的中文名。图形本身已经区分了形状，文字是给读屏和灰度图的冗余。 */
const KIND_LABEL = { host: '主机', switch: '交换机' };

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 画出拓扑，返回一个操作句柄。
 * @param {SVGElement} svg 目标 <svg>
 * @param {object} topology engine/topology.js 的实例
 */
export function renderTopology(svg, topology) {
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 760 300');
  svg.setAttribute('role', 'img');

  const desc = el('desc', {}, '拓扑图');
  svg.append(desc);

  const wires = el('g', { class: 'wires' });
  const boxes = el('g', { class: 'nodes' });
  const overlay = el('g', { class: 'overlay' });
  svg.append(wires, boxes, overlay);

  const anchors = new Map();
  const geometry = new Map();
  const portShapes = new Map();
  const nodeShapes = new Map();
  const key = (node, port) => `${node}/${port}`;

  // ---- 节点 ----
  for (const node of topology.nodes()) {
    const size = node.kind === 'switch' ? SWITCH : HOST;
    const group = el('g', { class: `node node--${node.kind}`, 'data-node': node.id });

    // 主机圆角大、交换机方正，形状本身就区分类型。
    const shape = el('rect', {
      x: node.x,
      y: node.y,
      width: size.w,
      height: size.h,
      rx: node.kind === 'host' ? 14 : 4,
      class: 'node__box',
    });
    group.append(shape);
    nodeShapes.set(node.id, shape);

    group.append(
      el('text', { x: node.x + size.w / 2, y: node.y + 26, class: 'node__id' }, node.id),
      el(
        'text',
        { x: node.x + size.w / 2, y: node.y + 44, class: 'node__kind' },
        KIND_LABEL[node.kind] ?? node.kind,
      ),
    );
    if (node.mac !== undefined) {
      group.append(
        el('text', { x: node.x + size.w / 2, y: node.y + size.h + 18, class: 'node__mac' }, node.mac),
      );
    }

    geometry.set(node.id, { ...size, ...node });

    // ---- 端口 ----
    //
    // 交换机的口画在两侧（p1 左、p2 右），主机的口画在朝向交换机的那一侧。
    // 阶段 0 拓扑是一条直线，这个规则够用；阶段 3 级联时再改。
    node.ports.forEach((port, index) => {
      const onLeft = node.kind === 'switch' ? index === 0 : node.x > 300;
      const cx = onLeft ? node.x : node.x + size.w;
      const cy = node.y + size.h / 2;

      const box = el('rect', {
        x: cx - PORT / 2,
        y: cy - PORT / 2,
        width: PORT,
        height: PORT,
        class: 'port__box',
        'data-port': key(node.id, port),
      });
      // 端口盒骑在节点框边线上，所以标签不能放正上方 —— 那样会压进框里。
      // 放到下方、再朝远离节点的方向偏，正好落在线缆下面的空白处。
      const label = el(
        'text',
        { x: cx + (onLeft ? -16 : 16), y: cy + 24, class: 'port__label' },
        port,
      );
      group.append(box, label);
      portShapes.set(key(node.id, port), box);
      anchors.set(key(node.id, port), { x: cx, y: cy });
    });

    boxes.append(group);
  }

  // ---- 链路 ----
  const wireMidpoints = new Map();
  for (const link of topology.links()) {
    const a = anchors.get(key(link.a.node, link.a.port));
    const b = anchors.get(key(link.b.node, link.b.port));
    wires.append(
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'wire', 'data-link': link.id }),
    );
    wireMidpoints.set(link.id, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }

  // ---- 帧标记 ----
  //
  // 一个小方块沿链路移动。带文字标签，不靠颜色单独表意。
  const marker = el('g', { class: 'frame-marker', 'aria-hidden': 'true' });
  marker.append(
    el('rect', { x: -18, y: -12, width: 36, height: 24, rx: 3, class: 'frame-marker__box' }),
    el('text', { x: 0, y: 5, class: 'frame-marker__text' }, '帧'),
  );
  marker.style.display = 'none';
  overlay.append(marker);

  function centerOf(nodeId) {
    const g = geometry.get(nodeId);
    return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  }

  return {
    /** 节点中心，帧从这里出发。 */
    centerOf,

    /** 端口锚点。 */
    anchorOf(nodeId, port) {
      return anchors.get(key(nodeId, port));
    },

    /** 链路中点，帧「在线上」时停这儿。 */
    midpointOf(linkId) {
      return wireMidpoints.get(linkId);
    },

    /** 把帧标记放到某个坐标。 */
    showFrameAt({ x, y }) {
      marker.setAttribute('transform', `translate(${x} ${y})`);
      marker.style.display = '';
    },

    hideFrame() {
      marker.style.display = 'none';
    },

    /** 高亮一批端口，其余复位。 */
    highlightPorts(keys = []) {
      const wanted = new Set(keys);
      for (const [id, shape] of portShapes) {
        shape.classList.toggle('is-active', wanted.has(id));
      }
    },

    /** 高亮一批节点，其余复位。 */
    highlightNodes(ids = []) {
      const wanted = new Set(ids);
      for (const [id, shape] of nodeShapes) {
        shape.classList.toggle('is-active', wanted.has(id));
      }
    },

    /** 更新 <desc>，读屏用户靠它知道当前这一步发生了什么。 */
    setDescription(text) {
      desc.textContent = text;
    },
  };
}
