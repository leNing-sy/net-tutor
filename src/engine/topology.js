// 拓扑的数据结构：节点、端口、链路，以及端口对端查询。
//
// 注意这个文件在 engine/ 而不是 topology/ —— 后者按方案 §4 在事件流下游，是
// 渲染目录。数据结构属于引擎。

const KINDS = new Set(['host', 'switch']);

/**
 * 建一个拓扑。
 *
 * @param {{
 *   nodes: Array<{id:string, kind:'host'|'switch', ports:string[], mac?:string, x:number, y:number}>,
 *   links: Array<{a:{node:string, port:string}, b:{node:string, port:string}}>
 * }} spec
 */
export function createTopology(spec) {
  const nodes = new Map();
  const linkByPort = new Map();
  const portKey = (node, port) => `${node}/${port}`;

  for (const node of spec.nodes ?? []) {
    if (nodes.has(node.id)) {
      throw new Error(`duplicate node id: "${node.id}"`);
    }
    if (!KINDS.has(node.kind)) {
      throw new Error(`unknown node kind "${node.kind}" on "${node.id}"`);
    }
    const ports = node.ports ?? [];
    if (new Set(ports).size !== ports.length) {
      throw new Error(`duplicate port id on node "${node.id}"`);
    }
    nodes.set(node.id, { ...node, ports: [...ports] });
  }

  // 校验期间自己记账。不能查 linkByPort —— 那个索引要等所有链路都收完才建，
  // 校验时还是空的，检查会形同虚设。
  const claimed = new Set();

  const links = (spec.links ?? []).map((link, index) => {
    const direction = link.direction ?? 'bidirectional'; // 'a-to-b', 'b-to-a', 'bidirectional'
    for (const end of [link.a, link.b]) {
      const node = nodes.get(end.node);
      if (node === undefined) {
        throw new Error(`link ${index} references unknown node "${end.node}"`);
      }
      if (!node.ports.includes(end.port)) {
        throw new Error(`link ${index} references unknown port "${end.node}/${end.port}"`);
      }
      // 一个口最多接一条线，否则 peer() 无法返回单一结果。
      if (claimed.has(portKey(end.node, end.port))) {
        throw new Error(`port "${end.node}/${end.port}" already has a link`);
      }
      claimed.add(portKey(end.node, end.port));
    }
    return { ...link, id: link.id ?? `link${index}`, direction };
  });

  // 建对端索引。根据 direction 决定单向还是双向。
  for (const link of links) {
    if (link.direction === 'bidirectional' || link.direction === 'a-to-b') {
      linkByPort.set(portKey(link.a.node, link.a.port), { link, far: link.b });
    }
    if (link.direction === 'bidirectional' || link.direction === 'b-to-a') {
      linkByPort.set(portKey(link.b.node, link.b.port), { link, far: link.a });
    }
  }

  return {
    /** 全部节点，顺序稳定。 */
    nodes() {
      return Array.from(nodes.values());
    },

    /** 全部链路，顺序稳定。 */
    links() {
      return [...links];
    },

    /** 取一个节点，不存在就抛 —— 拼错 id 属于编程错误，不该静默返回空。 */
    node(id) {
      const found = nodes.get(id);
      if (found === undefined) {
        throw new Error(`unknown node: "${id}"`);
      }
      return found;
    },

    /** 某个节点的端口列表，顺序稳定（渲染顺序不能每次刷新都变）。 */
    ports(nodeId) {
      return [...this.node(nodeId).ports];
    },

    hasPort(nodeId, port) {
      return nodes.has(nodeId) && nodes.get(nodeId).ports.includes(port);
    },

    /**
     * 端口对端。
     *
     * 区分两种「没有」：端口本身不存在是编程错误，抛；端口存在但没接线是合法
     * 拓扑状态，返回 null。
     * @returns {{node:string, port:string}|null}
     */
    peer(nodeId, port) {
      if (!this.hasPort(nodeId, port)) {
        throw new Error(`unknown port: "${nodeId}/${port}"`);
      }
      const entry = linkByPort.get(portKey(nodeId, port));
      return entry === undefined ? null : { ...entry.far };
    },

    /** 连着某个端口的链路 id，没接线返回 null。 */
    linkAt(nodeId, port) {
      if (!this.hasPort(nodeId, port)) {
        throw new Error(`unknown port: "${nodeId}/${port}"`);
      }
      return linkByPort.get(portKey(nodeId, port))?.link.id ?? null;
    },
  };
}
