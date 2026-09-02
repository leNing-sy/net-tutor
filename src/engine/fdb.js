// 转发数据库（FDB / MAC 地址表）。
//
// 键是 (VLAN, MAC) 而不是单纯的 MAC。阶段 1 还没有 VLAN，全部填默认 VLAN 1；
// 这样阶段 2 打开 VLAN 时不用改键的形状，也不会出现「两个 VLAN 里同一个 MAC
// 互相覆盖」这种只在多 VLAN 下暴露的 bug。
//
// 一条贯穿全程的规矩：**查询无副作用**。加了学习之后很容易在查询路径里顺手学
// 一下，那样表就会因为「看了一眼」而变化。lookup 只读，learn 只写。

import * as mac from './mac.js';

/** 默认 VLAN。没开 VLAN 的场景全部落在这里。 */
export const DEFAULT_VLAN = 1;

/** 默认老化时间。真设备通常 300 秒，教学场景要能在几步内看到过期。 */
export const DEFAULT_TTL = 30;

/**
 * 建一张空表。
 *
 * 用闭包而不是 class：这样方法不依赖 `this`，传给回调、解构出来单独用都不会
 * 悄悄丢掉绑定。
 *
 * @param {{ttl?:number}} [options]
 */
export function createFdb({ ttl = DEFAULT_TTL } = {}) {
  /** @type {Map<string, {vlan:number, address:string, port:string, learnedAt:number}>} */
  const table = new Map();
  const keyOf = (vlan, address) => `${vlan}/${mac.parse(address)}`;

  const api = {
    /** 老化时间，UI 要显示「还剩几秒」。 */
    get ttl() {
      return ttl;
    },

    /** 表项数量。 */
    get size() {
      return table.size;
    },

    /**
     * 查表。不改表。
     * @returns {{result:'hit', port:string}|{result:'miss', port:null}}
     */
    lookup(address, vlan = DEFAULT_VLAN) {
      const entry = table.get(keyOf(vlan, address));
      if (entry === undefined) {
        return { result: 'miss', port: null };
      }
      return { result: 'hit', port: entry.port };
    },

    /**
     * 学一条：源 MAC 在哪个口进来的，就记它在哪个口。
     *
     * 四种结果分开报，因为它们在教学上是不同的事：
     *   added     第一次见到这个 MAC
     *   moved     同一个 MAC 换口了（MAC 飘移，阶段 5 的故障素材）
     *   refreshed 同口再见到，续命，老化计时归零
     *   ignored   源地址是组播/广播，真设备不学
     *
     * @returns {{action:'added'|'moved'|'refreshed'|'ignored', previousPort:string|null}}
     */
    learn(address, port, t, vlan = DEFAULT_VLAN) {
      if (!Number.isInteger(t)) {
        throw new Error(`learn needs an integer t, got ${t}`);
      }
      // 源地址是组播说明帧本身畸形。不学，但也不抛 —— 引擎只解析不校验，
      // 畸形帧要能走完流程好让人看见真设备的处置方式。
      if (mac.isMulticast(address)) {
        return { action: 'ignored', previousPort: null };
      }

      const key = keyOf(vlan, address);
      const existing = table.get(key);
      const normalized = mac.parse(address);

      if (existing === undefined) {
        table.set(key, { vlan, address: normalized, port, learnedAt: t });
        return { action: 'added', previousPort: null };
      }

      const previousPort = existing.port;
      // 直接改 existing 会丢掉插入顺序里的位置吗？不会 —— Map 的 set 对已有键
      // 保持原位置。表项顺序稳定，渲染不会每步跳动。
      existing.port = port;
      existing.learnedAt = t;
      return {
        action: previousPort === port ? 'refreshed' : 'moved',
        previousPort,
      };
    },

    /**
     * 老化：删掉 learnedAt + ttl <= now 的表项。
     *
     * 时刻由调用方传进来（约束 1）。返回被删的表项，UI 要逐条说「谁过期了」。
     * @returns {Array<{vlan:number, address:string, port:string, learnedAt:number}>}
     */
    age(now) {
      if (!Number.isInteger(now)) {
        throw new Error(`age needs an integer now, got ${now}`);
      }
      const expired = [];
      for (const [key, entry] of table) {
        if (entry.learnedAt + ttl <= now) {
          expired.push({ ...entry });
          table.delete(key);
        }
      }
      return expired;
    },

    /** 手工删一条，给阶段 5 的「清表重来」用。 */
    forget(address, vlan = DEFAULT_VLAN) {
      return table.delete(keyOf(vlan, address));
    },

    /** 清空。 */
    clear() {
      table.clear();
    },

    /**
     * 快照，给渲染用。
     *
     * Map 保插入顺序，所以顺序稳定、可预期。每次返回新数组和新对象，外面改不到
     * 表里。
     */
    entries() {
      return Array.from(table.values(), (entry) => ({ ...entry }));
    },
  };

  return api;
}
