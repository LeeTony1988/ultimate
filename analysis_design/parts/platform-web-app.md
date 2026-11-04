# 平台 Web 应用（platform-web-app）分析笔记

> 范围：`web/src/app/`（22 个文件）、`web/src/components/`（24 个文件）、`web/src/index.css`、`web/src/main.tsx`、`web/index.html`、`web/public/manifest.webmanifest`。范围内没有任何 README.md，产品语义按 App 组合与既有 web-shell 结论校准；导出名、slot 名、事件名以 `web/src/sdk/types.ts`、`registry.ts`、`actions.ts` 交叉核对（SDK 本身由 `platform-web-sdk` 笔记覆盖，此处不展开）。

## 1. 概览

这一组是 web core 的**渲染层**：把 SDK 提供的单一会话副本、贡献注册表和持久 UI 状态，装配成可切换的 surface、可滚动的转录、可发送的 composer、标题栏、命令面板、快捷键，以及扩展可插入的 slot/panel/dock 与统一视觉。它没有任何服务端 facet，也没有可关闭的扩展开关；所有功能通过 `extensions/*/web.tsx` 的贡献表（`slots`/`panels`/`surfaces`/`tools`/`entries`/`composer`/`commands`/`provides` 等）和 `web/src/sdk` 的 hooks 接入。核心只提供“框架 + 每类贡献的默认渲染”，具体产品界面（Agent surface、侧栏、各 panel）由扩展组合这些原语完成。

| 名称                      | 一句话职责                                                       | 服务端入口                                                     | 浏览器入口                                                           | 是否 core tier     |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------ |
| App 组合与 surface 宿主   | 就绪门槛、surface 解析/回退、窗口标题、全局 overlay 与错误卡     | 无 facet；读 SSE 的 `system`/`ultimate.ui`，写 `POST /api/ui`  | `main.tsx:11-14` → `App`（`App.tsx:143`）                            | 不适用（web core） |
| 转录 Transcript           | 消息、流式回复、工具卡、压缩/重置、历史分页、滚动跟随、空态      | `GET /api/conversations/:id/history?before=&after=`            | `Transcript`（`transcript.tsx:85`），经 `Conversation` 挂载          | 不适用（web core） |
| Composer                  | 按会话草稿、发送/steer/follow-up、队列召回、图片、停止           | `POST /api/conversations/:id/{submit,abort,inbox/:sid/cancel}` | `Composer`（`composer.tsx:153`）                                     | 不适用（web core） |
| 标题栏 TitleBar           | 品牌、项目 chip、surface 切换、平板面板快捷、命令入口            | 无；读 `SystemInfo`，写 `shell.surface`/`shell.panel`          | `TitleBar`（`titlebar.tsx:345`），`App.tsx:181`                      | 不适用（web core） |
| 命令面板 Palette          | 搜索并执行全部 core/扩展命令                                     | 无                                                             | `CommandPalette`（`palette.tsx:32`），`App.tsx:185`                  | 不适用（web core） |
| 键盘 Keyboard             | 全局快捷键、和弦序列、输入上下文判定                             | 无                                                             | `useShortcuts`（`keyboard.ts:22`），`App.tsx:132-135`                | 不适用（web core） |
| 表面原语与边界 Primitives | StatusLine/Conversation/Sidebar/Panels/Dock/Header/Slot/错误边界 | 无 facet；布局键写 `POST /api/ui`                              | `primitives.tsx`、`header.tsx`、`boundary.tsx`，经 `@/sdk` barrel    | 不适用（web core） |
| AI 组件                   | Markdown/代码高亮/工具卡/思考/Shimmer/输入框                     | 无                                                             | `components/ai/*`                                                    | 不适用（web core） |
| 视觉与主题 Styling        | 设计 token、Tailwind 主题、排版、safe-area、动画                 | 无                                                             | `index.css`（`main.tsx:1`）；主题写 `localStorage['ultimate.theme']` | 不适用（web core） |
| PWA 与启动                | manifest/图标、首屏主题、重载快照、挂载                          | 静态文件                                                       | `index.html`、`manifest.webmanifest`、`main.tsx`                     | 不适用（web core） |

这些单元没有 `api.ts`、`export const tier`、`docs`、`reactors`，不参与扩展的 core tier 判定；它们随 web bundle 常驻，不能被 `extensions.disable` 关闭（推断：web 入口不读扩展开关）。

## 2. 逐扩展规格

### 2.1 App 组合与 surface 宿主

**职责与用户可见行为。** 页面只在 web facet 落定且首个 `system` 快照到达后显示 surface，避免半加载界面；所选 surface 崩溃或缺失时依次回退到 Agent、再到裸会话，并给出警告；窗口标题随项目、会话、surface 与忙闲变化；扩展加载错误卡和 `overlay` slot 可以在 surface 之前先出现。

**导出与契约。** `App`；`SurfaceContext`、`useSurfaceId`、`useRegion`（`surface.ts:6-12`）。内部 `Frame`、`Surfaces`、`SurfaceBoundary`、`onScreen`、`useDocumentTitle`、`Shortcuts`。**tools/actions/docs/reactors：** 无。**events：** 不直接收发；渲染稳定后调用 `rendered()`（`App.tsx:154-156`）。**apis provided：** `SurfaceContext` 与 `ExtensionNameContext` 两个 React context；无扩展 API。**apis needed：** `useReady`、`useExtensions`、`useShownSurface`、`useStore`、`useConversation`、`useConversations`、`useSystem`、`surfaceItems`、`HOME`、`uiState.set`、`rendered`。**settings keys：** 写 `shell.shownSurface`；经 `useShownSurface` 读 `shell.surface`；`state.ui.surface` 只在本标签。

**状态与持久化。** `shell.shownSurface`（`{id,title}`）写在根会话的 `ultimate.ui` 文档，跨标签/刷新保留；`reported` 是模块级去重变量，`embedded = window.top !== window` 是模块级常量。无 SQLite/文件直写，保留策略由 `ultimate.ui` 文档决定（范围外）。

**UI 位置。** 应用根；`overlay` slot（`App.tsx:187`）；surface 由贡献表的 `surfaces` 决定；`Frame` 是最后的裸会话（Header + Conversation + StatusLine）。

**关键流程。** 1) `main.tsx` 先 `store.start()`、`loadExtensions()`，再 `createRoot(#app).render(<App/>)`。2) `loaded = useReady().ready`；`ready = state.shared !== undefined && state.system !== undefined`；`pending` 时只渲染 TitleBar 之外的空壳，不渲染 surface。3) `line = [surface, surface.id === HOME ? undefined : home]`，`Surfaces` 逐个尝试。4) `SurfaceBoundary` 捕获异常，`componentDidCatch` 发 warning notice；`getDerivedStateFromProps` 在 `surface.version` 变化时清 `failed`。5) 成功挂载/更新时 `onScreen()` 比较后写 `store.ui.surface`；effect 再把 `shown` 持久化为 `shell.shownSurface`。6) `useDocumentTitle` 拼成 `[project ?? 'Ultimate', 会话或 surface]`，busy 时前缀 `●`。

**失败与恢复。** 缺失 surface 在 `ready` 后只报一次（`reported`）；首选失败渲染 Agent，Agent 也失败渲染 `Frame`；`Frame` 自己 `onScreen({id: HOME, title: 'Agent'})`。surface 热更新版本变化自动重试。若 Agent facet 也没有，仍显示裸会话而不会白屏。

**关掉它会发生什么。** 没有根组件，`#app` 为空；surface、slot、命令面板、错误卡全部不挂载。

**复刻要点。** ready 门槛必须同时等 facet 落定与首个 system；overlay/错误卡不能受 ready 限制；`SurfaceBoundary` 要以 `extension:id` 为 key，否则切换 surface 会复用错误状态；`onScreen` 必须写“实际渲染”的面而不是“想显示”的面，`useUltimate().surface` 才准确。

**证据。** `App.tsx:29-44,47,56-113,119-129,143-189`；`surface.ts:6-12`；`main.tsx:8-14`。

### 2.2 转录 Transcript

**职责与用户可见行为。** 转录是产品中心：用户回合、助手文本/思考、工具卡、压缩与重置分隔、未知 entry、流式 partial、最终答案标记、消息悬浮操作、空态、向上分页、发送后强制跟随、按 entry 定位 reveal，以及 compact 折叠和后台行折叠。用户能感知的行为是：切会话不继承滚动位置；上滚后不被流式输出拉回；发送后回到底部；长会话只加载窗口并可按需补历史。

**导出与契约。** `transcript.tsx` 导出 `Transcript`、`LiveLines`；`model.ts` 导出 `ToolResult`、`indexTools`、`slotsOf`、`resultText`、`callsStart`、`toolCallView`、`partialOf`；`compact.ts` 导出 `CompactPart`、`WorkRun`、`QuietGroup`、`AsideGroup`、`compactRows`、`groupQuiet`、`quietOf`、`windowKey`、`windowGaps`、`setAsideIds`、`partKey`、`isOpenIn`、`openIn`、`anchorSelector`、`partsOf`、`groupAside`、`runOf`；`user-turn.tsx` 导出 `textOf`、`skillInput`、`UserText`、`UserView`；`message-actions.tsx` 导出 `MessageActions`；`tool-call.tsx` 导出 `ToolCallBlock`、`GenericToolCall`；`transcript-skeleton.tsx` 导出 `TranscriptSkeleton`；`follow.ts` 导出 `ScrollPlace`、`readerLeft`；`fork.ts` 导出 `reachedFork`；`fold.tsx` 导出 `foldKey`、`readFold`、`writeFold`、`useFold`、`Fold`；`card.tsx` 导出 `Card`。**tools/actions/docs/reactors：** 无。**events：** 监听 `ultimate:sent`（同会话时立即回底）与 `ultimate:reveal-entry`（`{conversationId, entryId}`）。**apis provided：** 上述渲染函数/组件。**apis needed：** `entryRenderers`、`toolRenderers`、`toolLine`、`messageItems`、`useCompact`/`useCompactQuiet`/`useIntro`、`Slot`/`Provided`、`api.history`、`useStickToBottomContext`；point `ParkedRuns`、`RunStart`。**settings keys：** 无。

**状态与持久化。** active `EntryRecord[]`、`LiveState`、`inbox` 来自 `useConversation()` 的流副本；`history` 是组件 state，仅内存，按 id 去重合并；`opened`/`shownQuiet`/`shownAside` 是本次挂载的展开集合；折叠卡用 `localStorage['ultimate.fold.<conversation>.<card>']`，只存 `open`；无 doc 写入，历史条目本身在服务端 SQLite（经 `api.history` 读）。

**UI 位置。** `Conversation` 内（`main` 或 `dock`）；`transcript.start` 仅在“有可见行且 `cursor === undefined`（历史已全）”时渲染；`transcript.end` 总在最后；`LiveStatus` 在末尾显示重试/压缩/思考/工作计时；entry 与 tool 渲染器都在行内。

**关键流程。** 1) 合并 `history`、`previousActive`、`active`，按 id 排序。2) `indexTools` 建 result/call 索引，`visible` 过滤掉已有 call 的 `pi.tool-result`（结果在工具卡里显示）。3) 有 `compact` 时 `compactRows` 折叠工具/思考，再按 `quiet` 折叠后台行、按 `setAsideIds` 折叠 go-back 行。4) `EntryView` 用 `entryRenderers` 逐层包裹 `coreEntry`；`ToolCallBlock` 用 `toolRenderers` 逐层包裹 `GenericToolCall`。5) 顶部 sentinel 进入视口时 `loadEarlier`：`api.history(id, cursor, signal)`，记录锚点、补 `tailSpace`、合并、更新 `before`/`exhausted`。6) 新 compaction/reset 出现时中止请求、重置窗口；`windowGaps` 补“窗口未覆盖的存储区间”。7) `ultimate:reveal-entry` 缺行时 `loadDown(target)`，再依次打开 aside/quiet/compact 组，最后 `scrollIntoView({block:'start'})`。

**失败与恢复。** 历史加载失败显示 “Could not load earlier messages” + Retry；Retry 清 error 后重跑失败区间并继续 sentinel。单个 entry/tool/panel 渲染器抛错由 `ExtensionBoundary` 显示错误卡并回退到 core。未知 kind 渲染可展开的 JSON。`reachedFork` 在 fork 点停止分页，避免把源会话更早历史混进来。请求用 `AbortController`，切换会话/新的 compaction 会 abort。

**关掉它会发生什么。** `Conversation` 只剩 Composer，用户看不到任何消息、工具卡或流式输出；历史 API 仍可被别的组件调用，但没有渲染入口。

**复刻要点。** `EntryView` 的 `memo` + `sameRow` 是流式性能关键：只随 entry、可见工具结果和 slot 变化重渲染。`key={id}` 必须加在滚动容器上。跟随逻辑要同时处理 `use-stick-to-bottom`、`readerLeft` 与 `overflow-anchor`，否则上滚会被拽回。分页的锚点、`tailSpace`、`windowKey`/`windowGaps` 是长会话最容易出错的部分；不要用“按最小 id 游标”代替 head marker 语义。

**证据。** `transcript.tsx:85-184,186-713,922-995,1011-1093,1095-1190,1282-1370`；`model.ts:11-95`；`compact.ts:29-134,146-195,229-269`；`follow.ts:18-20`；`fork.ts:13-20`；`fold.tsx:8-73`；`user-turn.tsx:13-111`；`message-actions.tsx:17-73`；`tool-call.tsx:17-55`。

### 2.3 Composer

**职责与用户可见行为。** 每个会话独立的输入框：草稿自动保存；空闲 Enter 发送、忙碌 Enter 默认 steer、Alt+Enter follow-up、Shift+Enter 换行；触摸键盘 Enter 只换行；忙碌时显示 Stop；↑ 在首行可把队列召回编辑器；粘贴图片（最多 4 张、每张 2 MiB，PNG/JPEG/WebP/GIF）；模型不可用时禁用并说明原因；扩展可包裹 composer 或把发送重定向到别处。

**导出与契约。** `composer.tsx` 导出 `Composer`、`ComposerTarget`、`ComposerRedirect`、`fillComposer`、`insertIntoComposer`；`queued.ts` 导出 `QueuedInput`、`spliced`、`queuedInput`、`queuedLine`、`previewParts`、`atFirstLine`、`withdrawQueuedSteer`、`mergedSteer`、`recallQueued`、`recalledText`；`image-paste.tsx` 导出 `PastedImage`、`useImagePaste`、`ImagePreviews`。**tools/actions/docs/reactors：** 无。**events：** 发送前 `events.emit('ultimate:sent', {conversationId})`。**apis provided：** 上述组件与 `ComposerTarget`；**apis needed：** `composerRenderers`、`inboxRenderer`、`Slot`、`useIntro`、`useModels`、`api.submit/abort/cancelSubmission`、`useImagePaste`。**settings keys：** 无；草稿键 `ultimate.draft.<id>`。

**状态与持久化。** 模块级 `drafts: Map<number|string|undefined, Draft>`，每项含 `text/images/error/sending/revision`；`text` 存 `localStorage['ultimate.draft.<id>']`，发送成功且 `revision` 未变才删除/清空；图片只在内存；`pi.inbox` 的队列在服务端 doc，取消走 HTTP；`sending`/`error` 不持久化。

**UI 位置。** `Conversation` 底部；`composer.toolbar`（输入框上方左）、`composer.actions`（Send 旁，重定向时不显示）、`composer.status`（输入框下方状态行）；`Inbox` 在输入框上方列出 steer/follow-up。

**关键流程。** 1) `getDraft(id)` 取/建草稿，`useSyncExternalStore` 订阅；挂载时从 localStorage 同步一次。2) `update(value)` 写 `text` 与 `revision`，空值删键。3) `send(whenBusy?)`：守卫 loading/empty/blocked/sending/`pending`/无 id；`mode = busy ? whenBusy ?? 'steer' : undefined`；忙碌 steer 先 `withdrawQueuedSteer`，有旧 steer 就 `mergedSteer`；emit `ultimate:sent`；`api.submit(text.trim(), mode, id, images)`。4) 成功用 `clearDraft(snapshot)`：`revision` 变了就不覆盖用户新输入；localStorage 已被别的标签改写则保留存储值。5) 失败把文本从 localStorage 恢复（revision 未变时），被合并的旧 steer 以 `mergedSteer` 放回草稿并前置图片，错误显示在状态行。6) ↑ 首行且无 target：`recallQueued`（steer 先、follow-up 后）逐条 `cancelSubmission`，`recalledText` 拼回编辑器。7) Stop 调 `api.abort(id)`，失败显示在草稿错误。

**失败与恢复。** 队列项已被 run 取走时 `cancelSubmission` 返回 409，`withdrawQueuedSteer`/`recallQueued` 把它当作 `undefined` 跳过（已出现在转录里，不重复）。图片超限或类型不符给固定错误文案。`blockedBy` 在无模型或模型不可用时给 `provider/model is not available…` 并禁用发送。`ComposerRedirect` 目标带图片时拒绝发送（“Images stay here”）。

**关掉它会发生什么。** 用户无法输入或发送；转录只能只读浏览，队列无法召回或取消，Stop 也不可用。

**复刻要点。** 草稿按会话隔离，且发送期间新输入不能被清空（`revision` 守卫）；`pending` 是图片读取中的 ref，不是 state；忙碌默认 steer、Alt 变 follow-up 的语义要与服务端 `SubmitRequest.whenBusy` 对齐；`data-composer-target` 是键盘作用域识别的锚点；`fillComposer`/`insertIntoComposer` 必须走同一草稿存储，才能被命令和扩展复用。

**证据。** `composer.tsx:75-140,143-151,153-173,184-237,249-348,350-440`；`queued.ts:14-113`；`image-paste.tsx:11-118`；`shared/protocol.ts:13-15`（图片限制）。

### 2.4 标题栏 TitleBar

**职责与用户可见行为。** 每个 surface 顶部的全局条：ULTIMATE 字标、项目 chip（项目名/分支 checkout/预览标记）、桌面 surface 标签、移动端 surface 下拉、平板上的常用 panel 图标、右侧 slot 与命令面板入口。它让用户随时知道“在哪个项目、哪个 surface”，并一键切换。

**导出与契约。** `projectTitle`、`projectName`、`ProjectChip`、`Wordmark`、`TitleBar`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 上述组件/函数，`ProjectChip` 供扩展替换 `titlebar.project`。**apis needed：** `surfaceItems`、`panelItems`、`shownPanels`、`slotItems`、`actions.showSurface/openPanel/closePanel`、`useUiState(shellKeys.panel)`、`useRegionOpen`、`useViewport`、`HOME`、`Shortcut`。**settings keys：** 读 `shell.panel`；surface 选择经 `actions.showSurface` 写 `shell.surface`。

**状态与持久化。** 自身无持久状态；`shell.panel` 记住上次面板；surface 选择由 `shell.surface` 持久化；`SystemInfo` 来自流。

**UI 位置。** 全窗口顶部（嵌入时隐藏）；`titlebar.brand`、`titlebar.project`、`titlebar.left`、`titlebar.right` 四个 slot；移动端是 surface 下拉，`md` 以上是标签行；`PanelActions` 仅 `tablet` 且 `HOME` surface 显示。

**关键流程。** 1) `Brand` 在桌面渲染 `titlebar.brand` slot 或 `Wordmark`，在手机把 wordmark 变成 surface 下拉触发器。2) `Project` 有 `titlebar.project` slot 就整体替换，否则 `ProjectChip`。3) `SurfaceItems` 遍历 `surfaceItems`，当前项 `aria-current="page"`，前 9 个 tooltip 带 `mod+1…9`。4) `PanelActions` 按 `quickPanels = ['todos','tasks','activity','info']` 分快按钮与 `⋯` 菜单，点击打开/关闭 panel。5) 右侧渲染 `titlebar.right`、平板 panel 动作、两个响应式命令按钮（宽屏 “commands” + `mod+k`，窄屏图标）。

**失败与恢复。** 无 `SystemInfo` 时 chip 返回 null，不阻塞标题栏；worktree 路径不匹配时退回 `shortenPath(project.root)`；持久化目录不在 `~/.ultimate/projects` 下时显示 `preview ·`；没有 surface 时 `SurfaceItems` 为空，仍可用命令面板。

**关掉它会发生什么。** 失去项目标识、surface 标签/下拉和平板 panel 快捷入口；surface 仍可经 `mod+1…9` 与命令面板切换。

**复刻要点。** `projectTitle` 的 worktree 正则 `\/\.ultimate\/projects\/(.+)-[\da-f]{8}\/worktrees\/(\d+)$` 与 `projectName` 的“自身仓库不显示名字”规则要一致；左侧品牌块 `md:w-72` 必须与 Agent 侧栏宽度同步，否则 surface 标签会漂移；`quickPanels` 是产品约定，不是通用推导。

**证据。** `titlebar.tsx:32-58,65-116,122-217,220-259,262-338,345-389`。

### 2.5 命令面板 Palette

**职责与用户可见行为。** `mod+k` 打开的可搜索命令列表：core 命令、每个 surface 的切换命令、所有扩展命令按组展示；选中后关闭面板并执行。当前 surface 的切换命令和“打开命令面板”自身会被隐藏，避免无操作项。

**导出与契约。** `Shortcut`、`CommandPalette`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 上述组件。**apis needed：** `useCommands`（`allCommands`）、`applies`、`currentContext`、`actions.runCommand`、`store.setUi`、`formatKeys`、`Kbd/KbdGroup`、cmdk 的 `CommandDialog`。**settings keys：** 无；`paletteOpen` 只在内存 store。

**状态与持久化。** `state.ui.paletteOpen` 是易失状态，刷新即关；没有 localStorage/doc 写入。

**UI 位置。** 全局模态对话框（`top-[18%]`、`sm:max-w-xl`），不是 slot/panel；每个命令显示标题和可选快捷键。

**关键流程。** 1) 读取 `open`、`commands`、`context = currentContext()`。2) `hidden = {'ultimate.palette', 'ultimate.surface.<当前 surface>'}`；关闭时不计算可见项。3) `visible` 过滤 `applies(command, context)`；`Map.groupBy(command.group ?? command.extension)` 分组。4) `CommandItem` 的 `keywords` 是 `[id, extension]`，`value` 是 `title + id`。5) 选中后先 `store.setUi({paletteOpen:false})`，再 `actions.runCommand(id)`；命令失败由 `runCommand` 转 notice。

**失败与恢复。** `when` 抛错时 `applies` 隐藏该命令并发一次 notice（`extension … command … is hidden, its when() threw`）；`run` 的 Promise 拒绝显示 `标题 (扩展): 错误`；无匹配显示 “No matching command.”。

**关掉它会发生什么。** 失去可搜索命令入口；快捷键和标题栏/面板按钮仍可执行部分命令。

**复刻要点。** 隐藏“当前 surface”要用渲染时的 `context.surface`；命令组缺省是扩展名；`value` 同时含 title 与 id 才能按 id 搜到；关闭面板要先于 `run`，否则命令打开的新对话框会被面板抢焦点。

**证据。** `palette.tsx:17-29,32-82`；`actions.ts:177-218`（命令来源，SDK 范围）。

### 2.6 键盘 Keyboard

**职责与用户可见行为。** 全局捕获键盘：支持 `mod+shift+m` 这类和弦与 `mod+k m` 这类序列；序列首和弦先执行自己的命令（如打开面板），1.2 秒内可继续第二键；输入框里普通键不误触，带修饰键的快捷键仍可用；`whileTyping` 命令（Escape、Shift+Tab）只在 composer 生效且对话框打开时禁用；在 `ConversationScope` 内按键会作用于该会话。

**导出与契约。** `useShortcuts`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 全局 keydown 监听 hook。**apis needed：** `allCommands`、`parseKeys`、`chordOf`、`applies`、`currentContext`、`scopeOf`、`runCommand`、`CommandItem`。**settings keys：** 无。

**状态与持久化。** 闭包内 `pending: string[]` 与 `timer`（1200ms），只存在于本次挂载；无持久化。

**UI 位置。** 不可见；`Shortcuts` 组件在 `App` 内挂载，仅在 `loaded` 后启用。

**关键流程。** 1) window `keydown` 捕获阶段；忽略 `defaultPrevented`、`isComposing`、纯修饰键。2) `chord = chordOf(event)`，`sequence = [...pending, chord]`。3) 候选 = 所有 `keys` 存在且 `applies` 的命令，解析成 chord 数组。4) 判定 `typing`（INPUT/TEXTAREA/SELECT/contentEditable）、`composer`（`textarea[data-composer-target]`）、`emptyPalette`（面板打开且输入框为空）、`dialogOpen`（`[role=dialog]`）。5) `exact` 命中且 `allowed` 则 `preventDefault`；序列第二键先关面板，再 `runCommand(id, context)`。6) `longer` 候选存在则保留 `pending` 并重置 1.2s 计时；`exact` 命中时也保留，以支持“执行后继续序列”。

**失败与恢复。** 没有匹配则完全不干预；`when` 抛错由 `applies` 隐藏并报一次；对话框打开时 `whileTyping` 命令不执行；取消挂载清 timer 并移除监听。

**关掉它会发生什么。** 所有键盘快捷键失效；命令面板、标题栏按钮和面板图标仍可完成大部分操作，但 Escape/Shift+Tab 等 composer 内快捷行为消失。

**复刻要点。** 必须用捕获阶段，才能在 Radix 对话框/输入框之前判定；`chordOf` 用 `event.code` 归一字母/数字键，避免 Shift 改变字符；序列超时和 `pending` 清理要在同一处；`whileTyping` 只允许 composer 的 textarea，不允许任意输入框。

**证据。** `keyboard.ts:8-79`；`keys.ts:1-45`（SDK 范围）。

### 2.7 表面原语与故障边界 Primitives

**职责与用户可见行为。** 给 surface 作者一组稳定积木：`StatusLine`（左右 slot、手机收纳）、`Conversation`（transcript + composer + overlay）、`Sidebar`（左栏/手机覆盖层）、`Panels`（右栏 tab、溢出菜单）、`Dock`（可折叠可拖拽侧区）、`Header`（侧栏/面板开关、面包屑、`header.right`）、`Slot`/`Provided`/`ExtensionBoundary`/`ErrorCard`/`ExtensionErrors`。用户看到的是：响应式布局、可拖宽的 dock、单个扩展组件崩溃只坏一张卡、面板 tab 自动收纳。

**导出与契约。** `primitives.tsx` 导出 `StatusLine`、`Conversation`、`sidebarWidth`、`sidebarWidthBeyondPhone`、`Sidebar`、`Panels`、`Dock`，并 re-export `Header`、`Slot`；`header.tsx` 导出 `IconButton`、`Header`；`boundary.tsx` 导出 `ErrorCard`、`ExtensionBoundary`、`Provided`、`AllProvided`、`Slot`、`ExtensionErrors`；`layout.ts` 导出 `column`；`surface.ts` 导出 `SurfaceContext`、`useSurfaceId`、`useRegion`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 上述组件；`@/sdk` barrel 把 `Conversation/Dock/Header/Panels/Sidebar/Slot/StatusLine` 暴露给扩展。**apis needed：** `panelItems`、`shownPanels`、`slotItems`、`layout.mount`、`useRegionOpen`、`actions.openPanel/closePanel/togglePanel/toggleSidebar`、`useUiState`、`useViewport`、`overlays`、`provisionsOf/provisionOf`。**settings keys：** `shell.panel`、`shell.panelOpen`、`shell.sidebarOpen`、`shell.dock.<surface>.<side>`。

**状态与持久化。** `shell.panel` 记住选中 tab；桌面 `shell.panelOpen`/`shell.sidebarOpen` 共享，窄屏 `state.ui.open[viewport]` 只在本标签；dock 状态 `{open,width}` 按 surface+side 持久化；`layout` 的 region 计数只在内存，决定 Header 是否显示开关。

**UI 位置。** 16 个 `SlotName` 中核心宿主 `sidebar`、`titlebar.*`、`header.right`、`statusline.left/right`、`composer.toolbar/status/actions`、`conversation.overlay`、`transcript.start/end`、`overlay`；`sidebar.top` 不在核心宿主，由 sidebar 扩展在自己的 `sidebar` 内容里渲染（推断自 `extensions/sidebar/sidebar.tsx:556`，范围外）。`Panels` 是右栏，`Dock` 是任意 surface 可用的侧区。

**关键流程。** 1) `Sidebar`/`Panels` 用 `useMountRegion` 在 layout 中登记；`Header` 据此决定是否显示 `mod+b`/`mod+alt+b` 开关。2) `Sidebar` 空 slot 返回 null；`overlays('sidebar', viewport)` 为真时用 `Overlay`（85% 宽、最大 26rem、点击遮罩/侧滑 >64px 关闭、`inert`）。3) `Panels` 用 `shownPanels` 选 active；`PanelTabs` 在隐藏测量行里比较 label/icon 宽度，先让非当前 tab 只显示图标，再溢出到 `⋯`。4) `Dock` 读持久 `{open,width}`，宽度 `clamp(280, window.innerWidth-360)`，拖动内边分隔条写回，双击重置 416；折叠成 40px 轨道并显示 busy 点。5) `Provided` 取最后一个 provider，`AllProvided` 按发现顺序串起来；每个 contribution 都在 `ExtensionBoundary` 内，错误显示 inline 卡并回退。

**失败与恢复。** `ExtensionErrors` 在右下角列出所有加载失败的 facet，显示 `extensions/<name>/web.tsx`（builtin 用 `system.code.ultimateRoot`，否则项目根）并标明 “previous version still running”/“not loaded”。`ExtensionBoundary` 按 `version` 重置；`ErrorCard` 有 `inline`/`block` 两种。`Panels` 的每个 tab 以 `extension:id` 为 key，错误不会串到别的 panel。

**关掉它会发生什么。** surface 作者没有布局原语，Agent 等 surface 无法组合；`Slot` 不渲染任何扩展贡献，Header 也不显示侧栏/面板开关。

**复刻要点。** `layout.mount` 必须在 `useLayoutEffect` 中登记/释放，首帧就决定 Header 是否出现；`PanelTabs` 的测量行要 `invisible absolute w-max`，否则会撑开布局；`Dock` 的宽度上限要留 360px 给主区；`Overlay` 的 `inert` 不能省，否则键盘/读屏会穿透；`StatusLine` 的 `phone` 过滤是“true 才留在线上”，未标记项默认进 `⋯`。

**证据。** `primitives.tsx:37-61,64-86,92-100,103-177,184-206,223-344,347-389,402-497`；`header.tsx:23-58,60-128,134-162`；`boundary.tsx:11-57,64-106,113-142,148-186,200-223,226-260`；`surface.ts:6-12`；`layout.ts:1-3`。

### 2.8 AI 组件与 UI 套件

**职责与用户可见行为。** 提供消息/转录的展示基元：Markdown 流式渲染、代码高亮、思考折叠、工具卡、图片放大、Shimmer 加载文案、自动增高输入框；以及全站 UI 套件（按钮、对话框、下拉、popover、tooltip、checkbox、switch、command、kbd、collapsible、rows、skeleton、JSON tree）。用户看到的是统一的排版、状态色和交互手感。

**导出与契约。** `components/ai/conversation.tsx` 导出 `Conversation`、`ConversationContent`、`ConversationEmptyState`、`ConversationScrollButton`；`message.tsx` 导出 `MessageProps`、`Message`、`MessageContent`、`MentionText`、`MessageResponse`；`reasoning.tsx` 导出 `ReasoningProps`、`Reasoning`、`ReasoningTriggerProps`、`ReasoningTrigger`、`ReasoningContentProps`、`ReasoningContent`；`shimmer.tsx` 导出 `ShimmerProps`、`Shimmer`；`tool.tsx` 导出 `ToolState`、`Tool`、`ToolStatusIcon`、`ToolHeaderProps`、`ToolHeader`、`ToolContent`、`ToolSection`、`ToolInput`、`ToolOutput`、`ToolDiagnostics`、`ToolImage`、`ToolImages`；`code-block.tsx` 导出 `codePlugin`、`BundledLanguage`、`languageFromPath`、`CodeBlockProps`、`CodeBlock`；`ansi-output.tsx` 导出 `AnsiOutput`；`mentions.ts` 导出 `mentionPattern`、`mentionHref`、`parseMention`、`splitMentions`、`remarkMentions`；`prompt-input.tsx` 导出 `PromptInput`、`PromptInputTextareaProps`、`PromptInputTextarea`、`PromptInputFooter`、`PromptInputTools`、`PromptInputSubmitProps`、`PromptInputSubmit`。UI 套件：`Button/buttonVariants`、`Checkbox`、`Collapsible/CollapsibleTrigger/CollapsibleContent`、`Command/CommandDialog/CommandInput/CommandList/CommandEmpty/CommandGroup/CommandItem/CommandShortcut`、`Dialog/DialogContent/DialogDescription/DialogHeader/DialogTitle/DialogTrigger`、`DropdownMenu/DropdownMenuTrigger/DropdownMenuContent/DropdownMenuLabel/DropdownMenuItem/DropdownMenuRadioGroup/DropdownMenuRadioItem`、`Kbd/KbdGroup`、`Popover/PopoverTrigger/PopoverContent`、`Rows/Row`、`Skeleton`、`Switch`、`Tooltip/TooltipTrigger/TooltipContent/TooltipProvider`、`JsonTree`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 上述组件。**apis needed：** `linkRenderers`（`message.tsx` 的 `Link`）、`ExtensionBoundary`、`useExtensions`、`Streamdown`、`@streamdown/code`、`ansi_up`、`cmdk`、`radix-ui`。**settings keys：** 无。

**状态与持久化。** 基本无持久状态；`Collapsible` 的 `open` 可由调用方受控或内部 `useState`；`CodeBlock` 的 Shiki 高亮结果缓存在 `useTokens` 的 state 中，仅保留同语言上一次结果；`JsonTree` 的展开状态只在组件内。无 doc/SQLite/localStorage。

**UI 位置。** `components/ai/*` 被 transcript、composer 与扩展的卡片使用；`components/ui/*` 被所有 shell/扩展组件使用。`CommandDialog` 是命令面板的外壳，`Dialog` 也用于图片放大。

**关键流程。** 1) `MessageResponse` 用 `Streamdown` 渲染 Markdown，`remarkMentions` 把 `#123`/`#123/456` 改写成 `#conversation-123[-456]` 链接，`Link` 再交给 `linkRenderers` 逐层包裹；`mentionHref` 是裸 fragment，避免 Streamdown 的相对链接拦截。2) `codePlugin = createCodePlugin({themes:['vitesse-light','vitesse-dark']})`，`useTokens` 异步高亮并保留旧结果，`CodeBlock` 支持 `startLine`/`showLineNumbers`/`caret`。3) `Tool` 的 `ToolState` 六态映射 label/icon：`streaming→writing call`、`pending→queued`、`running→running`、`done→done`、`error→failed`、`interrupted→interrupted`；`ToolHeader` 的 `action` 放在 trigger 外，避免按钮嵌套。4) `AnsiOutput` 先用控制序列正则过滤（只保留数字 SGR），再 `ansi_up` + `escape_html = true`，最后 `dangerouslySetInnerHTML`。5) `PromptInputTextarea` 用 `useLayoutEffect` 把 height 设为 `min(scrollHeight, 320)`。6) `Collapsible` 是自研替代 Radix：关闭时 `CollapsibleContent` 返回 null，不做高度测量/动画，避免长转录打开卡死。

**失败与恢复。** `languageFromPath` 对未知扩展名返回 `text`；`MessageResponse` 用 `memo` 比较 `children` 与 `isAnimating`；`Link` 对 `streamdown:incomplete-link` 直接返回 core；`ToolOutput` 只渲染有内容的结果；`ToolImage` 点击才打开大图。`Collapsible` 在缺少 provider 时抛出明确错误。ANSI 注入只允许库生成的转义 HTML。

**关掉它会发生什么。** 转录退化为纯文本/无高亮，composer 没有输入框与按钮，所有对话框/下拉/提示失去统一行为；扩展的卡片也无法复用这些基元。

**复刻要点。** Streamdown 的 `controls` 明确关闭 table/mermaid/download，只留代码复制；Shiki 双主题靠 `.dark .shiki span[style*='--shiki-dark']`；`ToolImage` 的 dialog 必须给 `DialogTitle`（可 `sr-only`）以满足可访问性；`Collapsible` 不要换回 Radix 默认实现，否则长会话会卡；`PromptInputTextarea` 的 16px 触摸字号由 CSS 统一覆盖。

**证据。** `conversation.tsx:10-76`；`message.tsx:15-106`；`reasoning.tsx:15-63`；`shimmer.tsx:14-35`；`tool.tsx:18-217`；`code-block.tsx:11-157`；`ansi-output.tsx:4-16`；`mentions.ts:6-62`；`prompt-input.tsx:9-86`；`components/ui/*`（button/collapsible/command/dialog/dropdown-menu/kbd/popover/rows/skeleton/switch/tooltip/checkbox）；`json-tree.tsx:83-97`。

### 2.9 视觉与主题 Styling

**职责与用户可见行为。** 全站视觉的唯一来源：深色默认、浅色完整的 OKLCH token；Inter/JetBrains Mono 字体栈；品牌紫 `--brand` 与 success/warning/error/diff/terminal 语义色；Tailwind v4 的 `@theme inline` 映射；safe-area、触屏字号、滚动条、Shiki 暗色、`prefers-reduced-motion`、Markdown 与转录正文的排版。用户可见的是明暗切换即时生效、移动端不被刘海/圆角遮挡、代码块和消息正文密度不同。

**导出与契约。** 无 JS 导出；CSS 契约是 token 名（`--background`、`--foreground`、`--brand`、`--success`、`--warning`、`--note`、`--error`、`--diff-add`、`--diff-del`、`--terminal`、`--sidebar-*`、`--radius`）与动画名（`--animate-shimmer`、`--animate-pulse-dot`、`--animate-fade-in`、`--animate-sweep`）。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** Tailwind utilities 与 `.markdown`/`.safe-area`/`.status-line` 类。**apis needed：** 无。**settings keys：** `localStorage['ultimate.theme']`（读与写）。

**状态与持久化。** 主题是浏览器偏好：`client.ts` 启动时读 `ultimate.theme`，每次 store 变化写回并把 `html.dark` 与 `meta[name=theme-color]` 同步为 `#111112`/`#f9fafb`；无 doc/SQLite。其余 token 是静态 CSS。

**UI 位置。** 全局；`body`、`html`、所有 surface、扩展 `web.tsx` 的 class 都受影响。

**关键流程。** 1) `index.html` 先给 `<html class="dark">`，内联脚本若 `ultimate.theme === 'light'` 则移除 `dark` 并改 theme-color。2) 加载 `index.css`：`@import 'tailwindcss'`、`@import '@fontsource-variable/inter'`、`@source '../../extensions'` 与 streamdown 包，确保扩展 class 被扫描。3) `:root` 与 `.dark` 定义 token；`@theme inline` 映射成 `--color-*`，生成 `bg-background`、`text-brand` 等工具类。4) 用户执行主题命令 → `actions.setTheme` → `store.ui.theme` → `client.ts` 切 class/写 localStorage。5) `.safe-area` 用 `100dvh` + `env(safe-area-inset-*)`；输入聚焦时把底部 inset 置 0，避免键盘上方留缝。

**失败与恢复。** 缺少某个 `--color-*` 映射时对应 utility 不生成（构建期问题，不是运行时回退）；浅色 token 是完整的一套，不会出现“深色变量漏到浅色”；`prefers-reduced-motion` 全局禁用动画/过渡；触摸设备强制输入控件 16px，避免 iOS 聚焦缩放。

**关掉它会发生什么。** 页面退化为无样式 HTML；布局、主题、safe-area、Markdown 密度全部丢失，但 React 结构仍可运行。

**复刻要点。** 必须保留 `@custom-variant dark (&:where(.dark, .dark *))`，否则 `dark:` 工具类不匹配；`.markdown` 与 `[role='log']` 的规则是 unlayered，才能压过 Streamdown 自带 utility；`--animate-sweep` 的 Skeleton 背景固定 viewport，祖先不能有 transform/filter；`--radius` 参与的 `--radius-sm/md/lg/xl` 映射不要漏；浅色主题不是简单反色，OKLCH 亮度/彩度需照抄。

**证据。** `index.css:1-9,16-91,93-170,172-231,233-240,246-307,313-369`；`index.html:2,9,17,19-33`；`client.ts:98-104`（SDK 范围）。

### 2.10 PWA 与启动

**职责与用户可见行为。** 把 SPA 做成可安装的独立窗口应用，并在 JS 加载前按上次主题上色、用 `sessionStorage` 快照覆盖刷新，避免白屏/闪屏。

**导出与契约。** `main.tsx` 无导出，副作用为 `store.start()`、`loadExtensions()`、`createRoot(#app).render(<App/>)`；`index.html` 提供 `#app` 与内联主题/resume 脚本；`manifest.webmanifest` 是静态 JSON。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 无。**apis needed：** `App`、`store`、`loadExtensions`、`rendered()`（范围外）。**settings keys：** `sessionStorage['ultimate.resume']`、`localStorage['ultimate.theme']`。

**状态与持久化。** `ultimate.resume` 存 `{at,html,css}`，只接受 30 秒内快照，`rendered()` 后静默 120ms/最多 700ms 淡出并删除；`pagehide` 写入，超配额删除。无 SQLite/doc；manifest 与图标静态。

**UI 位置。** 文档级 `<html>`/`<head>` meta、`#app`、`#resume`；不属于 slot/surface。

**关键流程。** 1) `index.html` 设置 `class="dark"`、`viewport-fit=cover`、`interactive-widget=resizes-content`、manifest、apple-touch-icon、apple-mobile-web-app-*、theme-color。2) 内联主题脚本按 `ultimate.theme` 移除 `dark` 并改 meta。3) 30 秒内有快照则建 `#resume`（fixed/inset 0/最高 z-index/`inert`），注入 HTML/CSS 并恢复 `data-resume-scroll`。4) `main.tsx` 建立 SSE、装载 facets、渲染 `<App/>`。5) App 在 `loaded && !pending && viewed` 后 `rendered()`，resume 淡出。6) manifest 声明 `Ultimate`、`standalone`、`#111112` 与 192/512/maskable 图标。

**失败与恢复。** 快照过期/缺失不覆盖；配额失败删快照；8 秒兜底移除覆盖。无 service worker，离线缓存不在实现内（推断：只保证安装与独立窗口）；iOS 用 `black` 以免启动 viewport 少一个状态栏高度。

**关掉它会发生什么。** 仍是普通网页，但无安装入口、独立窗口、主题色同步和刷新快照，首屏可能白闪。

**复刻要点。** 内联脚本必须在 module 前且不依赖 React；`#resume` 要 `inert`，只保存视口内节点（视口外留等尺寸空白），否则长转录撑爆存储；`viewport-fit=cover` 必须配 `.safe-area`。

**证据。** `index.html:2-18,19-33,37-64,65`；`manifest.webmanifest:1-19`；`main.tsx:1-15`；`index.css:187-206`。

## 3. 跨扩展协作

- **App ↔ registry/surfaces：** `App` 通过 `surfaceItems` 取所有 `surfaces` 贡献，`resolveSurface` 决定实际 surface；Agent surface（`extensions/agent/web.tsx`，范围外）用 `Sidebar`、`Header`、`Conversation`、`Panels`、`StatusLine` 组合出主界面。`App` 用 `SurfaceContext` 告诉 `Dock` 自己的 surface id，用 `ExtensionNameContext` 让 `useExtensionUiState` 自动加前缀。
- **Slot 总线：** 所有 `slots` 贡献由 `Slot` 渲染；16 个 `SlotName` 覆盖 `titlebar.*`、`header.right`、`statusline.*`、`composer.*`、`conversation.overlay`、`transcript.start/end`、`overlay`、`sidebar`、`sidebar.top`。`sidebar.top` 由 sidebar 扩展在自己的 `sidebar` 内容里二次分发（`extensions/sidebar/sidebar.tsx:556`），核心不直接消费。
- **Point 总线：** `Provided`/`AllProvided` 取最后一个/全部 provider。核心消费四个内置 point：`ConversationKind`（标题栏的会话类型）、`MessageReference`（消息复制引用）、`ParkedRuns`（暂停态）、`RunStart`（工作计时起点）。
- **Transcript ↔ 扩展：** `entryRenderers(kind)`、`toolRenderers(name)`、`toolLine(name)`、`messageItems('answerLabels'|'messageDetails'|'messageActions'|'userBubble')`、`compact`/`intro`、`linkRenderers` 都是扩展插入点；`composerRenderers` 按发现顺序包裹 composer，`inboxRenderer` 取最后一个。
- **事件：** `ultimate:sent {conversationId}` 由 composer、todos、update 等发出，transcript 收到后在同会话立即回底；`ultimate:reveal-entry {conversationId, entryId}` 由 messages/subagents 等发出，transcript 负责补历史、展开折叠组并滚动定位。
- **命令：** `allCommands` = 核心 `ultimate.palette`/`ultimate.panel`/`ultimate.sidebar` + 每个 surface 的 `ultimate.surface.<id>`（前九个带 `mod+1…9`）+ 扩展 `commands`；Palette 与 Keyboard 共用这一张表，`group` 决定面板分组，`when`/`whileTyping` 决定可用性。
- **主题：** core-tier 的 `theme` 扩展（范围外）提供“Toggle light and dark theme”命令，调用 `actions.setTheme`；`store.ui.theme` 驱动 `client.ts` 的 class/localStorage，样式来自本组 `index.css`。
- **导航：** `actions.switchConversation`/`showSurface`/`openPanel`/`toggleSidebar` 被 titlebar、palette、keyboard、sidebar、消息卡片共用；它们先关掉覆盖层再写 `shell.*`，所以“去哪里”总是让对话可见。

## 4. 复刻顺序建议与风险

**顺序。** 1) 先做 `index.css` 的 token/Tailwind 基座与 `components/ui`、`components/ai` 的纯组件（无契约、可独立验收）。2) 再做 `boundary.tsx` + `surface.ts` + `layout.ts`（错误隔离与上下文是后面一切的地基）。3) 做 `primitives.tsx` + `header.tsx`（slot/panel/dock/statusline 宿主），用假贡献表验收响应式。4) 做 `App.tsx` + `main.tsx`（ready/surface 回退/标题/overlay）。5) 做 transcript 家族（`model.ts` → `compact.ts`/`fold.tsx`/`follow.ts`/`fork.ts` → `transcript.tsx`），这是工作量和风险最大的一块。6) 做 `composer.tsx` + `queued.ts` + `image-paste.tsx`。7) 做 `titlebar.tsx`、`palette.tsx`、`keyboard.ts`。8) 最后补 `index.html`/manifest/resume 的 PWA 与首屏细节。

**风险。**

- **契约漂移：** slot 名、point 名、renderer 的包裹顺序、`inbox` 取最后一个、`surfaces`/`commands` 后者胜 id，任何一处不一致都会让扩展“静默不显示”。复刻时先冻结 `web/src/sdk/types.ts`/`registry.ts` 的语义。
- **转录分页与锚点：** `windowKey`、`windowGaps`、`reachedFork`、`tailSpace`、`anchorSelector` 共同保证“加载更早历史时视口不跳”；少一个就会在长会话/压缩/fork 场景抖动或丢行。
- **滚动跟随：** `use-stick-to-bottom` 的 `isAtBottom`、`readerLeft`、`overflow-anchor` 三者互相影响；把 `overflow-anchor` 一律关掉或一律开着都会破坏“上滚不被拉回”。
- **React 版本耦合：** 代码使用 React 19 的 `<Context value>` 简写、`useEffectEvent`、`ref` 作为 prop、`useSyncExternalStore` 选择器；移植到 React 18 需要改写，否则编译或行为不一致。
- **持久化键：** `shell.surface`/`shell.shownSurface`/`shell.panel`/`shell.panelOpen`/`shell.sidebarOpen`/`shell.dock.<surface>.<side>`、`ultimate.draft.<id>`、`ultimate.fold.<conversation>.<card>`、`ultimate.theme`、`ultimate.resume` 都是隐式协议；改名会造成“设置丢失”而非报错。
- **移动端/PWA：** 768/1024 断点、`pointer: coarse`、`safe-area`、standalone 下 `.status-line` 的负 margin、`interactive-widget` 必须一起验；只测桌面会把手机布局做坏。
- **性能：** `EntryView` 的 `sameRow`、`useNow(100)` 只在 retry/idle 时启用、Shiki 旧结果保留、`content-visibility` 与 resume 快照；任何“每次流事件重渲染整棵转录”的实现都会在长会话卡死。
- **安全：** `AnsiOutput` 的 `dangerouslySetInnerHTML` 依赖 `ansi_up` 的 `escape_html` 与控制序列过滤；`index.html` 的 resume 直接注入同源 `sessionStorage` 的 HTML，必须保证只来自本应用（推断：同源脚本本已可执行，但不要把外部内容写进该键）。
- **范围事实：** 本组没有 README，产品语义是从组件行为与既有 `09-web-shell`/`platform-web-sdk` 反推的；`sidebar.top`、主题命令、Agent surface 组合属于范围外扩展，复刻时应以 `extensions/README.md` 与对应扩展 README 复核。
