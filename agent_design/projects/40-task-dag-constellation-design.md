# Task DAG · 圆点星群（Constellation）设计

| 字段 | 值 |
| --- | --- |
| 状态 | 设计草案 + 可交互原型（假数据） |
| 目标表面 | `extensions/tasks` 的 Task DAG（现有 Structure / Timeline 之外的新视图） |
| 原型 | `agent_design/projects/prototypes/task-dag-constellation.html` |
| 关联 | `30-task-dag-history-design.md`、`extensions/tasks/graph.tsx`、`extensions/tasks/layout.ts` |

## 1. 问题

现在的 Structure 是「每个会话一个 frame、每个 turn 一列卡片」的结构图。它忠实记录了任务，但读起来像流水账：

- 一个任务被拆成多个 conversation frame，turn 越多，横向列越长；
- 卡片里塞满文字，节点之间的“形状”看不见：哪里分叉、哪里重试、哪里等待，都要逐张读；
- 没有「从开始到结束」的主轴，用户看到的只是不断累加的 turn；
- 任务与任务之间没有颜色或空间隔离，三个任务混在一起时无法一眼分清。

**根因**：旧 Structure 以 frame/卡片为单位，Constellation 首版又误把「一次输入提交到回答」的 Run 当成一个任务。正确单位是**会话（conversation）**：一个会话一个星群；会话内的每个 turn（Run）是一条独立星链，不设统一的会话起始节点，节点只展示真正有意义的工具/子代理步骤，不展示 generation 这类内部边界。

## 2. 目标与非目标

**目标**

1. 以「会话」为第一视觉单位：星群数量不固定，**由 Task DAG 左侧勾选的会话决定**；每个勾选会话对应一个圆点星群，星群允许部分重叠以节省空间，重叠区通过色系与 mouse focus 区分。
2. 一个会话内部是一个星群：每个 turn 一条独立星链，不设会话根节点；纯圆点节点、簇内半透明 Bezier / 直线边、活跃节点与边脉冲。
3. `visual clustering` 设置控制星群聚合程度；支持 `constellation`（引力）与 `hierarchy`（层级隔离）两种全局布局。
4. 同一任务内所有节点同一色系；任务之间彩虹轮转，色相距离 ≥ 60°。
5. Focus Mode 是核心交互：从全局星群到单条星链，再到单个节点，层级清楚、退出自然。
6. 支持混杂布局：不同任务可按自身拓扑采用 spine / branch / orbit / burst 的内部模板，不强制一种形状。

**非目标**

- 不替换 Timeline（时间条）和现有 Structure（可作为备用视图）。
- 不做任务编辑、拖拽改依赖、跨任务合并。
- 不在两个任务星群之间画任何连线。跨任务依赖只在任务标题或详情卡里以小标记说明，绝不画线。
- 不追求一开始就支持 5000 个节点同时发光；节点很多时用 LOD 降级（见 §9）。

## 3. 领域模型

### 3.1 会话（Cluster）

视觉上的一个星群就是一个**会话**，不是一次 Run。

- **cluster = 勾选的一个会话**；会话标题用 agent + `#conversation`（有 plan task 标题时优先用它），hover 显示 agent、耗时、turn 数。
- 会话内的每个 **turn = 一次 Run**（一次输入提交到回答）；turn 按 `startedAt` 升序排列。
- 每个 turn 是一条**独立星链**，不设统一的会话起始节点；turn 之间没有直接边，只共享星群的空间和色系。
- 一个会话只有 1 条 turn 时就是一条独立星链；0 turn 的会话不显示根节点。

**数量与勾选**：星图不预设任务数量。左侧会话栏复用 Task DAG 现有的 checkbox：勾选几个会话，就绘制几个星群（1–6 个；更多时折叠为「+N tasks」）。取消勾选即移除对应星群，重新勾选恢复；当前会话默认勾选。

### 3.2 节点（Step）

| 节点类型 | 来源 | 圆点大小 | 说明 |
| --- | --- | --- | --- |
| `turn` | 无可见工具调用的 Run | 7–9 px | 合成线头，label 为 `turn · HH:MM`；有工具时不需要额外节点 |
| `tool` | `pi.tool` / `pi.compaction` 之外的步骤 | 5–8 px | 实际工具调用；label 为 `tool · detail`，例如 `powershell · npm test`、`read · package.json` |
| `subagent` | 子代理锚点 | 8–11 px | `subagent · #42` |
| `wait` | `waiting` / `sleeping` | 6–8 px | 等待、休眠、阻塞 |

**不显示 `pi.generation`**：generation 是 turn 的内部边界，只用来切分 turn 线，不产生可见圆点。compaction 同样隐藏。一个 turn 若没有任何可见工具调用，才生成一个 `turn` 合成节点作为线头。

节点只有圆点，内部不渲染文字。状态用亮度、透明度、半径和光晕表达：

- `done`：同色相 50% 亮度，透明度 0.55；
- `running`：同色相 65% 亮度，半径 +2，外发光 + 脉冲；
- `waiting`：同色相 38% 亮度，透明度 0.4，虚线外环；
- `failed`：同色相，外环断裂/短弧，详情卡显示失败原因（不引入第二种色相，保持色系隔离）。

### 3.3 实时与快照（Live vs Snapshot）

- **进行中的会话（live）**：星群节点不是一次性画完，而是从当前 `tasks` 事件流增量生成：新 generation / tool / wait 节点出现时插入圆点（出生动画：200 ms 淡入 + 从父节点方向轻微漂移），状态变化即时更新颜色/脉冲，边随节点出现。布局只做局部力调整，不整图重排。
- **已完成的会话（snapshot）**：只渲染已完成的星群，不订阅 `tasks`，不会凭空生成节点；所有节点来自持久化的 Run history。
- 一个已完成会话如果重新开始运行，则它的星群从 snapshot 切回 live，继续增量生成；用户不需要刷新页面。
- 视觉上 live 星群标题带一个 `LIVE` 小标；snapshot 星群没有。

### 3.4 边（Edge）

- 只允许 `from.cluster === to.cluster`；渲染前过滤，单元测试兜底。
- 类型：`sequence`（同一个 turn 内步骤先后）、`wait`（blocker → waiter）。
- **每个 turn 是一条独立星链**；turn 之间没有边。不同会话之间绝不画线。
- 线宽 1 px；颜色 = 簇色相，透明度 0.22；活跃边 0.55 + 流动虚线。默认 Bezier；线性 spine 用直线。
- 方向：不画大箭头。用「流动虚线 + 起点暗、终点亮」的微差表示方向；hover 时在边的中点显示小方向点。

## 4. 全局布局

### 4.1 星群锚点（允许重叠）

星群数量由勾选的会话决定（1–6 个）。锚点用圆环均布：相邻中心距 = `2R × (1 − clusterOverlap)`，因此 `clusterOverlap` 滑杆可以直接控制重叠比例（0 = 完全分开，0.3 = 默认，0.6 = 高度重叠）。3 个任务时用左上、右上、下方居中的三角排布；4–6 个用圆环均布。重叠不是缺陷，而是节省空间的手段，靠色系、blur 边界和 hover 隔离来区分。超过 6 个时折叠为「+N tasks」入口。

### 4.2 两种模式

**A. `constellation`（默认，引力布局）**

- 每个节点受自己的簇锚点吸引：`forceX/forceY`，强度由 `visualClustering` 控制（0 = 松散云，1 = 紧致球）；
- 簇内 `forceLink` 弹簧保持边长大致 52–72 px；
- 全局 `forceManyBody` 斥力 + `forceCollide` 防节点覆盖；
- **簇间不设长程斥力**（`crossRepulsion` 默认 0）：不同星群可以互相穿插、连线可以交错，只有节点碰撞层阻止圆点覆盖；如果某些场景仍想拉开星群，可把 `crossRepulsion` 调到 0–1；
- 初始位置用 id 的确定性黄金角螺旋，刷新不跳动。

**B. `hierarchy`（层级隔离，阅读优先）**

- 每个簇仍可与其他簇的星云部分重叠，但节点按内部模板铺开，阅读顺序优先；
- 簇内按时间从左到右排布，分支沿纵向展开；
- 适合“我要看清这个任务的步骤顺序”，不适合观察整体形状。

### 4.3 无限画布（infinite canvas）

DAG 不是一张固定截图，而是一块可平移、可缩放的无限画布：

- 世界坐标与屏幕坐标分离；`world` 层统一接受 `translate + scale` 相机变换；
- 拖拽空白处平移；滚轮 / 触控板以鼠标位置为锚点缩放（zoom-to-cursor），缩放范围 0.32–2.6；
- 双击空白处或 `0` 键 Fit 全部星群；顶部提供 `− / + / Fit`；
- 右下角 minimap 显示三个星云与当前视口矩形，点击可跳转；
- 缩放 < 64% 时隐藏节点标签、只保留簇名，避免文字挤成一团；
- 画布尺寸变化时重新 Fit，但保持当前 focus 状态；
- 无限画布不等于无限数据：视觉层仍按 historyDays 和 5000 任务上限裁剪。

### 4.4 拖拽整个星群

- 每个星群有一块透明拖拽区（覆盖星云范围，不覆盖节点），按住拖动时整个星群的世界坐标和所有节点一起平移；
- 拖拽只改变视图排布，不改变任务数据、不改依赖、不写回 history；
- `Reset` 回到自动布局；`Fit` 只调整相机，不改变拖拽后的相对位置；
- 拖拽中的星群不触发背景平移，松开后也不触发 click focus。

### 4.5 混杂的内部模板

每个簇按拓扑自动选一个模板，也允许在设置里覆盖：

| 模板 | 形状 | 适用 |
| --- | --- | --- |
| `spine` | 横向主链 + 轻微正弦弯曲 | 线性流程、修 bug |
| `branch` | 根在左，子节点向右扇形展开 | 调研、并行工具调用 |
| `orbit` | 以任务中心为圆心的环，按时间顺时针推进 | 迭代、重试、设计循环 |
| `burst` | 单个父节点周围放射状小点 | 一轮里大量工具调用 |

“混杂布局”指的就是不同任务可以同时使用不同模板：一个任务像一条线，一个像一棵树，一个像一圈轨道；它们共享圆点语言和色系规则，但形状不必统一。

## 5. 视觉规范

### 5.1 画布

- 背景：`#070b14` → `#05070d` 的径向渐变；叠一层 24 px 的点阵（透明度 0.12）和不可见的暗角；
- 每个星群后面只有一层同色相的 **不规则彩色晕染**（blurry backdrop glow）：由 2–3 个偏移、旋转、模糊的椭圆叠加而成，中心透明度仅 3–6%，颜色 lightness 约 70%，范围约 0.7–0.95R，向外淡出；没有矩形边框，也没有圆形定位环、进度弧或任何实线边界；
- 星群之间可以重叠；重叠区的两个色相通过 `mix-blend-mode: screen` 自然混合，仍然是“极淡的星云”，不是实心色块；
- 边界只靠这层晕染暗示，不画任何完整圆周、虚线环或刻度。

### 5.2 圆点

- 纯 `<circle>`，没有 icon、没有卡片、没有文字。
- 基础半径按节点类型 5–14 px；hover 时 +2 px；focus 时 +3 px。
- 选中节点加一圈同色细环（`r + 5`），不是白色描边，保持色系。

### 5.3 色系

- 任务索引 `i` 的色相：`hue = (i * 137.508 + 188) % 360`（黄金角，3 个任务时约 188° / 325° / 103°，色相距离都 ≥ 60°；实际用固定三色时可微调）。
- 同一任务内所有节点只用该色相的亮度/透明度变化；不同任务绝不共用同一色相。
- 3 个任务的推荐值：`hsl(188 86% 60%)`（青）、`hsl(38 92% 62%)`（琥珀）、`hsl(286 85% 66%)`（紫）。

### 5.4 动效

- 活跃节点：`scale 1 → 1.18 → 1`，周期 1.8 s，外发光同步呼吸；
- 活跃边：`stroke-dashoffset` 流动，周期 2.2 s；同时边透明度在 0.35–0.65 之间呼吸；
- 只有在 `status === running` 或 `waiting` 的节点/边上播放；`done`、`failed` 不脉冲；
- `prefers-reduced-motion: reduce` 时全部关闭，只保留静态高亮。

## 6. Focus Mode（核心）

### 6.1 状态机

```
Overview（默认全场半透明）
  ├─ hover node        → 该 turn 的星链高亮，其他星链/星群瞬间暗淡（Dim-on-Hover）
  ├─ click node        → Chain Focus
  ├─ click cluster     → Cluster Focus
  └─ double click      → Solo Cluster

Chain Focus
  ├─ Esc               → Cluster Focus（同一任务）
  ├─ click blank       → Overview
  └─ click another node → 切换 Chain Focus

Cluster Focus
  ├─ Esc               → Overview
  ├─ click blank       → Overview
  └─ click node        → Chain Focus

Solo Cluster
  ├─ Esc               → Cluster Focus
  └─ double click blank → Overview
```

### 6.2 视觉

- **Hover / Dim-on-Hover**：默认所有节点、边都是半透明；鼠标悬停在任意圆点上时，该圆点所属的 **turn 星链**（该 turn 的全部节点和边）高亮并脉冲，同会话其他星链与别的星群在 120 ms 内降到 5–6% 透明度；移开后恢复。这是主要的“读图”方式，不需要先点击。
- **Chain Focus**：其他任务星群淡到 8% 并向外轻移 8 px；同一任务内其他星链淡到 18%；选中节点加同色外环，详情卡展示该链的步骤、状态、耗时、上下游数量。
- **Cluster Focus**：其他任务星群淡到 4%，当前星群轻微放大（1.04×），标题变成面包屑「All tasks / 任务名」；详情卡显示任务摘要（节点数、完成/失败/运行、总耗时、当前活跃步骤）。
- **Solo Cluster**：相机缩放到该星群，其他星群移出视口；适合演示单个任务的完整过程。
- 所有过渡 180–260 ms，`ease-out`；不改变数据，只改变可见性、缩放和镜头。

### 6.3 键盘与可达性

- `Tab` / `Shift+Tab` 在节点间循环（按开始时间顺序）；
- `Enter` 进入 Chain Focus，`Esc` 退一级；
- 每个节点有 `aria-label`：`步骤名，状态，耗时`；
- Focus 变化时通过 `aria-live="polite"` 播报「已聚焦：任务 / 步骤」。

## 7. 设置

在 `.ultimate/settings.json` 的 `tasks` 下新增（均有默认值，不写也能用）：

```json
{
  "tasks": {
    "dag": {
      "view": "constellation",
      "visualClustering": 0.72,
      "clusterOverlap": 0.3,
      "crossRepulsion": 0,
      "pulse": true,
      "labels": "hover",
      "maxVisibleTasks": 6
    }
  }
}
```

- `view`: `constellation` | `hierarchy`
- `visualClustering`: 0–1；只影响 `constellation` 的簇引力
- `clusterOverlap`: 0–0.6；星群锚点允许重叠的比例（0 = 完全分开，0.3 = 默认）
- `crossRepulsion`: 0–1；不同星群节点之间的长程斥力，默认 0（只保留节点碰撞，禁止圆点覆盖，但允许星群穿插）
- `pulse`: 是否播放活跃节点/边动画
- `labels`: `hover` | `always` | `off`
- 设置入口沿用 Task DAG 现有齿轮菜单，新增「DAG appearance」一节。

## 8. 开源调研

| 方案 | 可借鉴 | 不采用的原因 |
| --- | --- | --- |
| **d3-force** | `forceLink` / `forceManyBody` / `forceX` / `forceY` / `forceCollide` 的组合最贴近“星群 + 簇内边”的需求；确定性和可调参数也最好控制 | 项目目前没有 d3 依赖。可以先在 `layout.ts` 里实现一个 200–300 行的等价力模拟，等视图稳定后再决定是否引入 `d3-force` 作为小依赖 |
| **Cytoscape.js** | compound nodes（父节点包住子节点）天然适合 cluster；有 cose / cola 布局 | 运行时重、视觉偏“图编辑器”，难以做到纯圆点极简 |
| **Sigma.js + Graphology** | WebGL 渲染、`forceatlas2`，大图性能好 | 适合上千节点；当前 DAG 是几十到几百节点，SVG + 自研力模拟更轻 |
| **AntV G6** | combo / force / radial 都有现成实现 | 体积大、样式定制成本高 |
| **React Flow** | 卡片节点、交互成熟 | 正是我们要摆脱的“卡片 + turn 累加”范式 |
| **ECharts graph** | 简单 force 布局、开箱即用 | 视觉自由度低，动画和 Focus Mode 不好做 |
| **Obsidian graph view / GitHub network graph** | 圆点星群、低文字、聚焦高亮的视觉参考 | 只借视觉语言，不借实现 |

**结论**：首版用 `layout.ts` 的纯函数 + 自研小型力模拟 + SVG 渲染，不引入新依赖；节点规模超过 600 时再切 Canvas，超过 1200 时按簇聚合（见 §9）。这样原型和产品实现共用同一套坐标/边过滤逻辑，迁移成本最低。

## 9. 性能与降级

| 节点数 | 渲染 | 边 | 标签 | 交互 |
| --- | --- | --- | --- | --- |
| < 300 | SVG | 全部 Bezier | hover + focus | 完整 |
| 300–600 | SVG | 全部直线、低透明度 | focus | Focus Mode 保留，hover 延迟 60 ms |
| 600–1200 | Canvas 2D | 直线，按簇采样 | 只显示簇标题 | 只支持 Cluster Focus |
| > 1200 | Canvas 2D | 只画簇内主链 | 无 | 聚类级探索 + 点击展开 |

- 力模拟只在布局变化、窗口 resize、focus 切换时运行；稳定后停止，脉冲用 CSS。
- 页面不可见时暂停 RAF。
- 初始位置按任务 id + 节点 id 哈希生成，刷新/重新打开不跳。
- 5000 个任务的硬上限不变；视觉层默认只呈现当前 historyDays 内的任务。

## 10. 实施计划

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0（本原型） | 假数据 HTML，验证视觉语言和 Focus Mode | 默认 3 个星群、34 个节点（第 4 个会话可勾选）、可调 overlap/cross-repel、可拖拽星群、可体验 Focus |
| P1 | `layout.ts` 增加 `clusterLayout()` 纯函数：任务分组、簇内模板、边过滤 | 单测：跨簇边为 0；同簇色相唯一；确定性坐标 |
| P2 | `graph.tsx` 增加第三张 tab「Constellation」，读取左侧勾选的会话与现有 `RunSummary` / `RunTask`；live 会话订阅 tasks 事件，snapshot 会话只读历史 | 勾选 1–6 个会话得到 1–6 个星群；live 节点增量出现；旧 Structure/Timeline 保留 |
| P3 | Focus Mode、设置项、键盘/aria、reduced motion | 交互验收 + e2e 截图 |
| P4 | LOD、Canvas 降级、性能压测 | 600 节点 60 fps，1200 节点可交互 |

## 11. 验收标准（可逐条勾）

1. 星群数量等于左侧勾选的会话数（1–6）；默认 1440×900 下 3 个已勾选会话显示 3 个星群；星群允许部分重叠，重叠区仍能通过色相和 hover 区分，且不存在跨任务的边。
2. 所有节点是纯圆点，节点内部无文字、无图标；标签只在 hover/focus/always 设置下出现。
3. 任意一条边的两个端点属于同一任务；跨任务边数量为 0（单元测试）。
4. 同一任务所有节点色相相同；不同任务色相距离 ≥ 60°。
5. 活跃节点和活跃边有脉冲；`prefers-reduced-motion` 下无动画。
6. 点击节点进入 Chain Focus，Esc 退到 Cluster Focus，再 Esc 回 Overview；无布局跳动。
7. `visual clustering` 从 0 到 1 变化时，星群从松散云过渡到紧致球，节点不重叠。
8. `constellation` / `hierarchy` 切换时布局平滑过渡，不丢失 Focus 状态。
9. 画布支持拖拽平移、以鼠标位置为锚点的滚轮缩放、Fit 全部、minimap 跳转；缩放 <64% 时标签自动隐藏。
10. 星群边界只有不规则 blurry glow，不存在圆形定位环、进度弧或任何完整圆周。
11. `clusterOverlap` 从 0 到 0.6 变化时，星群从完全分开平滑过渡到高度重叠。
12. 只有 live 会话的星群会增量生成节点；snapshot 星群在页面打开后节点集合不变。
13. 可以拖拽任意星群整体移动，节点、边、星云和标题一起移动；Reset 恢复自动布局。
14. 取消/勾选左侧会话时，星群数量与标题栏计数同步变化。
15. `crossRepulsion` 默认为 0 时，不同星群的节点可以彼此靠近、连线可以交错，但任意两个圆点不重叠；调大该值才会产生星群间的长程推开。

## 12. 原型

打开 `agent_design/projects/prototypes/task-dag-constellation.html`（纯静态、无依赖、无需构建）。原型包含：

- 4 个假会话，默认勾选 3 个：修复登录页崩溃（spine，LIVE）、资源预算调研（branch）、Task DAG 圆点视图（orbit）、发布前检查（未勾选）；
- 默认 34 个节点（总共 40 个），状态覆盖 done / running / waiting / failed / pending；
- 左侧会话栏可勾选/取消，星群数量和标题计数实时变化；
- 3 个星云允许部分重叠，边界只有极淡的不规则 blurry glow，没有圆形弧线；顶部 `overlap` 滑杆可调整重叠程度；
- 顶部 `cross repel` 滑杆可调节跨星群斥力（默认 0：允许星群穿插和连线交错，只阻止节点圆点互相覆盖）；
- 拖拽任意星云空白处可以整体移动该星群；
- 默认所有节点/边半透明；hover 任一圆点 → 该 turn 星链高亮，其他星链/星群立即暗淡；
- 无限画布：拖拽平移、滚轮 zoom-to-cursor、双击/`0` 键 Fit、顶部 `− / + / Fit`、右下角 minimap；
- 顶部：Force / Hierarchy 切换、Clustering 滑杆、Overlap 滑杆、Labels、Pulse、Reset；
- 点击节点 → Chain Focus；点击星群标题 → Cluster Focus；Esc 逐级退出；
- 右侧详情卡：任务摘要或节点详情；
- 底部图例：圆点大小 / 状态 / 颜色。

原型不是产品数据，也不包含真实任务；它只验证“圆点星群 + 簇内过程 + Focus Mode”的视觉与交互假设。原型仍是早期 root 方案；产品实现已改为无 root 的独立星链。确认方向后再按 §10 的 P1 进入产品代码。
