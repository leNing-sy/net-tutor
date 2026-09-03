# net-tutor

> **当前状态：5 个阶段全部完成，引擎全功能，152 项单测全过。**
> 
> 阶段 0-3：交互式课程，可单步播放查看转发逻辑、FDB 变化、VLAN 隔离、STP 收敛  
> 阶段 4：45 道练习题，支持错题本和进度追踪  
> 阶段 5：4 个故障排查场景，从 VLAN 配置到广播风暴

浏览器里跑的二层网络教学工具。画出拓扑、发一个帧、看它怎么被转发、看 FDB 怎么长出表项。

判断这个工具做成了的标准只有一句话：**能对着屏幕给一个不懂的人讲清「为什么这个帧
没被转发到那个口」**，不需要在旁边补口头说明。

## 现在能看到什么

### 交互式课程（index.html）

打开 `index.html`，默认加载阶段 0 课程：

- **拓扑**：两台主机一台交换机 `h1 —[p1] sw1 [p2]— h2`
- **事件流**：h1 发单播帧给 h2，单步播放 5 个核心事件（注入、出口、入口、查表、消耗）
- **FDB 表**：初始为空，引擎会学习源 MAC（阶段 1 行为已实现）
- **事件日志**：每一步的操作记录，可回看

切换到阶段 1-3：修改 `index.html` 中的 `import` 路径，从 `stage0.js` 改成 `stage1.js`、`stage2.js` 或 `stage3.js`。

### 练习题系统（quiz.html）

打开 `quiz.html`，包含 30 道练习题：

- **题型多样**：单选、多选、填空、判断、场景题
- **错题本**：自动记录答错的题目，答对后移除
- **进度追踪**：统计答题次数、正确率，掌握标准：正确≥2次且正确率≥80%
- **数据持久化**：错题和进度保存在 localStorage，刷新页面不丢失

### 故障排查演练（troubleshoot.html）

打开 `troubleshoot.html`，包含 4 个真实故障场景：

1. **VLAN 配置错误**：端口 VLAN 配置不匹配导致隔离
2. **MAC 地址飘移**：重复 MAC 导致 FDB 表项振荡
3. **广播风暴**：环路 + STP 未启用导致帧无限循环
4. **单向链路**：链路方向配置错误导致回程失败

每个场景包含：可视化拓扑、渐进式提示、根因分析、修复建议

## 阶段状态

| 阶段 | 内容 | 引擎 | UI | 课程数据 |
|---|---|---|---|---|
| 0 | 帧头解析、空 FDB、事件流驱动渲染 | ✅ | ✅ | ✅ |
| 1 | FDB 学习、命中转发、未命中泛洪、老化 | ✅ | ✅ | ✅ |
| 2 | VLAN：打/剥 tag、access/trunk、PVID、隔离 | ✅ | ⚠️ 着色未实现 | ✅ |
| 3 | 多台交换机、环路、BPDU、STP 收敛 | ✅ | ⚠️ 角色标识简化 | ✅ |
| 4 | 练习题系统：题库、错题本、进度追踪 | ✅ | ✅ | ✅ 30 题 |
| 5 | 故障排查演练：VLAN、MAC飘移、广播风暴、单向链路 | ✅ | ✅ | ✅ 4 场景 |

**说明**：
- 引擎层（`src/engine/`）已实现阶段 0-5 的全部逻辑：帧解析、FDB 学习与查询、VLAN 标签处理、STP 端口角色计算、maxEvents 限制、单向链路支持
- UI 层可单步播放、查看 FDB 表、事件日志，VLAN 着色和 STP 详细可视化待完善
- 阶段 4 包含 30 道练习题（单选、多选、填空、判断、场景题），支持错题本和进度统计
- 阶段 5 包含 4 个故障场景，每个场景带提示和答案

## 运行方式

无构建步骤，无 npm 依赖。原生 ES module + SVG。

### 本地运行

```bash
# 起静态服务器，然后开 http://localhost:8000
python -m http.server 8000

# 或用 Node（需要全局安装 http-server）
npx http-server -p 8000

# 跑引擎单测（Node 内置运行器，零依赖）
npm test
```

`npm test` 等价于 `node --test "tests/**/*.test.js"`。注意 **`node --test tests/`
在 Node v24 上会把目录当模块路径解析而报 MODULE_NOT_FOUND**，得用 glob。

ES module 需要 http 协议，直接双击 `index.html` 走 `file://` 会被 CORS 挡住。

**访问入口**：
- 交互式课程：http://localhost:8000/index.html
- 练习题系统：http://localhost:8000/quiz.html
- 故障排查：http://localhost:8000/troubleshoot.html

**切换课程**：编辑 `index.html`，修改 `import { spec, injections } from './src/lessons/stage0.js';` 为 `stage1.js`、`stage2.js` 或 `stage3.js`。

### 在线访问

本项目已部署到 GitHub Pages，可直接访问：

🔗 **https://[your-username].github.io/net-tutor/**

（首次推送 main/master 分支后，GitHub Actions 会自动部署）

详细使用说明：[docs/USAGE.md](docs/USAGE.md)

## 学习路径

### 阶段 0：事件流基础

**目标**：理解「事件驱动」的核心 —— 引擎吐事件，UI 订阅并渲染。

- 拓扑：`h1 → sw1 → h2`
- 场景：h1 发单播帧给 h2，FDB 为空，查表未命中，帧被消耗（不转发）
- 学到什么：
  - 5 个核心事件类型：`frame.injected`、`frame.egress`、`frame.ingress`、`fdb.lookup`、`frame.consumed`
  - 事件的 `seq`（序号）、`t`（时刻）、`type`（类型）
  - FDB 是空的 ≠ 端口不存在，交换机有端口但什么都不知道

### 阶段 1：学习与转发

**目标**：看懂 FDB 怎么从空表变成有两条表项，未命中泛洪 vs 命中单播。

- 拓扑：`h1 → sw1 → h2`
- 场景：
  1. h1 → h2：学习 h1 的 MAC，查表未命中目的 MAC，泛洪到 p2，h2 收到
  2. h2 → h1：学习 h2 的 MAC，查表命中 h1 的 MAC，单播转发到 p1，h1 收到
  3. h1 → h2：查表命中 h2 的 MAC，单播转发到 p2，h2 收到
- 学到什么：
  - `fdb.learn` 事件：`action` 可能是 `added`（新学）、`refreshed`（刷新）、`moved`（MAC 地址迁移）
  - `frame.flooded`：未命中时泛洪到除入端口外的所有端口
  - `frame.forwarded`：命中时单播转发到指定端口
  - 表项有老化时间（默认 300 秒），过期后产生 `fdb.aged` 事件

### 阶段 2：VLAN 隔离

**目标**：看到「同一根线上两个 VLAN 的帧互相看不见」。

- 拓扑：4 主机 2 交换机，h1/h3 在 VLAN 10，h2/h4 在 VLAN 20，sw1-sw2 之间 trunk
- 场景：
  1. h1 (VLAN 10) 广播 → 只有 h3 收到，h2/h4 收不到
  2. h2 (VLAN 20) 广播 → 只有 h4 收到，h1/h3 收不到
- 学到什么：
  - `vlan.tagged`：access 口进帧时打 tag（按 PVID），trunk 口进帧时已有 tag 就检查 allowed 列表
  - `vlan.untagged`：access 口出帧前剥 tag，trunk 口看是否 native VLAN 决定是否剥
  - FDB 的键是 `(MAC, VLAN)`：同一个 MAC 在不同 VLAN 里是两条独立表项
  - `frame.dropped`：VLAN 不匹配或不在 allowed 列表时丢弃

### 阶段 3：STP 收敛

**目标**：看懂「环路 → 风暴 → STP 阻塞一个端口 → 环路断开」。

- 拓扑：3 台交换机形成三角环路，sw2 priority 最小（16384），会成为根桥
- 场景：
  1. 启用 STP：交换机交换 BPDU，sw2 被选为根桥，某些端口角色变成 `blocked`
  2. 注入广播帧：不会风暴，被正常转发（blocked 端口不转发数据帧）
- 学到什么：
  - `stp.bpdu-received`：交换机收到 BPDU，比较 bridge ID（priority + MAC）
  - `stp.topology-change`：端口角色变化（`root`、`designated`、`blocked`）
  - blocked 端口不转发数据帧，但转发 BPDU
  - 对比场景：禁用 STP 的版本会产生广播风暴（帧无限循环）

### 阶段 4：练习题系统

**目标**：通过 30 道题目巩固前三阶段的知识点。

- 访问：打开 `quiz.html`
- 题目分布：
  - 阶段 1（FDB）：10 题 - FDB 结构、学习时机、泛洪条件、老化机制
  - 阶段 2（VLAN）：10 题 - VLAN 标签位置、access/trunk 端口、FDB 键、隔离原理
  - 阶段 3（STP）：10 题 - Bridge ID、根桥选举、端口角色、BPDU、广播风暴
- 功能：
  - 答题后即时反馈，显示正确答案和解析
  - 错题自动进入错题本，答对后移除
  - 进度统计：已作答 / 正确数 / 错题数
  - 数据持久化到 localStorage

### 阶段 5：故障排查演练

**目标**：在真实故障场景中应用网络知识，学会诊断和定位问题。

- 访问：打开 `troubleshoot.html`
- 场景 1：**VLAN 配置错误** - sw2 的 p3 口配成 VLAN 20，导致 h1 (VLAN 10) 无法到达 h3 (VLAN 10)
- 场景 2：**MAC 地址飘移** - h1 和 h2 使用相同 MAC，FDB 表项在 p1 和 p2 之间振荡
- 场景 3：**广播风暴** - 三交换机环路 + STP 未启用，广播帧无限循环（设置 maxEvents=50 防止卡死）
- 场景 4：**单向链路** - sw1→sw2 可通但 sw2→sw1 不通，h2 的回复无法到达 h1
- 每个场景包含：
  - 完整可视化：拓扑图 + 事件流 + FDB 表
  - 渐进式提示：逐步引导思考方向
  - 根因分析：解释为什么会出现这个问题
  - 修复建议：给出具体的配置修改方法

## 键盘操作

| 键 | 作用 |
|---|---|
| <kbd>→</kbd> | 下一步 |
| <kbd>←</kbd> | 上一步（从 0 重放） |
| <kbd>Home</kbd> | 重置到初始状态 |
| <kbd>End</kbd> | 快进到最后一步 |

## 架构

一条硬边界：**引擎不知道自己被画出来了。**

```text
src/engine/      纯逻辑。吃拓扑和帧，吐事件序列。不碰 DOM，可在 Node 下单测
    ↓            可序列化的普通对象
src/topology/    把拓扑画成 SVG
src/ui/          单步控制、三个面板、事件流投影
src/lessons/     课程数据
```

这条边界买来三件事：引擎能裸测、事件流能重放/单步/回退、换渲染方式不动逻辑。

### 四条约束

引擎层守着四条规矩，每条都有单测盯着：

1. **不碰 `Date.now()` / `Math.random()`。**时刻由调用方传进来 —— 阶段 1 的老化
   要可测、事件流重放要可复现，都指着这条
2. **事件必须能 JSON 往返。**不放 `Map`、`Set`、类实例、函数
3. **回退 = 从 0 重放到目标步。**不写反向操作 —— 撤销老化、撤销剥 tag 很难写对，
   写错了表现是画面和引擎状态悄悄分叉
4. **引擎里不出现中文文案。**原因用机器码（`'no-forwarding-yet'`），人话在
   `src/ui/panels.js` 里映射

### 无障碍

高亮一律双编码：颜色之外必有描边加粗或符号（`▶`、`✓`、`✗`）。灰度截图和色盲
用户都能读。全部操作可用键盘完成。

## 目录

```text
index.html                 入口页面，默认加载 stage0
quiz.html                  练习题系统，30 道题 + 错题本 + 进度追踪
troubleshoot.html          故障排查演练，4 个真实场景
src/
├─ engine/
│  ├─ mac.js               MAC 地址解析、类型判定、字节互转
│  ├─ frame.js             帧解析（前 14 字节）、构建、十六进制互转
│  ├─ fdb.js               转发表：学习、查询、老化、VLAN 键
│  ├─ vlan.js              VLAN 标签读写、端口模式、ingress/egress 规则
│  ├─ stp.js               生成树协议：BPDU 比较、端口角色计算
│  ├─ topology.js          拓扑对象：节点、端口、链路、对端查询、单向链路
│  └─ engine.js            模拟引擎：事件队列驱动、状态机、maxEvents 限制
├─ ui/
│  ├─ ui.js                UI 控制器：单步播放、事件处理、视图更新
│  └─ ui.css               样式：深色主题、流体排版、网格布局
├─ lessons/
│  ├─ stage0.js            阶段 0：帧头解析、空 FDB、事件流
│  ├─ stage1.js            阶段 1：学习与转发
│  ├─ stage2.js            阶段 2：VLAN 隔离
│  ├─ stage3.js            阶段 3：STP 收敛
│  ├─ troubleshoot1.js     故障场景 1：VLAN 配置错误
│  ├─ troubleshoot2.js     故障场景 2：MAC 地址飘移
│  ├─ troubleshoot3.js     故障场景 3：广播风暴
│  └─ troubleshoot4.js     故障场景 4：单向链路
└─ quiz/
   ├─ types.js             题目类型定义和答案验证
   ├─ mistakes.js          错题本：增删查、导入导出
   ├─ progress.js          进度追踪：统计、持久化
   ├─ questions-stage1.js  阶段 1 题库（10 题）
   ├─ questions-stage2.js  阶段 2 题库（10 题）
   └─ questions-stage3.js  阶段 3 题库（10 题）
tests/engine/
├─ engine.test.js          引擎集成测试
├─ fdb.test.js             FDB 单元测试（学习、查询、老化、VLAN）
├─ frame.test.js           帧解析测试（边界、VLAN tag、类型）
├─ mac.test.js             MAC 地址测试（归一化、类型判定）
├─ stp.test.js             STP 测试（BPDU 比较、角色选举）
├─ topology.test.js        拓扑测试（节点、链路、对端查询）
└─ vlan.test.js            VLAN 测试（标签读写、ingress/egress）
```

完整方案：`D:\CodexWork\net-tutor\docs\design.md`  
阶段 0 拆解与测试表：`D:\CodexWork\net-tutor\docs\stage-0.md`
