# Browser SDK（platform-web-sdk）分析笔记

> 范围说明：`web/src/sdk/`（16 个文件）、`web/src/extensions.ts`、`web/src/web-facets.d.ts` 均无 README.md。产品语义按 `web/src/sdk/index.ts:1-4` 指向的 `extensions/README.md` web facet 章节校准；实现断言以本组源码为准，超出本组路径的事实注明"范围外"。下文 `sdk/foo.ts` 与裸 `foo.ts` 均指 `web/src/sdk/foo.ts`。

## 1. 概览

这一组是 web core 的运行时底座，不是扩展包：把服务端单一 SSE 流变成 React 可读的会话副本，把 `extensions/*/web.tsx` 的默认导出装成经校验、可热替换的贡献表，并提供 hooks、全局动作、HTTP action 客户端、事件总线、重载恢复、跨标签 UI 状态、断点与测试钩子。它本身不渲染界面，但没有它，surface/panel/tool renderer/命令都无处挂载。

| 名称                  | 一句话职责                                          | 服务端入口                                                                                                                                                                 | 浏览器入口                                                   | 是否 core tier     |
| --------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ |
| store                 | 主 SSE 流与当前会话副本，另管按会话/文档的附加流    | `GET /api/events`、`GET /api/models`                                                                                                                                       | `sdk/store.ts`（`createStore`，`client.ts:33` 单例）         | 不适用（web core） |
| api                   | 对话命令与扩展 action 的 HTTP 客户端                | `/api/conversations/:id/{submit,history,abort,inbox/:sid/cancel,configure,compact}`、`/api/conversations`、`/api/restart`、`/api/extensions/:ext/actions/:name`、`/api/ui` | `sdk/api.ts`（`createApi`，`client.ts:43`）                  | 不适用（web core） |
| registry              | 加载/校验 web facets，维护就绪态与贡献索引          | 无                                                                                                                                                                         | `sdk/registry.ts`（`createRegistry`，`client.ts:60`）        | 不适用（web core） |
| hooks                 | 把 store/registry/ui-state 绑成 React hooks         | 经 store 的 SSE                                                                                                                                                            | `sdk/hooks.ts`，`index.ts:81-114`                            | 不适用（web core） |
| actions               | 全局导航、面板/侧栏、命令执行与 shell 命令表        | 经 ui-state 写 `/api/ui`                                                                                                                                                   | `sdk/actions.ts`                                             | 不适用（web core） |
| ui-state              | 跨标签/设备的持久 UI 状态，带乐观写与 revision 对账 | `POST /api/ui`；根文档 `ultimate.ui`                                                                                                                                       | `sdk/ui-state.ts`（`client.ts:50`）                          | 不适用（web core） |
| events                | 浏览器内事件总线与 `useEvent`                       | 无                                                                                                                                                                         | `sdk/events.ts`                                              | 不适用（web core） |
| resume                | 重载时先画 `sessionStorage` 快照再淡出              | 无（`index.html` 读取）                                                                                                                                                    | `sdk/resume.ts`                                              | 不适用（web core） |
| viewport              | 768/1024px 断点与覆盖/停靠判断                      | 无                                                                                                                                                                         | `sdk/viewport.ts`                                            | 不适用（web core） |
| test-hook             | `window.ultimate`：发消息、等状态                   | 经 `api.submit` 与根事件 feed                                                                                                                                              | `sdk/test-hook.ts`（`client.ts:58`）                         | 不适用（web core） |
| client                | 组合根：单例、URL↔选择、主题、进程换代、兜底        | 经 store 的 SSE                                                                                                                                                            | `sdk/client.ts`                                              | 不适用（web core） |
| types / index         | 贡献契约、slot/point/action 类型与公共导出面        | 无                                                                                                                                                                         | `sdk/types.ts`、`sdk/index.ts`                               | 不适用（web core） |
| format / keys / scope | 数值与时间格式、快捷键解析、多会话作用域            | 无                                                                                                                                                                         | `sdk/format.ts`、`sdk/keys.ts`、`sdk/conversation-scope.tsx` | 不适用（web core） |
| extensions loader     | 把 Vite 的 facet 映射交给 registry 并接 HMR         | `virtual:ultimate/web-facets`                                                                                                                                              | `web/src/extensions.ts`、`web-facets.d.ts`                   | 不适用（web core） |

这些单元不是扩展包，没有扩展的 `api.ts`/`tier` 导出，不参与 core-tier 判定；它们随 web 产物加载，不能被扩展设置关闭（推断：web 入口不读扩展开关）。

## 2. 逐扩展规格

### 2.1 store

**职责与用户可见行为。** 页面主 SSE 流与"请求的会话"副本（快照加 ops），另为 `ConversationScope` 保留的会话和文档 watch 开附加流。用户可见：切会话先用缓存副本秒开再刷新、断线重连、目标会话不存在时回退根会话、通知与任务图实时更新。

**导出与契约。** `createStore(options: StoreOptions)`，类型 `Store`、`State`、`Connection`、`UiState`、`EventSourceLike`、`StoreOptions`。**tools/actions/docs/reactors：无**；**events：** 消费 `system`、`conversations`、`view`、`ops`、`ui`、`uiOps`、`doc`、`docOps`、`tasks`、`notice`；**apis provided：** `getState`、`subscribe`、`start`/`stop`、`show`、`watchConversation`、`watchDoc`、`watchDocOf`、`refreshModels`、`setUi`、`notify`、`dismissNotice`；**needed：** 可注入的 `EventSource`/`fetch`。**settings keys：** 无。

**状态与持久化。** 全内存 `State`：`connection`、`requested`、`view`、`restored`、`viewsOf`、`docs`、`docsOf`、`shared`、`system`、`conversations`、`tasks`、`models`、`notices`、`ui`（`store.ts:33-55`）。`recent` 只留最近 6 个会话的副本及原始快照文本（`:136-147`），`notices` 最多 50 条（`:200-206`）；无 SQLite/文件写入，会话状态从 `view.docs` 的 `pi.agent`/`pi.usage`/`pi.live`/`pi.inbox` 派生（`hooks.ts:89-110`）。

**UI 位置。** 无 slot/panel；它是 hooks 的数据源，`connection.status` 供 shell 显示连接态（推断）。

**关键流程。** 1) `start()` 打开 `/api/events?conversation=<requested>&docs=<排序后的 kind>`，注册十个事件。2) `view` 用原始字符串去重：同会话同 raw 且当前 `view` 相同只清 `restored`。3) `ops` 用 `applyImmutable` 叠加；`ui` 写 `shared`，`uiOps` 仅在已有 `shared` 时叠加。4) `doc`/`docOps` 只处理已注册 kind，`docOps` 无快照时丢弃。5) `show(id)` 先取 `recent` 设 `view`/`restored`，再 `scheduleReconnect()` 重开主流并清 `docs`。6) 三个 watch 都是引用计数，`syncDocs` 按每个会话的 kind 列表重开/关闭流并裁掉无人看的 doc/view。7) `system` 到达且模型未加载或进程换代时 `refreshModels()`。

**失败与恢复。** `error` 且 `readyState === CLOSED`：若从未 open、有 `requested`、无 `view`，则清 `requested` 并调 `onFallback`（client 清 `shell.conversation`），1 秒后重连；否则只标 `reconnecting`，让 EventSource 自愈。重连必收新快照，旧流 ops 作废；`refreshModels` 异常被吞，等下一次 `system`。

**关掉它会发生什么。** `useConversation` 永远 `loading`，shell 无法显示会话，所有读数据的 hooks/actions 失效。

**复刻要点。** 主流只服务当前会话，其他会话必须另开流；`docs` 参数每次重连都要重算；旧流 `ops` 不得落到刚换上的 `view`；`recent` 的 raw 去重可避免重连换对象导致整树重渲染；`onFallback` 与 URL 写入必须分开。

**证据。** `store.ts:33-55,74-85,105-147,157-221,223-330,332-339,365-421,423-432`。

### 2.2 api

**职责与用户可见行为。** 把界面动作变成 HTTP 命令：发送、取消、配置、压缩、建会话、重启、扩展 action、写 UI 状态；会话命令默认作用于当前显示的会话。

**导出与契约。** `createApi(store, {fetch?})`、`ROOT = 1`、`ActionError`、`HttpError`、`actionMessage`、`ActionOptions`、`ActionArgs`、`Api`。**tools/actions/docs/events/reactors：无**；**apis provided：** `submit(text, whenBusy?, id?, images?)`、`history(id, before, signal?, after?)`、`abort`、`cancelSubmission`、`configure`、`compact`、`createConversation`、`restart`、`action(ref, ...)`、`updateUi`；**needed：** `Store` 与可注入 `fetch`。**settings keys：** 无。

**状态与持久化。** 不持状态；`shown()` 取 `view?.conversation.id ?? requested ?? ROOT`（`api.ts:83-86`）；`action` 的 body 为 `{ args: args ?? null, conversationId }`（`:139-142`）。

**UI 位置。** 无直接 UI；composer、重启按钮、扩展 action 按钮都经它。

**关键流程。** 1) `post()` 统一 `POST`、JSON、可选 `keepalive`/`signal`；先 `response.json()`（失败给 `{}`），非 2xx 抛 `HttpError`，消息取 body 的 `error` 或 `"<status> <statusText>"`。2) `history` 是 GET，`before` 必填、`after` 可选。3) `action` 拼 `/api/extensions/<encodeURIComponent(extension)>/actions/<encodeURIComponent(name)>`，成功返回 `result`；非 abort 错误包成 `ActionError(extension, name, status, message)`，网络错误 status 0。4) `signal.aborted` 时原样抛出。

**失败与恢复。** 未捕获的 `ActionError` 由 `client.ts:138-142` 转 notice；`useAction` 自行捕获并转 notice 或 `onError`。404 表示 action 不存在，500 表示它抛了；abort 不重试，由调用方重新发起。

**关掉它会发生什么。** 不能发送/取消/压缩/重启，扩展 action 全部不可用；只读会话仍可显示（推断）。

**复刻要点。** `ROOT = 1` 必须与 Pi Durable 的根会话常量一致；`ActionArgs` 用条件元组让参数为 `null` 的 action 可省略实参；两段路径都要 `encodeURIComponent`；`keepalive` 只给离开页面仍要完成的调用；abort 必须原样穿透。

**证据。** `api.ts:20-55,58-86,91-125,132-157`。

### 2.3 registry

**职责与用户可见行为。** 把每个 `extensions/<name>/web.tsx` 的 default export 安装成 `ExtensionRecord`，校验贡献形状，维护 `ready/timedOut/failed/pending`，并提供全部贡献查询。用户可见：某个 facet 编译失败只显示错误卡，其他 UI 与它自己的旧版本继续工作；页面在 facet 全部落定且收到首个 `system` 后一次显示。

**导出与契约。** `ExtensionLoader`、`ExtensionRecord`、`SlotItem`/`PanelItem`/`SurfaceItem`/`CommandItem`/`DocumentItem`、`extensionName`、`createRegistry`，以及 `slotItems`、`panelItems`、`shownPanels`、`surfaceItems`、`resolveSurface`、`HOME = 'agent'`、`commandItems`、`commandApplies`、`documentItems`、`introOf`、`composerRenderers`、`inboxRenderer`、`entryRenderers`、`toolRenderers`、`toolLine`、`linkRenderers`、`messageItems`、`compactDocs`、`compactTools`、`provisionsOf`、`provisionOf`。**tools/actions/docs/reactors：无**；**events：** 发 `ultimate:extension-loaded {name}`、`ultimate:extension-failed {name,error}`、`ultimate:ready {failed,pending,timedOut}`；**apis provided：** `getSnapshot`、`getReady`、`receiveSystem`、`subscribe`、`setLoaders`、`replace`、`fail`；**needed：** `events.ts`、`format.ts`。**settings keys：** 无。

**状态与持久化。** 全内存：`records`、`readiness`、`pending`、`tokens`、`generation`、`systemReceived`、`deadline`（`registry.ts:202-257`）；刷新后重新发现。

**UI 位置。** 不直接渲染；`slotItems` 定 slot 顺序，`surfaceItems` 定切换列表，`commandItems` 定命令面板，`documentItems` 定 Documents 渲染器，`entryRenderers`/`toolRenderers` 定转录卡片；`HOME` 是默认与兜底 surface。

**关键流程。** 1) `setLoaders(map)` 按传入顺序（约定 built-in → user → project，再按目录名）建记录，保留同名旧记录，`Promise.allSettled` 并行加载；每项有 token，过期结果丢弃。2) `install` 调 `validate`：必须是对象且 `default` 是对象；按 `shapes` 检查 18 个键，失败走 `fail`，旧 `extension` 保留。3) `ready = settled && systemReceived || timedOut`，从首次 `setLoaders` 起 8 秒兜底；`ready`/`timedOut` 跨热重载粘性，`ultimate:ready` 只发一次。4) `replace` 处理单 facet 热更新并 bump `version`；`fail` 只对已存在记录生效。

**失败与恢复。** 单个 import/validate 失败只影响自己；安装新模块时 `version` 加一，错误边界据此重置。`resolveSurface` 加载中找不到目标返回 `pending`，加载结束后回退 `HOME` 并报 `missing`；`commandApplies` 捕获 `when` 异常并隐藏命令。

**关掉它会发生什么。** `useExtensions()` 为空，没有 slot/panel/surface/command/renderer；扩展热更新失去安装点。

**复刻要点。** 校验必须整体通过才安装；`surfaces`/`commands`/`documents`/`provision` 后者胜，`tools`/`entries`/`link`/`composer` 按发现顺序包一圈，`slots` 按 `order` 稳定排序，`inbox` 取最后，`intro` 取最后匹配；`compact` 的 tools 合并、quiet 任一为真即真、summary 取第一个；`setLoaders` 必须重建 records 丢掉已删 facet；token 与 `generation` 防止旧 import 覆盖新结果。

**证据。** `registry.ts:27-66,98-196,202-257,273-323,337-400,408-460,466-570,577-639`。

### 2.4 hooks

**职责与用户可见行为。** 扩展与 shell 主要的数据读取层：订阅 store、派生 `ConversationState`、按 kind 观看文档、读根事件 feed、读写持久 UI 状态、拿全局 actions、跑 server action。它让流式转录只重渲染真正变化的行。

**导出与契约。** `useReady`、`useStore`、`ConversationState`、`useConversation`、`getConversation`、`getState`、`useSystem`、`useConversations`、`useTasks`、`useModels`、`refreshModels`、`useNotices`、`useConnection`、`useDoc`、`useDocKind`、`useDocOf`、`useEvents`、`useUltimate`、`useShownSurface`、`useUiState`、`useRegionOpen`、`useTranscript`、`ExtensionNameContext`、`useExtensionUiState`、`useDialog`、`useExtensions`、`useCompact`、`useCompactQuiet`、`useIntro`、`useDocumentRenderers`、`useCommands`、`useRestart`、`ActionState`、`UseActionOptions`、`useAction`、`useCopy`、`useNow`、`useToolDuration`。**tools/actions/docs/reactors：无**；**events：** 不直接发；`useEvents` 读 `ultimate.event-feed`；**apis provided：** 上述 hooks；**needed：** `store`/`api`/`registry`/`uiState`、`actions.ts` 选择器、两个 context。**settings keys：** 经 `useUiState`/`useExtensionUiState` 间接使用。

**状态与持久化。** `derive(view)` 用 `WeakMap<StreamedView, ConversationState>` 缓存：`entries` 是 active entries，`older` 是补历史游标，`agent/usage/live/inbox` 来自 `view.docs`，`busy = !!live.run`（`hooks.ts:89-110`）。`useUiState` 落在 `ultimate.ui`；`useExtensionUiState` 自动加 `ext.<extension>.` 前缀；其余为组件内 state/ref。

**UI 位置。** 不直接占 slot；所有 slot/panel/surface 组件经它取数。`useUltimate()` 返回 `UltimateContext`，命令与消息按钮据此导航。

**关键流程。** 1) `useConversation(select?)`：无作用域用 `state.view`，有 `ConversationIdContext` 用 `state.viewsOf[id]`；有 `select` 时只在该值变化时重渲染。2) `useDoc`/`useDocKind` 在 effect 里 `watchDoc`/`watchDocOf`，卸载释放；`useDocOf(conversation, ref)` 用于根文档等非当前会话。3) `useEvents({events,limit=20})` 读 `ROOT` 的 `EVENT_FEED`，按 kind 过滤、`toReversed()`、截断；feed 只存最近 100 条所有 kind，稀有事件可能不足 `limit`。4) `useUiState` 用 `useSyncExternalStore(uiState.subscribe, get)`，setter 立即本地生效；`useAction` 以 `JSON.stringify([extension,name,args,conversationId])` 为 key，自动调用、变更/卸载 abort，失败默认 notice。5) `useRestart` 从 `api.restart()` 取 `generation`，等 `system.process.generation >= target`；断线重连后 generation 仍旧则报 rolled back，超时默认 120 秒。

**失败与恢复。** `compact.when`/`intro.when`/命令 `when` 抛错只报一次 notice 并当作不匹配（`hooks.ts:296-348`、`actions.ts:165-175`）。`useAction` 的 abort 若来自禁用/卸载则把 `loading` 置回 false；`useRestart` 分 asking 失败、回滚、超时；`useCopy` 失败转 notice，1.2 秒复位。

**关掉它会发生什么。** 扩展无法读会话/文档/UI 状态或执行 action；每个组件都得自己订阅 store。

**复刻要点。** selector 必须返回稳定值，否则每个 ops 都重渲染整棵转录；`derive` 按 `StreamedView` 对象缓存，不能按会话 id；doc watch 必须在 cleanup 释放；`useUiState` 的 `initial` 只是 fallback；`useAction` 要重建 `actionRef`，不能复用 render 中创建的对象；公共 barrel 没有导出 `useShownSurface`、`useRegionOpen`、`useCompactQuiet`，它们是 shell 内部 hooks。

**证据。** `hooks.ts:40-52,54-132,151-203,206-284,287-365,383-437,462-563`；`index.ts:81-114`。

### 2.5 actions

**职责与用户可见行为。** 全局导航与布局动作：切会话、切 surface、开关右栏/侧栏、开关对话框、开命令面板、聚焦 composer、切主题；同时提供命令执行器与 shell 自带命令。用户按 `mod+k`、`mod+b`、`mod+alt+b`、`mod+1…9` 时走这里。

**导出与契约。** `shellKeys`、`shownSurface`、`layout`、`Region`、`regionKeys`、`ownDefault`、`regionOpen`、`actions: UltimateActions`、`runCommand`、`currentContext`、`applies`、`allCommands`。**tools/actions/docs/reactors：无**；**events：** 无（失败只发 notice）；**apis provided：** 上述；**needed：** registry 的 `commandItems`/`panelItems`/`slotItems`/`surfaceItems`/`resolveSurface`，`store`/`uiState`，`viewport`/`overlays`。**settings keys：** `shell.conversation`、`shell.surface`、`shell.shownSurface`、`shell.panel`、`shell.panelOpen`、`shell.sidebarOpen`、`shell.dock`（前缀 `shell.dock.<surface id>.<side>`）。

**状态与持久化。** `shell.*` 写 `ultimate.ui`，跨标签/刷新保留；`paletteOpen`、`dialogs`、移动端 `ui.open` 只在 `store.ui`，即本标签；`theme` 也在 `store.ui`，并由 client 另存 `localStorage` 的 `ultimate.theme`（`client.ts:99`）。`layout` 只记录当前挂载的区域计数，不持久化。

**UI 位置。** 命令面板、标题栏/状态条按钮、侧栏与右栏开关、surface 切换器；核心命令是 `ultimate.palette`（`mod+k`）、`ultimate.panel`（`mod+alt+b`）、`ultimate.sidebar`（`mod+b`），surface 命令是 `ultimate.surface.<id>`（前九个带 `mod+1…9`）。

**关键流程。** 1) `switchConversation`/`showSurface` 先 `closeOverlays()`，再写 `shell.conversation`/`shell.surface`；可选 `replace` 调 `replaceNextSelection()`。2) `openPanel(id?)` 桌面写 `shell.panelOpen=true`，移动端写本标签 `ui.open[viewport].panels`；指定 id 再写 `shell.panel`。`setRegionOpen` 在两者都覆盖时关闭另一个。3) `runCommand(id, context?)` 从 `allCommands()` 找命令，`applies` 通过后 `Promise.resolve().then(run)`，异常转 `"<title> (<extension>): <message>"` notice；未知/不适用静默返回。4) `allCommands` 顺序：核心命令 → surface 切换 → 扩展命令；同 id 后者覆盖。5) surface 解析顺序：`shell.surface` → 项目 `defaultSurface`（已安装或加载中）→ `HOME`。

**失败与恢复。** `when()` 抛错只隐藏该命令并报一次 notice；`run()` 抛错转 notice；`panelItems` 为空时右栏命令不存在；`layout.has(region)` 为假时对应开关不存在；`openPanel` 在移动端会关闭侧栏。

**关掉它会发生什么。** 没有导航与布局命令，命令面板/surface 切换/主题切换消失；URL 选择仍在，但用户无法从 UI 换会话或 surface。

**复刻要点。** `shell.*` 必须跨标签共享，移动端 `ui.open` 必须每标签独立；`closeOverlays` 只收覆盖区域，桌面停靠侧栏不该被导航收起；`regionOpen` 与 `useRegionOpen` 必须同一套判定；surface 命令只给前九个 `mod+数字`，顺序按 `surfaceItems`（Agent 永远第一）；扩展可覆盖核心命令 id。

**证据。** `actions.ts:18-42,48-106,108-175,178-219`；`viewport.ts:39-40`。

### 2.6 ui-state

**职责与用户可见行为。** 根会话 `ultimate.ui` 的前端镜像：一个扁平 JSON map，跨标签、跨设备共享，让刷新后回到同一会话/面板/视图。写入先本地生效，再合批发给服务端，服务端按 revision 确认。

**导出与契约。** `UiValues`、`createUiState(write, {delayMs?, onError?})`、`UiState`；返回 `get`、`snapshot`、`subscribe`、`set`、`delete`、`receive`、`restarted`、`flush`。**tools/actions/docs/events/reactors：无**；**apis provided：** 上述；**needed：** `(UiUpdateRequest) => Promise<UiUpdateResponse>`，通常是 `api.updateUi`。**settings keys：** 任意合法 key；`ui.rev` 由服务端维护（`UI_REVISION`）。

**状态与持久化。** 服务端文档 `ultimate.ui`（范围外：`server/ui-state.ts:4-5`）；每次 `POST /api/ui` 在自身事务里把 `ui.rev` 加一。服务端限制 key 长度 ≤200、匹配 `[A-Za-z0-9_.:-]`、总大小 ≤256KB，并拒绝客户端写 `ui.rev`（范围外：`server/api.ts:67-68,422-445`）。前端只在内存保留 `remote`、`local` overlay、`shown`、`sent`、`inFlight`、`epoch`、`restarting`。

**UI 位置。** 无直接 UI；`useUiState` 与所有 `shell.*` 开关都是消费者。

**关键流程。** 1) `set(key,value)` 与当前合并值相同则返回；否则写 `local`，`schedule(150ms)`，立即 `update()`。2) `send()` 只允许一个批次在飞（`force` 例外）；给未发送项打 `batch`，组成 `{set,delete}`，记录 `epoch`。3) 成功回 `rev`：该批记 `rev`，`release()` 删除 `rev <= shown` 的 overlay。4) `receive(next)` 按 `ui.rev`：`rev < shown` 丢弃；否则覆盖 `remote`、更新 `shown`、清 `restarting`、释放已确认写。5) `restarted()` 在进程换代时 `epoch++`、`shown=0`、`inFlight=false`、已发送批次 `rev=0` 并保持到新快照；未发送的立即发。6) `flush()` 在 `pagehide` 强制发送。

**失败与恢复。** 写失败删除该批 local 项、`update()`、调 `onError`（client 显示 `UI state not saved: …`）；旧进程迟到响应因 `sentIn !== epoch` 被忽略；更旧快照整体丢弃；无 `write`（detached）时只留本地。

**关掉它会发生什么。** `shell.*` 与 `ext.*` 退回每标签内存：刷新丢失、标签间不一致；会话仍可由 URL 打开，但面板/侧栏/主题选择不跟随。

**复刻要点。** 不能用"值相等"当提交确认，必须等 `rev`（否则 A→B→A 会误释放）；一个批次在飞保证写序；`release` 在 `restarting` 时必须暂停，否则新进程从 0 开始的 revision 会误删旧写；本地 overlay 必须先于远端快照应用；`flush` 只保证尽快发出，页面卸载时仍可能被浏览器取消（推断）。

**证据。** `ui-state.ts:17-31,33-59,61-71,76-121,135-163`；`client.ts:50-56,70-77,136`。

### 2.7 events

**职责与用户可见行为。** 浏览器内的进程级事件总线，供 facet 之间、registry 与 shell 之间传瞬时事件；`useEvent` 在挂载期间订阅。它不持久化、不回放，刷新即清空；registry 的加载/失败/就绪通知走它。

**导出与契约。** `events: EventBus`（`emit`、`on`）、`useEvent(channel, handler)`。**tools/actions/docs/reactors：无**；**events：** 任意 channel，SDK 内部用 `ultimate:extension-loaded`、`ultimate:extension-failed`、`ultimate:ready`；**apis provided：** 上述；**needed：** 无。**settings keys：** 无。

**状态与持久化。** `Map<string, Set<handler>>`，纯内存；`on` 返回取消函数，最后一个 handler 移除时删除 channel；`emit` 先快照监听器再逐个 `void handler(data)`，不等待。

**UI 位置。** 无固定位置；`ultimate:ready` 可驱动启动遮罩，`ultimate:extension-failed` 可驱动错误卡（推断：具体消费者在范围外）。

**关键流程。** 1) `emit` 取当前 Set 的浅拷贝逐个调用，async handler 也立即返回。2) `on` 把 handler 包成 `safe`：`await handler(data)`，异常只 `console.error("Event handler error (<channel>):", error)`。3) `useEvent` 用 `useRef` 保存最新 handler，effect 只依赖 channel。

**失败与恢复。** handler 异常被吞并记录，总线继续；没有重试/补偿；页面卸载即丢。跨页面通信应走 `ultimate.ui` 或服务端事件日志。

**关掉它会发生什么。** registry 仍工作，但 `ultimate:ready` 等生命周期通知无人接收；facet 间松耦合事件失效。

**复刻要点。** 必须快照监听器，否则 handler 内部退订会跳过后续；每个 handler 单独 try/catch；`useEvent` 必须用 ref 取最新 handler；不要把持久事件（`host.emit` 到 `EVENT_FEED`）与这个总线混为一谈。

**证据。** `events.ts:1-35`；`registry.ts:248,256`。

### 2.8 resume

**职责与用户可见行为。** 重载（F5、Vite full reload、core swap）时，`index.html` 先用上次页面写进 `sessionStorage` 的 DOM/CSS 快照铺满窗口，等 React 渲染并稳定后再淡出，避免白屏或 splash 闪一下；`resumed` 告诉调用方这次是恢复加载。

**导出与契约。** `resumed`、`covered()`、`rendered()`。**tools/actions/docs/events/reactors：无**；**events：** 无；**apis provided：** 上述；**needed：** DOM（`#app`、`#resume`）、`sessionStorage`、`index.html` 的预绘制脚本。**settings keys：** `ultimate.resume`（`{at, html, css}`）；页面只接受 30 秒内的快照（范围外：`web/index.html:40-41`）。

**状态与持久化。** `sessionStorage` 单键；`capture()` 在 `pagehide` 遍历 `document.body.children`，跳过 `SCRIPT` 与 `#resume`，把 `#app` 子节点逐个克隆；每个元素记录 `data-resume-scroll="top,left"`，textarea 记录 `value`；屏幕外块用同尺寸空白 `div` 代替（`absolute`/`fixed` 丢成空文本），长转录不会撑爆配额；CSS 取所有 `document.styleSheets` 的 `cssRules`。超配额则删键，下次全量启动。

**UI 位置。** 根级 `#resume` 覆盖层（`inert`），由 `index.html` 在模块加载前创建；`rendered()` 由 App 在 surface 显示且会话已到时调用（范围外：`web/src/app/App.tsx:154-156`）。

**关键流程。** 1) 模块加载时 `shown = #resume`，`resumed = shown !== null`。2) 若 `covering` 且再次 `pagehide`，只更新 `at`。3) `rendered()` 首次置 `ready=true`；观察 `#app` 的 `childList` 与捕获阶段 `scroll`，每次变动重置 `quiet=120ms`，总上限 `settle=700ms`；稳定后 `uncover()`。4) `uncover()` 清 `sessionStorage`，可见时 200ms 淡出后移除，隐藏时立即移除。5) 模块加载 8 秒后仍未 `rendered()` 也强制 `uncover()`。

**失败与恢复。** 未 `ready` 就离开则删快照，下次全新启动；写失败（配额）删键；超过 30 秒不被采用；`rendered()` 只生效一次；`document.hidden` 时不做动画。

**关掉它会发生什么。** 功能不受影响，只是重载看到白屏/splash；深色主题首屏脚本仍生效（`index.html:28-35`），但不恢复滚动位置与草稿。

**复刻要点。** 克隆必须"可见内容原样、屏幕外只留尺寸"，否则 DOM 体积与滚动偏移失控；`data-resume-scroll` 要在 `index.html` 回填；textarea 的 value 不在 innerHTML，必须显式写 `textContent`；`#resume` 必须 `inert`；快照可能含敏感文本，`sessionStorage` 只能当同标签临时数据。

**证据。** `resume.ts:6-24,31-49,51-80,83-96,103-127`；`index.html:38-60`（范围外）。

### 2.9 viewport

**职责与用户可见行为。** 判断 phone（<768）、tablet（768–1023）、desktop（≥1024），决定侧栏/右栏覆盖还是停靠；`touchKeyboard()` 判断粗指针，避免聚焦输入框时软键盘遮挡。同一套 surface 因此能在桌面、折叠屏、手机上用不同布局。

**导出与契约。** `Viewport`、`viewport()`、`useViewport()`、`touchKeyboard()`、`overlays(region, on?)`。**tools/actions/docs/reactors：无**；**events：** 监听两个 `MediaQueryList` 的 `change`；**apis provided：** 上述；**needed：** `window.matchMedia`。**settings keys：** 无。

**状态与持久化。** 无状态；`queries` 惰性缓存 `(min-width: 768px)` 与 `(min-width: 1024px)` 两个 `MediaQueryList`，`useViewport` 用 `useSyncExternalStore` 订阅。

**UI 位置。** 不渲染；`actions.regionOpen`/`useRegionOpen` 用它决定桌面共享状态与移动端本标签状态；`overlays()` 决定 `setRegionOpen` 是否关闭另一个区域。

**关键流程。** 1) `viewport()` 先 desktop，再 tablet，否则 phone。2) `overlays('sidebar')` 在 phone 真、tablet/desktop 假；`overlays('panels')` 在 phone/tablet 真、desktop 假。3) `useViewport` 订阅两个断点，任一变化重渲染。4) `touchKeyboard` 直接读 `(pointer: coarse)`，不订阅。

**失败与恢复。** 无异步失败；SSR 下 `matchMedia` 不存在会抛错（本应用纯浏览器，推断不需兼容）。

**关掉它会发生什么。** 移动端退化为桌面假设：侧栏/右栏错误共享桌面状态，面板在手机上不覆盖而是挤占宽度；软键盘检测失效。

**复刻要点。** 断点必须与 CSS 的 768/1024 一致；桌面用 `ultimate.ui` 共享开关，手机/平板用 `store.ui.open` 每标签开关；tablet 的 sidebar 默认开、panels 默认关（`ownDefault`）；`overlays` 默认参数是当前 viewport。

**证据。** `viewport.ts:9-40`；`actions.ts:70-100`；`hooks.ts:244-252`。

### 2.10 test-hook

**职责与用户可见行为。** 仅在 `sessionStorage.ultimate.driven === '1'` 时把 `window.ultimate` 装到页面，让浏览器/截图工具用状态而非 sleep 驱动 Ultimate：读当前会话与忙碌标记、以用户身份提交文本、等待"这一轮结束/全局安静/出现某类 entry/出现某个持久事件"。

**导出与契约。** `Condition`（`'idle' | 'quiet' | {entry} | {event,where?}`）、`UntilOptions`、`createTestHook(store, api)`、`TestHook`。**tools/actions/docs/events/reactors：无**；**events：** 通过 `store.watchDocOf(ROOT, EVENT_FEED)` 读根事件 feed；**apis provided：** `state()`、`send(text,{conversation?})`、`until(condition, options?)`；**needed：** `store`、`api`、`EVENT_FEED`。**settings keys：** `ultimate.driven`（sessionStorage）。

**状态与持久化。** 内存 `Map<conversation, Sent>`，`Sent = {at, entry, event, ran}`；`lastSent` 记录最近一次发送。`watchDocOf(ROOT, EVENT_FEED)` 在页面生命周期内保持。

**UI 位置。** 无 UI；挂到 `window.ultimate`。

**关键流程。** 1) `ready()` 等 `view` 与 `tasks` 同时存在，默认 30 秒。2) `state()` 返回 `shown`、每个会话的 `{id,title,busy}`、当前 view 的 entry kind 列表。3) `send()` 先 `ready()`，目标不是当前会话则 `watchConversation(id)`，记录最后 entry id 与最后 event id，调 `api.submit`，返回 `{conversation, submissionId}`。4) 订阅 store，把 `summary.busy` 或 `summary.answerAt >= record.at` 记为 `ran`，解决"太短的轮次从未显示 busy"。5) `until('idle')` 等本轮 `ran` 且目标不 busy；`quiet` 等本轮 `ran` 且所有会话不 busy；`{entry}` 等 `id > 发送前最后 entry` 的该 kind；`{event}` 等 `id > 发送前最后 event`、name 匹配且 `where` 每键 JSON 相等。6) 超时错误带 `busyLine`（任务 phase）或最近 entry/事件名。

**失败与恢复。** 超时抛带描述与剩余状态的错误；`until` 默认 300 秒、`ready` 30 秒；没收到首个快照报 `the page never received its first snapshot`；`{entry}` 对非当前会话会临时 watch；hook 只安装一次。

**关掉它会发生什么。** 浏览器工具退化为盲等/轮询 DOM；普通用户无影响。

**复刻要点。** `ran` 不能只看 `busy`，要加 `answerAt >= at`；发送游标必须在 `api.submit` 之前取；`{entry}`/`{event}` 严格用 `>` 不是 `>=`；`quiet` 要查所有会话；`EVENT_FEED` 是根会话文档；只应在受控浏览器开启。

**证据。** `test-hook.ts:9-46,49-85,87-114,119-192`；`client.ts:57-58`；`shared/events.ts:84-86`。

### 2.11 client

**职责与用户可见行为。** 组合根：创建页面唯一的 `store`、`api`、`uiState`、`registry`，按 URL `?conversation=` 与 `shell.conversation` 双向同步选择，持久化主题，检测服务端进程换代，处理未捕获 action 错误与 HMR。用户可见：刷新保持会话、前进/后退可用、主题跟随本机、core 换代后 UI 状态不串。

**导出与契约。** `store`、`api`、`uiState`、`registry`、`replaceNextSelection()`。**tools/actions/docs/reactors：无**；**events：** 无；**apis provided：** 上述单例；**needed：** `store`/`api`/`registry`/`ui-state`/`test-hook` 工厂，浏览器 `history`/`localStorage`/`sessionStorage`。**settings keys：** `ultimate.theme`（localStorage）、`ultimate.detached`、`ultimate.driven`（sessionStorage）、`shell.conversation`（在 `ultimate.ui`）。

**状态与持久化。** 模块级 `initialUrl`、`initialized`、`replaceSelection`、`selected`、`server`、`stale`；`detached` 页面不写 `uiState` 且后续不跟随远端；`driven` 页面安装 `window.ultimate`。

**UI 位置。** 无；它决定根组件的初始数据与 URL。

**关键流程。** 1) 启动：`createStore({ui:{theme: localStorage...}})` → `createApi` → `createUiState(detached ? undefined : api.updateUi)` → 条件装 test hook → `createRegistry`。2) 订阅 store：首个 `system` 且 registry 未 ready 时 `receiveSystem()`；用 `pid:generation` 判断换代，换代时 `uiState.restarted()` 并把旧 `shared` 记为 `stale`。3) 首次 `shared`：`uiState.receive(shared)`；URL 的合法 `conversation` 写 `shell.conversation`，非法则删除该 key；`initialized=true` 后 `followSelection()`。4) `followSelection` 读 `shell.conversation` 的数字，写 URL（`replaceSelection` 决定 replace/push），再 `store.show(id)`。5) `popstate` 反向：读 URL → set/delete `shell.conversation` → `followSelection` → 规范化 URL。6) 只有 `requested === view.conversation.id`（用户真的选了）才写 URL，流回退到根不算选择。7) `pagehide` 调 `uiState.flush()`；未捕获 `ActionError` 转 notice；模块自接受 HMR 时整页 reload。

**失败与恢复。** `onFallback` 置 `replaceSelection=true` 并删 `shell.conversation`；`stale` 防止换代瞬间旧 `shared` 覆盖新状态；主题异常值按 dark 处理；`popstate` 即使选择未变也重新规范化 URL。

**关掉它会发生什么。** 没有单例，所有 hooks/组件失去数据源；URL 与 UI 状态不同步，刷新回到根会话。

**复刻要点。** `initialUrl` 必须在任何 `history.replaceState` 前抓取；初始化顺序必须是"先吃保存值，再让显式 URL 胜出"；`replaceSelection` 在每次 `followSelection` 后复位；`pid:generation` 是"新进程、可能换存储"的唯一依据；单例一旦热替换会产生第二条 SSE，必须整页 reload。

**证据。** `client.ts:14-43,48-60,63-105,107-142,144-146`。

### 2.12 types / index

**职责与用户可见行为。** 定义 web facet 能贡献的一切及公共导出面。`types.ts` 是编译期契约，`registry.ts` 是运行期校验；`index.ts` 是 `@/sdk` 的 barrel，扩展只从这里导入。用户不直接看到它，但 slot 名、快捷键、surface 图标、compact 规则、point 名都由它固定。

**导出与契约。** `SlotName` 共 16 个：`sidebar`、`sidebar.top`、`titlebar.brand`、`titlebar.project`、`titlebar.left`、`titlebar.right`、`header.right`、`statusline.left`、`statusline.right`、`composer.toolbar`、`composer.status`、`composer.actions`、`conversation.overlay`、`transcript.start`、`transcript.end`、`overlay`。`WebExtension` 共 18 个可选键：`slots`、`panels`、`surfaces`、`tools`、`toolLines`、`entries`、`inbox`、`composer`、`link`、`messageActions`、`messageDetails`、`answerLabels`、`userBubble`、`compact`、`intro`、`documents`、`commands`、`provides`。另有 `Contribution`、`PanelContribution`、`SurfaceContribution`、`ToolCallView`（6 种 status）、`ToolRenderer`、`ToolLineRenderer`、`EntryRenderer`、`LinkRenderer`、`InboxRenderer`、`ComposerRenderer`、`DocumentProps`/`DocumentContribution`、`UltimateActions`、`UltimateContext`、`CommandContribution`、`CompactContribution`/`CompactRow`/`CompactQuietTest`/`CompactSummaryProps`/`CompactDocs`/`CompactCallTest`、`IntroContribution`、`Point`/`definePoint`/`Provision`/`provide`、`defineWebExtension`。内置 point：`ParkedRuns`（`ultimate.parked`）、`RunStart`（`ultimate.runStart`）、`ConversationKind`（`ultimate.conversationKind`）、`MessageReference`（`ultimate.messageReference`）。**tools/actions/docs/reactors：无**；**events：** 无；**apis provided：** 类型与 `defineWebExtension`（恒等）、`provide`（`{point,use}`）；**needed：** 无。**settings keys：** 无。

**状态与持久化。** 无状态；`defineWebExtension` 仅返回入参，运行期校验在 registry。

**UI 位置。** 定义所有 slot/panel/surface/command 的合法位置与字段；`index.ts` 还 re-export `Header`、`Conversation`、`Dock`、`Panels`、`Sidebar`、`Slot`、`StatusLine`、`ProjectChip`、`Wordmark`、`ExtensionBoundary`、`Card`、`Fold`、`MessageActions`、`UserText`/`UserView`、`ConversationScope`、`ComposerRedirect` 等原语。

**关键流程。** 1) facet 写 `export default defineWebExtension({...})`。2) `index.ts` 导出 `defineWebExtension`、`definePoint`、`provide` 与相关类型。3) `<Provided point input>`/`<AllProvided>`（`boundary.tsx`，范围外）按 `provisionOf`/`provisionsOf` 解析：单值取最后一个 provider，组合取全部。4) `Contribution` 允许裸组件或 `{component,order?,phone?}`；`phone` 只影响状态线在手机上的保留。5) `tab: false` 的面板默认不进 tab 行；`SurfaceContribution.order` 排在 Agent 之后；`CommandContribution.whileTyping` 允许在 composer 输入时触发。

**失败与恢复。** 类型错误编译期暴露；运行期形状不符由 registry 报错并保留旧版。`useExtensionUiState` 没有 `ExtensionNameContext` 时抛 `useExtensionUiState works inside an extension contribution only`（`hooks.ts:277-284`）。

**关掉它会发生什么。** 所有 facet 无法编译/导入，`@/sdk` 公共 API 不存在。

**复刻要点。** `Point` 的 `input`/`value` 是 phantom，运行时只有 `point` 字符串；`provide` 不要保留泛型到运行时；slot 名是跨版本契约；`defineWebExtension` 保持恒等；`index.ts` 不要导出 `store`/`registry`/`uiState`，否则扩展会绕过 hooks 直接改单例。

**证据。** `types.ts:7-31,34-58,61-126,129-173,179-227,235-278,281-317`；`index.ts:1-168`。

### 2.13 extensions loader / web-facets

**职责与用户可见行为。** 把 Vite 生成的 `virtual:ultimate/web-facets`（路径 → 动态 import）接到 registry，处理三类热更新：facet 单文件刷新、facet 增删、编译错误。用户可见：改 `web.tsx` 后组件保留状态、页面不刷新；编译失败只在该扩展卡片显示错误，Vite 红色 overlay 被收掉。

**导出与契约。** `loaders: Record<string, ExtensionLoader>`、`loadExtensions(map?)`；全局 `window.__getReactRefreshIgnoredExports`。**tools/actions/docs/events/reactors：无**；**events：** Vite 的 `vite:afterUpdate`、`vite:error`、`import.meta.hot.accept`；**apis provided：** 上述；**needed：** `registry.setLoaders`/`replace`/`fail`、`extensionName`、虚拟模块。**settings keys：** 无。

**状态与持久化。** 模块级 `viteErrors: Map<name,string>`；无持久化。

**UI 位置。** 无；它决定 registry 记录，从而间接决定所有 UI。

**关键流程。** 1) `loadExtensions()` 给每个 loader 包一层：成功清 `viteErrors`；失败先等 50ms（让 `vite:error` 先到），再抛带 `viteErrors.get(name)` 的 Error，`cause` 保留原错。2) `window.__getReactRefreshIgnoredExports` 对 facet 路径返回 `['default']`，让 Fast Refresh 不把 default 当组件检查。3) `accept('virtual:ultimate/web-facets')` 处理增删/整体重载；裸 `accept` 处理自身更新。4) `vite:afterUpdate` 只处理 `type === 'js-update' && path === acceptedPath` 的 facet，带 `?t=<timestamp>` 重新 import，成功 `registry.replace`，失败 `registry.fail`。5) `vite:error` 从 `err.id` 或 `err.loc.file` 取扩展名；有名字才 `viteErrors.set` + `registry.fail`，下一帧移除 `vite-error-overlay`；核心错误保留 overlay。

**失败与恢复。** 单 facet 编译失败时 registry 保留旧 `extension`，只加 `error`；下次成功安装 bump `version`，错误边界重挂。整体 map 重载时已删 facet 从 records 消失。

**关掉它会发生什么。** `loaders` 为空，registry 没有扩展，UI 只剩裸框架；热更新完全不工作。

**复刻要点。** loader key 是文件路径，`extensionName()` 必须兼容 Windows `\` 与 query；错误等 50ms 再抛，否则拿不到 Vite 详细错误；`vite:afterUpdate` 只接受 `path === acceptedPath`；`registry.replace` 必须 bump `version`；`__getReactRefreshIgnoredExports` 只对 facet 返回 `default`。

**证据。** `extensions.ts:1-79`；`web-facets.d.ts:1-3`；`registry.ts:63-66,240-257,313-321`。

### 2.14 小工具与作用域

**职责与用户可见行为。** `format.ts` 统一 token/字节/时长/时间/路径/复数的格式；`keys.ts` 解析与显示快捷键；`conversation-scope.tsx` 让一个页面同时渲染多个会话（侧聊、分支预览），并让其中的快捷键作用于该会话。

**导出与契约。** `format.ts`：`formatTokens`、`formatBytes`、`formatDuration`、`formatAgo`（re-export `lib/ago.ts`）、`shortenPath`、`elidePath`、`plural`、`errorMessage`、`formatTime`。`keys.ts`：`isMac`、`chordOf`、`parseKeys`、`formatKeys`。`conversation-scope.tsx`：`ConversationIdContext`、`TranscriptContext`、`scopeAttribute = 'data-conversation-scope'`、`ConversationScope`、`scopeOf`。**tools/actions/docs/events/reactors：无**；**events：** 无；**apis provided：** 上述；**needed：** `store.watchConversation`。**settings keys：** 无。

**状态与持久化。** `ConversationScope` 在 effect 里 `store.watchConversation(id)`，卸载释放；`TranscriptContext` 初始为 `undefined`，新作用域重置继承历史；快捷键 scope 通过 DOM 属性读取，不持久化。

**UI 位置。** `ConversationScope` 渲染一个 `display: contents` 的 `div`，带 `data-conversation-scope=<id>`；`scopeOf(target)` 从事件目标向上 `closest` 读 id，供 shell 快捷键使用。

**关键流程。** 1) `chordOf` 优先用 `event.code` 的 `KeyX`/`DigitN`，否则 `event.key.toLowerCase()`；mac 上 meta 记 `mod`，ctrl 另记 `ctrl`；修饰键顺序固定 `mod,ctrl,alt,shift`。2) `parseKeys` 把 `esc` 归一为 `escape`，按固定顺序重排；`formatKeys` 按平台给 `⌘/⌃/⌥/⇧` 或 `Ctrl/Alt/Shift`。3) `ConversationScope` 提供 id 并把 transcript 重置为 `undefined`，子组件的 `useConversation`/`useDoc` 自动落到该会话；`useTranscript` 优先读外层 transcript，没有时 scope 内退回该会话 active entries、scope 外为空。

**失败与恢复。** `scopeOf` 对非 HTMLElement 返回 undefined；id 必须是正安全整数；`watchConversation` 引用计数保证同 id scope 共用一条流；`formatTime` 固定 24 小时制；`shortenPath` 统一把 `\` 换 `/`。

**关掉它会发生什么。** 格式风格漂移；快捷键提示与解析不一致；侧聊/多会话视图的 hooks 落不到正确会话，快捷键作用到主会话。

**复刻要点。** 快捷键必须用 `event.code` 而非 `event.key`；`mod` 只在 mac 映射 meta；`ConversationScope` 必须同时提供 id 与 transcript 并渲染 DOM 属性；`formatAgo` 是服务端/浏览器共用实现，不要复制。

**证据。** `format.ts:1-76`；`keys.ts:1-45`；`conversation-scope.tsx:1-37`。

## 3. 跨扩展协作

| 调用方                       | 被调用方                               | 通道                                                                                                                     |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `web/src/main.tsx`（范围外） | store / extensions loader              | `store.start()`、`void loadExtensions()`                                                                                 |
| `extensions.ts`              | registry                               | `setLoaders`、`replace`、`fail`（`ExtensionLoader`）                                                                     |
| registry                     | events / hooks                         | `events.emit('ultimate:extension-loaded'/'ultimate:extension-failed'/'ultimate:ready')`；`useReady`/`useExtensions` 订阅 |
| store                        | EventSource                            | `/api/events?conversation=&docs=`；十个命名事件                                                                          |
| client                       | store / registry / ui-state            | `store.subscribe`；`registry.receiveSystem()`；`uiState.receive/restarted`                                               |
| ui-state                     | api / store                            | `api.updateUi` → `POST /api/ui`；`store` 的 `ui`/`uiOps` 回到 `receive`                                                  |
| hooks                        | store / registry / ui-state            | `useStore`、`watchDoc`/`watchDocOf`、`useExtensions`、`useUiState`                                                       |
| `ConversationScope`          | store / hooks / 快捷键                 | `watchConversation(id)`；`ConversationIdContext`、`TranscriptContext`、`data-conversation-scope`                         |
| `useAction`                  | api / ConversationScope                | `api.action(ref,{conversationId,signal})`                                                                                |
| actions                      | ui-state / store / registry / viewport | `shell.*` 写 `ultimate.ui`；`store.setUi` 管 palette/dialog/theme；`commandItems`/`surfaceItems`；`regionOpen`           |
| test-hook                    | store / api / events feed              | `watchDocOf(ROOT, EVENT_FEED)`；`api.submit`；`until` 条件                                                               |
| App（范围外）                | resume                                 | `rendered()`；`resumed`/`covered` 供加载态                                                                               |
| facet 之间                   | events                                 | 任意 channel；registry 生命周期事件                                                                                      |

依赖是单向的：`types.ts` 不依赖任何人；`store.ts` 依赖协议与 chord；`api.ts` 依赖 store；`ui-state.ts` 依赖协议；`registry.ts` 依赖 events/format；`hooks.ts` 依赖 client/actions/registry/store/types；`actions.ts` 依赖 client/registry/viewport；`client.ts` 组装以上单例；`extensions.ts` 依赖 client/registry。复刻时不要把组装逻辑塞进 `store.ts`，否则单测无法注入 fake EventSource/fetch；也不要把 selector 放进 hooks，否则 HMR 时选择器不随记录更新。

web 侧的点只有四个：`ultimate.parked`、`ultimate.runStart`、`ultimate.conversationKind`、`ultimate.messageReference`。它们用 `provide(Point, useValue)` 注册，`<Provided>` 单值取最后一个 provider，`<AllProvided>` 取全部；这与 server 侧 `api.ts` 的 `need`/`want` 是两套机制。

## 4. 复刻顺序建议与风险

**顺序。** 1) 先定 `types.ts` + `index.ts` + `shared/protocol.ts` 的 token：slot 名、18 个 `WebExtension` 键、事件名、`ROOT=1`、`UI_REVISION='ui.rev'`、`EVENT_FEED='ultimate.event-feed'`。2) 写 `store.ts` + `api.ts`，用可注入的 `eventSource`/`fetch` 做无网络测试；先跑通快照/ops/重连/fallback。3) 写 `ui-state.ts` + `client.ts`：先验证"本地写→150ms 批→rev→快照释放"和"进程换代 epoch"，再接 URL/主题/兜底。4) 写 `registry.ts` + `extensions.ts` + `web-facets.d.ts`：先做形状校验、就绪态与选择器，再做 HMR。5) 写 `hooks.ts`，按 `useConversation`→`useDoc*`→`useUiState`→`useAction`→`useRestart`；之后 `actions.ts`/`viewport.ts`。6) `events.ts`、`resume.ts`、`test-hook.ts` 最后补。每步验收：store 在断网/重连/切会话下保持副本；registry 在一个 facet 抛错时保留其余；ui-state 两标签收敛；HMR 不产生第二条 SSE。

**风险。** 1) SSE 契约漂移：少注册事件或 `view` 不做 raw 去重，表现为"偶尔不更新/整树重渲染"。2) ops 与快照竞态：旧流 ops 落到新 `view` 会污染副本，必须用 `source !== current` 与 generation/token 双重防护。3) 就绪死锁：`ready = settled && systemReceived`，忘了 `registry.receiveSystem()` 则 App 永不渲染 surface，8 秒 `timedOut` 只是遮羞布。4) HMR 双流：`client.ts` 单例若被热接受而非整页 reload，会同时存在两个 EventSource，表现为重复通知/重复 ops。5) UI 状态 revision：不按 `ui.rev` 释放 overlay 会让旧标签的写永远覆盖新值；客户端改 `ui.rev` 会 400；超过 256KB 会 413。6) 移动端状态混用：把 `shell.sidebarOpen` 用在手机上会让桌面开关影响手机。7) URL 选择：把流回退的根会话写进 URL 会让刷新永远停在根；`replaceNextSelection` 必须在每次 follow 后复位。8) resume 快照：`sessionStorage` 是完整 DOM，可能含敏感文本；配额失败要静默降级，30 秒/8 秒两个时限要一致。9) test hook：`ultimate.driven` 是 sessionStorage 开关，任何同源脚本都能设置，只应在受控浏览器开启。10) 内存：`recent` 保留 6 个完整 view，长转录 ×6 可能很大；`notices` 上限 50 是有意的。

**证据（总览）。** `index.ts:1-168`；`client.ts:14-146`；`store.ts:105-435`；`api.ts:20-160`；`registry.ts:27-639`；`hooks.ts:40-563`；`actions.ts:18-219`；`ui-state.ts:17-166`；`events.ts:1-35`；`resume.ts:1-127`；`viewport.ts:1-40`；`test-hook.ts:1-195`；`types.ts:1-317`；`extensions.ts:1-79`；`web-facets.d.ts:1-3`。
