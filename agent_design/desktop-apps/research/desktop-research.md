# 桌面编排可视化调研：任务图与子 Agent 泳道

| 字段     | 值                                                                                   |
| -------- | ------------------------------------------------------------------------------------ |
| 文档 ID  | AD-R-01                                                                              |
| 状态     | final（2026-10-28，供 `30-*` / `40-*` spec 引用）                                    |
| 证据基线 | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`（2026-10-27）                             |
| 调研日期 | 2026-10-28（所有外链访问日期均为该日）                                               |
| 范围     | A 任务编排可视化桌面应用；B 子 agent 编排可视化桌面应用                              |
| 约束     | 只读调研；不改产品代码；外部版本以实际查到的 registry/release 为准，查不到写“未确认” |

## 目录

- [1. 结论先行](#1-结论先行)
- [2. 桌面技术选型](#2-桌面技术选型)
- [3. 前端图形与时间线](#3-前端图形与时间线)
- [4. 状态与本地存储](#4-状态与本地存储)
- [5. 产品调研](#5-产品调研)
- [6. 标准与协议](#6-标准与协议)
- [7. 用 Ultimate 自身数据面做适配分析](#7-用-ultimate-自身数据面做适配分析)
- [8. 两份推荐栈与决策矩阵](#8-两份推荐栈与决策矩阵)
- [9. 性能预算与验证计划](#9-性能预算与验证计划)
- [10. 可直接被 spec 引用的结论清单](#10-可直接被-spec-引用的结论清单)
- [11. 不确定点](#11-不确定点)

## 1. 结论先行

1. **桌面壳没有单一句结论。** 本项目 A/B 共同点是“长时间运行的本地观测 + 大量自绘图形 + 需要签名自动更新”，因此默认选 Tauri 2.x；若团队没有 Rust 维护能力、且必须直接复用 Ultimate 的 Node/TypeScript 服务端模块（`node:sqlite`、`AsyncLocalStorage` 等），Electron 是合理回退，代价是安装包和内存。
2. **10k 节点/100k 事件的关键不是换一个“更快的图库”，而是数据面分层。** 任务图只在“可见层级 + 可见视口”渲染；事件时间线先按像素分桶聚合，再按需取原始事件。React Flow 适合 ≤2k 可见节点的交互图；超过后切 Canvas/WebGL 或摘要节点。
3. **Ultimate 现有数据面足够做 read-only v0。** `TaskGraph` 提供所有权树与状态，`system.lanes` 提供泳道骨架，`trace.sqlite` 提供调用树；但**没有完成任务历史、结束时间、attempt/retry、token/cost 的强类型字段**，这些必须在适配器里标成缺口，不能假装存在。
4. **推荐共享内核 `orchestra-core`：** Tauri 2.12.5 + React 19.3.1 + TypeScript；A 用 React Flow/ELK 做任务 DAG，B 用 Canvas 泳道 + 事件溯源回放；SQLite 为本地主存，DuckDB 只做分析旁路。

> **与 `30`/`40` spec 的差异**：本备忘录以**产品分发**为第一约束（Tauri 4.45 vs Electron 4.20）；`30`/`40` 以**AI agent 复刻速度**为第一约束，参考实现默认 Electron 45（4.05 vs 3.85），并在 `30` §3.5 给出 Tauri 替换点。两者按硬约束选择，不是事实冲突。

## 2. 桌面技术选型

### 2.1 版本基线（实际查到）

| 组件                                     | 版本                                                        | 来源（访问 2026-10-28）                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri（Rust crate）                      | **2.12.5**（2026-10-21 发布；3.0.0-alpha.5 为 alpha，不用） | <https://crates.io/api/v1/crates/tauri>                                                                                                                                                             |
| `@tauri-apps/cli` / `api`                | 2.12.4 / 2.12.4                                             | <https://registry.npmjs.org/-/package/@tauri-apps/cli/dist-tags>、<https://registry.npmjs.org/-/package/@tauri-apps/api/dist-tags>                                                                  |
| `@tauri-apps/plugin-sql`                 | 2.6.0                                                       | <https://registry.npmjs.org/-/package/@tauri-apps/plugin-sql/dist-tags>                                                                                                                             |
| `@tauri-apps/plugin-updater`             | 2.14.0                                                      | <https://registry.npmjs.org/-/package/@tauri-apps/plugin-updater/dist-tags>                                                                                                                         |
| Electron                                 | **45.0.0**（46 为 alpha）                                   | <https://registry.npmjs.org/-/package/electron/dist-tags>                                                                                                                                           |
| electron-builder / electron-updater      | 26.18.0 / 6.8.11                                            | <https://registry.npmjs.org/-/package/electron-builder/dist-tags>、<https://registry.npmjs.org/-/package/electron-updater/dist-tags>                                                                |
| Electron Forge                           | 8.0.1                                                       | <https://registry.npmjs.org/-/package/@electron-forge/cli/dist-tags>                                                                                                                                |
| Wails                                    | **v3.0.0**（2026-10-26；v2 线最新 v2.17.0）                 | <https://github.com/wailsapp/wails/releases>                                                                                                                                                        |
| Flutter / Dart                           | 3.47.8 / 3.13.7（2026-10-23）                               | <https://docs.flutter.dev/install/archive>                                                                                                                                                          |
| Avalonia                                 | **12.1.4**（2026-10-09；11.3.22 为 LTS 线）                 | <https://github.com/AvaloniaUI/Avalonia/releases>                                                                                                                                                   |
| .NET MAUI                                | **10.0.120**（2026-10-21；11.0.100-rc.2 为预发布）          | <https://github.com/dotnet/maui/releases>                                                                                                                                                           |
| React / React DOM                        | 19.3.1（仓库内为 19.3.0）                                   | <https://registry.npmjs.org/react/latest>；`package.json:43`                                                                                                                                        |
| `@xyflow/react`                          | 12.12.0                                                     | <https://registry.npmjs.org/-/package/@xyflow/react/dist-tags>                                                                                                                                      |
| `elkjs`                                  | 0.12.0                                                      | <https://registry.npmjs.org/-/package/elkjs/dist-tags>                                                                                                                                              |
| `@dagrejs/dagre`                         | 3.1.3                                                       | <https://registry.npmjs.org/-/package/@dagrejs/dagre/dist-tags>                                                                                                                                     |
| `cytoscape` / `vis-timeline` / `d3`      | 3.34.4 / 8.5.6 / 7.9.0                                      | <https://registry.npmjs.org/-/package/cytoscape/dist-tags>、<https://registry.npmjs.org/-/package/vis-timeline/dist-tags>、<https://registry.npmjs.org/-/package/d3/dist-tags>                      |
| Zustand / Redux Toolkit / TanStack Query | 5.0.16 / 2.13.0 / 5.105.0                                   | <https://registry.npmjs.org/-/package/zustand/dist-tags>、<https://registry.npmjs.org/-/package/@reduxjs/toolkit/dist-tags>、<https://registry.npmjs.org/-/package/@tanstack/react-query/dist-tags> |
| better-sqlite3 / DuckDB Node API         | 13.0.3 / 2.0.0-r.1                                          | <https://registry.npmjs.org/-/package/better-sqlite3/dist-tags>、<https://registry.npmjs.org/-/package/@duckdb/node-api/dist-tags>                                                                  |
| `@ag-ui/core` / MCP SDK                  | 1.0.3 / 1.32.2                                              | <https://registry.npmjs.org/-/package/@ag-ui/core/dist-tags>、<https://registry.npmjs.org/-/package/@modelcontextprotocol/sdk/dist-tags>                                                            |

> 说明：上表“latest”均指 2026-10-28 的 npm/crates 最新稳定 tag；alpha/beta 另标注。Tauri 2.12.5 与 CLI 2.12.4 的小版本差是正常的 crate/npm 发布节奏，不表示不兼容。

### 2.2 Tauri 2.x 与 Electron 的硬事实

| 维度          | Tauri 2.12.5                                                                                                                                                          | Electron 45.0.0                                                                                                                                        | 证据                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 进程与渲染    | Rust Core 进程 + 系统 WebView（Windows 用 WebView2、macOS 用 WKWebView、Linux 用 WebKitGTK）；WebView **不打进安装包**                                                | Chromium + Node.js 全部打进应用；主进程是 Node 环境，渲染进程默认沙箱化，preload + contextBridge 暴露 API                                              | Tauri <https://v2.tauri.app/concept/process-model/>；Electron <https://www.electronjs.org/docs/latest/tutorial/process-model>                                                                        |
| 包体积        | 官方称最小应用可 **<600KB**；实际 React 应用会明显更大（**未实测**）                                                                                                  | 官方称 zip 包通常 **80–100MB**，多数应用 **>100MB**                                                                                                    | Tauri <https://v2.tauri.app/start/>；Electron <https://www.electronjs.org/docs/latest/why-electron>                                                                                                  |
| 内存          | 复用系统 WebView，架构上更省；无第一方对比数字。第三方基准称 Tauri 空闲 ~42MB vs Electron 43 ~168MB，该数据**不是第一方、且版本落后于 45**，只能作方向参考            | 多进程 Chromium；第三方基准同上，不能当作 45 的精确值                                                                                                  | 第三方：<https://tech-insider.org/tauri-vs-electron-2026/>（访问 2026-10-28）                                                                                                                        |
| Node/系统 API | WebView 内**没有 Node**；系统能力通过 Rust command/plugin 暴露，受 capability/ACL 权限约束；需要 Node 时可带 sidecar                                                  | 主进程**完整 Node**（`require`、原生模块、`child_process`）；渲染进程通过 IPC 拿能力                                                                   | Tauri <https://v2.tauri.app/concept/inter-process-communication/>；Electron <https://www.electronjs.org/docs/latest/tutorial/process-model>                                                          |
| 自动更新      | 官方 `tauri-plugin-updater`，Windows/Linux/macOS 均支持；**更新包必须签名，不能关闭**；支持静态 JSON 或动态更新服务器；Windows `installMode` 有 passive/basicUi/quiet | 内置 `autoUpdater` 仅 macOS/Windows；Windows 自动识别 MSIX 或 Squirrel.Windows；Linux 无内置支持；macOS 自动更新要求签名                               | Tauri <https://v2.tauri.app/plugin/updater/>；Electron <https://www.electronjs.org/docs/latest/api/auto-updater>                                                                                     |
| Windows 签名  | 文档给 OV 证书、Azure Key Vault、Azure Artifact Signing（原 Trusted Signing）与自定义 `signCommand`；未签名会被 SmartScreen/Smart App Control 拦                      | 文档明确：2023-06 起 Microsoft 要求 **EV 证书**；OV/普通 Authenticode 会被当作未签名；Azure Artifact Signing 是官方推荐的最便宜路径                    | Tauri <https://v2.tauri.app/distribute/sign/windows/>；Electron <https://www.electronjs.org/docs/latest/tutorial/code-signing>                                                                       |
| SQLite        | `tauri-plugin-sql` 基于 sqlx，支持 SQLite/MySQL/PostgreSQL；迁移在 Rust 注册；默认权限只给 `allow-select`，写要显式加 `sql:allow-execute`                             | 可在主进程用 `better-sqlite3`（同步 API、WAL、事务）；原生模块需按 Electron ABI 用 `@electron/rebuild` 重编                                            | Tauri <https://v2.tauri.app/plugin/sql/>；better-sqlite3 <https://github.com/WiseLibs/better-sqlite3>；Electron 原生模块 <https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules> |
| 崩溃报告      | **没有内置 crash reporter**；常用 `tauri-plugin-sentry` + `sentry_rust_minidump` 捕获 Rust/WebView 崩溃，属于社区插件                                                 | 内置 `crashReporter`：Crashpad、minidump、`submitURL`、`uploadToServer`、`rateLimit`、`globalExtra`；Windows 还带 `electron_wer.dll` 处理 `__fastfail` | Tauri <https://github.com/timfish/sentry-tauri>；Electron <https://www.electronjs.org/docs/latest/api/crash-reporter>                                                                                |
| 适用条件      | 安装包/内存/系统 WebView 一致性优先；可接受 Rust 维护；需要 Windows/Linux/macOS 同一套签名更新                                                                        | 需要直接复用 Node/TypeScript 后端、原生模块、成熟 crashReporter；能接受 80–100MB 包与更高内存                                                          | 上两列来源                                                                                                                                                                                           |

**结论（条件式）**：

- 选 **Tauri**：A 类“分发给很多开发者/CI 机器”的只读可视化；安装包和内存是硬指标；愿意维护一个薄 Rust 数据面（sidecar/command）。Tauri 的 WebView 差异是主要风险：Windows WebView2 通常随 Edge 更新，Linux WebKitGTK 版本碎片化，必须在 CI 里固定测试矩阵。
- 选 **Electron**：团队只写 TypeScript、要把 Ultimate 现有 Node 模块直接搬进主进程、强依赖 `crashReporter`/`utilityProcess`/原生模块；或产品生命周期短、包体积不敏感。
- **不要**把“Tauri 一定比 Electron 快”当结论：Electron 官方明确说对简单页面内置 WebView 有时更省资源，对大应用才倾向自带 Chromium；两类应用的瓶颈通常在图渲染和 SQLite 查询，不在壳。

### 2.3 补充候选（简要）

| 候选                   | 事实                                                                                                                                                       | 适合/不适合                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wails v3.0.0**       | Go + 系统 WebView；v3 于 2026-10-26 发布，要求 Go 1.26+；自带 updater、绑定生成、系统托盘（<https://github.com/wailsapp/wails/releases>，访问 2026-10-28） | 适合 Go 团队、想要 Tauri 式小包但不想写 Rust；不适合本项目的 TS 共享内核：v3 刚发布，插件/社区厚度不如 Tauri，且仍要维护 Go 侧数据面                                                      |
| **Flutter 3.47.8**     | 自绘引擎，桌面/移动一套 UI；Dart 3.13.7（<https://docs.flutter.dev/install/archive>，访问 2026-10-28）                                                     | 适合像素级一致的跨端 UI；不适合“节点图 + 时间线 + 大量文本/表格”的桌面工具：没有 DOM，React Flow/Cytoscape/vis-timeline 全部不可用，等于重写图形层；桌面插件与可访问性也弱于 WebView 方案 |
| **Avalonia 12.1.4**    | .NET 跨平台 XAML 框架，Windows/macOS/Linux；12.1.4 为最新稳定，11.3.22 为 LTS（<https://github.com/AvaloniaUI/Avalonia/releases>，访问 2026-10-28）        | 适合 .NET 团队、需要原生控件与强类型；不适合本项目：图/时间线库多为第三方且成熟度低于 JS 生态，团队若无 C# 经验会把“可视化”变成“控件适配”                                                 |
| **.NET MAUI 10.0.120** | Microsoft 官方跨平台 UI；Windows 走 WinUI，移动端为主（<https://github.com/dotnet/maui/releases>，访问 2026-10-28）                                        | 不建议：桌面（尤其 Linux）不是它的强项，图形/时间线生态薄；若已是 .NET 商店可考虑 Avalonia 而非 MAUI                                                                                      |

## 3. 前端图形与时间线

### 3.1 渲染模型决定上限

> 版本见 §2.1。渲染模型来源：React Flow <https://reactflow.dev/learn/advanced-use/performance>、Cytoscape <https://js.cytoscape.org/>、sigma.js <https://www.sigmajs.org/>、vis-timeline <https://visjs.github.io/vis-timeline/docs/timeline/>、d3 <https://d3js.org/>（均访问 2026-10-28）。

| 方案                       | 渲染单元                                          | 10k 节点可行性                                                               | 主要坑                                                                                                                                                     |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React Flow 12.12.0**     | 每个节点/边是 DOM + SVG；React 组件               | 仅“可见节点 ≤2k”可行；全量 10k 会 DOM 爆炸、拖拽/缩放掉帧                    | 官方性能指南要求 memo 组件/回调、折叠大树、简化样式；禁止在组件里直接取整个 `nodes` 数组；`onlyRenderVisibleElements` 只能省视口外节点，不能省“展开的 10k” |
| **Cytoscape.js 3.34.4**    | Canvas 渲染器（也可 SVG）；图算法/选择器/复合节点 | 只读 10k 级别可行（取决于样式/标签/布局）                                    | React 集成是命令式 wrapper；样式用 stylesheet 而非 Tailwind；布局扩展（fcose/ELK/dagre）质量参差；标签渲染是主要成本                                       |
| **sigma.js**               | WebGL；graphology 图数据                          | 万级节点可行（官方定位“render large graphs”；上限取决于边/标签，**未实测**） | 无内置分层 DAG 布局，需自己算坐标；标签/边箭头要 WebGL 层；可访问性差；React 集成需桥接                                                                    |
| **vis-timeline 8.5.6**     | 每个 item 是 HTML DOM；group 行                   | 仅适合 ≤5k 可见 item；100k 事件不可直接挂                                    | 官方明确“uses regular HTML DOM to render timeline and items”；大量 item 时布局/滚动/内存都会崩；必须自己做聚合/分桶/虚拟化                                 |
| **d3 7.9.0**               | SVG 或 Canvas，自己控制                           | SVG 适合 ≤1k；Canvas 可到 10k+，但交互全自己写                               | 不是组件库；缩放/拖拽/命中测试/标签避让都要自己实现；适合做时间轴 scale/axis，不适合直接做产品图                                                           |
| **Canvas 2D / WebGL 自绘** | 像素/GPU 图元                                     | 10k 节点/100k 事件可行，取决于聚合                                           | 文本、命中测试、可访问性、主题、导出图片都要自建；开发成本最高，但 B 的泳道最合适                                                                          |

### 3.2 10k 节点 / 100k 事件的可行路径

1. **拆成两个数据面，不混在一个图里。** 任务图是“节点 + 所有权/等待边”，事件是“时间点 + 归属”。100k 事件永远不要变成 100k 个 React Flow 节点；它们只进时间线和详情列表。
2. **SQL 预聚合。** 节点按 `conversation/owner/status` 建索引；事件按 `(lane, time)` 和 `(kind, time)` 建索引。首屏只查“当前可见时间窗 + 当前展开层级”的聚合行；原始事件按需分页。
3. **层级折叠。** 以 conversation/owner 为一级、task 为二级、tool call 为三级；默认只展开“运行中/失败/选中”的子树，已完成子树折叠成 `+N finished` 摘要节点。Ultimate 自己已经这么做：父节点超过 3 个已完成子节点就折叠（`extensions/system/layout.ts:85-86`）。
4. **布局在 Worker。** ELKjs 官方支持 Web Worker，避免阻塞 UI；只对“可见子图”跑 layered 布局，新增节点做增量/局部布局，缓存旧坐标，禁止每次刷新全图重排。ELKjs README 明确把“增量布局”列为常见问题（issues #100 等），说明它不是开箱即用的能力。
5. **渲染分级（LOD）。** ≤2k 可见节点：React Flow 交互；2k–10k：Cytoscape/sigma 只读或 React Flow 摘要节点；>10k：只渲染聚合块/热力，不下钻到单节点。缩放级别低于阈值时隐藏边标签、合并平行边、按社区/泳道着色。
6. **时间线按像素分桶。** 设视口宽 2000px，100k 事件在 30 分钟窗口内先聚成 ≤2000 个桶（每桶 count/失败数/最大耗时）；点击桶再查原始事件。桶用 Canvas 画，命中测试用 `bucketIndex = floor((t - start) / bucketMs)`，O(1)。
7. **增量摄入与背压。** SSE/分页每次取 200–500 条，先落 SQLite 再更新内存；UI 用 100ms 合帧（Ultimate 的 tasks 事件本身就是 100ms 去抖，`server/api.ts:224-244`）；队列满时丢“帧”不丢“数据”，并显示 lag。

### 3.3 复杂度与坑（按组件）

| 组件                  | 复杂度/行为                                                                                                    | 具体坑                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **ELK layered**       | 基于 Sugiyama：分层、长边插 dummy 节点、交叉最小化（NP-hard，启发式）；elkjs 是 GWT 编译的 Java 核心，包体不小 | 10k 全量布局可能是秒级到十秒级（**推断，未实测**）；没有稳定的增量 API；端口/嵌套/边路由选项多，调参成本高；Web Worker 里不能直接碰 DOM |
| **dagre 3.1.3**       | 简单 DAG 布局，适合小图；无端口约束、嵌套支持弱                                                                | 大图/多层交叉时质量明显下降；不要用它做 10k 主布局；适合 ≤500 节点的 fallback 或缩略图                                                  |
| **React Flow**        | 每个节点是 React 组件；拖拽时高频 setState                                                                     | 未 memo 的 nodeTypes/回调会让全图重渲染；把 `nodes` 放全局 store 并在每个节点订阅会放大更新；边动画/阴影/渐变在 2k 节点时就会拖慢       |
| **Cytoscape**         | Canvas 绘制所有可见元素；样式计算与布局是两笔成本                                                              | 复杂 selector/大量 label 会退化；复合节点展开时布局重算；React 状态与 cy 实例双写容易不同步                                             |
| **sigma.js**          | WebGL 顶点/边批处理                                                                                            | 分层布局要自己给坐标；文字标签需额外层；边太多时 GPU 带宽/overdraw 也会瓶颈；不适合高交互编辑                                           |
| **vis-timeline**      | DOM item + 时间轴                                                                                              | 每个 item 一个 DOM 节点；100k 会直接卡死；group 高度/嵌套/时区都要调；移动端触摸行为一般                                                |
| **Canvas/WebGL 自绘** | O(可见像素/图元)                                                                                               | 高 DPI 缩放、文本测量、命中测试、键盘可访问性、导出 SVG/PNG、主题切换都要自建；团队需要图形工程能力                                     |

### 3.4 组件选择（按用途）

| 用途                                 | 首选                                 | 备选                          | 不建议                 |
| ------------------------------------ | ------------------------------------ | ----------------------------- | ---------------------- |
| A 的任务 DAG（可选中/展开/查看详情） | React Flow 12 + ELKjs（Worker）      | Cytoscape + ELK（只读大图）   | 用 dagre 做 10k 主布局 |
| B 的 agent 泳道/消息边               | 自绘 Canvas 2D（时间轴 + 轨道）      | vis-timeline（≤5k 可见 item） | 用 React Flow 画时间线 |
| 调用树/火焰图                        | 自绘 Canvas 或 d3 hierarchy + Canvas | React Flow 小树               | 用 SVG 画 5000 调用    |
| 事件列表/搜索                        | TanStack Virtual + SQLite FTS5       | react-window                  | 全量 DOM 列表          |
| 缩略图/全局导航                      | Canvas 热力/密度图                   | Cytoscape 缩略                | 全量 React Flow        |

## 4. 状态与本地存储

### 4.1 Zustand / Redux / TanStack Query

> 版本见 §2.1；各库定位来源：<https://zustand.docs.pmnd.rs/>、<https://redux-toolkit.js.org/>、<https://tanstack.com/query/latest>（访问 2026-10-28）。

| 方案                       | 适合                                                                           | 不适合                                                                 | 结论                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Zustand 5.0.16**         | 选择态、视口、过滤、面板开合、hover、临时高亮；可按 slice 订阅，避免全图重渲染 | 复杂 undo/redo、严格事件日志、跨窗口同步                               | **A/B 的 UI 状态首选**；把 `nodes` 这类大数组放外部 store/索引，不要在每个节点里订阅整个数组 |
| **Redux Toolkit 2.13.0**   | 需要时间旅行、严格 action 日志、复杂 reducer 协作、DevTools 回溯               | 只做本地 UI 状态时样板过重；高频图更新会产生大量 action                | 只有在“回放/撤销”是核心功能时才选；B 的事件回放可用自己的 event log，不必引入 Redux          |
| **TanStack Query 5.105.0** | HTTP 请求缓存、重试、失效、分页（history、definitions、settings）              | 不适合作为 SSE/事件流的唯一状态；高频 append 会让 query cache 变成负担 | 用作“请求缓存”，事件流用独立 store + SQLite；`staleTime: Infinity` 用于不可变 history        |

### 4.2 SQLite 选型

| 方案                              | 事实                                                                                                                                                                          | 适用                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **better-sqlite3 13.0.3**         | 同步 API、事务、WAL、worker thread 支持；官方 benchmark 称比 `sqlite3` 快 2.9–24.4x（不同操作）（<https://github.com/WiseLibs/better-sqlite3>，访问 2026-10-28）              | Electron 主进程/utility process；批量写入、复杂查询；必须 `@electron/rebuild` 按 ABI 重编           |
| **tauri-plugin-sql 2.6.0**        | 基于 sqlx，异步；迁移在 Rust 注册；SQLite/MySQL/PostgreSQL；默认权限只读（`allow-select`），写要加 `sql:allow-execute`（<https://v2.tauri.app/plugin/sql/>，访问 2026-10-28） | Tauri 的 CRUD/设置/中等查询；高频写入热路径建议下沉到 Rust `rusqlite` 单写线程，避免前端 IPC 往返   |
| **DuckDB Node API 2.0.0-r.1**     | 嵌入式列式 OLAP；适合扫描/聚合/Parquet/JSON；不是高并发 OLTP（<https://duckdb.org/docs/stable/clients/node_neo/overview>，访问 2026-10-28）                                   | 100k+ 事件的成本/时长/失败率聚合、导入导出、离线分析；单独 `.duckdb` 文件，不与主 SQLite 混用       |
| **`node:sqlite`（Node 26 内置）** | Ultimate 服务端已在用（`server/trace.ts:11` 的 `DatabaseSync`）；同步、零依赖                                                                                                 | 若做 Electron 且 Electron 内置 Node 支持该模块，可复用；但 Electron 版本/ABI 需实测，不作为跨壳假设 |

### 4.3 事件溯源与离线优先

**推荐模型：append-only event log + 投影 + 快照。**

```sql
-- 本地主存（SQLite，WAL）
CREATE TABLE task (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, kind TEXT NOT NULL,
  conversation_id TEXT, parent_id TEXT, owner_task_id TEXT,
  status TEXT NOT NULL, phase TEXT, blocked_reason TEXT,
  started_at INTEGER, ended_at INTEGER,
  attrs_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE task_edge (
  from_id TEXT NOT NULL, to_id TEXT NOT NULL, kind TEXT NOT NULL,  -- owner | wait | message | spawn
  PRIMARY KEY (from_id, to_id, kind)
);
CREATE TABLE event (
  source TEXT NOT NULL, source_id TEXT NOT NULL, at INTEGER NOT NULL,
  kind TEXT NOT NULL, name TEXT NOT NULL, conversation_id TEXT,
  trace_id TEXT, task_id TEXT, ok INTEGER NOT NULL DEFAULT 1,
  ms REAL, error TEXT, summary TEXT,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX event_time ON event(at);
CREATE INDEX event_lane_time ON event(conversation_id, at);
CREATE TABLE call (
  id TEXT PRIMARY KEY, parent_id TEXT, trace_id TEXT NOT NULL,
  at INTEGER NOT NULL, ms REAL NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
  caller TEXT, callee TEXT, ok INTEGER NOT NULL, error TEXT,
  conversation_id TEXT, task_id TEXT, entry_id TEXT,
  args_json TEXT, result_json TEXT
);
CREATE INDEX call_trace ON call(trace_id);
CREATE INDEX call_lane_time ON call(conversation_id, at);
CREATE TABLE snapshot (
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, cursor TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY, action TEXT NOT NULL, payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL, sent_at INTEGER
);
```

- **幂等键**：`(source, source_id)`。Ultimate 的 event id / call id 可直接用；OTel 用 `(trace_id, span_id)`；A2A 用 `(context_id, task_id, message_id)`。
- **快照**：每 5k 事件或 5 分钟写一次 `snapshot`，回放从最近快照 + 后续事件开始，避免 100k 全量重放。
- **投影**：`task`/`task_edge`/`call` 是投影表，可删可重建；原始 `event` 是唯一真相。
- **离线优先**：本地 SQLite 先写；控制动作进 `outbox`，联网后按顺序提交；读模型永远从本地投影读，不阻塞在网络上。
- **增量同步**：Ultimate 的 `system.stream` 用 opaque cursor（`<event id>.<trace position>`，`extensions/system/README.md:7`）；SSE 没有 `Last-Event-ID`，重连后用 `after: head` 追。任务图用“全量 snapshot + 按 id diff”；trace 用 `after: seq`。冲突策略：**服务端状态字段赢，客户端布局/筛选字段赢**；不需要 CRDT，除非以后做多人标注。

## 5. 产品调研

### 5.1 任务编排（选 5 个）

| 产品                     | URL（访问 2026-10-28）                                           | 一句可借鉴点                                                                                                                                | 不要照搬                                                                     |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Temporal Web UI**      | <https://docs.temporal.io/web-ui>                                | 同一 Workflow 提供 History 的 **Timeline / All / Compact / JSON** 四种粒度，且 **Relationships** 展示父子 Workflow 树；Saved Views 固化查询 | 它的 Namespace/Workflow 模型很重；任务图不是 DAG 画布，而是事件历史 + 关系树 |
| **Apache Airflow 3.3.2** | <https://airflow.apache.org/docs/apache-airflow/stable/ui.html>  | **Grid View** 用热力图把多次 Dag Run 压成矩阵，**Graph View** 只负责依赖；Runs 页有运行时间线                                               | 静态 DAG + TaskInstance 模型；不适合“运行时动态生成子任务”的 agent 场景      |
| **Dagster**              | <https://dagster.io/docs/guides/operate/webserver>               | **Global Asset Lineage** 全局血缘 + 单次 Run 的 **Gantt** + 结构化事件日志，三层信息架构清楚                                                | 资产（asset）中心；对“一次执行”的所有权树表达弱                              |
| **Prefect**              | <https://www.prefect.io/>（docs 站点对抓取返回 404，改用产品页） | “运行即生成依赖图”，不用先声明 DAG；UI 做实时 flow run 监控、日志、状态                                                                     | Python 装饰器/flow 模型；桌面端不能直接复用其服务端                          |
| **Windmill**             | <https://www.windmill.dev/docs/flows/flow_editor>                | 画布内 **Flow groups 可折叠/展开**、**subflow 可内联展开**；分组折叠状态可持久化到 YAML                                                     | 编辑器优先；运行观测是附属能力，不是“大规模只读回放”                         |
| （备选）n8n              | <https://docs.n8n.io/build/understand-workflows>                 | 节点 + 连接的工作流画布，执行记录可过滤/调试                                                                                                | 触发器/集成导向；不适合作为任务图数据模型                                    |

### 5.2 子 agent / LLM 可观测（选 5 个）

| 产品                 | URL（访问 2026-10-28）                                                                      | 一句可借鉴点                                                                                                    | 不要照搬                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **LangSmith Studio** | <https://docs.langchain.com/langsmith/studio>                                               | **Graph mode** 显示图结构 + 节点轨迹 + 中间状态；Threads + **time travel** 调试；Chat mode 降低非技术用户门槛   | 绑定 LangGraph/Agent Server 协议；不是通用桌面客户端                       |
| **AutoGen Studio**   | <https://microsoft.github.io/autogen/stable/user-guide/autogenstudio-user-guide/index.html> | Team Builder + Playground 的 **live message streaming** 与 **control transition graph**；消息流和控制流叠加展示 | 官方明确“research prototype, not production-ready”；只能借交互，不能借架构 |
| **Langfuse**         | <https://langfuse.com/docs/observability/overview>                                          | 嵌套 observation 的 **trace tree** + session 聚合 + token/cost/latency 列；异步批量上报不阻塞应用               | 以“请求/会话”为中心，缺任务所有权和泳道时间线                              |
| **Arize Phoenix**    | <https://arize.com/docs/phoenix>                                                            | 以 **OpenTelemetry/OpenInference** 为入口；span replay + evals 把“看”接到“评”；适合做 OTel 适配器的参照         | 评测/实验平台优先；图布局和泳道不是它的强项                                |
| **AgentOps**         | <https://docs.agentops.ai/v2/introduction>                                                  | **Session Waterfall**：左侧 LLM/action/tool/error 时间线，右侧选中事件详情；最接近“泳道 + 详情”的最小形态       | Session 为单位，缺跨会话 spawn 树；控制面弱                                |
| （备选）Braintrust   | <https://www.braintrust.dev/docs>                                                           | trace → observe → annotate → evaluate 的工作流；Patterns 自动发现问题                                           | 偏评测/实验；不适合直接做运行中编排                                        |

### 5.3 信息架构提炼（可直接写进 30/40 §7）

1. **双主视图 + 联动选择**：图（结构）与时间线（过程）并列；选中节点/泳道同时高亮另一视图。Temporal、Dagster、AgentOps 都验证了这一点。
2. **列表/过滤是第一入口**：运行列表 + 状态/时间/标签过滤 + Saved Views（Temporal）。不要一上来就画全图。
3. **详情抽屉四件套**：属性、输入/输出、日志/事件、重试/失败原因；原始 JSON 作为逃生口（Temporal History JSON）。
4. **渐进披露**：cluster/group/collapse + “+N finished”（Ultimate 已有）；Windmill 的 flow group 可折叠是 10k 节点的直接参照。
5. **控制面与观测面分离**：默认只读；取消/重试/steer 需二次确认 + 审计；AutoGen Studio 的 pause/stop 是交互参照，不是权限模型。
6. **回放是独立模式**：时间旅行/回放要有自己的时钟、游标和“回到实时”按钮；LangSmith time travel、Temporal History 都把它当一等功能。

## 6. 标准与协议

| 标准/版本                                                                                         | 作用                           | 可直接映射到任务图                                                                                                                | 可直接映射到 agent 泳道                                                                                                                                                                     | 缺失（必须自建）                                                                                                   | 来源（访问 2026-10-28）                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OpenTelemetry GenAI semconv**（已迁到独立 repo；agent spans 状态 **Development**，不是 Stable） | LLM/agent/tool 的 span 语义    | `gen_ai.operation.name` 的 `invoke_agent`/`invoke_workflow`/`plan` 可做高层任务节点；`gen_ai.agent.id/name/version` 做 agent 身份 | `gen_ai.conversation.id` 做泳道分组；`execute_tool` span + `gen_ai.tool.name`/`gen_ai.tool.call.id` 做调用 tick；`gen_ai.usage.input_tokens/output_tokens`（及 cache/reasoning 细分）做成本 | 任务所有权树、wait 边、attempt/retry、workspace/branch、定价、UI 布局；`gen_ai.*` 大多仍是 Development，字段可能变 | <https://github.com/open-telemetry/semantic-conventions-genai>；<https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-agent-spans.md> |
| **AG-UI**（SDK `@ag-ui/core` 1.0.3；协议文档未给独立版本号）                                      | Agent ↔ 用户前端的流式事件协议 | 弱：`RunStarted`/`RunFinished`/`StepStarted`/`StepFinished` 只能做“一次运行”的粗粒度节点                                          | 强：`TextMessage*`、`ToolCall*`、`StateSnapshot`/`StateDelta`、`subagentRunId`、`parentRunId`、interrupts 可直接驱动泳道/消息/回放                                                          | 持久化任务图、跨运行所有权、成本/模型字段（`metadata` 是开放字典，未标准化）、workspace/artifact                   | <https://docs.ag-ui.com/concepts/events>                                                                                                                                             |
| **A2A 1.0.0**                                                                                     | 独立 agent 系统之间的任务委派  | `Task` + `contextId` 可做跨进程任务节点；`TaskStatusUpdateEvent` 做状态                                                           | `Message`/`Part`/`Artifact` 可做跨 agent 消息边；`AgentCard` 做 agent 身份                                                                                                                  | 内部 tool call/trace、token usage、UI 事件、细粒度重试；A2A 刻意“opaque execution”                                 | <https://a2a-protocol.org/latest/specification/>                                                                                                                                     |
| **MCP 2026-07-28**                                                                                | LLM 应用与工具/数据源的连接    | 弱：只有 tool/resource/prompt 调用，不是任务图                                                                                    | `tools/call` 的 name/args/result 可做 tool tick；Tasks 扩展可表达长任务，但不含 agent 泳道                                                                                                  | agent 身份、trace parent、任务所有权、成本、回放；MCP 是“能力协议”不是“观测协议”                                   | <https://modelcontextprotocol.io/specification/2026-07-28>                                                                                                                           |

**结论**：

- **内部存储以 Ultimate 原生模型为主**，OTel GenAI 作为**导出/互操作格式**（Phoenix/Langfuse/Braintrust 都能吃 OTel），不要反过来用 OTel 的 span 树当数据库。
- **AG-UI 只用于“实时 UI 流”**：如果未来要接 CopilotKit 或其他 agent 前端，可作为 ingress；不要把它当持久任务模型。
- **A2A 只用于跨进程/跨厂商边界**：把远端 agent 当一个不透明 Task 节点；内部仍用 Ultimate 的 conversation/task 图。
- **MCP 只用于工具注册/调用元数据**：不要指望它给出 agent 泳道或任务依赖。

## 7. 用 Ultimate 自身数据面做适配分析

### 7.1 可用字段（源码证据）

| 数据源                               | 可用字段                                                                                                                                                                                                            | 用途                                         | 证据                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `TaskGraph` / `TaskGraphNode`        | `id`、`kind`、`conversationId`、`owner?`、`background`、`abortRequested`、`state`（`pending/running/waiting/sleeping/completing`，含 `phase`、`on[]`、`policy`、`until`、`outcome`）、`blocked?`、`conversations[]` | 任务 DAG 的节点、所有权边、等待边、状态/阶段 | `node_modules/@earendil-works/pi-durable/dist/harness/task-graph.d.ts:6-42`；`shared/protocol.ts:209` |
| `tasks.started` action               | `{ ids } → { [taskId]: startedAt }`，毫秒；未开始/已消失的不返回                                                                                                                                                    | 运行时长、超时告警                           | `extensions/tasks/refs.ts:5-8`；`extensions/tasks/server.ts:12-25`                                    |
| `ConversationSummary`                | `id`、`parentConversationId?`、`branchOf?`、`ownerTaskId?`、`label?`、`title?`、`cwd?`、`busy`、`inputAt?`、`answerAt?`                                                                                             | 泳道身份、父子关系、当前忙闲                 | `shared/protocol.ts:45-61`；`server/api.ts:182-215`                                                   |
| `subagents.started` event            | `id`（conversation id）、`agent`、`model?`、`thinking?`、`parent?`、`kind: child/standing/branch`                                                                                                                   | spawn 边、agent 身份、模型                   | `extensions/subagents/refs.ts:76-83`；`extensions/subagents/children.ts:30-39`                        |
| `ultimate.subagents` doc             | `agents{conversationId,agent,background,reported[]}`、`actions{conversationId,reporter,answer?,status?}`                                                                                                            | 投递/回答/失败状态                           | `extensions/subagents/api.ts:15-47`                                                                   |
| `board.sent` event                   | `{ message, from, to, reply, steer }`                                                                                                                                                                               | 泳道间消息边                                 | `extensions/messages/refs.ts:93`；`extensions/subagents/README.md:94`                                 |
| `call` trace row                     | `id`、`parent?`、`trace`、`at`、`ms`、`caller`、`callee`、`kind`（service/action/reactor/tool/model）、`name`、`ok`、`error?`、`args?`、`result?`、`conversation?`、`task?`、`entry?`                               | 调用树、泳道块、模型调用、错误               | `server/trace.ts:32-49`、`16`                                                                         |
| model trace `result`                 | `{ input, output, cacheRead, cacheWrite, stopReason }` 的 JSON 摘要                                                                                                                                                 | token 用量（需解析，见缺口 G4）              | `server/tool-arguments.ts:100-117`                                                                    |
| `system.stream`                      | 合并 event+call，`sources/kinds/conversation/errors/text` 过滤，opaque cursor，最多 500/页                                                                                                                          | 事件时间线、搜索、增量                       | `extensions/system/refs.ts:49-52`；`extensions/system/README.md:5-7`                                  |
| `system.lanes`                       | `{ now, lanes, links, more? }`；每 lane 的 runs/calls/spawn/parent                                                                                                                                                  | 开箱即用的泳道骨架                           | `extensions/system/refs.ts:55-102`；`extensions/system/README.md:9-10`                                |
| `system.tree`                        | `{ calls, events }`，trace 的调用树，最多 5000 calls                                                                                                                                                                | 调用详情/火焰图                              | `extensions/system/refs.ts:129-132`；`server/trace.ts:471-487`                                        |
| `GET /api/events` SSE                | `system`、`conversations`、`view`、`ui`、`tasks`、`doc`、`notice`；15s heartbeat、500ms retry                                                                                                                       | 实时快照/增量                                | `server/api.ts:82-92`、`299-307`、`361-372`                                                           |
| `GET /api/conversations/:id/history` | 条目分页，`before`/`after` 游标，页大小 64/512                                                                                                                                                                      | 拉取消息正文/工具结果                        | `server/api.ts:374-403`                                                                               |
| 扩展 action                          | `POST /api/extensions/:name/actions/:key`，`{args, conversationId?}`                                                                                                                                                | 调 `system/*`、`tasks/*`、`subagents/*`      | `server/api.ts:103-145`                                                                               |

### 7.2 缺口（按影响排序）

| ID      | 缺口                                                                                                  | 影响                                                                               | 证据/说明                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **G1**  | `TaskGraph` 只含 **live task**，任务完成后从图中消失                                                  | 无法直接做历史任务图/回放；必须从 event log + trace 重建                           | `task-graph.d.ts:43-47`（“Every live task”）                                   |
| **G2**  | 无 `endedAt`、无 attempt/retry 计数、无任务级失败原因（只有 `blocked` 与 `completing.outcome`）       | 无法算准确时长、重试次数、SLA；只能 `now - startedAt`                              | `task-graph.d.ts:6-25`；`extensions/tasks/refs.ts:5-8`                         |
| **G3**  | 无静态依赖边；只有 `waiting.on` 在等待时存在                                                          | 图布局只能画“当前等待”，画不出完整 DAG；历史边需从事件推断                         | `task-graph.d.ts:10-14`                                                        |
| **G4**  | token 用量只在 model call 的 `result` JSON 里，且 `summary()` 截断到 ~300 字符，无定价/成本字段       | 成本分析要做“解析 + 容错 + 价格表”；截断可能丢字段                                 | `server/trace.ts:86-103`；`server/tool-arguments.ts:113-117`                   |
| **G5**  | 无 agent 状态时间线；`ConversationSummary.busy` 只是当前布尔值                                        | 泳道只能从 call 间隔推断 run 的起止（20s 静默切分）                                | `shared/protocol.ts:56`；`extensions/system/README.md:9`                       |
| **G6**  | `board.sent` 不含消息正文，只有 `message` id                                                          | 消息边可画，内容要按 id 再查 history；批量时 N+1                                   | `extensions/messages/refs.ts:93`；`extensions/system/README.md:10`             |
| **G7**  | 事件 id 与 trace position 是两套序列；`system.stream` 按“调用结束时间”合并排序                        | 跨源严格全序需要适配器自己定义 `(time, source, id)` 排序；不能用单一自增           | `extensions/system/server.ts:143-153`；`extensions/system/README.md:6`         |
| **G8**  | 硬上限：lanes 40、每 run 200 calls、tree 5000 calls、stream 500/页、trace 保留 200k 行/7 天           | 100k 事件必须归档/ETL；不能把 Ultimate 当无限历史库                                | `extensions/system/server.ts:242-244`、`426`；`server/trace.ts:106`、`471-487` |
| **G9**  | 控制面只有 conversation `submit/abort` 与 `tasks.retry`；没有“按 subagent id stop/steer”的独立 action | 桌面控制面要复用 conversation 级操作，权限/审计需自建                              | `server/api.ts:495-597`；`extensions/tasks/refs.ts:10-11`                      |
| **G10** | 跨源访问受同源策略限制：loopback 只接受同端口 origin；扩展 action 还检查 `sec-fetch-site`             | Tauri/Electron 的 WebView origin 与 `http://127.0.0.1:port` 不同，前端直连会被 403 | `server/request-security.ts:40-45`、`56`；`server/api.ts:111-113`              |
| **G11** | 无 OTel 导出；trace 是私有 SQLite schema                                                              | 接 Phoenix/Langfuse 需要 exporter 或适配器                                         | `server/trace.ts:316-321`                                                      |
| **G12** | trace 不含 workspace/branch/commit；这些在 conversations/workspaces 文档                              | 泳道要显示 worktree 需另查 workspace 文档                                          | `extensions/subagents/README.md:94`；`shared/protocol.ts:45-61`                |

### 7.3 建议的适配器接口（TypeScript）

```ts
// orchestra-core/src/adapters/ultimate.ts
export type UltimateTaskState =
  | { status: 'pending' | 'running'; phase: string }
  | { status: 'waiting'; phase: string; on: number[]; policy: string }
  | { status: 'sleeping'; phase: string; until: number }
  | { status: 'completing'; outcome: string }

export interface UltimateTaskNode {
  id: number
  kind: string
  conversationId: number
  owner?: number
  background: boolean
  abortRequested: boolean
  state: UltimateTaskState
  blocked?: 'missing_task' | 'task_too_old' | 'migration_failed' | 'restart_limit'
  conversations: number[]
}

export interface UltimateAgentFact {
  agent?: string
  model?: string
  thinking?: string
  kind?: 'child' | 'standing' | 'branch'
  parent?: number
}

export interface UltimateSnapshot {
  tasks: Record<string, UltimateTaskNode>
  conversations: import('../../shared/protocol').ConversationSummary[]
  starts: Record<string, number> // tasks.started
  agents: Record<number, UltimateAgentFact> // subagents.started
}

export interface StreamQuery {
  sources?: ('event' | 'call')[]
  kinds?: string[]
  conversation?: number
  errors?: boolean
  text?: string
  before?: string
  after?: string
  limit?: number
}

export interface UltimateSource {
  /** GET /api/events：system 先到，随后 tasks/conversations/doc 快照与增量。 */
  subscribe(onEvent: (name: string, data: unknown) => void): () => void
  /** 首屏：tasks 快照 + conversations + 可见任务的 startedAt + subagents.started 事实。 */
  snapshot(): Promise<UltimateSnapshot>
  /** GET /api/extensions/system/actions/lanes */
  lanes(q: { since?: string; until?: string }): Promise<{
    now: string
    lanes: import('../../extensions/system/refs').Lane[]
    links: import('../../extensions/system/refs').LaneLink[]
    more?: number
  }>
  /** GET /api/extensions/system/actions/stream */
  stream(q: StreamQuery): Promise<{
    rows: import('../../extensions/system/refs').SystemRow[]
    next?: string
    head: string
  }>
  /** GET /api/extensions/system/actions/tree */
  tree(trace: string): Promise<{
    calls: import('../../extensions/system/refs').SystemCall[]
    events: import('../../extensions/system/refs').SystemRow[]
  }>
  /** GET /api/conversations/:id/history */
  history(conversation: number, before?: number): Promise<{ entries: unknown[]; before?: number }>
  /** POST /api/extensions/:name/actions/:key（same-origin；桌面端应由 sidecar 代理） */
  action<T>(name: string, key: string, args: unknown, conversationId?: number): Promise<T>
}
```

标准化模型（与 Ultimate 解耦，供 A/B 共用）：

```ts
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'sleeping'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'blocked'

export interface TaskNode {
  id: string
  source: 'ultimate' | 'otel' | 'a2a' | 'jsonl'
  kind: string
  title?: string
  status: TaskStatus
  phase?: string
  conversationId?: string
  parentId?: string
  ownerTaskId?: string
  startedAt?: number
  endedAt?: number // Ultimate 缺口 G2：v0 为 undefined
  waitOn: string[]
  blockedReason?: string
  attrs: Record<string, string | number | boolean>
}

export interface TaskEdge {
  from: string
  to: string
  kind: 'owner' | 'wait' | 'spawn' | 'message'
  inferred?: boolean // 由 call 间隔/相邻事件推断时必须标 true
}

export interface TimelineEvent {
  id: string
  source: 'event' | 'call' | 'otel-span'
  at: number
  kind: string
  name: string
  conversationId?: string
  traceId?: string
  taskId?: string
  ok: boolean
  ms?: number
  error?: string
  summary?: string
}
```

映射规则：

- `TaskNode.id = "task:" + id`；`conversationId = String(conversationId)`；`owner` 边来自 `TaskGraphNode.owner`；`wait` 边只在 `state.status === 'waiting'` 时来自 `state.on`，并标 `inferred: false`；其余依赖从 trace 的 `parent`/`spawn` 推断，标 `inferred: true`。
- `TaskNode.startedAt = starts[id]`；`endedAt` 暂空；`status` 由 `state.status` + `blocked` + `completing.outcome` 映射；`success/failed/cancelled` 只在 `completing` 或事件回填时出现。
- `AgentLane` 由 `ConversationSummary` + `subagents.started` + `system.lanes` 合成；`spawn.call` 直接来自 `Lane.spawn.call`，`inferred` 来自 `Lane.spawn.inferred`。
- `TimelineEvent` 的 call 行：`at = Date.parse(call.at)`，`end = at + ms`；`summary` 是已脱敏的 300 字符摘要，不能反推完整参数。
- 模型用量：仅当 `call.kind === 'model'` 且 `result` 是合法 JSON 时解析 `{input, output, cacheRead, cacheWrite}`；解析失败/含 `…` 时记 `usage_unavailable`，不要猜。

### 7.4 接入与安全（桌面端必须做对）

1. **sidecar 是唯一 HTTP 客户端。** Tauri 用 Rust command/`reqwest`；Electron 用主进程 `net`/`fetch`。WebView 只通过 `invoke`/IPC 拿已脱敏的 DTO。这样同时解决 G10（origin 403）和“token 不进前端”。
2. **地址发现。** 用户配置 `ULTIMATE_URL`，或从 `/api/events` 的第一帧 `system.process.url` 读取（`shared/protocol.ts:125-134`；`server/api.ts:299`）。连接前先做 `/api/models` 或 SSE 握手健康检查。
3. **初次同步顺序。** SSE 建连 → 收 `system`/`conversations`/`tasks` 快照 → 对可见 task 批量 `tasks.started` → 对可见 conversation 拉 `system.lanes` 或 `system.stream` 历史 → 按需 `system.tree`/`history`。不要先拉 100k 事件再渲染。
4. **重连。** 心跳 15s（`server/api.ts:90-92`）；断开后指数退避；用 `system.stream` 的 `head` 作为 `after` 追赶，避免重复/缺口。SSE 本身没有 event id，不能依赖 `Last-Event-ID`。
5. **权限。** 默认只读；`stop`/`steer`/`retry` 需显式用户动作 + 二次确认 + 本地审计表（`outbox` + `audit`）；`tasks.retry` 是 user-only（`extensions/tasks/refs.ts:10-11`），不要在后台自动调用。
6. **数据保留。** 本地 SQLite 保留全量归档（自己定 30/90 天），Ultimate 的 200k/7 天只当热源；超过 `system.stream` 上限的历史从本地归档读。

### 7.5 v0 可做/不可做

- **可做**：当前 live 任务树、状态/阶段/等待、当前运行时长、conversation 泳道、spawn 树、消息边（无正文）、调用树、错误、模型 token（尽力解析）。
- **不可做（v0）**：完整历史任务图、精确 attempt/retry、任务级成本、跨源严格全序、按 subagent 的独立 stop/steer、workspace/branch 在同一条泳道里完整呈现。spec 必须把这些写成 `NOTE`/后续里程碑，而不是隐含假设。

## 8. 两份推荐栈与决策矩阵

### 8.1 共享内核 `orchestra-core`

```
orchestra-core/
  src/protocol/        # TaskNode/TaskEdge/AgentLane/TimelineEvent/Command
  src/transport/       # SSE、action、sidecar IPC、重连/背压
  src/adapters/        # ultimate.ts / otel.ts / a2a.ts / jsonl.ts
  src/store/           # schema.sql、migrations、repo、snapshot
  src/layout/          # ELK worker、cluster、incremental
  src/replay/          # clock、projector、cursor
  src/query/           # selectors、aggregate、FTS
  src/ui/              # 主题、状态色、时间轴 scale、空态/错误态
```

A/B 只替换 `views/` 与 `adapters/`；`transport`、`store`、`layout`、`replay` 完全共享。这样 30/40 两个 spec 的字段、状态机、错误码可以保持同一套。

### 8.2 桌面壳决策矩阵（1–5 分；5 最好）

权重是**产品判断**，不是测量值；评分是设计评审用，不是 benchmark。

| 维度                               |    权重 | Tauri 2.12.5 | Electron 45 | Wails 3.0.0 | Avalonia 12.1.4 | Flutter 3.47.8 |
| ---------------------------------- | ------: | -----------: | ----------: | ----------: | --------------: | -------------: |
| 包体积/内存                        |      20 |            5 |           2 |           4 |               4 |              4 |
| 系统 API / Node / 进程能力         |      15 |            5 |           5 |           4 |               5 |              3 |
| 自动更新 / Windows 签名            |      15 |            5 |           4 |           3 |               3 |              3 |
| SQLite / 本地数据                  |      15 |            4 |           5 |           3 |               4 |              3 |
| 崩溃报告                           |       5 |            2 |           5 |           2 |               3 |              3 |
| 前端图形生态（React/Canvas/WebGL） |      15 |            5 |           5 |           5 |               2 |              2 |
| 开发效率 / 团队技能                |      10 |            3 |           5 |           3 |               2 |              2 |
| 长期维护 / 生态风险                |       5 |            4 |           4 |           3 |               4 |              3 |
| **加权总分（/5）**                 | **100** |     **4.45** |    **4.20** |    **3.60** |        **3.45** |       **2.95** |

计算：`Σ(权重×分数)/100`。Tauri 445、Electron 420、Wails 360、Avalonia 345、Flutter 295。

**读法**：Tauri 在“体积/内存 + 更新/签名 + 前端生态”三项胜出；Electron 在“Node 能力 + SQLite + 崩溃报告 + 开发效率”胜出。若这些后者是硬约束，见 8.3。

### 8.3 敏感性分析

| 情景                              | 权重变化              | 胜者（分数）                | 结论                                              |
| --------------------------------- | --------------------- | --------------------------- | ------------------------------------------------- |
| 基准                              | 20/15/15/15/5/15/10/5 | Tauri 4.45 vs Electron 4.20 | 默认 Tauri                                        |
| 团队只写 TS、要复用 Node          | 体积 10、开发 20      | Electron 4.50 vs Tauri 4.25 | **Electron 胜**；此时不要再坚持 Tauri             |
| 体积/内存是硬指标                 | 体积 30、开发 0       | Tauri 4.65 vs Electron 3.90 | Tauri 压倒性                                      |
| 崩溃报告权重升到 10、前端降到 10  | 5→10 / 15→10          | Tauri 4.30 vs Electron 4.20 | Tauri 仍略胜；但若 crash 是合规要求，选 Electron  |
| SQLite 权重升到 25、前端降到 5    | 15→25 / 15→5          | Tauri 4.35 vs Electron 4.20 | Tauri 仍胜；better-sqlite3 的优势不足以抵消包体积 |
| 系统 API 权重升到 25、体积降到 10 | 15→25 / 20→10         | Electron 4.50 vs Tauri 4.45 | 极接近；按团队技能定                              |

**硬约束优先级高于加权分**：

- 若“安装包 ≤30MB / 8GB 机器内存 ≤250MB / Linux 自动更新”是 must-have → **只能 Tauri**。
- 若“直接复用 Ultimate `server/trace.ts` 等 Node 模块 / 必须内置 crashReporter / 团队无 Rust”是 must-have → **Electron**。
- 若“全 .NET 商店 / 原生控件”是 must-have → **Avalonia**，但图/时间线要自研或买第三方控件。

### 8.4 推荐栈 A：任务编排可视化

| 层        | 选择                                                                           | 理由                                                                          |
| --------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 壳        | **Tauri 2.12.5**（Rust 1.90+；WebView2/WKWebView/WebKitGTK）                   | 包小、更新签名完整、跨平台；sidecar 做 Ultimate 客户端与 SQLite 写线程        |
| UI        | React 19.3.1 + TypeScript + Vite                                               | 与 Ultimate 前端同栈；团队可直接复用组件/样式经验（`package.json:43`、`57`）  |
| 图        | `@xyflow/react` 12.12.0 + `elkjs` 0.12.0（Worker）                             | React 集成最好；ELK layered 适合 DAG；小图 fallback 用 `@dagrejs/dagre` 3.1.3 |
| 时间线    | 自绘 Canvas 2D + TanStack Virtual                                              | 100k 事件必须分桶；不用 vis-timeline 直接挂全量                               |
| 状态      | Zustand 5.0.16（UI）+ TanStack Query 5.105.0（HTTP 缓存）                      | 分离“高频图状态”与“请求缓存”                                                  |
| 本地库    | SQLite（Rust `rusqlite` 单写线程，WAL；`tauri-plugin-sql` 做迁移/简单查询）    | 写入热路径不跨 IPC；迁移可控                                                  |
| 分析      | DuckDB 2.0.0-r.1（可选旁路）                                                   | 100k+ 事件聚合/成本报表；不碰主库                                             |
| 更新/签名 | `tauri-plugin-updater` 2.14.0 + Azure Artifact Signing；更新包签名密钥离线保管 | 官方支持 Windows/Linux/macOS；签名不可关闭                                    |
| 崩溃      | `tauri-plugin-sentry` + `sentry_rust_minidump`                                 | 无内置 crashReporter 的补位；需自建 symbol 上传                               |

### 8.5 推荐栈 B：子 agent 编排可视化

| 层        | 选择                                                                                                          | 理由                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 壳        | **同 A：Tauri 2.12.5**                                                                                        | 共享打包/更新/签名/SQLite；B 不需要 Electron 的 Node 主进程                                 |
| UI        | React 19.3.1 + 自绘 Canvas 泳道                                                                               | 40 条 lane × 多 run × 200 calls/run，DOM 时间线会卡；Canvas 可分桶/裁剪                     |
| 图        | spawn 树用 React Flow（小树）；消息边用 Canvas overlay                                                        | 树通常 <200 节点；消息边可能上千，Canvas 更稳                                               |
| 状态      | 同 A；额外 `replayStore`（时钟、游标、播放速度）                                                              | 回放与实时共用投影，不共用时钟                                                              |
| 本地库    | 同 A + `event`/`snapshot`/`outbox` 表                                                                         | 事件溯源回放；控制动作离线排队                                                              |
| 实时      | SSE `/api/events` + `system.lanes` 轮询（2s，和 Ultimate 现 UI 一致）                                         | 低延迟；断线用 `system.stream` 的 `head` 追赶                                               |
| 控制      | 默认只读；stop = `POST /api/conversations/:id/abort`；steer = `submit { whenBusy: 'steer' }`；二次确认 + 审计 | 复用 Ultimate 既有 conversation 控制面（`server/api.ts:495-597`）；没有 per-subagent action |
| 崩溃/更新 | 同 A                                                                                                          | 共享内核                                                                                    |

### 8.6 不要选什么/为什么

| 不要选                                    | 为什么                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Flutter Desktop 作为主壳**              | 没有 DOM，React Flow/Cytoscape/vis-timeline 全部不可用；图/时间线/文本表格都要自绘或找弱生态插件；桌面可访问性与插件成熟度不如 WebView |
| **.NET MAUI**                             | 桌面（尤其 Linux）非强项；图形/时间线生态薄；团队若无 .NET 经验，成本高于收益                                                          |
| **Avalonia（除非全 .NET 商店）**          | 原生控件强，但缺少 React Flow/ELK 级别的图生态；复杂 DAG + 时间线要自研控件，工期不可控                                                |
| **Wails（除非 Go 团队）**                 | v3 刚发布（2026-10-26），插件/社区厚度不如 Tauri；同样用 WebView2，却没有 Tauri 的 capability/plugin 生态与本文的 Rust 数据面复用      |
| **Electron（当包体积/内存是硬指标）**     | 官方自己说 zip 80–100MB、多数应用 >100MB；每个窗口一个渲染进程；对 8GB 笔记本不友好                                                    |
| **Cytoscape.js 作为主交互图**             | 只读大图很强，但 React 集成是命令式 wrapper，编辑/选中/自定义节点体验不如 React Flow；适合“大图只读”第二模式                           |
| **vis-timeline 直接挂 100k 事件**         | 官方明确每个 item 是 HTML DOM；100k item 会卡死；只能用聚合后的 ≤5k 可见 item                                                          |
| **dagre 做 10k 主布局**                   | 适合小 DAG，缺端口/嵌套/大图质量；10k 应上 ELK layered 或自研分层                                                                      |
| **Redux 作为默认状态层**                  | 高频图更新会产生大量 action；Zustand 的选择器订阅更直接。只有 undo/redo/时间旅行是核心时才用 RTK                                       |
| **TanStack Query 当事件流 store**         | 它是请求缓存，不是 append-only 事件存储；SSE 高频更新会让 cache 失效逻辑变复杂                                                         |
| **DuckDB 当主 OLTP**                      | 列式分析引擎，不适合高频小事务/单写多读的 UI 状态；主库用 SQLite，DuckDB 只做分析                                                      |
| **只做事件溯源、不做快照**                | 100k 事件全量重放启动慢；必须有 snapshot + 投影重建                                                                                    |
| **把 OTel/AG-UI/A2A 当内部数据库 schema** | 它们分别是观测/交互/跨 agent 协议，缺任务所有权、重试、workspace 等；内部模型必须自建，协议只做边界                                    |

## 9. 性能预算与验证计划

| 指标               | 目标（设计目标，未实测）              | 测量方法                                  |
| ------------------ | ------------------------------------- | ----------------------------------------- |
| 冷启动到首屏       | <2.0s                                 | Tauri/Electron 启动打点；SSE 首帧到首图   |
| 10k 任务元数据加载 | p95 <1.5s                             | SQLite 查询 + IPC；`EXPLAIN QUERY PLAN`   |
| 首图 500 可见节点  | <800ms                                | PerformanceObserver（long task）          |
| 平移/缩放          | 2k DOM 节点 ≥55fps；10k Canvas ≥30fps | Playwright + `requestAnimationFrame` 采样 |
| 10k 全量 ELK 布局  | <10s，后台 Worker，可取消             | 合成 DAG benchmark                        |
| 100k 事件分桶      | <300ms（2000px 视口）                 | 纯函数 benchmark                          |
| 摄入突发           | 5k events/s，不丢数据                 | 合成 SSE/JSONL 回放；比对 row count       |
| 内存               | 100k 事件 + 10k 节点 <350MB RSS       | 任务管理器/`process.memoryUsage`          |
| 回放               | 100k 事件从头到尾 <60s（可倍速）      | 回放时钟 + 投影耗时                       |

**验证步骤**：

1. 生成合成数据：10k 节点/20k 边/100k 事件，含 5% 失败、3 层嵌套、10% 跨泳道消息。
2. 用 `orchestra-core` 的 JSONL adapter 回放，记录 ingest/投影/布局/首帧。
3. 用 Playwright 在 Windows 11 + WebView2 与 Electron 45 各跑一遍；记录 FPS、内存、长任务。
4. 用真实 Ultimate home（`~/.ultimate`）的 `trace.sqlite` 抽样，校验字段映射与缺口（G1–G12）。
5. 任何“推断”字段在 UI 上打 `inferred` 标记；验收时检查标记覆盖率。

## 10. 可直接被 spec 引用的结论清单

- **R1** 桌面壳没有单一句结论；本项目默认 Tauri 2.12.5，Node 复用/崩溃报告/开发效率是硬约束时选 Electron 45.0.0。证据：§2.2、§8.2–8.3。
- **R2** Tauri 官方称最小应用可 <600KB；Electron 官方称 zip 包通常 80–100MB、多数应用 >100MB。证据：<https://v2.tauri.app/start/>、<https://www.electronjs.org/docs/latest/why-electron>（2026-10-28）。
- **R3** Tauri WebView 内没有 Node，系统能力走 Rust command/plugin + capability ACL；Electron 主进程是完整 Node。证据：<https://v2.tauri.app/concept/process-model/>、<https://www.electronjs.org/docs/latest/tutorial/process-model>。
- **R4** Tauri updater 覆盖 Windows/Linux/macOS 且更新包必须签名；Electron 内置 autoUpdater 只覆盖 macOS/Windows。证据：<https://v2.tauri.app/plugin/updater/>、<https://www.electronjs.org/docs/latest/api/auto-updater>。
- **R5** Windows 签名按 Electron 文档应使用 EV 证书/Azure Artifact Signing（2023-06 起 OV 不再被视为有效签名）；Tauri 文档仍列 OV，需以 Microsoft 当前要求为准。证据：<https://www.electronjs.org/docs/latest/tutorial/code-signing>、<https://v2.tauri.app/distribute/sign/windows/>。
- **R6** Electron 内置 crashReporter（Crashpad/minidump）；Tauri 无内置，需 `tauri-plugin-sentry` + minidump。证据：<https://www.electronjs.org/docs/latest/api/crash-reporter>、<https://github.com/timfish/sentry-tauri>。
- **R7** `tauri-plugin-sql` 基于 sqlx、迁移在 Rust 注册、默认只读；better-sqlite3 同步且需按 Electron ABI 重编。证据：<https://v2.tauri.app/plugin/sql/>、<https://github.com/WiseLibs/better-sqlite3>、<https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules>。
- **R8** React Flow 的节点是 DOM；官方性能指南要求 memo、折叠大树、简化样式，不能把 10k 节点全量挂载。证据：<https://reactflow.dev/learn/advanced-use/performance>（2026-10-28）。
- **R9** ELKjs 的旗舰是 Sugiyama 风格 layered 布局，支持 Web Worker；dagre 只适合小 DAG；vis-timeline 每个 item 是 DOM，100k 事件不可直接挂。证据：<https://github.com/kieler/elkjs>、<https://github.com/dagrejs/dagre>、<https://visjs.github.io/vis-timeline/docs/timeline/>。
- **R10** 10k/100k 的可行路径是“SQL 预聚合 + 层级折叠 + 可见视口渲染 + Worker 布局 + Canvas 分桶 + 增量摄入”，不是换一个图库。证据：§3.2、§9。
- **R11** Zustand 适合 UI/选择态，TanStack Query 适合 HTTP 缓存；不要把 Redux 或 Query 当事件存储。证据：§4.1。
- **R12** 本地主存用 SQLite（WAL、单写线程、append-only event + snapshot + projection）；DuckDB 只做分析旁路。证据：§4.2–4.3。
- **R13** Ultimate `TaskGraph` 字段含 `id/kind/conversationId/owner/background/abortRequested/state/blocked/conversations`，但**只含 live task**。证据：`node_modules/@earendil-works/pi-durable/dist/harness/task-graph.d.ts:26-47`。
- **R14** `tasks.started` 只返回每个 task 的首次 `startedAt`，没有结束时间/attempt/retry；时长只能 `now - startedAt`。证据：`extensions/tasks/refs.ts:5-8`、`extensions/tasks/server.ts:12-25`。
- **R15** `CallRow` 含 `id/parent/trace/at/ms/caller/callee/kind/name/ok/error/args/result/conversation/task/entry`；model call 的 `result` JSON 含 `{input,output,cacheRead,cacheWrite,stopReason}`。证据：`server/trace.ts:32-49`、`server/tool-arguments.ts:100-117`。
- **R16** `system.lanes` 上限 40 lanes、每 run 200 calls、20s 静默切分；`system.tree` 最多 5000 calls；`system.stream` 每页最多 500；trace 保留 200k 行/7 天。证据：`extensions/system/server.ts:242-244`、`426`；`server/trace.ts:106`、`471-487`；`extensions/system/README.md:9-11`。
- **R17** `/api/events` SSE 首帧发 `system`/`conversations`/`tasks` 等快照，心跳 15s、retry 500ms；没有 `Last-Event-ID`，重连用 `system.stream` 的 `head` 追赶。证据：`server/api.ts:82-92`、`299-307`、`361-372`；`extensions/system/README.md:7`。
- **R18** 桌面 WebView 直连 Ultimate 会被同源策略拦（loopback 只接受同端口 origin；action 还查 `sec-fetch-site`）；必须由 Rust/Node sidecar 代理。证据：`server/request-security.ts:40-45`、`56`；`server/api.ts:111-113`。
- **R19** OTel GenAI agent spans 仍是 **Development**（未 Stable），可直接映射 `invoke_agent`/`execute_tool`/`plan`、`gen_ai.agent.*`、`gen_ai.conversation.id`、`gen_ai.tool.*`、`gen_ai.usage.*`，但缺任务所有权/重试/workspace/成本。证据：<https://github.com/open-telemetry/semantic-conventions-genai>、<https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-agent-spans.md>（2026-10-28）。
- **R20** AG-UI 有 `RunStarted/RunFinished/RunError`、`StepStarted/Finished`、`ToolCall*`、`StateSnapshot/Delta`、`subagentRunId`/`parentRunId`，适合实时泳道，不是持久任务模型。证据：<https://docs.ag-ui.com/concepts/events>（2026-10-28）。
- **R21** A2A 1.0.0 提供 `Task/Message/Part/Artifact/AgentCard/contextId` 与任务状态；MCP 2026-07-28 提供 tools/resources/prompts 与 Tasks 扩展；二者只适合做边界协议。证据：<https://a2a-protocol.org/latest/specification/>、<https://modelcontextprotocol.io/specification/2026-07-28>。
- **R22** 产品信息架构的共性：图 + 时间线联动、运行列表/过滤/Saved Views、详情抽屉、渐进披露、只读默认 + 审计控制、独立回放模式。证据：§5.1–5.3。
- **R23** 推荐 A = Tauri 2.12.5 + React 19.3.1 + React Flow 12.12 + ELK 0.12 + SQLite；B = 同壳 + Canvas 泳道 + 事件溯源回放；两者共享 `orchestra-core`。证据：§8.1、§8.4–8.5。
- **R24** 不建议 Flutter/MAUI 作为主壳；Avalonia 仅在 .NET 商店；Wails 仅在 Go 团队；Electron 仅在 Node 复用/体积不敏感时。证据：§2.3、§8.6。
- **R25** 决策矩阵基准 Tauri 4.45 vs Electron 4.20；当开发效率权重 +10、体积权重 -10 时 Electron 4.50 反超，因此选型必须带团队/约束条件。证据：§8.2–8.3。

## 11. 不确定点

- **Tauri 3.0** 已有 `3.0.0-alpha.5`（2026-10-14），但仍是 alpha；本文只推荐 2.12.5。若 2027 年升级，`createUpdaterArtifacts` 等配置会变（Tauri updater 文档明确说该设置将在 v3 移除）。
- **Electron 45** 的精确内存/启动数据未实测；第三方 benchmark 基于 Electron 43，不能直接外推到 45。
- **Tauri 崩溃报告**依赖社区 `tauri-plugin-sentry`，其与 Tauri 2.12.5 的兼容性需在 M0 做 spike；官方没有 crashReporter。
- **Windows 签名**的证书要求随 Microsoft 政策变化；Tauri 文档的 OV 流程可能过时，采购前需向证书商/Azure 确认 EV/Artifact Signing 资格。
- **OTel GenAI** 仍是 Development；`gen_ai.*` 属性名可能调整，适配器必须做版本 pin + 兼容层。
- **Ultimate 数据面**的 G1–G12 均按当前 commit 源码确认；若基线升级，需重跑 `tasks/trace/system` 相关测试并更新行号。
- **性能数字**（10k 布局秒级、100k 分桶 300ms 等）是设计目标/推断，未在本机测量；M0 必须用合成数据 benchmark 后才能写进验收。
- **产品 UI 细节**随版本变化；本文只引用文档中明确写出的能力，不引用截图或营销页。
