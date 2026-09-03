# 贡献指南

感谢你对 net-tutor 项目的关注！这份指南将帮助你快速上手贡献代码、题目或文档。

## 项目结构

```
net-tutor/
├── src/engine/      # 核心模拟引擎（纯逻辑，可在 Node 下单测）
├── src/ui/          # UI 控制器和样式
├── src/lessons/     # 课程场景和故障排查场景
├── src/quiz/        # 题库系统
├── tests/           # 引擎单元测试（152 项）
├── docs/            # 设计文档和使用指南
└── *.html           # 入口页面
```

## 如何贡献

### 1. 添加练习题

编辑 `src/quiz/questions-stageX.js`，添加新题目：

```javascript
{
  id: 'stage1-q11',              // 唯一 ID，格式：stageX-qN
  stage: 1,                       // 所属阶段（1/2/3）
  type: 'single-choice',          // 题型（见下方类型列表）
  question: '交换机何时学习源 MAC 地址？',
  options: [                      // 仅单选/多选/场景题需要
    '收到帧时',
    '转发帧时',
    '查表命中时',
    '查表未命中时',
  ],
  answer: 0,                      // 单选：索引；多选：索引数组；填空：字符串；判断：boolean
  explanation: '交换机在 frame.ingress 时学习源 MAC，无论是否命中。参考 engine.js:202',
  lesson: {                       // 可选：关联课程位置
    stage: 1,
    eventRange: [0, 10]
  },
}
```

**题型列表**：
- `single-choice`：单选题（answer 是索引，如 `0`）
- `multiple-choice`：多选题（answer 是索引数组，如 `[0, 2]`）
- `fill-in-blank`：填空题（answer 是字符串，不区分大小写）
- `true-false`：判断题（answer 是 `true` 或 `false`）
- `scenario`：场景题（带拓扑描述，answer 同单选）

**注意事项**：
- `id` 必须唯一，建议按 `stageX-qN` 格式递增
- `explanation` 要说清楚为什么，最好能引用代码位置
- 多选题的 `answer` 数组要升序排列：`[0, 2]` 而非 `[2, 0]`
- 填空题答案会转小写比较，用户输入 `FDB` 和 `fdb` 都算对

### 2. 添加故障场景

参考 `src/lessons/troubleshoot1.js`，创建新场景：

```javascript
export const scenario = {
  title: '场景 5：端口 DOWN',
  description: 'sw1 的 p2 端口故障，h1 无法到达 h2。',

  spec: {
    nodes: [
      { id: 'h1', kind: 'host', mac: 'aa:bb:cc:00:00:01', ports: ['eth0'], x: 100, y: 300 },
      { id: 'sw1', kind: 'switch', ports: ['p1', 'p2'], x: 300, y: 300 },
      { id: 'h2', kind: 'host', mac: 'aa:bb:cc:00:00:02', ports: ['eth0'], x: 500, y: 300 },
    ],
    links: [
      { a: { node: 'h1', port: 'eth0' }, b: { node: 'sw1', port: 'p1' } },
      // ❌ p2 端口没有链路（模拟物理故障）
    ],
    portConfigs: [],
  },

  injections: [
    {
      node: 'h1',
      port: 'eth0',
      t: 0,
      frame: 'aabbcc000002' + 'aabbcc000001' + '0800' + '450000280001000040010000c0a8010ac0a8010b',
    },
  ],

  hints: [
    '观察事件流：帧从 h1.eth0 出去后到了哪里？',
    '检查 sw1 的端口：p1 和 p2 都有对端吗？',
    '查看链路列表：sw1.p2 有连接吗？',
  ],

  solution: {
    rootCause: 'sw1 的 p2 端口没有链路，帧无法从 sw1 转发到 h2',
    fix: '检查物理连接：网线是否插好、端口是否启用（no shutdown）、对端设备是否开机',
  },

  maxEvents: 20,
};
```

然后在 `troubleshoot.html` 中导入并添加按钮：

```javascript
// 第 8 行附近
import { scenario as s5 } from './src/lessons/troubleshoot5.js';

// 第 15 行附近
const scenarios = { 1: s1, 2: s2, 3: s3, 4: s4, 5: s5 };

// HTML 中添加按钮（约 235 行）
<button data-scenario="5">场景 5：端口 DOWN</button>
```

**场景设计原则**：
- 一个场景只展示一个核心问题
- 提示从现象到根因，逐步引导
- 答案要包含根因分析和修复建议
- 设置合理的 `maxEvents` 防止浏览器卡死

### 3. 改进 UI 可视化

当前待改进项：
- VLAN 着色：不同 VLAN 的帧用不同颜色显示
- STP 端口角色标识：在拓扑图上用符号区分 root/designated/blocked
- FDB 表项高亮：新增/移动/刷新用不同颜色

相关文件：
- `src/ui/ui.js`：UI 控制器
- `src/ui/ui.css`：样式表
- `src/topology/render.js`：拓扑渲染（如果存在）

### 4. 编写引擎测试

在 `tests/engine/` 目录添加测试文件：

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { simulate } from '../../src/engine/engine.js';
import { createTopology } from '../../src/engine/topology.js';

test('单向链路：帧只能单向通过', () => {
  const topology = createTopology({
    nodes: [
      { id: 'sw1', kind: 'switch', ports: ['p1', 'p2'], x: 100, y: 100 },
      { id: 'sw2', kind: 'switch', ports: ['p1', 'p2'], x: 300, y: 100 },
    ],
    links: [
      { a: { node: 'sw1', port: 'p2' }, b: { node: 'sw2', port: 'p1' }, direction: 'a-to-b' },
    ],
  });

  const events = simulate({
    topology,
    injections: [
      { node: 'sw1', port: 'p2', t: 0, frame: 'ffffffffffff' + 'aabbcc000001' + '0806' },
    ],
  });

  const egress = events.find(e => e.type === 'frame.egress');
  assert.ok(egress, 'sw1 应该尝试 egress');

  const consumed = events.find(e => e.type === 'frame.consumed' && e.reason === 'unidirectional-link');
  assert.ok(consumed, '单向链路应该导致帧被消耗');
});
```

运行测试：
```bash
npm test
```

### 5. 改进文档

文档清单：
- `README.md`：项目概览和快速开始
- `docs/USAGE.md`：详细使用指南
- `docs/CONTRIBUTING.md`：本文件
- `docs/design.md`：完整设计文档
- `docs/stage-0.md`：阶段 0 拆解

文档规范：
- 中文为主，技术术语保持英文
- 代码示例要完整可运行
- 截图或 ASCII 图要清晰

## 代码规范

### JavaScript

- 使用 ES6+ 语法（`const`/`let`、箭头函数、解构）
- 不使用分号（项目风格）
- 函数命名：动词开头（`createFdb`、`simulate`、`render`）
- 常量命名：全大写（`DEFAULT_VLAN`、`BPDU_ETHERTYPE`）
- 注释：关键逻辑用中文注释，API 用 JSDoc

### 引擎层约束

**四条铁律**（每条都有单测盯着）：

1. **不碰 `Date.now()` / `Math.random()`**  
   时刻由调用方传进来，确保可测试和可重放

2. **事件必须能 JSON 往返**  
   不放 `Map`、`Set`、类实例、函数

3. **回退 = 从 0 重放**  
   不提供反向操作，撤销通过重放实现

4. **不出现中文文案**  
   原因用机器码（如 `'no-link'`），人话在 UI 层映射

### Git 提交信息

格式：`<type>: <subject>`

**Type**：
- `feat`：新功能
- `fix`：修复 bug
- `docs`：文档
- `style`：格式（不影响代码运行的变动）
- `refactor`：重构
- `test`：添加或修改测试
- `chore`：构建过程或辅助工具的变动

示例：
```
feat: 添加端口 DOWN 故障场景
fix: 修复单向链路检测逻辑
docs: 更新 USAGE.md 的键盘操作说明
```

## 提交流程

1. **Fork 项目**到你的账号下
2. **Clone 到本地**：
   ```bash
   git clone https://github.com/your-username/net-tutor.git
   cd net-tutor
   ```
3. **创建分支**：
   ```bash
   git checkout -b feat/add-port-down-scenario
   ```
4. **修改代码**并验证：
   ```bash
   # 本地测试
   python -m http.server 8000
   # 打开浏览器验证功能
   
   # 跑引擎测试（如果改了引擎）
   npm test
   ```
5. **提交更改**：
   ```bash
   git add .
   git commit -m "feat: 添加端口 DOWN 故障场景"
   ```
6. **推送到远程**：
   ```bash
   git push origin feat/add-port-down-scenario
   ```
7. **创建 Pull Request**：
   - 到你 fork 的仓库页面
   - 点击"Pull Request"
   - 填写 PR 描述：改了什么、为什么改、怎么验证
   - 提交 PR

## 问题反馈

发现 bug 或有功能建议？欢迎提 Issue：

1. 到 GitHub 项目页面
2. 点击"Issues" → "New Issue"
3. 选择模板（Bug Report / Feature Request）
4. 填写详细信息

**Bug Report 应包含**：
- 复现步骤
- 预期行为 vs 实际行为
- 浏览器版本和操作系统
- 截图或错误信息

**Feature Request 应包含**：
- 功能描述
- 使用场景
- 期望效果

## 许可证

本项目采用 MIT 许可证，贡献代码即表示同意以相同许可证发布。

## 联系方式

- GitHub Issues：适合 bug 反馈和功能建议
- Pull Request：适合直接贡献代码

感谢你的贡献！🎉
