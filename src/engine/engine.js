// 引擎：吃拓扑和注入的帧,吐事件序列。
//
// 四条约束(方案 §4),每条都在测试里有哨兵盯着:
//   1. 不碰 Date.now() / Math.random()。时刻由调用方传进来
//   2. 事件必须能 JSON 往返。不放 Map、Set、类实例、函数
//   3. 回退 = 从 0 重放。这里不提供任何反向操作
//   4. 不出现中文文案。原因用机器码,人话在 UI 层映射
//
// 阶段 1-3 用队列驱动:一个帧进来可能触发多个出口、学习、老化、BPDU。每个动作
// 产出一个或多个事件,有些动作会往队列里塞新的待办(泛洪 = 对每个口排一个出口
// 动作)。队列空了才处理下一个注入。

import * as frame from './frame.js';
import * as mac from './mac.js';
import { createFdb, DEFAULT_VLAN } from './fdb.js';
import * as vlan from './vlan.js';
import * as stp from './stp.js';

/**
 * 跑一遍模拟。
 *
 * @param {object} scenario
 * @param {object} scenario.topology
 * @param {Array<{node:string, port:string, t:number, frame:object|string|number[]}>} scenario.injections
 * @param {object} [scenario.options]
 * @param {boolean} [scenario.options.enableStp=false] 是否启用 STP
 * @param {boolean} [scenario.options.enableVlan=false] 是否启用 VLAN(阶段 2)
 * @param {Map<string, object>} [scenario.options.vlanConfig] 节点 → 端口 → VLAN 配置
 * @param {number} [scenario.options.agingInterval=10] 每隔多少时刻做一次老化
 * @param {number} [scenario.options.maxEvents] 事件数量上限（防止广播风暴无限循环）
 * @param {Map<string, object>} [scenario.fdbs] 交换机 id → FDB
 * @returns {object[]} 事件序列
 */
export function simulate({ topology, injections, options = {}, fdbs = new Map() }) {
  if (topology === undefined || topology === null) {
    throw new Error('simulate needs a topology');
  }
  if (!Array.isArray(injections) || injections.length === 0) {
    throw new Error('simulate needs at least one injection');
  }

  const {
    enableStp = false,
    enableVlan = false,
    vlanConfig = new Map(),
    agingInterval = 10,
    maxEvents = Infinity,
  } = options;

  // 先把所有输入校验完,再产事件。半截事件流会让 UI 画出停在半空的帧。
  const prepared = injections.map((injection, index) => {
    const { node, port, t } = injection ?? {};
    if (!topology.hasPort(node, port)) {
      throw new Error(`injection ${index} targets unknown port "${node}/${port}"`);
    }
    if (!Number.isInteger(t)) {
      throw new Error(`injection ${index} needs an integer t, got ${t}`);
    }
    const parsed = frame.parse(injection.frame?.bytes ?? injection.frame);
    return { node, port, t, parsed };
  });

  const events = [];
  const stpInstances = new Map();
  let lastAgingTime = -Infinity;

  // 初始化 STP
  if (enableStp) {
    for (const node of topology.nodes()) {
      if (node.kind === 'switch') {
        const bridgeId = {
          priority: node.stpPriority ?? stp.DEFAULT_BRIDGE_PRIORITY,
          mac: node.mac ?? `00:00:00:00:00:${node.id.charCodeAt(node.id.length - 1).toString(16).padStart(2, '0')}`,
        };
        stpInstances.set(
          node.id,
          stp.createStp({ bridgeId, ports: topology.ports(node.id) }),
        );
      }
    }
  }

  function emit(t, type, payload) {
    if (events.length >= maxEvents) {
      throw new Error(`Event limit reached (${maxEvents}). Possible broadcast storm.`);
    }
    events.push({ seq: events.length, t, type, ...payload });
  }

  function toWire(parsed) {
    return {
      dst: parsed.dst,
      src: parsed.src,
      ethertype: parsed.ethertype,
      bytes: parsed.bytes,
    };
  }

  function getPortVlanConfig(nodeId, port) {
    return vlanConfig.get(nodeId)?.get(port) ?? {};
  }

  // 老化检查
  function checkAging(t) {
    if (t - lastAgingTime < agingInterval) return;
    lastAgingTime = t;
    for (const [nodeId, fdb] of fdbs) {
      const expired = fdb.age(t);
      for (const entry of expired) {
        emit(t, 'fdb.aged', { node: nodeId, address: entry.address, vlan: entry.vlan, port: entry.port });
      }
    }
  }

  // 处理一个注入
  for (const item of prepared) {
    checkAging(item.t);
    const queue = [{ action: 'inject', ...item }];

    while (queue.length > 0) {
      const task = queue.shift();

      if (task.action === 'inject') {
        const wire = toWire(task.parsed);
        emit(task.t, 'frame.injected', { from: { node: task.node, port: task.port }, frame: wire });
        const far = topology.peer(task.node, task.port);
        if (far === null) {
          emit(task.t, 'frame.consumed', { at: { node: task.node, port: task.port }, reason: 'no-link' });
          continue;
        }
        queue.push({ action: 'egress', node: task.node, port: task.port, far, wire, t: task.t });
      }

      if (task.action === 'egress') {
        const linkId = topology.linkAt(task.node, task.port);
        emit(task.t, 'frame.egress', { at: { node: task.node, port: task.port }, link: linkId });
        // 检查链路方向：如果是单向且方向不对，帧无法到达对端
        const link = topology.links().find(l => l.id === linkId);
        const canReach = !link || link.direction === 'bidirectional' ||
          (link.direction === 'a-to-b' && link.a.node === task.node && link.a.port === task.port) ||
          (link.direction === 'b-to-a' && link.b.node === task.node && link.b.port === task.port);
        if (!canReach) {
          emit(task.t, 'frame.consumed', { at: { node: task.node, port: task.port }, reason: 'unidirectional-link' });
          continue;
        }
        queue.push({ action: 'ingress', at: task.far, wire: task.wire, t: task.t });
      }

      if (task.action === 'ingress') {
        const { at, wire, t } = task;
        emit(t, 'frame.ingress', { at, frame: wire });

        const nodeKind = topology.node(at.node).kind;
        if (nodeKind === 'host') {
          emit(t, 'frame.consumed', { at, reason: 'reached-host' });
          continue;
        }

        // 交换机处理
        let currentVlan = DEFAULT_VLAN;
        if (enableVlan) {
          const ingressResult = vlan.ingress(wire, getPortVlanConfig(at.node, at.port));
          if (!ingressResult.ok) {
            emit(t, 'frame.dropped', { at, reason: ingressResult.reason, vlan: ingressResult.vlan });
            continue;
          }
          currentVlan = ingressResult.vlan;
          if (ingressResult.action === 'tagged') {
            emit(t, 'vlan.tagged', { at, vlan: currentVlan });
          }
        }

        // STP BPDU 检测
        if (enableStp && wire.ethertype === stp.BPDU_ETHERTYPE) {
          const bpdu = stp.decodeBpdu(wire.bytes);
          if (bpdu !== null) {
            emit(t, 'stp.bpdu-received', { at, bpdu });
            const instance = stpInstances.get(at.node);
            if (instance && instance.receiveBpdu(at.port, bpdu)) {
              const state = instance.recompute();
              emit(t, 'stp.topology-change', { node: at.node, root: state.root, rootPort: state.rootPort, roles: Object.fromEntries(state.roles) });
              // 重算后在 designated 口发 BPDU
              const outBpdu = instance.makeBpdu();
              for (const [port, role] of state.roles) {
                if (role === 'designated') {
                  const bpduBytes = stp.encodeBpdu(state.root.mac, outBpdu);
                  const bpduWire = toWire(frame.parse(bpduBytes));
                  const far = topology.peer(at.node, port);
                  if (far !== null) {
                    queue.push({ action: 'egress', node: at.node, port, far, wire: bpduWire, t });
                  }
                }
              }
            }
            continue; // BPDU 不转发
          }
        }

        // 学习源 MAC
        const fdb = fdbs.get(at.node) ?? createFdb();
        fdbs.set(at.node, fdb);
        const learned = fdb.learn(wire.src, at.port, t, currentVlan);
        if (learned.action !== 'ignored') {
          emit(t, 'fdb.learn', { node: at.node, address: wire.src, port: at.port, vlan: currentVlan, action: learned.action, previousPort: learned.previousPort });
        }

        // 查表
        const hit = fdb.lookup(wire.dst, currentVlan);
        emit(t, 'fdb.lookup', { node: at.node, key: wire.dst, vlan: currentVlan, result: hit.result, port: hit.port });

        if (hit.result === 'hit') {
          // 命中:单播转发
          const outPort = hit.port;
          if (outPort === at.port) {
            emit(t, 'frame.consumed', { at, reason: 'same-port' });
            continue;
          }

          // STP 阻塞检查
          if (enableStp) {
            const instance = stpInstances.get(at.node);
            if (instance) {
              const state = instance.recompute();
              if (state.roles.get(outPort) === 'blocked') {
                emit(t, 'frame.consumed', { at: { node: at.node, port: outPort }, reason: 'stp-blocked' });
                continue;
              }
            }
          }

          // VLAN 出口检查
          let outWire = wire;
          if (enableVlan) {
            const egressResult = vlan.egress(wire, getPortVlanConfig(at.node, outPort), currentVlan);
            if (!egressResult.ok) {
              emit(t, 'frame.dropped', { at: { node: at.node, port: outPort }, reason: egressResult.reason });
              continue;
            }
            outWire = egressResult.wire;
            if (egressResult.action === 'untagged') {
              emit(t, 'vlan.untagged', { at: { node: at.node, port: outPort }, vlan: currentVlan });
            }
          }

          emit(t, 'frame.forwarded', { at, to: outPort, vlan: currentVlan });
          const far = topology.peer(at.node, outPort);
          if (far !== null) {
            queue.push({ action: 'egress', node: at.node, port: outPort, far, wire: outWire, t });
          }
        } else {
          // 未命中:泛洪(广播/组播/未知单播)
          const allPorts = topology.ports(at.node);
          const candidates = allPorts.filter((p) => p !== at.port);
          if (candidates.length === 0) {
            emit(t, 'frame.consumed', { at, reason: 'no-other-ports' });
            continue;
          }

          const floodPorts = [];
          for (const outPort of candidates) {
            // STP 阻塞检查
            if (enableStp) {
              const instance = stpInstances.get(at.node);
              if (instance) {
                const state = instance.recompute();
                if (state.roles.get(outPort) === 'blocked') {
                  continue;
                }
              }
            }

            // VLAN 出口检查
            if (enableVlan) {
              const egressResult = vlan.egress(wire, getPortVlanConfig(at.node, outPort), currentVlan);
              if (!egressResult.ok) continue;
            }

            floodPorts.push(outPort);
          }

          if (floodPorts.length === 0) {
            emit(t, 'frame.consumed', { at, reason: 'no-eligible-ports' });
            continue;
          }

          emit(t, 'frame.flooded', { at, ports: floodPorts, excluded: [at.port], vlan: currentVlan });
          for (const outPort of floodPorts) {
            let outWire = wire;
            if (enableVlan) {
              const egressResult = vlan.egress(wire, getPortVlanConfig(at.node, outPort), currentVlan);
              outWire = egressResult.wire;
              if (egressResult.action === 'untagged') {
                emit(t, 'vlan.untagged', { at: { node: at.node, port: outPort }, vlan: currentVlan });
              }
            }
            const far = topology.peer(at.node, outPort);
            if (far !== null) {
              queue.push({ action: 'egress', node: at.node, port: outPort, far, wire: outWire, t });
            }
          }
        }
      }
    }
  }

  return events;
}
