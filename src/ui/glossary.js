// 术语表：网络概念的简短解释
// 用于在 UI 中自动标记并提供浮层解释

export const terms = {
  FDB: {
    short: '转发数据库（Forwarding Database）',
    full: '交换机用来存储 MAC 地址与端口映射关系的表。当收到帧时，交换机会：1) 学习源 MAC 地址；2) 查询目的 MAC 地址决定从哪个端口转发。',
    lesson: { stage: 1, eventRange: [0, 10] },
  },
  VLAN: {
    short: '虚拟局域网（Virtual LAN）',
    full: '在同一物理网络上划分多个逻辑隔离的广播域。不同 VLAN 的设备无法直接通信，即使连在同一台交换机上。VLAN 标签（4 字节）插在源 MAC 之后。',
    lesson: { stage: 2, eventRange: [0, 5] },
  },
  STP: {
    short: '生成树协议（Spanning Tree Protocol）',
    full: '通过阻塞某些端口来打破环路，防止广播风暴。交换机通过交换 BPDU 选举根桥，计算每个端口的角色（root/designated/blocked）。',
    lesson: { stage: 3, eventRange: [0, 15] },
  },
  BPDU: {
    short: '桥协议数据单元（Bridge Protocol Data Unit）',
    full: 'STP 的控制消息，包含 Bridge ID、根桥 ID、路径成本等信息。交换机通过比较 BPDU 来选举根桥和计算端口角色。',
    lesson: { stage: 3, eventRange: [5, 15] },
  },
  'MAC 地址': {
    short: '媒体访问控制地址',
    full: '网卡的硬件地址，48 位（6 字节），格式如 aa:bb:cc:dd:ee:ff。前 3 字节是厂商标识，后 3 字节是设备序列号。',
    lesson: { stage: 0, eventRange: [0, 5] },
  },
  '广播帧': {
    short: '目的地址为 ff:ff:ff:ff:ff:ff 的帧',
    full: '发往所有设备的帧。交换机收到广播帧后会泛洪（flood）到除入端口外的所有端口。ARP、DHCP 等协议使用广播帧。',
    lesson: { stage: 1, eventRange: [0, 10] },
  },
  '单播帧': {
    short: '目的地址为单个设备 MAC 的帧',
    full: '发往特定设备的帧。交换机查 FDB 表，如果命中则单播转发到指定端口，未命中则泛洪。',
    lesson: { stage: 1, eventRange: [10, 20] },
  },
  泛洪: {
    short: 'Flooding',
    full: '当交换机查 FDB 表未命中目的 MAC 时，将帧复制并转发到除入端口外的所有端口。广播帧、组播帧、未知单播帧都会触发泛洪。',
    lesson: { stage: 1, eventRange: [5, 10] },
  },
  '端口角色': {
    short: 'STP 中的端口分类',
    full: 'Root 端口：非根桥上到根桥最短路径的端口；Designated 端口：负责转发的端口；Blocked 端口：被阻塞，不转发数据帧但转发 BPDU。',
    lesson: { stage: 3, eventRange: [15, 25] },
  },
  '根桥': {
    short: 'Root Bridge',
    full: 'STP 拓扑的根节点，Bridge ID 最小的交换机。所有路径成本的计算都以根桥为基准。根桥的所有端口都是 Designated 角色。',
    lesson: { stage: 3, eventRange: [10, 15] },
  },
  'Access 端口': {
    short: '接入端口',
    full: '连接主机的端口，只允许一个 VLAN。入帧时按 PVID 打标签，出帧时剥标签（主机不需要理解 VLAN）。',
    lesson: { stage: 2, eventRange: [5, 10] },
  },
  'Trunk 端口': {
    short: '干道端口',
    full: '连接交换机的端口，允许多个 VLAN 通过。帧在 Trunk 上传输时保留 VLAN 标签。配置包括 allowed VLAN 列表和 native VLAN。',
    lesson: { stage: 2, eventRange: [10, 15] },
  },
  PVID: {
    short: 'Port VLAN ID',
    full: 'Access 端口的默认 VLAN。当收到无标签的帧时，按 PVID 打标签。',
    lesson: { stage: 2, eventRange: [5, 10] },
  },
  '老化': {
    short: 'Aging',
    full: 'FDB 表项在一定时间（默认 300 秒）未刷新后会被删除，释放空间。老化防止 MAC 地址迁移后出现转发错误。',
    lesson: { stage: 1, eventRange: [20, 30] },
  },
  'Bridge ID': {
    short: '桥标识符',
    full: 'Priority（2 字节）+ MAC 地址（6 字节）。Priority 越小优先级越高，相同时比较 MAC（越小越优先）。用于 STP 根桥选举。',
    lesson: { stage: 3, eventRange: [5, 10] },
  },
};

/**
 * 在文本中标记术语，返回 HTML 字符串
 * @param {string} text 原始文本
 * @returns {string} 带术语标记的 HTML
 */
export function enrichText(text) {
  if (!text) return '';

  let result = text;

  // 按术语长度倒序排列，避免短术语匹配到长术语的一部分
  const sortedTerms = Object.keys(terms).sort((a, b) => b.length - a.length);

  for (const term of sortedTerms) {
    // 避免重复标记（已经被 <span> 包裹的）
    const pattern = new RegExp(`(?<!<[^>]*)\\b${escapeRegex(term)}\\b(?![^<]*>)`, 'g');
    result = result.replace(
      pattern,
      `<span class="term" data-term="${escapeHtml(term)}">${escapeHtml(term)}</span>`
    );
  }

  return result;
}

/**
 * 创建术语浮层元素
 * @param {string} term 术语名称
 * @param {number} x 鼠标 X 坐标
 * @param {number} y 鼠标 Y 坐标
 * @returns {HTMLElement} 浮层元素
 */
export function createTooltip(term, x, y) {
  const data = terms[term];
  if (!data) return null;

  const tooltip = document.createElement('div');
  tooltip.className = 'term-tooltip';

  const title = document.createElement('div');
  title.className = 'term-tooltip-title';
  title.textContent = term;

  const short = document.createElement('div');
  short.className = 'term-tooltip-short';
  short.textContent = data.short;

  const full = document.createElement('div');
  full.className = 'term-tooltip-full';
  full.textContent = data.full;

  tooltip.appendChild(title);
  tooltip.appendChild(short);
  tooltip.appendChild(full);

  if (data.lesson) {
    const link = document.createElement('a');
    link.className = 'term-tooltip-link';
    link.href = `lesson.html?stage=${data.lesson.stage}`;
    link.textContent = `→ 查看阶段 ${data.lesson.stage} 课程`;
    tooltip.appendChild(link);
  }

  // 定位浮层
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';

  return tooltip;
}

/**
 * 初始化术语标记系统
 * 监听所有 .term 元素的点击事件
 */
export function initGlossary() {
  let currentTooltip = null;

  document.addEventListener('click', (e) => {
    // 关闭已有浮层
    if (currentTooltip && !currentTooltip.contains(e.target)) {
      currentTooltip.remove();
      currentTooltip = null;
    }

    // 点击术语
    if (e.target.classList.contains('term')) {
      e.preventDefault();
      e.stopPropagation();

      const term = e.target.dataset.term;
      const rect = e.target.getBoundingClientRect();

      // 浮层显示在术语下方，居中对齐
      const x = rect.left + rect.width / 2;
      const y = rect.bottom + 8;

      currentTooltip = createTooltip(term, x, y);
      if (currentTooltip) {
        document.body.appendChild(currentTooltip);

        // 调整位置避免超出视口
        const tooltipRect = currentTooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
          currentTooltip.style.left = (window.innerWidth - tooltipRect.width - 16) + 'px';
        }
        if (tooltipRect.bottom > window.innerHeight) {
          currentTooltip.style.top = (rect.top - tooltipRect.height - 8) + 'px';
        }
      }
    }
  });
}

// 工具函数
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
