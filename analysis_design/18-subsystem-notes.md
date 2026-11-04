# 18 · 子系统分析附录（平台层）

> 本附录收录平台层的原始分析笔记：浏览器 SDK、Web 外壳、共享库、Pi Durable 运行时、工具链。
> 对应正文：`07-protocol-and-sdk.md`、`09-web-shell.md`、`12-lib-and-infra.md`、`06-durable-runtime.md`、`03-tech-stack-and-build.md`。

## B.1 Browser SDK（platform-web-sdk）分析笔记

> 范围说明：`web/src/sdk/`（16 个文件）、`web/src/extensions.ts`、`web/src/web-facets.d.ts` 均无 README.md。产品语义按 `web/src/sdk/index.ts:1-4` 指向的 `extensions/README.md` web facet 章节校准；实现断言以本组源码为准，超出本组路径的事实注明"范围外"。下文 `sdk/foo.ts` 与裸 `foo.ts` 均指 `web/src/sdk/foo.ts`。

### 1. 概览

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

### 2. 逐扩展规格

#### 2.1 store

**职责与用户可见行为。** 页面主 SSE 流与"请求的会话"副本（快照加 ops），另为 `ConversationScope` 保留的会话和文档 watch 开附加流。用户可见：切会话先用缓存副本秒开再刷新、断线重连、目标会话不存在时回退根会话、通知与任务图实时更新。

**导出与契约。** `createStore(options: StoreOptions)`，类型 `Store`、`State`、`Connection`、`UiState`、`EventSourceLike`、`StoreOptions`。**tools/actions/docs/reactors：无**；**events：** 消费 `system`、`conversations`、`view`、`ops`、`ui`、`uiOps`、`doc`、`docOps`、`tasks`、`notice`；**apis provided：** `getState`、`subscribe`、`start`/`stop`、`show`、`watchConversation`、`watchDoc`、`watchDocOf`、`refreshModels`、`setUi`、`notify`、`dismissNotice`；**needed：** 可注入的 `EventSource`/`fetch`。**settings keys：** 无。

**状态与持久化。** 全内存 `State`：`connection`、`requested`、`view`、`restored`、`viewsOf`、`docs`、`docsOf`、`shared`、`system`、`conversations`、`tasks`、`models`、`notices`、`ui`（`store.ts:33-55`）。`recent` 只留最近 6 个会话的副本及原始快照文本（`:136-147`），`notices` 最多 50 条（`:200-206`）；无 SQLite/文件写入，会话状态从 `view.docs` 的 `pi.agent`/`pi.usage`/`pi.live`/`pi.inbox` 派生（`hooks.ts:89-110`）。

**UI 位置。** 无 slot/panel；它是 hooks 的数据源，`connection.status` 供 shell 显示连接态（推断）。

**关键流程。** 1) `start()` 打开 `/api/events?conversation=<requested>&docs=<排序后的 kind>`，注册十个事件。2) `view` 用原始字符串去重：同会话同 raw 且当前 `view` 相同只清 `restored`。3) `ops` 用 `applyImmutable` 叠加；`ui` 写 `shared`，`uiOps` 仅在已有 `shared` 时叠加。4) `doc`/`docOps` 只处理已注册 kind，`docOps` 无快照时丢弃。5) `show(id)` 先取 `recent` 设 `view`/`restored`，再 `scheduleReconnect()` 重开主流并清 `docs`。6) 三个 watch 都是引用计数，`syncDocs` 按每个会话的 kind 列表重开/关闭流并裁掉无人看的 doc/view。7) `system` 到达且模型未加载或进程换代时 `refreshModels()`。

**失败与恢复。** `error` 且 `readyState === CLOSED`：若从未 open、有 `requested`、无 `view`，则清 `requested` 并调 `onFallback`（client 清 `shell.conversation`），1 秒后重连；否则只标 `reconnecting`，让 EventSource 自愈。重连必收新快照，旧流 ops 作废；`refreshModels` 异常被吞，等下一次 `system`。

**关掉它会发生什么。** `useConversation` 永远 `loading`，shell 无法显示会话，所有读数据的 hooks/actions 失效。

**复刻要点。** 主流只服务当前会话，其他会话必须另开流；`docs` 参数每次重连都要重算；旧流 `ops` 不得落到刚换上的 `view`；`recent` 的 raw 去重可避免重连换对象导致整树重渲染；`onFallback` 与 URL 写入必须分开。

**证据。** `store.ts:33-55,74-85,105-147,157-221,223-330,332-339,365-421,423-432`。

#### 2.2 api

**职责与用户可见行为。** 把界面动作变成 HTTP 命令：发送、取消、配置、压缩、建会话、重启、扩展 action、写 UI 状态；会话命令默认作用于当前显示的会话。

**导出与契约。** `createApi(store, {fetch?})`、`ROOT = 1`、`ActionError`、`HttpError`、`actionMessage`、`ActionOptions`、`ActionArgs`、`Api`。**tools/actions/docs/events/reactors：无**；**apis provided：** `submit(text, whenBusy?, id?, images?)`、`history(id, before, signal?, after?)`、`abort`、`cancelSubmission`、`configure`、`compact`、`createConversation`、`restart`、`action(ref, ...)`、`updateUi`；**needed：** `Store` 与可注入 `fetch`。**settings keys：** 无。

**状态与持久化。** 不持状态；`shown()` 取 `view?.conversation.id ?? requested ?? ROOT`（`api.ts:83-86`）；`action` 的 body 为 `{ args: args ?? null, conversationId }`（`:139-142`）。

**UI 位置。** 无直接 UI；composer、重启按钮、扩展 action 按钮都经它。

**关键流程。** 1) `post()` 统一 `POST`、JSON、可选 `keepalive`/`signal`；先 `response.json()`（失败给 `{}`），非 2xx 抛 `HttpError`，消息取 body 的 `error` 或 `"<status> <statusText>"`。2) `history` 是 GET，`before` 必填、`after` 可选。3) `action` 拼 `/api/extensions/<encodeURIComponent(extension)>/actions/<encodeURIComponent(name)>`，成功返回 `result`；非 abort 错误包成 `ActionError(extension, name, status, message)`，网络错误 status 0。4) `signal.aborted` 时原样抛出。

**失败与恢复。** 未捕获的 `ActionError` 由 `client.ts:138-142` 转 notice；`useAction` 自行捕获并转 notice 或 `onError`。404 表示 action 不存在，500 表示它抛了；abort 不重试，由调用方重新发起。

**关掉它会发生什么。** 不能发送/取消/压缩/重启，扩展 action 全部不可用；只读会话仍可显示（推断）。

**复刻要点。** `ROOT = 1` 必须与 Pi Durable 的根会话常量一致；`ActionArgs` 用条件元组让参数为 `null` 的 action 可省略实参；两段路径都要 `encodeURIComponent`；`keepalive` 只给离开页面仍要完成的调用；abort 必须原样穿透。

**证据。** `api.ts:20-55,58-86,91-125,132-157`。

#### 2.3 registry

**职责与用户可见行为。** 把每个 `extensions/<name>/web.tsx` 的 default export 安装成 `ExtensionRecord`，校验贡献形状，维护 `ready/timedOut/failed/pending`，并提供全部贡献查询。用户可见：某个 facet 编译失败只显示错误卡，其他 UI 与它自己的旧版本继续工作；页面在 facet 全部落定且收到首个 `system` 后一次显示。

**导出与契约。** `ExtensionLoader`、`ExtensionRecord`、`SlotItem`/`PanelItem`/`SurfaceItem`/`CommandItem`/`DocumentItem`、`extensionName`、`createRegistry`，以及 `slotItems`、`panelItems`、`shownPanels`、`surfaceItems`、`resolveSurface`、`HOME = 'agent'`、`commandItems`、`commandApplies`、`documentItems`、`introOf`、`composerRenderers`、`inboxRenderer`、`entryRenderers`、`toolRenderers`、`toolLine`、`linkRenderers`、`messageItems`、`compactDocs`、`compactTools`、`provisionsOf`、`provisionOf`。**tools/actions/docs/reactors：无**；**events：** 发 `ultimate:extension-loaded {name}`、`ultimate:extension-failed {name,error}`、`ultimate:ready {failed,pending,timedOut}`；**apis provided：** `getSnapshot`、`getReady`、`receiveSystem`、`subscribe`、`setLoaders`、`replace`、`fail`；**needed：** `events.ts`、`format.ts`。**settings keys：** 无。

**状态与持久化。** 全内存：`records`、`readiness`、`pending`、`tokens`、`generation`、`systemReceived`、`deadline`（`registry.ts:202-257`）；刷新后重新发现。

**UI 位置。** 不直接渲染；`slotItems` 定 slot 顺序，`surfaceItems` 定切换列表，`commandItems` 定命令面板，`documentItems` 定 Documents 渲染器，`entryRenderers`/`toolRenderers` 定转录卡片；`HOME` 是默认与兜底 surface。

**关键流程。** 1) `setLoaders(map)` 按传入顺序（约定 built-in → user → project，再按目录名）建记录，保留同名旧记录，`Promise.allSettled` 并行加载；每项有 token，过期结果丢弃。2) `install` 调 `validate`：必须是对象且 `default` 是对象；按 `shapes` 检查 18 个键，失败走 `fail`，旧 `extension` 保留。3) `ready = settled && systemReceived || timedOut`，从首次 `setLoaders` 起 8 秒兜底；`ready`/`timedOut` 跨热重载粘性，`ultimate:ready` 只发一次。4) `replace` 处理单 facet 热更新并 bump `version`；`fail` 只对已存在记录生效。

**失败与恢复。** 单个 import/validate 失败只影响自己；安装新模块时 `version` 加一，错误边界据此重置。`resolveSurface` 加载中找不到目标返回 `pending`，加载结束后回退 `HOME` 并报 `missing`；`commandApplies` 捕获 `when` 异常并隐藏命令。

**关掉它会发生什么。** `useExtensions()` 为空，没有 slot/panel/surface/command/renderer；扩展热更新失去安装点。

**复刻要点。** 校验必须整体通过才安装；`surfaces`/`commands`/`documents`/`provision` 后者胜，`tools`/`entries`/`link`/`composer` 按发现顺序包一圈，`slots` 按 `order` 稳定排序，`inbox` 取最后，`intro` 取最后匹配；`compact` 的 tools 合并、quiet 任一为真即真、summary 取第一个；`setLoaders` 必须重建 records 丢掉已删 facet；token 与 `generation` 防止旧 import 覆盖新结果。

**证据。** `registry.ts:27-66,98-196,202-257,273-323,337-400,408-460,466-570,577-639`。

#### 2.4 hooks

**职责与用户可见行为。** 扩展与 shell 主要的数据读取层：订阅 store、派生 `ConversationState`、按 kind 观看文档、读根事件 feed、读写持久 UI 状态、拿全局 actions、跑 server action。它让流式转录只重渲染真正变化的行。

**导出与契约。** `useReady`、`useStore`、`ConversationState`、`useConversation`、`getConversation`、`getState`、`useSystem`、`useConversations`、`useTasks`、`useModels`、`refreshModels`、`useNotices`、`useConnection`、`useDoc`、`useDocKind`、`useDocOf`、`useEvents`、`useUltimate`、`useShownSurface`、`useUiState`、`useRegionOpen`、`useTranscript`、`ExtensionNameContext`、`useExtensionUiState`、`useDialog`、`useExtensions`、`useCompact`、`useCompactQuiet`、`useIntro`、`useDocumentRenderers`、`useCommands`、`useRestart`、`ActionState`、`UseActionOptions`、`useAction`、`useCopy`、`useNow`、`useToolDuration`。**tools/actions/docs/reactors：无**；**events：** 不直接发；`useEvents` 读 `ultimate.event-feed`；**apis provided：** 上述 hooks；**needed：** `store`/`api`/`registry`/`uiState`、`actions.ts` 选择器、两个 context。**settings keys：** 经 `useUiState`/`useExtensionUiState` 间接使用。

**状态与持久化。** `derive(view)` 用 `WeakMap<StreamedView, ConversationState>` 缓存：`entries` 是 active entries，`older` 是补历史游标，`agent/usage/live/inbox` 来自 `view.docs`，`busy = !!live.run`（`hooks.ts:89-110`）。`useUiState` 落在 `ultimate.ui`；`useExtensionUiState` 自动加 `ext.<extension>.` 前缀；其余为组件内 state/ref。

**UI 位置。** 不直接占 slot；所有 slot/panel/surface 组件经它取数。`useUltimate()` 返回 `UltimateContext`，命令与消息按钮据此导航。

**关键流程。** 1) `useConversation(select?)`：无作用域用 `state.view`，有 `ConversationIdContext` 用 `state.viewsOf[id]`；有 `select` 时只在该值变化时重渲染。2) `useDoc`/`useDocKind` 在 effect 里 `watchDoc`/`watchDocOf`，卸载释放；`useDocOf(conversation, ref)` 用于根文档等非当前会话。3) `useEvents({events,limit=20})` 读 `ROOT` 的 `EVENT_FEED`，按 kind 过滤、`toReversed()`、截断；feed 只存最近 100 条所有 kind，稀有事件可能不足 `limit`。4) `useUiState` 用 `useSyncExternalStore(uiState.subscribe, get)`，setter 立即本地生效；`useAction` 以 `JSON.stringify([extension,name,args,conversationId])` 为 key，自动调用、变更/卸载 abort，失败默认 notice。5) `useRestart` 从 `api.restart()` 取 `generation`，等 `system.process.generation >= target`；断线重连后 generation 仍旧则报 rolled back，超时默认 120 秒。

**失败与恢复。** `compact.when`/`intro.when`/命令 `when` 抛错只报一次 notice 并当作不匹配（`hooks.ts:296-348`、`actions.ts:165-175`）。`useAction` 的 abort 若来自禁用/卸载则把 `loading` 置回 false；`useRestart` 分 asking 失败、回滚、超时；`useCopy` 失败转 notice，1.2 秒复位。

**关掉它会发生什么。** 扩展无法读会话/文档/UI 状态或执行 action；每个组件都得自己订阅 store。

**复刻要点。** selector 必须返回稳定值，否则每个 ops 都重渲染整棵转录；`derive` 按 `StreamedView` 对象缓存，不能按会话 id；doc watch 必须在 cleanup 释放；`useUiState` 的 `initial` 只是 fallback；`useAction` 要重建 `actionRef`，不能复用 render 中创建的对象；公共 barrel 没有导出 `useShownSurface`、`useRegionOpen`、`useCompactQuiet`，它们是 shell 内部 hooks。

**证据。** `hooks.ts:40-52,54-132,151-203,206-284,287-365,383-437,462-563`；`index.ts:81-114`。

#### 2.5 actions

**职责与用户可见行为。** 全局导航与布局动作：切会话、切 surface、开关右栏/侧栏、开关对话框、开命令面板、聚焦 composer、切主题；同时提供命令执行器与 shell 自带命令。用户按 `mod+k`、`mod+b`、`mod+alt+b`、`mod+1…9` 时走这里。

**导出与契约。** `shellKeys`、`shownSurface`、`layout`、`Region`、`regionKeys`、`ownDefault`、`regionOpen`、`actions: UltimateActions`、`runCommand`、`currentContext`、`applies`、`allCommands`。**tools/actions/docs/reactors：无**；**events：** 无（失败只发 notice）；**apis provided：** 上述；**needed：** registry 的 `commandItems`/`panelItems`/`slotItems`/`surfaceItems`/`resolveSurface`，`store`/`uiState`，`viewport`/`overlays`。**settings keys：** `shell.conversation`、`shell.surface`、`shell.shownSurface`、`shell.panel`、`shell.panelOpen`、`shell.sidebarOpen`、`shell.dock`（前缀 `shell.dock.<surface id>.<side>`）。

**状态与持久化。** `shell.*` 写 `ultimate.ui`，跨标签/刷新保留；`paletteOpen`、`dialogs`、移动端 `ui.open` 只在 `store.ui`，即本标签；`theme` 也在 `store.ui`，并由 client 另存 `localStorage` 的 `ultimate.theme`（`client.ts:99`）。`layout` 只记录当前挂载的区域计数，不持久化。

**UI 位置。** 命令面板、标题栏/状态条按钮、侧栏与右栏开关、surface 切换器；核心命令是 `ultimate.palette`（`mod+k`）、`ultimate.panel`（`mod+alt+b`）、`ultimate.sidebar`（`mod+b`），surface 命令是 `ultimate.surface.<id>`（前九个带 `mod+1…9`）。

**关键流程。** 1) `switchConversation`/`showSurface` 先 `closeOverlays()`，再写 `shell.conversation`/`shell.surface`；可选 `replace` 调 `replaceNextSelection()`。2) `openPanel(id?)` 桌面写 `shell.panelOpen=true`，移动端写本标签 `ui.open[viewport].panels`；指定 id 再写 `shell.panel`。`setRegionOpen` 在两者都覆盖时关闭另一个。3) `runCommand(id, context?)` 从 `allCommands()` 找命令，`applies` 通过后 `Promise.resolve().then(run)`，异常转 `"<title> (<extension>): <message>"` notice；未知/不适用静默返回。4) `allCommands` 顺序：核心命令 → surface 切换 → 扩展命令；同 id 后者覆盖。5) surface 解析顺序：`shell.surface` → 项目 `defaultSurface`（已安装或加载中）→ `HOME`。

**失败与恢复。** `when()` 抛错只隐藏该命令并报一次 notice；`run()` 抛错转 notice；`panelItems` 为空时右栏命令不存在；`layout.has(region)` 为假时对应开关不存在；`openPanel` 在移动端会关闭侧栏。

**关掉它会发生什么。** 没有导航与布局命令，命令面板/surface 切换/主题切换消失；URL 选择仍在，但用户无法从 UI 换会话或 surface。

**复刻要点。** `shell.*` 必须跨标签共享，移动端 `ui.open` 必须每标签独立；`closeOverlays` 只收覆盖区域，桌面停靠侧栏不该被导航收起；`regionOpen` 与 `useRegionOpen` 必须同一套判定；surface 命令只给前九个 `mod+数字`，顺序按 `surfaceItems`（Agent 永远第一）；扩展可覆盖核心命令 id。

**证据。** `actions.ts:18-42,48-106,108-175,178-219`；`viewport.ts:39-40`。

#### 2.6 ui-state

**职责与用户可见行为。** 根会话 `ultimate.ui` 的前端镜像：一个扁平 JSON map，跨标签、跨设备共享，让刷新后回到同一会话/面板/视图。写入先本地生效，再合批发给服务端，服务端按 revision 确认。

**导出与契约。** `UiValues`、`createUiState(write, {delayMs?, onError?})`、`UiState`；返回 `get`、`snapshot`、`subscribe`、`set`、`delete`、`receive`、`restarted`、`flush`。**tools/actions/docs/events/reactors：无**；**apis provided：** 上述；**needed：** `(UiUpdateRequest) => Promise<UiUpdateResponse>`，通常是 `api.updateUi`。**settings keys：** 任意合法 key；`ui.rev` 由服务端维护（`UI_REVISION`）。

**状态与持久化。** 服务端文档 `ultimate.ui`（范围外：`server/ui-state.ts:4-5`）；每次 `POST /api/ui` 在自身事务里把 `ui.rev` 加一。服务端限制 key 长度 ≤200、匹配 `[A-Za-z0-9_.:-]`、总大小 ≤256KB，并拒绝客户端写 `ui.rev`（范围外：`server/api.ts:67-68,422-445`）。前端只在内存保留 `remote`、`local` overlay、`shown`、`sent`、`inFlight`、`epoch`、`restarting`。

**UI 位置。** 无直接 UI；`useUiState` 与所有 `shell.*` 开关都是消费者。

**关键流程。** 1) `set(key,value)` 与当前合并值相同则返回；否则写 `local`，`schedule(150ms)`，立即 `update()`。2) `send()` 只允许一个批次在飞（`force` 例外）；给未发送项打 `batch`，组成 `{set,delete}`，记录 `epoch`。3) 成功回 `rev`：该批记 `rev`，`release()` 删除 `rev <= shown` 的 overlay。4) `receive(next)` 按 `ui.rev`：`rev < shown` 丢弃；否则覆盖 `remote`、更新 `shown`、清 `restarting`、释放已确认写。5) `restarted()` 在进程换代时 `epoch++`、`shown=0`、`inFlight=false`、已发送批次 `rev=0` 并保持到新快照；未发送的立即发。6) `flush()` 在 `pagehide` 强制发送。

**失败与恢复。** 写失败删除该批 local 项、`update()`、调 `onError`（client 显示 `UI state not saved: …`）；旧进程迟到响应因 `sentIn !== epoch` 被忽略；更旧快照整体丢弃；无 `write`（detached）时只留本地。

**关掉它会发生什么。** `shell.*` 与 `ext.*` 退回每标签内存：刷新丢失、标签间不一致；会话仍可由 URL 打开，但面板/侧栏/主题选择不跟随。

**复刻要点。** 不能用"值相等"当提交确认，必须等 `rev`（否则 A→B→A 会误释放）；一个批次在飞保证写序；`release` 在 `restarting` 时必须暂停，否则新进程从 0 开始的 revision 会误删旧写；本地 overlay 必须先于远端快照应用；`flush` 只保证尽快发出，页面卸载时仍可能被浏览器取消（推断）。

**证据。** `ui-state.ts:17-31,33-59,61-71,76-121,135-163`；`client.ts:50-56,70-77,136`。

#### 2.7 events

**职责与用户可见行为。** 浏览器内的进程级事件总线，供 facet 之间、registry 与 shell 之间传瞬时事件；`useEvent` 在挂载期间订阅。它不持久化、不回放，刷新即清空；registry 的加载/失败/就绪通知走它。

**导出与契约。** `events: EventBus`（`emit`、`on`）、`useEvent(channel, handler)`。**tools/actions/docs/reactors：无**；**events：** 任意 channel，SDK 内部用 `ultimate:extension-loaded`、`ultimate:extension-failed`、`ultimate:ready`；**apis provided：** 上述；**needed：** 无。**settings keys：** 无。

**状态与持久化。** `Map<string, Set<handler>>`，纯内存；`on` 返回取消函数，最后一个 handler 移除时删除 channel；`emit` 先快照监听器再逐个 `void handler(data)`，不等待。

**UI 位置。** 无固定位置；`ultimate:ready` 可驱动启动遮罩，`ultimate:extension-failed` 可驱动错误卡（推断：具体消费者在范围外）。

**关键流程。** 1) `emit` 取当前 Set 的浅拷贝逐个调用，async handler 也立即返回。2) `on` 把 handler 包成 `safe`：`await handler(data)`，异常只 `console.error("Event handler error (<channel>):", error)`。3) `useEvent` 用 `useRef` 保存最新 handler，effect 只依赖 channel。

**失败与恢复。** handler 异常被吞并记录，总线继续；没有重试/补偿；页面卸载即丢。跨页面通信应走 `ultimate.ui` 或服务端事件日志。

**关掉它会发生什么。** registry 仍工作，但 `ultimate:ready` 等生命周期通知无人接收；facet 间松耦合事件失效。

**复刻要点。** 必须快照监听器，否则 handler 内部退订会跳过后续；每个 handler 单独 try/catch；`useEvent` 必须用 ref 取最新 handler；不要把持久事件（`host.emit` 到 `EVENT_FEED`）与这个总线混为一谈。

**证据。** `events.ts:1-35`；`registry.ts:248,256`。

#### 2.8 resume

**职责与用户可见行为。** 重载（F5、Vite full reload、core swap）时，`index.html` 先用上次页面写进 `sessionStorage` 的 DOM/CSS 快照铺满窗口，等 React 渲染并稳定后再淡出，避免白屏或 splash 闪一下；`resumed` 告诉调用方这次是恢复加载。

**导出与契约。** `resumed`、`covered()`、`rendered()`。**tools/actions/docs/events/reactors：无**；**events：** 无；**apis provided：** 上述；**needed：** DOM（`#app`、`#resume`）、`sessionStorage`、`index.html` 的预绘制脚本。**settings keys：** `ultimate.resume`（`{at, html, css}`）；页面只接受 30 秒内的快照（范围外：`web/index.html:40-41`）。

**状态与持久化。** `sessionStorage` 单键；`capture()` 在 `pagehide` 遍历 `document.body.children`，跳过 `SCRIPT` 与 `#resume`，把 `#app` 子节点逐个克隆；每个元素记录 `data-resume-scroll="top,left"`，textarea 记录 `value`；屏幕外块用同尺寸空白 `div` 代替（`absolute`/`fixed` 丢成空文本），长转录不会撑爆配额；CSS 取所有 `document.styleSheets` 的 `cssRules`。超配额则删键，下次全量启动。

**UI 位置。** 根级 `#resume` 覆盖层（`inert`），由 `index.html` 在模块加载前创建；`rendered()` 由 App 在 surface 显示且会话已到时调用（范围外：`web/src/app/App.tsx:154-156`）。

**关键流程。** 1) 模块加载时 `shown = #resume`，`resumed = shown !== null`。2) 若 `covering` 且再次 `pagehide`，只更新 `at`。3) `rendered()` 首次置 `ready=true`；观察 `#app` 的 `childList` 与捕获阶段 `scroll`，每次变动重置 `quiet=120ms`，总上限 `settle=700ms`；稳定后 `uncover()`。4) `uncover()` 清 `sessionStorage`，可见时 200ms 淡出后移除，隐藏时立即移除。5) 模块加载 8 秒后仍未 `rendered()` 也强制 `uncover()`。

**失败与恢复。** 未 `ready` 就离开则删快照，下次全新启动；写失败（配额）删键；超过 30 秒不被采用；`rendered()` 只生效一次；`document.hidden` 时不做动画。

**关掉它会发生什么。** 功能不受影响，只是重载看到白屏/splash；深色主题首屏脚本仍生效（`index.html:28-35`），但不恢复滚动位置与草稿。

**复刻要点。** 克隆必须"可见内容原样、屏幕外只留尺寸"，否则 DOM 体积与滚动偏移失控；`data-resume-scroll` 要在 `index.html` 回填；textarea 的 value 不在 innerHTML，必须显式写 `textContent`；`#resume` 必须 `inert`；快照可能含敏感文本，`sessionStorage` 只能当同标签临时数据。

**证据。** `resume.ts:6-24,31-49,51-80,83-96,103-127`；`index.html:38-60`（范围外）。

#### 2.9 viewport

**职责与用户可见行为。** 判断 phone（<768）、tablet（768–1023）、desktop（≥1024），决定侧栏/右栏覆盖还是停靠；`touchKeyboard()` 判断粗指针，避免聚焦输入框时软键盘遮挡。同一套 surface 因此能在桌面、折叠屏、手机上用不同布局。

**导出与契约。** `Viewport`、`viewport()`、`useViewport()`、`touchKeyboard()`、`overlays(region, on?)`。**tools/actions/docs/reactors：无**；**events：** 监听两个 `MediaQueryList` 的 `change`；**apis provided：** 上述；**needed：** `window.matchMedia`。**settings keys：** 无。

**状态与持久化。** 无状态；`queries` 惰性缓存 `(min-width: 768px)` 与 `(min-width: 1024px)` 两个 `MediaQueryList`，`useViewport` 用 `useSyncExternalStore` 订阅。

**UI 位置。** 不渲染；`actions.regionOpen`/`useRegionOpen` 用它决定桌面共享状态与移动端本标签状态；`overlays()` 决定 `setRegionOpen` 是否关闭另一个区域。

**关键流程。** 1) `viewport()` 先 desktop，再 tablet，否则 phone。2) `overlays('sidebar')` 在 phone 真、tablet/desktop 假；`overlays('panels')` 在 phone/tablet 真、desktop 假。3) `useViewport` 订阅两个断点，任一变化重渲染。4) `touchKeyboard` 直接读 `(pointer: coarse)`，不订阅。

**失败与恢复。** 无异步失败；SSR 下 `matchMedia` 不存在会抛错（本应用纯浏览器，推断不需兼容）。

**关掉它会发生什么。** 移动端退化为桌面假设：侧栏/右栏错误共享桌面状态，面板在手机上不覆盖而是挤占宽度；软键盘检测失效。

**复刻要点。** 断点必须与 CSS 的 768/1024 一致；桌面用 `ultimate.ui` 共享开关，手机/平板用 `store.ui.open` 每标签开关；tablet 的 sidebar 默认开、panels 默认关（`ownDefault`）；`overlays` 默认参数是当前 viewport。

**证据。** `viewport.ts:9-40`；`actions.ts:70-100`；`hooks.ts:244-252`。

#### 2.10 test-hook

**职责与用户可见行为。** 仅在 `sessionStorage.ultimate.driven === '1'` 时把 `window.ultimate` 装到页面，让浏览器/截图工具用状态而非 sleep 驱动 Ultimate：读当前会话与忙碌标记、以用户身份提交文本、等待"这一轮结束/全局安静/出现某类 entry/出现某个持久事件"。

**导出与契约。** `Condition`（`'idle' | 'quiet' | {entry} | {event,where?}`）、`UntilOptions`、`createTestHook(store, api)`、`TestHook`。**tools/actions/docs/events/reactors：无**；**events：** 通过 `store.watchDocOf(ROOT, EVENT_FEED)` 读根事件 feed；**apis provided：** `state()`、`send(text,{conversation?})`、`until(condition, options?)`；**needed：** `store`、`api`、`EVENT_FEED`。**settings keys：** `ultimate.driven`（sessionStorage）。

**状态与持久化。** 内存 `Map<conversation, Sent>`，`Sent = {at, entry, event, ran}`；`lastSent` 记录最近一次发送。`watchDocOf(ROOT, EVENT_FEED)` 在页面生命周期内保持。

**UI 位置。** 无 UI；挂到 `window.ultimate`。

**关键流程。** 1) `ready()` 等 `view` 与 `tasks` 同时存在，默认 30 秒。2) `state()` 返回 `shown`、每个会话的 `{id,title,busy}`、当前 view 的 entry kind 列表。3) `send()` 先 `ready()`，目标不是当前会话则 `watchConversation(id)`，记录最后 entry id 与最后 event id，调 `api.submit`，返回 `{conversation, submissionId}`。4) 订阅 store，把 `summary.busy` 或 `summary.answerAt >= record.at` 记为 `ran`，解决"太短的轮次从未显示 busy"。5) `until('idle')` 等本轮 `ran` 且目标不 busy；`quiet` 等本轮 `ran` 且所有会话不 busy；`{entry}` 等 `id > 发送前最后 entry` 的该 kind；`{event}` 等 `id > 发送前最后 event`、name 匹配且 `where` 每键 JSON 相等。6) 超时错误带 `busyLine`（任务 phase）或最近 entry/事件名。

**失败与恢复。** 超时抛带描述与剩余状态的错误；`until` 默认 300 秒、`ready` 30 秒；没收到首个快照报 `the page never received its first snapshot`；`{entry}` 对非当前会话会临时 watch；hook 只安装一次。

**关掉它会发生什么。** 浏览器工具退化为盲等/轮询 DOM；普通用户无影响。

**复刻要点。** `ran` 不能只看 `busy`，要加 `answerAt >= at`；发送游标必须在 `api.submit` 之前取；`{entry}`/`{event}` 严格用 `>` 不是 `>=`；`quiet` 要查所有会话；`EVENT_FEED` 是根会话文档；只应在受控浏览器开启。

**证据。** `test-hook.ts:9-46,49-85,87-114,119-192`；`client.ts:57-58`；`shared/events.ts:84-86`。

#### 2.11 client

**职责与用户可见行为。** 组合根：创建页面唯一的 `store`、`api`、`uiState`、`registry`，按 URL `?conversation=` 与 `shell.conversation` 双向同步选择，持久化主题，检测服务端进程换代，处理未捕获 action 错误与 HMR。用户可见：刷新保持会话、前进/后退可用、主题跟随本机、core 换代后 UI 状态不串。

**导出与契约。** `store`、`api`、`uiState`、`registry`、`replaceNextSelection()`。**tools/actions/docs/reactors：无**；**events：** 无；**apis provided：** 上述单例；**needed：** `store`/`api`/`registry`/`ui-state`/`test-hook` 工厂，浏览器 `history`/`localStorage`/`sessionStorage`。**settings keys：** `ultimate.theme`（localStorage）、`ultimate.detached`、`ultimate.driven`（sessionStorage）、`shell.conversation`（在 `ultimate.ui`）。

**状态与持久化。** 模块级 `initialUrl`、`initialized`、`replaceSelection`、`selected`、`server`、`stale`；`detached` 页面不写 `uiState` 且后续不跟随远端；`driven` 页面安装 `window.ultimate`。

**UI 位置。** 无；它决定根组件的初始数据与 URL。

**关键流程。** 1) 启动：`createStore({ui:{theme: localStorage...}})` → `createApi` → `createUiState(detached ? undefined : api.updateUi)` → 条件装 test hook → `createRegistry`。2) 订阅 store：首个 `system` 且 registry 未 ready 时 `receiveSystem()`；用 `pid:generation` 判断换代，换代时 `uiState.restarted()` 并把旧 `shared` 记为 `stale`。3) 首次 `shared`：`uiState.receive(shared)`；URL 的合法 `conversation` 写 `shell.conversation`，非法则删除该 key；`initialized=true` 后 `followSelection()`。4) `followSelection` 读 `shell.conversation` 的数字，写 URL（`replaceSelection` 决定 replace/push），再 `store.show(id)`。5) `popstate` 反向：读 URL → set/delete `shell.conversation` → `followSelection` → 规范化 URL。6) 只有 `requested === view.conversation.id`（用户真的选了）才写 URL，流回退到根不算选择。7) `pagehide` 调 `uiState.flush()`；未捕获 `ActionError` 转 notice；模块自接受 HMR 时整页 reload。

**失败与恢复。** `onFallback` 置 `replaceSelection=true` 并删 `shell.conversation`；`stale` 防止换代瞬间旧 `shared` 覆盖新状态；主题异常值按 dark 处理；`popstate` 即使选择未变也重新规范化 URL。

**关掉它会发生什么。** 没有单例，所有 hooks/组件失去数据源；URL 与 UI 状态不同步，刷新回到根会话。

**复刻要点。** `initialUrl` 必须在任何 `history.replaceState` 前抓取；初始化顺序必须是"先吃保存值，再让显式 URL 胜出"；`replaceSelection` 在每次 `followSelection` 后复位；`pid:generation` 是"新进程、可能换存储"的唯一依据；单例一旦热替换会产生第二条 SSE，必须整页 reload。

**证据。** `client.ts:14-43,48-60,63-105,107-142,144-146`。

#### 2.12 types / index

**职责与用户可见行为。** 定义 web facet 能贡献的一切及公共导出面。`types.ts` 是编译期契约，`registry.ts` 是运行期校验；`index.ts` 是 `@/sdk` 的 barrel，扩展只从这里导入。用户不直接看到它，但 slot 名、快捷键、surface 图标、compact 规则、point 名都由它固定。

**导出与契约。** `SlotName` 共 16 个：`sidebar`、`sidebar.top`、`titlebar.brand`、`titlebar.project`、`titlebar.left`、`titlebar.right`、`header.right`、`statusline.left`、`statusline.right`、`composer.toolbar`、`composer.status`、`composer.actions`、`conversation.overlay`、`transcript.start`、`transcript.end`、`overlay`。`WebExtension` 共 18 个可选键：`slots`、`panels`、`surfaces`、`tools`、`toolLines`、`entries`、`inbox`、`composer`、`link`、`messageActions`、`messageDetails`、`answerLabels`、`userBubble`、`compact`、`intro`、`documents`、`commands`、`provides`。另有 `Contribution`、`PanelContribution`、`SurfaceContribution`、`ToolCallView`（6 种 status）、`ToolRenderer`、`ToolLineRenderer`、`EntryRenderer`、`LinkRenderer`、`InboxRenderer`、`ComposerRenderer`、`DocumentProps`/`DocumentContribution`、`UltimateActions`、`UltimateContext`、`CommandContribution`、`CompactContribution`/`CompactRow`/`CompactQuietTest`/`CompactSummaryProps`/`CompactDocs`/`CompactCallTest`、`IntroContribution`、`Point`/`definePoint`/`Provision`/`provide`、`defineWebExtension`。内置 point：`ParkedRuns`（`ultimate.parked`）、`RunStart`（`ultimate.runStart`）、`ConversationKind`（`ultimate.conversationKind`）、`MessageReference`（`ultimate.messageReference`）。**tools/actions/docs/reactors：无**；**events：** 无；**apis provided：** 类型与 `defineWebExtension`（恒等）、`provide`（`{point,use}`）；**needed：** 无。**settings keys：** 无。

**状态与持久化。** 无状态；`defineWebExtension` 仅返回入参，运行期校验在 registry。

**UI 位置。** 定义所有 slot/panel/surface/command 的合法位置与字段；`index.ts` 还 re-export `Header`、`Conversation`、`Dock`、`Panels`、`Sidebar`、`Slot`、`StatusLine`、`ProjectChip`、`Wordmark`、`ExtensionBoundary`、`Card`、`Fold`、`MessageActions`、`UserText`/`UserView`、`ConversationScope`、`ComposerRedirect` 等原语。

**关键流程。** 1) facet 写 `export default defineWebExtension({...})`。2) `index.ts` 导出 `defineWebExtension`、`definePoint`、`provide` 与相关类型。3) `<Provided point input>`/`<AllProvided>`（`boundary.tsx`，范围外）按 `provisionOf`/`provisionsOf` 解析：单值取最后一个 provider，组合取全部。4) `Contribution` 允许裸组件或 `{component,order?,phone?}`；`phone` 只影响状态线在手机上的保留。5) `tab: false` 的面板默认不进 tab 行；`SurfaceContribution.order` 排在 Agent 之后；`CommandContribution.whileTyping` 允许在 composer 输入时触发。

**失败与恢复。** 类型错误编译期暴露；运行期形状不符由 registry 报错并保留旧版。`useExtensionUiState` 没有 `ExtensionNameContext` 时抛 `useExtensionUiState works inside an extension contribution only`（`hooks.ts:277-284`）。

**关掉它会发生什么。** 所有 facet 无法编译/导入，`@/sdk` 公共 API 不存在。

**复刻要点。** `Point` 的 `input`/`value` 是 phantom，运行时只有 `point` 字符串；`provide` 不要保留泛型到运行时；slot 名是跨版本契约；`defineWebExtension` 保持恒等；`index.ts` 不要导出 `store`/`registry`/`uiState`，否则扩展会绕过 hooks 直接改单例。

**证据。** `types.ts:7-31,34-58,61-126,129-173,179-227,235-278,281-317`；`index.ts:1-168`。

#### 2.13 extensions loader / web-facets

**职责与用户可见行为。** 把 Vite 生成的 `virtual:ultimate/web-facets`（路径 → 动态 import）接到 registry，处理三类热更新：facet 单文件刷新、facet 增删、编译错误。用户可见：改 `web.tsx` 后组件保留状态、页面不刷新；编译失败只在该扩展卡片显示错误，Vite 红色 overlay 被收掉。

**导出与契约。** `loaders: Record<string, ExtensionLoader>`、`loadExtensions(map?)`；全局 `window.__getReactRefreshIgnoredExports`。**tools/actions/docs/events/reactors：无**；**events：** Vite 的 `vite:afterUpdate`、`vite:error`、`import.meta.hot.accept`；**apis provided：** 上述；**needed：** `registry.setLoaders`/`replace`/`fail`、`extensionName`、虚拟模块。**settings keys：** 无。

**状态与持久化。** 模块级 `viteErrors: Map<name,string>`；无持久化。

**UI 位置。** 无；它决定 registry 记录，从而间接决定所有 UI。

**关键流程。** 1) `loadExtensions()` 给每个 loader 包一层：成功清 `viteErrors`；失败先等 50ms（让 `vite:error` 先到），再抛带 `viteErrors.get(name)` 的 Error，`cause` 保留原错。2) `window.__getReactRefreshIgnoredExports` 对 facet 路径返回 `['default']`，让 Fast Refresh 不把 default 当组件检查。3) `accept('virtual:ultimate/web-facets')` 处理增删/整体重载；裸 `accept` 处理自身更新。4) `vite:afterUpdate` 只处理 `type === 'js-update' && path === acceptedPath` 的 facet，带 `?t=<timestamp>` 重新 import，成功 `registry.replace`，失败 `registry.fail`。5) `vite:error` 从 `err.id` 或 `err.loc.file` 取扩展名；有名字才 `viteErrors.set` + `registry.fail`，下一帧移除 `vite-error-overlay`；核心错误保留 overlay。

**失败与恢复。** 单 facet 编译失败时 registry 保留旧 `extension`，只加 `error`；下次成功安装 bump `version`，错误边界重挂。整体 map 重载时已删 facet 从 records 消失。

**关掉它会发生什么。** `loaders` 为空，registry 没有扩展，UI 只剩裸框架；热更新完全不工作。

**复刻要点。** loader key 是文件路径，`extensionName()` 必须兼容 Windows `\` 与 query；错误等 50ms 再抛，否则拿不到 Vite 详细错误；`vite:afterUpdate` 只接受 `path === acceptedPath`；`registry.replace` 必须 bump `version`；`__getReactRefreshIgnoredExports` 只对 facet 返回 `default`。

**证据。** `extensions.ts:1-79`；`web-facets.d.ts:1-3`；`registry.ts:63-66,240-257,313-321`。

#### 2.14 小工具与作用域

**职责与用户可见行为。** `format.ts` 统一 token/字节/时长/时间/路径/复数的格式；`keys.ts` 解析与显示快捷键；`conversation-scope.tsx` 让一个页面同时渲染多个会话（侧聊、分支预览），并让其中的快捷键作用于该会话。

**导出与契约。** `format.ts`：`formatTokens`、`formatBytes`、`formatDuration`、`formatAgo`（re-export `lib/ago.ts`）、`shortenPath`、`elidePath`、`plural`、`errorMessage`、`formatTime`。`keys.ts`：`isMac`、`chordOf`、`parseKeys`、`formatKeys`。`conversation-scope.tsx`：`ConversationIdContext`、`TranscriptContext`、`scopeAttribute = 'data-conversation-scope'`、`ConversationScope`、`scopeOf`。**tools/actions/docs/events/reactors：无**；**events：** 无；**apis provided：** 上述；**needed：** `store.watchConversation`。**settings keys：** 无。

**状态与持久化。** `ConversationScope` 在 effect 里 `store.watchConversation(id)`，卸载释放；`TranscriptContext` 初始为 `undefined`，新作用域重置继承历史；快捷键 scope 通过 DOM 属性读取，不持久化。

**UI 位置。** `ConversationScope` 渲染一个 `display: contents` 的 `div`，带 `data-conversation-scope=<id>`；`scopeOf(target)` 从事件目标向上 `closest` 读 id，供 shell 快捷键使用。

**关键流程。** 1) `chordOf` 优先用 `event.code` 的 `KeyX`/`DigitN`，否则 `event.key.toLowerCase()`；mac 上 meta 记 `mod`，ctrl 另记 `ctrl`；修饰键顺序固定 `mod,ctrl,alt,shift`。2) `parseKeys` 把 `esc` 归一为 `escape`，按固定顺序重排；`formatKeys` 按平台给 `⌘/⌃/⌥/⇧` 或 `Ctrl/Alt/Shift`。3) `ConversationScope` 提供 id 并把 transcript 重置为 `undefined`，子组件的 `useConversation`/`useDoc` 自动落到该会话；`useTranscript` 优先读外层 transcript，没有时 scope 内退回该会话 active entries、scope 外为空。

**失败与恢复。** `scopeOf` 对非 HTMLElement 返回 undefined；id 必须是正安全整数；`watchConversation` 引用计数保证同 id scope 共用一条流；`formatTime` 固定 24 小时制；`shortenPath` 统一把 `\` 换 `/`。

**关掉它会发生什么。** 格式风格漂移；快捷键提示与解析不一致；侧聊/多会话视图的 hooks 落不到正确会话，快捷键作用到主会话。

**复刻要点。** 快捷键必须用 `event.code` 而非 `event.key`；`mod` 只在 mac 映射 meta；`ConversationScope` 必须同时提供 id 与 transcript 并渲染 DOM 属性；`formatAgo` 是服务端/浏览器共用实现，不要复制。

**证据。** `format.ts:1-76`；`keys.ts:1-45`；`conversation-scope.tsx:1-37`。

### 3. 跨扩展协作

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

### 4. 复刻顺序建议与风险

**顺序。** 1) 先定 `types.ts` + `index.ts` + `shared/protocol.ts` 的 token：slot 名、18 个 `WebExtension` 键、事件名、`ROOT=1`、`UI_REVISION='ui.rev'`、`EVENT_FEED='ultimate.event-feed'`。2) 写 `store.ts` + `api.ts`，用可注入的 `eventSource`/`fetch` 做无网络测试；先跑通快照/ops/重连/fallback。3) 写 `ui-state.ts` + `client.ts`：先验证"本地写→150ms 批→rev→快照释放"和"进程换代 epoch"，再接 URL/主题/兜底。4) 写 `registry.ts` + `extensions.ts` + `web-facets.d.ts`：先做形状校验、就绪态与选择器，再做 HMR。5) 写 `hooks.ts`，按 `useConversation`→`useDoc*`→`useUiState`→`useAction`→`useRestart`；之后 `actions.ts`/`viewport.ts`。6) `events.ts`、`resume.ts`、`test-hook.ts` 最后补。每步验收：store 在断网/重连/切会话下保持副本；registry 在一个 facet 抛错时保留其余；ui-state 两标签收敛；HMR 不产生第二条 SSE。

**风险。** 1) SSE 契约漂移：少注册事件或 `view` 不做 raw 去重，表现为"偶尔不更新/整树重渲染"。2) ops 与快照竞态：旧流 ops 落到新 `view` 会污染副本，必须用 `source !== current` 与 generation/token 双重防护。3) 就绪死锁：`ready = settled && systemReceived`，忘了 `registry.receiveSystem()` 则 App 永不渲染 surface，8 秒 `timedOut` 只是遮羞布。4) HMR 双流：`client.ts` 单例若被热接受而非整页 reload，会同时存在两个 EventSource，表现为重复通知/重复 ops。5) UI 状态 revision：不按 `ui.rev` 释放 overlay 会让旧标签的写永远覆盖新值；客户端改 `ui.rev` 会 400；超过 256KB 会 413。6) 移动端状态混用：把 `shell.sidebarOpen` 用在手机上会让桌面开关影响手机。7) URL 选择：把流回退的根会话写进 URL 会让刷新永远停在根；`replaceNextSelection` 必须在每次 follow 后复位。8) resume 快照：`sessionStorage` 是完整 DOM，可能含敏感文本；配额失败要静默降级，30 秒/8 秒两个时限要一致。9) test hook：`ultimate.driven` 是 sessionStorage 开关，任何同源脚本都能设置，只应在受控浏览器开启。10) 内存：`recent` 保留 6 个完整 view，长转录 ×6 可能很大；`notices` 上限 50 是有意的。

**证据（总览）。** `index.ts:1-168`；`client.ts:14-146`；`store.ts:105-435`；`api.ts:20-160`；`registry.ts:27-639`；`hooks.ts:40-563`；`actions.ts:18-219`；`ui-state.ts:17-166`；`events.ts:1-35`；`resume.ts:1-127`；`viewport.ts:1-40`；`test-hook.ts:1-195`；`types.ts:1-317`；`extensions.ts:1-79`；`web-facets.d.ts:1-3`。

---

## B.2 平台 Web 应用（platform-web-app）分析笔记

> 范围：`web/src/app/`（22 个文件）、`web/src/components/`（24 个文件）、`web/src/index.css`、`web/src/main.tsx`、`web/index.html`、`web/public/manifest.webmanifest`。范围内没有任何 README.md，产品语义按 App 组合与既有 web-shell 结论校准；导出名、slot 名、事件名以 `web/src/sdk/types.ts`、`registry.ts`、`actions.ts` 交叉核对（SDK 本身由 `platform-web-sdk` 笔记覆盖，此处不展开）。

### 1. 概览

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

### 2. 逐扩展规格

#### 2.1 App 组合与 surface 宿主

**职责与用户可见行为。** 页面只在 web facet 落定且首个 `system` 快照到达后显示 surface，避免半加载界面；所选 surface 崩溃或缺失时依次回退到 Agent、再到裸会话，并给出警告；窗口标题随项目、会话、surface 与忙闲变化；扩展加载错误卡和 `overlay` slot 可以在 surface 之前先出现。

**导出与契约。** `App`；`SurfaceContext`、`useSurfaceId`、`useRegion`（`surface.ts:6-12`）。内部 `Frame`、`Surfaces`、`SurfaceBoundary`、`onScreen`、`useDocumentTitle`、`Shortcuts`。**tools/actions/docs/reactors：** 无。**events：** 不直接收发；渲染稳定后调用 `rendered()`（`App.tsx:154-156`）。**apis provided：** `SurfaceContext` 与 `ExtensionNameContext` 两个 React context；无扩展 API。**apis needed：** `useReady`、`useExtensions`、`useShownSurface`、`useStore`、`useConversation`、`useConversations`、`useSystem`、`surfaceItems`、`HOME`、`uiState.set`、`rendered`。**settings keys：** 写 `shell.shownSurface`；经 `useShownSurface` 读 `shell.surface`；`state.ui.surface` 只在本标签。

**状态与持久化。** `shell.shownSurface`（`{id,title}`）写在根会话的 `ultimate.ui` 文档，跨标签/刷新保留；`reported` 是模块级去重变量，`embedded = window.top !== window` 是模块级常量。无 SQLite/文件直写，保留策略由 `ultimate.ui` 文档决定（范围外）。

**UI 位置。** 应用根；`overlay` slot（`App.tsx:187`）；surface 由贡献表的 `surfaces` 决定；`Frame` 是最后的裸会话（Header + Conversation + StatusLine）。

**关键流程。** 1) `main.tsx` 先 `store.start()`、`loadExtensions()`，再 `createRoot(#app).render(<App/>)`。2) `loaded = useReady().ready`；`ready = state.shared !== undefined && state.system !== undefined`；`pending` 时只渲染 TitleBar 之外的空壳，不渲染 surface。3) `line = [surface, surface.id === HOME ? undefined : home]`，`Surfaces` 逐个尝试。4) `SurfaceBoundary` 捕获异常，`componentDidCatch` 发 warning notice；`getDerivedStateFromProps` 在 `surface.version` 变化时清 `failed`。5) 成功挂载/更新时 `onScreen()` 比较后写 `store.ui.surface`；effect 再把 `shown` 持久化为 `shell.shownSurface`。6) `useDocumentTitle` 拼成 `[project ?? 'Ultimate', 会话或 surface]`，busy 时前缀 `●`。

**失败与恢复。** 缺失 surface 在 `ready` 后只报一次（`reported`）；首选失败渲染 Agent，Agent 也失败渲染 `Frame`；`Frame` 自己 `onScreen({id: HOME, title: 'Agent'})`。surface 热更新版本变化自动重试。若 Agent facet 也没有，仍显示裸会话而不会白屏。

**关掉它会发生什么。** 没有根组件，`#app` 为空；surface、slot、命令面板、错误卡全部不挂载。

**复刻要点。** ready 门槛必须同时等 facet 落定与首个 system；overlay/错误卡不能受 ready 限制；`SurfaceBoundary` 要以 `extension:id` 为 key，否则切换 surface 会复用错误状态；`onScreen` 必须写“实际渲染”的面而不是“想显示”的面，`useUltimate().surface` 才准确。

**证据。** `App.tsx:29-44,47,56-113,119-129,143-189`；`surface.ts:6-12`；`main.tsx:8-14`。

#### 2.2 转录 Transcript

**职责与用户可见行为。** 转录是产品中心：用户回合、助手文本/思考、工具卡、压缩与重置分隔、未知 entry、流式 partial、最终答案标记、消息悬浮操作、空态、向上分页、发送后强制跟随、按 entry 定位 reveal，以及 compact 折叠和后台行折叠。用户能感知的行为是：切会话不继承滚动位置；上滚后不被流式输出拉回；发送后回到底部；长会话只加载窗口并可按需补历史。

**导出与契约。** `transcript.tsx` 导出 `Transcript`、`LiveLines`；`model.ts` 导出 `ToolResult`、`indexTools`、`slotsOf`、`resultText`、`callsStart`、`toolCallView`、`partialOf`；`compact.ts` 导出 `CompactPart`、`WorkRun`、`QuietGroup`、`AsideGroup`、`compactRows`、`groupQuiet`、`quietOf`、`windowKey`、`windowGaps`、`setAsideIds`、`partKey`、`isOpenIn`、`openIn`、`anchorSelector`、`partsOf`、`groupAside`、`runOf`；`user-turn.tsx` 导出 `textOf`、`skillInput`、`UserText`、`UserView`；`message-actions.tsx` 导出 `MessageActions`；`tool-call.tsx` 导出 `ToolCallBlock`、`GenericToolCall`；`transcript-skeleton.tsx` 导出 `TranscriptSkeleton`；`follow.ts` 导出 `ScrollPlace`、`readerLeft`；`fork.ts` 导出 `reachedFork`；`fold.tsx` 导出 `foldKey`、`readFold`、`writeFold`、`useFold`、`Fold`；`card.tsx` 导出 `Card`。**tools/actions/docs/reactors：** 无。**events：** 监听 `ultimate:sent`（同会话时立即回底）与 `ultimate:reveal-entry`（`{conversationId, entryId}`）。**apis provided：** 上述渲染函数/组件。**apis needed：** `entryRenderers`、`toolRenderers`、`toolLine`、`messageItems`、`useCompact`/`useCompactQuiet`/`useIntro`、`Slot`/`Provided`、`api.history`、`useStickToBottomContext`；point `ParkedRuns`、`RunStart`。**settings keys：** 无。

**状态与持久化。** active `EntryRecord[]`、`LiveState`、`inbox` 来自 `useConversation()` 的流副本；`history` 是组件 state，仅内存，按 id 去重合并；`opened`/`shownQuiet`/`shownAside` 是本次挂载的展开集合；折叠卡用 `localStorage['ultimate.fold.<conversation>.<card>']`，只存 `open`；无 doc 写入，历史条目本身在服务端 SQLite（经 `api.history` 读）。

**UI 位置。** `Conversation` 内（`main` 或 `dock`）；`transcript.start` 仅在“有可见行且 `cursor === undefined`（历史已全）”时渲染；`transcript.end` 总在最后；`LiveStatus` 在末尾显示重试/压缩/思考/工作计时；entry 与 tool 渲染器都在行内。

**关键流程。** 1) 合并 `history`、`previousActive`、`active`，按 id 排序。2) `indexTools` 建 result/call 索引，`visible` 过滤掉已有 call 的 `pi.tool-result`（结果在工具卡里显示）。3) 有 `compact` 时 `compactRows` 折叠工具/思考，再按 `quiet` 折叠后台行、按 `setAsideIds` 折叠 go-back 行。4) `EntryView` 用 `entryRenderers` 逐层包裹 `coreEntry`；`ToolCallBlock` 用 `toolRenderers` 逐层包裹 `GenericToolCall`。5) 顶部 sentinel 进入视口时 `loadEarlier`：`api.history(id, cursor, signal)`，记录锚点、补 `tailSpace`、合并、更新 `before`/`exhausted`。6) 新 compaction/reset 出现时中止请求、重置窗口；`windowGaps` 补“窗口未覆盖的存储区间”。7) `ultimate:reveal-entry` 缺行时 `loadDown(target)`，再依次打开 aside/quiet/compact 组，最后 `scrollIntoView({block:'start'})`。

**失败与恢复。** 历史加载失败显示 “Could not load earlier messages” + Retry；Retry 清 error 后重跑失败区间并继续 sentinel。单个 entry/tool/panel 渲染器抛错由 `ExtensionBoundary` 显示错误卡并回退到 core。未知 kind 渲染可展开的 JSON。`reachedFork` 在 fork 点停止分页，避免把源会话更早历史混进来。请求用 `AbortController`，切换会话/新的 compaction 会 abort。

**关掉它会发生什么。** `Conversation` 只剩 Composer，用户看不到任何消息、工具卡或流式输出；历史 API 仍可被别的组件调用，但没有渲染入口。

**复刻要点。** `EntryView` 的 `memo` + `sameRow` 是流式性能关键：只随 entry、可见工具结果和 slot 变化重渲染。`key={id}` 必须加在滚动容器上。跟随逻辑要同时处理 `use-stick-to-bottom`、`readerLeft` 与 `overflow-anchor`，否则上滚会被拽回。分页的锚点、`tailSpace`、`windowKey`/`windowGaps` 是长会话最容易出错的部分；不要用“按最小 id 游标”代替 head marker 语义。

**证据。** `transcript.tsx:85-184,186-713,922-995,1011-1093,1095-1190,1282-1370`；`model.ts:11-95`；`compact.ts:29-134,146-195,229-269`；`follow.ts:18-20`；`fork.ts:13-20`；`fold.tsx:8-73`；`user-turn.tsx:13-111`；`message-actions.tsx:17-73`；`tool-call.tsx:17-55`。

#### 2.3 Composer

**职责与用户可见行为。** 每个会话独立的输入框：草稿自动保存；空闲 Enter 发送、忙碌 Enter 默认 steer、Alt+Enter follow-up、Shift+Enter 换行；触摸键盘 Enter 只换行；忙碌时显示 Stop；↑ 在首行可把队列召回编辑器；粘贴图片（最多 4 张、每张 2 MiB，PNG/JPEG/WebP/GIF）；模型不可用时禁用并说明原因；扩展可包裹 composer 或把发送重定向到别处。

**导出与契约。** `composer.tsx` 导出 `Composer`、`ComposerTarget`、`ComposerRedirect`、`fillComposer`、`insertIntoComposer`；`queued.ts` 导出 `QueuedInput`、`spliced`、`queuedInput`、`queuedLine`、`previewParts`、`atFirstLine`、`withdrawQueuedSteer`、`mergedSteer`、`recallQueued`、`recalledText`；`image-paste.tsx` 导出 `PastedImage`、`useImagePaste`、`ImagePreviews`。**tools/actions/docs/reactors：** 无。**events：** 发送前 `events.emit('ultimate:sent', {conversationId})`。**apis provided：** 上述组件与 `ComposerTarget`；**apis needed：** `composerRenderers`、`inboxRenderer`、`Slot`、`useIntro`、`useModels`、`api.submit/abort/cancelSubmission`、`useImagePaste`。**settings keys：** 无；草稿键 `ultimate.draft.<id>`。

**状态与持久化。** 模块级 `drafts: Map<number|string|undefined, Draft>`，每项含 `text/images/error/sending/revision`；`text` 存 `localStorage['ultimate.draft.<id>']`，发送成功且 `revision` 未变才删除/清空；图片只在内存；`pi.inbox` 的队列在服务端 doc，取消走 HTTP；`sending`/`error` 不持久化。

**UI 位置。** `Conversation` 底部；`composer.toolbar`（输入框上方左）、`composer.actions`（Send 旁，重定向时不显示）、`composer.status`（输入框下方状态行）；`Inbox` 在输入框上方列出 steer/follow-up。

**关键流程。** 1) `getDraft(id)` 取/建草稿，`useSyncExternalStore` 订阅；挂载时从 localStorage 同步一次。2) `update(value)` 写 `text` 与 `revision`，空值删键。3) `send(whenBusy?)`：守卫 loading/empty/blocked/sending/`pending`/无 id；`mode = busy ? whenBusy ?? 'steer' : undefined`；忙碌 steer 先 `withdrawQueuedSteer`，有旧 steer 就 `mergedSteer`；emit `ultimate:sent`；`api.submit(text.trim(), mode, id, images)`。4) 成功用 `clearDraft(snapshot)`：`revision` 变了就不覆盖用户新输入；localStorage 已被别的标签改写则保留存储值。5) 失败把文本从 localStorage 恢复（revision 未变时），被合并的旧 steer 以 `mergedSteer` 放回草稿并前置图片，错误显示在状态行。6) ↑ 首行且无 target：`recallQueued`（steer 先、follow-up 后）逐条 `cancelSubmission`，`recalledText` 拼回编辑器。7) Stop 调 `api.abort(id)`，失败显示在草稿错误。

**失败与恢复。** 队列项已被 run 取走时 `cancelSubmission` 返回 409，`withdrawQueuedSteer`/`recallQueued` 把它当作 `undefined` 跳过（已出现在转录里，不重复）。图片超限或类型不符给固定错误文案。`blockedBy` 在无模型或模型不可用时给 `provider/model is not available…` 并禁用发送。`ComposerRedirect` 目标带图片时拒绝发送（“Images stay here”）。

**关掉它会发生什么。** 用户无法输入或发送；转录只能只读浏览，队列无法召回或取消，Stop 也不可用。

**复刻要点。** 草稿按会话隔离，且发送期间新输入不能被清空（`revision` 守卫）；`pending` 是图片读取中的 ref，不是 state；忙碌默认 steer、Alt 变 follow-up 的语义要与服务端 `SubmitRequest.whenBusy` 对齐；`data-composer-target` 是键盘作用域识别的锚点；`fillComposer`/`insertIntoComposer` 必须走同一草稿存储，才能被命令和扩展复用。

**证据。** `composer.tsx:75-140,143-151,153-173,184-237,249-348,350-440`；`queued.ts:14-113`；`image-paste.tsx:11-118`；`shared/protocol.ts:13-15`（图片限制）。

#### 2.4 标题栏 TitleBar

**职责与用户可见行为。** 每个 surface 顶部的全局条：ULTIMATE 字标、项目 chip（项目名/分支 checkout/预览标记）、桌面 surface 标签、移动端 surface 下拉、平板上的常用 panel 图标、右侧 slot 与命令面板入口。它让用户随时知道“在哪个项目、哪个 surface”，并一键切换。

**导出与契约。** `projectTitle`、`projectName`、`ProjectChip`、`Wordmark`、`TitleBar`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 上述组件/函数，`ProjectChip` 供扩展替换 `titlebar.project`。**apis needed：** `surfaceItems`、`panelItems`、`shownPanels`、`slotItems`、`actions.showSurface/openPanel/closePanel`、`useUiState(shellKeys.panel)`、`useRegionOpen`、`useViewport`、`HOME`、`Shortcut`。**settings keys：** 读 `shell.panel`；surface 选择经 `actions.showSurface` 写 `shell.surface`。

**状态与持久化。** 自身无持久状态；`shell.panel` 记住上次面板；surface 选择由 `shell.surface` 持久化；`SystemInfo` 来自流。

**UI 位置。** 全窗口顶部（嵌入时隐藏）；`titlebar.brand`、`titlebar.project`、`titlebar.left`、`titlebar.right` 四个 slot；移动端是 surface 下拉，`md` 以上是标签行；`PanelActions` 仅 `tablet` 且 `HOME` surface 显示。

**关键流程。** 1) `Brand` 在桌面渲染 `titlebar.brand` slot 或 `Wordmark`，在手机把 wordmark 变成 surface 下拉触发器。2) `Project` 有 `titlebar.project` slot 就整体替换，否则 `ProjectChip`。3) `SurfaceItems` 遍历 `surfaceItems`，当前项 `aria-current="page"`，前 9 个 tooltip 带 `mod+1…9`。4) `PanelActions` 按 `quickPanels = ['todos','tasks','activity','info']` 分快按钮与 `⋯` 菜单，点击打开/关闭 panel。5) 右侧渲染 `titlebar.right`、平板 panel 动作、两个响应式命令按钮（宽屏 “commands” + `mod+k`，窄屏图标）。

**失败与恢复。** 无 `SystemInfo` 时 chip 返回 null，不阻塞标题栏；worktree 路径不匹配时退回 `shortenPath(project.root)`；持久化目录不在 `~/.ultimate/projects` 下时显示 `preview ·`；没有 surface 时 `SurfaceItems` 为空，仍可用命令面板。

**关掉它会发生什么。** 失去项目标识、surface 标签/下拉和平板 panel 快捷入口；surface 仍可经 `mod+1…9` 与命令面板切换。

**复刻要点。** `projectTitle` 的 worktree 正则 `\/\.ultimate\/projects\/(.+)-[\da-f]{8}\/worktrees\/(\d+)$` 与 `projectName` 的“自身仓库不显示名字”规则要一致；左侧品牌块 `md:w-72` 必须与 Agent 侧栏宽度同步，否则 surface 标签会漂移；`quickPanels` 是产品约定，不是通用推导。

**证据。** `titlebar.tsx:32-58,65-116,122-217,220-259,262-338,345-389`。

#### 2.5 命令面板 Palette

**职责与用户可见行为。** `mod+k` 打开的可搜索命令列表：core 命令、每个 surface 的切换命令、所有扩展命令按组展示；选中后关闭面板并执行。当前 surface 的切换命令和“打开命令面板”自身会被隐藏，避免无操作项。

**导出与契约。** `Shortcut`、`CommandPalette`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 上述组件。**apis needed：** `useCommands`（`allCommands`）、`applies`、`currentContext`、`actions.runCommand`、`store.setUi`、`formatKeys`、`Kbd/KbdGroup`、cmdk 的 `CommandDialog`。**settings keys：** 无；`paletteOpen` 只在内存 store。

**状态与持久化。** `state.ui.paletteOpen` 是易失状态，刷新即关；没有 localStorage/doc 写入。

**UI 位置。** 全局模态对话框（`top-[18%]`、`sm:max-w-xl`），不是 slot/panel；每个命令显示标题和可选快捷键。

**关键流程。** 1) 读取 `open`、`commands`、`context = currentContext()`。2) `hidden = {'ultimate.palette', 'ultimate.surface.<当前 surface>'}`；关闭时不计算可见项。3) `visible` 过滤 `applies(command, context)`；`Map.groupBy(command.group ?? command.extension)` 分组。4) `CommandItem` 的 `keywords` 是 `[id, extension]`，`value` 是 `title + id`。5) 选中后先 `store.setUi({paletteOpen:false})`，再 `actions.runCommand(id)`；命令失败由 `runCommand` 转 notice。

**失败与恢复。** `when` 抛错时 `applies` 隐藏该命令并发一次 notice（`extension … command … is hidden, its when() threw`）；`run` 的 Promise 拒绝显示 `标题 (扩展): 错误`；无匹配显示 “No matching command.”。

**关掉它会发生什么。** 失去可搜索命令入口；快捷键和标题栏/面板按钮仍可执行部分命令。

**复刻要点。** 隐藏“当前 surface”要用渲染时的 `context.surface`；命令组缺省是扩展名；`value` 同时含 title 与 id 才能按 id 搜到；关闭面板要先于 `run`，否则命令打开的新对话框会被面板抢焦点。

**证据。** `palette.tsx:17-29,32-82`；`actions.ts:177-218`（命令来源，SDK 范围）。

#### 2.6 键盘 Keyboard

**职责与用户可见行为。** 全局捕获键盘：支持 `mod+shift+m` 这类和弦与 `mod+k m` 这类序列；序列首和弦先执行自己的命令（如打开面板），1.2 秒内可继续第二键；输入框里普通键不误触，带修饰键的快捷键仍可用；`whileTyping` 命令（Escape、Shift+Tab）只在 composer 生效且对话框打开时禁用；在 `ConversationScope` 内按键会作用于该会话。

**导出与契约。** `useShortcuts`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 全局 keydown 监听 hook。**apis needed：** `allCommands`、`parseKeys`、`chordOf`、`applies`、`currentContext`、`scopeOf`、`runCommand`、`CommandItem`。**settings keys：** 无。

**状态与持久化。** 闭包内 `pending: string[]` 与 `timer`（1200ms），只存在于本次挂载；无持久化。

**UI 位置。** 不可见；`Shortcuts` 组件在 `App` 内挂载，仅在 `loaded` 后启用。

**关键流程。** 1) window `keydown` 捕获阶段；忽略 `defaultPrevented`、`isComposing`、纯修饰键。2) `chord = chordOf(event)`，`sequence = [...pending, chord]`。3) 候选 = 所有 `keys` 存在且 `applies` 的命令，解析成 chord 数组。4) 判定 `typing`（INPUT/TEXTAREA/SELECT/contentEditable）、`composer`（`textarea[data-composer-target]`）、`emptyPalette`（面板打开且输入框为空）、`dialogOpen`（`[role=dialog]`）。5) `exact` 命中且 `allowed` 则 `preventDefault`；序列第二键先关面板，再 `runCommand(id, context)`。6) `longer` 候选存在则保留 `pending` 并重置 1.2s 计时；`exact` 命中时也保留，以支持“执行后继续序列”。

**失败与恢复。** 没有匹配则完全不干预；`when` 抛错由 `applies` 隐藏并报一次；对话框打开时 `whileTyping` 命令不执行；取消挂载清 timer 并移除监听。

**关掉它会发生什么。** 所有键盘快捷键失效；命令面板、标题栏按钮和面板图标仍可完成大部分操作，但 Escape/Shift+Tab 等 composer 内快捷行为消失。

**复刻要点。** 必须用捕获阶段，才能在 Radix 对话框/输入框之前判定；`chordOf` 用 `event.code` 归一字母/数字键，避免 Shift 改变字符；序列超时和 `pending` 清理要在同一处；`whileTyping` 只允许 composer 的 textarea，不允许任意输入框。

**证据。** `keyboard.ts:8-79`；`keys.ts:1-45`（SDK 范围）。

#### 2.7 表面原语与故障边界 Primitives

**职责与用户可见行为。** 给 surface 作者一组稳定积木：`StatusLine`（左右 slot、手机收纳）、`Conversation`（transcript + composer + overlay）、`Sidebar`（左栏/手机覆盖层）、`Panels`（右栏 tab、溢出菜单）、`Dock`（可折叠可拖拽侧区）、`Header`（侧栏/面板开关、面包屑、`header.right`）、`Slot`/`Provided`/`ExtensionBoundary`/`ErrorCard`/`ExtensionErrors`。用户看到的是：响应式布局、可拖宽的 dock、单个扩展组件崩溃只坏一张卡、面板 tab 自动收纳。

**导出与契约。** `primitives.tsx` 导出 `StatusLine`、`Conversation`、`sidebarWidth`、`sidebarWidthBeyondPhone`、`Sidebar`、`Panels`、`Dock`，并 re-export `Header`、`Slot`；`header.tsx` 导出 `IconButton`、`Header`；`boundary.tsx` 导出 `ErrorCard`、`ExtensionBoundary`、`Provided`、`AllProvided`、`Slot`、`ExtensionErrors`；`layout.ts` 导出 `column`；`surface.ts` 导出 `SurfaceContext`、`useSurfaceId`、`useRegion`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 上述组件；`@/sdk` barrel 把 `Conversation/Dock/Header/Panels/Sidebar/Slot/StatusLine` 暴露给扩展。**apis needed：** `panelItems`、`shownPanels`、`slotItems`、`layout.mount`、`useRegionOpen`、`actions.openPanel/closePanel/togglePanel/toggleSidebar`、`useUiState`、`useViewport`、`overlays`、`provisionsOf/provisionOf`。**settings keys：** `shell.panel`、`shell.panelOpen`、`shell.sidebarOpen`、`shell.dock.<surface>.<side>`。

**状态与持久化。** `shell.panel` 记住选中 tab；桌面 `shell.panelOpen`/`shell.sidebarOpen` 共享，窄屏 `state.ui.open[viewport]` 只在本标签；dock 状态 `{open,width}` 按 surface+side 持久化；`layout` 的 region 计数只在内存，决定 Header 是否显示开关。

**UI 位置。** 16 个 `SlotName` 中核心宿主 `sidebar`、`titlebar.*`、`header.right`、`statusline.left/right`、`composer.toolbar/status/actions`、`conversation.overlay`、`transcript.start/end`、`overlay`；`sidebar.top` 不在核心宿主，由 sidebar 扩展在自己的 `sidebar` 内容里渲染（推断自 `extensions/sidebar/sidebar.tsx:556`，范围外）。`Panels` 是右栏，`Dock` 是任意 surface 可用的侧区。

**关键流程。** 1) `Sidebar`/`Panels` 用 `useMountRegion` 在 layout 中登记；`Header` 据此决定是否显示 `mod+b`/`mod+alt+b` 开关。2) `Sidebar` 空 slot 返回 null；`overlays('sidebar', viewport)` 为真时用 `Overlay`（85% 宽、最大 26rem、点击遮罩/侧滑 >64px 关闭、`inert`）。3) `Panels` 用 `shownPanels` 选 active；`PanelTabs` 在隐藏测量行里比较 label/icon 宽度，先让非当前 tab 只显示图标，再溢出到 `⋯`。4) `Dock` 读持久 `{open,width}`，宽度 `clamp(280, window.innerWidth-360)`，拖动内边分隔条写回，双击重置 416；折叠成 40px 轨道并显示 busy 点。5) `Provided` 取最后一个 provider，`AllProvided` 按发现顺序串起来；每个 contribution 都在 `ExtensionBoundary` 内，错误显示 inline 卡并回退。

**失败与恢复。** `ExtensionErrors` 在右下角列出所有加载失败的 facet，显示 `extensions/<name>/web.tsx`（builtin 用 `system.code.ultimateRoot`，否则项目根）并标明 “previous version still running”/“not loaded”。`ExtensionBoundary` 按 `version` 重置；`ErrorCard` 有 `inline`/`block` 两种。`Panels` 的每个 tab 以 `extension:id` 为 key，错误不会串到别的 panel。

**关掉它会发生什么。** surface 作者没有布局原语，Agent 等 surface 无法组合；`Slot` 不渲染任何扩展贡献，Header 也不显示侧栏/面板开关。

**复刻要点。** `layout.mount` 必须在 `useLayoutEffect` 中登记/释放，首帧就决定 Header 是否出现；`PanelTabs` 的测量行要 `invisible absolute w-max`，否则会撑开布局；`Dock` 的宽度上限要留 360px 给主区；`Overlay` 的 `inert` 不能省，否则键盘/读屏会穿透；`StatusLine` 的 `phone` 过滤是“true 才留在线上”，未标记项默认进 `⋯`。

**证据。** `primitives.tsx:37-61,64-86,92-100,103-177,184-206,223-344,347-389,402-497`；`header.tsx:23-58,60-128,134-162`；`boundary.tsx:11-57,64-106,113-142,148-186,200-223,226-260`；`surface.ts:6-12`；`layout.ts:1-3`。

#### 2.8 AI 组件与 UI 套件

**职责与用户可见行为。** 提供消息/转录的展示基元：Markdown 流式渲染、代码高亮、思考折叠、工具卡、图片放大、Shimmer 加载文案、自动增高输入框；以及全站 UI 套件（按钮、对话框、下拉、popover、tooltip、checkbox、switch、command、kbd、collapsible、rows、skeleton、JSON tree）。用户看到的是统一的排版、状态色和交互手感。

**导出与契约。** `components/ai/conversation.tsx` 导出 `Conversation`、`ConversationContent`、`ConversationEmptyState`、`ConversationScrollButton`；`message.tsx` 导出 `MessageProps`、`Message`、`MessageContent`、`MentionText`、`MessageResponse`；`reasoning.tsx` 导出 `ReasoningProps`、`Reasoning`、`ReasoningTriggerProps`、`ReasoningTrigger`、`ReasoningContentProps`、`ReasoningContent`；`shimmer.tsx` 导出 `ShimmerProps`、`Shimmer`；`tool.tsx` 导出 `ToolState`、`Tool`、`ToolStatusIcon`、`ToolHeaderProps`、`ToolHeader`、`ToolContent`、`ToolSection`、`ToolInput`、`ToolOutput`、`ToolDiagnostics`、`ToolImage`、`ToolImages`；`code-block.tsx` 导出 `codePlugin`、`BundledLanguage`、`languageFromPath`、`CodeBlockProps`、`CodeBlock`；`ansi-output.tsx` 导出 `AnsiOutput`；`mentions.ts` 导出 `mentionPattern`、`mentionHref`、`parseMention`、`splitMentions`、`remarkMentions`；`prompt-input.tsx` 导出 `PromptInput`、`PromptInputTextareaProps`、`PromptInputTextarea`、`PromptInputFooter`、`PromptInputTools`、`PromptInputSubmitProps`、`PromptInputSubmit`。UI 套件：`Button/buttonVariants`、`Checkbox`、`Collapsible/CollapsibleTrigger/CollapsibleContent`、`Command/CommandDialog/CommandInput/CommandList/CommandEmpty/CommandGroup/CommandItem/CommandShortcut`、`Dialog/DialogContent/DialogDescription/DialogHeader/DialogTitle/DialogTrigger`、`DropdownMenu/DropdownMenuTrigger/DropdownMenuContent/DropdownMenuLabel/DropdownMenuItem/DropdownMenuRadioGroup/DropdownMenuRadioItem`、`Kbd/KbdGroup`、`Popover/PopoverTrigger/PopoverContent`、`Rows/Row`、`Skeleton`、`Switch`、`Tooltip/TooltipTrigger/TooltipContent/TooltipProvider`、`JsonTree`。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 上述组件。**apis needed：** `linkRenderers`（`message.tsx` 的 `Link`）、`ExtensionBoundary`、`useExtensions`、`Streamdown`、`@streamdown/code`、`ansi_up`、`cmdk`、`radix-ui`。**settings keys：** 无。

**状态与持久化。** 基本无持久状态；`Collapsible` 的 `open` 可由调用方受控或内部 `useState`；`CodeBlock` 的 Shiki 高亮结果缓存在 `useTokens` 的 state 中，仅保留同语言上一次结果；`JsonTree` 的展开状态只在组件内。无 doc/SQLite/localStorage。

**UI 位置。** `components/ai/*` 被 transcript、composer 与扩展的卡片使用；`components/ui/*` 被所有 shell/扩展组件使用。`CommandDialog` 是命令面板的外壳，`Dialog` 也用于图片放大。

**关键流程。** 1) `MessageResponse` 用 `Streamdown` 渲染 Markdown，`remarkMentions` 把 `#123`/`#123/456` 改写成 `#conversation-123[-456]` 链接，`Link` 再交给 `linkRenderers` 逐层包裹；`mentionHref` 是裸 fragment，避免 Streamdown 的相对链接拦截。2) `codePlugin = createCodePlugin({themes:['vitesse-light','vitesse-dark']})`，`useTokens` 异步高亮并保留旧结果，`CodeBlock` 支持 `startLine`/`showLineNumbers`/`caret`。3) `Tool` 的 `ToolState` 六态映射 label/icon：`streaming→writing call`、`pending→queued`、`running→running`、`done→done`、`error→failed`、`interrupted→interrupted`；`ToolHeader` 的 `action` 放在 trigger 外，避免按钮嵌套。4) `AnsiOutput` 先用控制序列正则过滤（只保留数字 SGR），再 `ansi_up` + `escape_html = true`，最后 `dangerouslySetInnerHTML`。5) `PromptInputTextarea` 用 `useLayoutEffect` 把 height 设为 `min(scrollHeight, 320)`。6) `Collapsible` 是自研替代 Radix：关闭时 `CollapsibleContent` 返回 null，不做高度测量/动画，避免长转录打开卡死。

**失败与恢复。** `languageFromPath` 对未知扩展名返回 `text`；`MessageResponse` 用 `memo` 比较 `children` 与 `isAnimating`；`Link` 对 `streamdown:incomplete-link` 直接返回 core；`ToolOutput` 只渲染有内容的结果；`ToolImage` 点击才打开大图。`Collapsible` 在缺少 provider 时抛出明确错误。ANSI 注入只允许库生成的转义 HTML。

**关掉它会发生什么。** 转录退化为纯文本/无高亮，composer 没有输入框与按钮，所有对话框/下拉/提示失去统一行为；扩展的卡片也无法复用这些基元。

**复刻要点。** Streamdown 的 `controls` 明确关闭 table/mermaid/download，只留代码复制；Shiki 双主题靠 `.dark .shiki span[style*='--shiki-dark']`；`ToolImage` 的 dialog 必须给 `DialogTitle`（可 `sr-only`）以满足可访问性；`Collapsible` 不要换回 Radix 默认实现，否则长会话会卡；`PromptInputTextarea` 的 16px 触摸字号由 CSS 统一覆盖。

**证据。** `conversation.tsx:10-76`；`message.tsx:15-106`；`reasoning.tsx:15-63`；`shimmer.tsx:14-35`；`tool.tsx:18-217`；`code-block.tsx:11-157`；`ansi-output.tsx:4-16`；`mentions.ts:6-62`；`prompt-input.tsx:9-86`；`components/ui/*`（button/collapsible/command/dialog/dropdown-menu/kbd/popover/rows/skeleton/switch/tooltip/checkbox）；`json-tree.tsx:83-97`。

#### 2.9 视觉与主题 Styling

**职责与用户可见行为。** 全站视觉的唯一来源：深色默认、浅色完整的 OKLCH token；Inter/JetBrains Mono 字体栈；品牌紫 `--brand` 与 success/warning/error/diff/terminal 语义色；Tailwind v4 的 `@theme inline` 映射；safe-area、触屏字号、滚动条、Shiki 暗色、`prefers-reduced-motion`、Markdown 与转录正文的排版。用户可见的是明暗切换即时生效、移动端不被刘海/圆角遮挡、代码块和消息正文密度不同。

**导出与契约。** 无 JS 导出；CSS 契约是 token 名（`--background`、`--foreground`、`--brand`、`--success`、`--warning`、`--note`、`--error`、`--diff-add`、`--diff-del`、`--terminal`、`--sidebar-*`、`--radius`）与动画名（`--animate-shimmer`、`--animate-pulse-dot`、`--animate-fade-in`、`--animate-sweep`）。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** Tailwind utilities 与 `.markdown`/`.safe-area`/`.status-line` 类。**apis needed：** 无。**settings keys：** `localStorage['ultimate.theme']`（读与写）。

**状态与持久化。** 主题是浏览器偏好：`client.ts` 启动时读 `ultimate.theme`，每次 store 变化写回并把 `html.dark` 与 `meta[name=theme-color]` 同步为 `#111112`/`#f9fafb`；无 doc/SQLite。其余 token 是静态 CSS。

**UI 位置。** 全局；`body`、`html`、所有 surface、扩展 `web.tsx` 的 class 都受影响。

**关键流程。** 1) `index.html` 先给 `<html class="dark">`，内联脚本若 `ultimate.theme === 'light'` 则移除 `dark` 并改 theme-color。2) 加载 `index.css`：`@import 'tailwindcss'`、`@import '@fontsource-variable/inter'`、`@source '../../extensions'` 与 streamdown 包，确保扩展 class 被扫描。3) `:root` 与 `.dark` 定义 token；`@theme inline` 映射成 `--color-*`，生成 `bg-background`、`text-brand` 等工具类。4) 用户执行主题命令 → `actions.setTheme` → `store.ui.theme` → `client.ts` 切 class/写 localStorage。5) `.safe-area` 用 `100dvh` + `env(safe-area-inset-*)`；输入聚焦时把底部 inset 置 0，避免键盘上方留缝。

**失败与恢复。** 缺少某个 `--color-*` 映射时对应 utility 不生成（构建期问题，不是运行时回退）；浅色 token 是完整的一套，不会出现“深色变量漏到浅色”；`prefers-reduced-motion` 全局禁用动画/过渡；触摸设备强制输入控件 16px，避免 iOS 聚焦缩放。

**关掉它会发生什么。** 页面退化为无样式 HTML；布局、主题、safe-area、Markdown 密度全部丢失，但 React 结构仍可运行。

**复刻要点。** 必须保留 `@custom-variant dark (&:where(.dark, .dark *))`，否则 `dark:` 工具类不匹配；`.markdown` 与 `[role='log']` 的规则是 unlayered，才能压过 Streamdown 自带 utility；`--animate-sweep` 的 Skeleton 背景固定 viewport，祖先不能有 transform/filter；`--radius` 参与的 `--radius-sm/md/lg/xl` 映射不要漏；浅色主题不是简单反色，OKLCH 亮度/彩度需照抄。

**证据。** `index.css:1-9,16-91,93-170,172-231,233-240,246-307,313-369`；`index.html:2,9,17,19-33`；`client.ts:98-104`（SDK 范围）。

#### 2.10 PWA 与启动

**职责与用户可见行为。** 把 SPA 做成可安装的独立窗口应用，并在 JS 加载前按上次主题上色、用 `sessionStorage` 快照覆盖刷新，避免白屏/闪屏。

**导出与契约。** `main.tsx` 无导出，副作用为 `store.start()`、`loadExtensions()`、`createRoot(#app).render(<App/>)`；`index.html` 提供 `#app` 与内联主题/resume 脚本；`manifest.webmanifest` 是静态 JSON。**tools/actions/docs/reactors：** 无。**events：** 无。**apis provided：** 无。**apis needed：** `App`、`store`、`loadExtensions`、`rendered()`（范围外）。**settings keys：** `sessionStorage['ultimate.resume']`、`localStorage['ultimate.theme']`。

**状态与持久化。** `ultimate.resume` 存 `{at,html,css}`，只接受 30 秒内快照，`rendered()` 后静默 120ms/最多 700ms 淡出并删除；`pagehide` 写入，超配额删除。无 SQLite/doc；manifest 与图标静态。

**UI 位置。** 文档级 `<html>`/`<head>` meta、`#app`、`#resume`；不属于 slot/surface。

**关键流程。** 1) `index.html` 设置 `class="dark"`、`viewport-fit=cover`、`interactive-widget=resizes-content`、manifest、apple-touch-icon、apple-mobile-web-app-*、theme-color。2) 内联主题脚本按 `ultimate.theme` 移除 `dark` 并改 meta。3) 30 秒内有快照则建 `#resume`（fixed/inset 0/最高 z-index/`inert`），注入 HTML/CSS 并恢复 `data-resume-scroll`。4) `main.tsx` 建立 SSE、装载 facets、渲染 `<App/>`。5) App 在 `loaded && !pending && viewed` 后 `rendered()`，resume 淡出。6) manifest 声明 `Ultimate`、`standalone`、`#111112` 与 192/512/maskable 图标。

**失败与恢复。** 快照过期/缺失不覆盖；配额失败删快照；8 秒兜底移除覆盖。无 service worker，离线缓存不在实现内（推断：只保证安装与独立窗口）；iOS 用 `black` 以免启动 viewport 少一个状态栏高度。

**关掉它会发生什么。** 仍是普通网页，但无安装入口、独立窗口、主题色同步和刷新快照，首屏可能白闪。

**复刻要点。** 内联脚本必须在 module 前且不依赖 React；`#resume` 要 `inert`，只保存视口内节点（视口外留等尺寸空白），否则长转录撑爆存储；`viewport-fit=cover` 必须配 `.safe-area`。

**证据。** `index.html:2-18,19-33,37-64,65`；`manifest.webmanifest:1-19`；`main.tsx:1-15`；`index.css:187-206`。

### 3. 跨扩展协作

- **App ↔ registry/surfaces：** `App` 通过 `surfaceItems` 取所有 `surfaces` 贡献，`resolveSurface` 决定实际 surface；Agent surface（`extensions/agent/web.tsx`，范围外）用 `Sidebar`、`Header`、`Conversation`、`Panels`、`StatusLine` 组合出主界面。`App` 用 `SurfaceContext` 告诉 `Dock` 自己的 surface id，用 `ExtensionNameContext` 让 `useExtensionUiState` 自动加前缀。
- **Slot 总线：** 所有 `slots` 贡献由 `Slot` 渲染；16 个 `SlotName` 覆盖 `titlebar.*`、`header.right`、`statusline.*`、`composer.*`、`conversation.overlay`、`transcript.start/end`、`overlay`、`sidebar`、`sidebar.top`。`sidebar.top` 由 sidebar 扩展在自己的 `sidebar` 内容里二次分发（`extensions/sidebar/sidebar.tsx:556`），核心不直接消费。
- **Point 总线：** `Provided`/`AllProvided` 取最后一个/全部 provider。核心消费四个内置 point：`ConversationKind`（标题栏的会话类型）、`MessageReference`（消息复制引用）、`ParkedRuns`（暂停态）、`RunStart`（工作计时起点）。
- **Transcript ↔ 扩展：** `entryRenderers(kind)`、`toolRenderers(name)`、`toolLine(name)`、`messageItems('answerLabels'|'messageDetails'|'messageActions'|'userBubble')`、`compact`/`intro`、`linkRenderers` 都是扩展插入点；`composerRenderers` 按发现顺序包裹 composer，`inboxRenderer` 取最后一个。
- **事件：** `ultimate:sent {conversationId}` 由 composer、todos、update 等发出，transcript 收到后在同会话立即回底；`ultimate:reveal-entry {conversationId, entryId}` 由 messages/subagents 等发出，transcript 负责补历史、展开折叠组并滚动定位。
- **命令：** `allCommands` = 核心 `ultimate.palette`/`ultimate.panel`/`ultimate.sidebar` + 每个 surface 的 `ultimate.surface.<id>`（前九个带 `mod+1…9`）+ 扩展 `commands`；Palette 与 Keyboard 共用这一张表，`group` 决定面板分组，`when`/`whileTyping` 决定可用性。
- **主题：** core-tier 的 `theme` 扩展（范围外）提供“Toggle light and dark theme”命令，调用 `actions.setTheme`；`store.ui.theme` 驱动 `client.ts` 的 class/localStorage，样式来自本组 `index.css`。
- **导航：** `actions.switchConversation`/`showSurface`/`openPanel`/`toggleSidebar` 被 titlebar、palette、keyboard、sidebar、消息卡片共用；它们先关掉覆盖层再写 `shell.*`，所以“去哪里”总是让对话可见。

### 4. 复刻顺序建议与风险

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

---

## B.3 共享库与基础设施分析笔记（`lib/`）

### 1. 概览

`lib/` 是"核心与扩展都能用、但不属于任何一方"的纯逻辑层。它只允许 `node:*`、`shared/` 与 `server/` 的**类型**导入；
不得 import 扩展、web、bin。复刻时先把这一层做稳，扩展与核心都会薄很多。

### 2. 模块与职责

| 模块                       | 关键导出                                                                                   | 复刻要点                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `exec.ts`                  | `exec`                                                                                     | `promisify(execFile)`，不经过 shell                               |
| `git.ts`                   | `git(cwd                                                                                   | opts,...args)`、`empty`、`isolatable`、`noRepository`、`noCommit` | 30s 超时、1MB buffer；`isolatable` 判断 Git/分支/首提交 |
| `shell.ts`                 | `shellFor`、`fill`、`argv`、`script`、`ShellName`                                          | Bash/PowerShell 一处判定；`$NAME` 两壳互转                        |
| `process-group.ts`         | `spawnGroup`、`stopGroup`、`runGroup`、`sweepPidFiles`、`groupAlive`、`closeOutput`        | pid 文件 + 启动时间校验；POSIX 进程组；handshake 防"父死子活"     |
| `windows-process-group.ts` | `spawnWindowsGroup`、`stopWindowsJob`、`identifyWindows`                                   | C# Job Object（KILL_ON_JOB_CLOSE）；创建时间识别 owner            |
| `json-file.ts`             | `readJson`、`writeJson`、`updateJson`、`writeTextAtomically`                               | 临时文件+fsync+rename；符号链接保持；按路径串行                   |
| `settings.ts`              | `userSettingsPath`、`readSettings`、`updateSettings`                                       | 用户设置 `~/.ultimate/settings.json`                              |
| `secrets.ts`               | `readSecret`、`secretMetadata`、`validate*`                                                | `O_NOFOLLOW`；POSIX 拒绝 group/other 权限；≤16KiB                 |
| `database-files.ts`        | `moveDatabase`、`vacuum`                                                                   | db+`-wal`+`-shm` 一起移动；`VACUUM INTO`                          |
| `chapters.ts`              | `activeChapter`、`requestChapter`、`finishChapterSwitch`、`continueChapterIds`、`inFlight` | 切换日志、ID 连续、前台任务检查                                   |
| `agents.ts`                | `AgentDefinition`、`discoverAgents`、`definitionAgent`、`defaultModel`                     | frontmatter 解析、overlay 合并、模型解析                          |
| `actions.ts`               | `implementAction`、`ActionInput`                                                           | 编译期保证 handler 只读 ref 声明的参数                            |
| `api-files.ts`             | `apiSummary`、`apiFiles`                                                                   | 供 codemode 的 `ultimate.api` 读取契约                            |
| `compaction.ts`            | `compacting`、`admitCompaction`                                                            | 事务内检查/创建压缩任务                                           |
| `context-usage.ts`         | `promptTokens`、`contextUsage`、`lastAssistant`                                            | 上下文/用量计算（浏览器安全）                                     |
| `entries.ts`               | `isInput`、`imagesOf`                                                                      | 输入判定与图片提取                                                |
| `title.ts`                 | `shortTitle`                                                                               | 去掉 Markdown/章节名，取首个有空格的行                            |
| `ago.ts`                   | `formatAgo`                                                                                | now/5m/3h/2d/日期                                                 |
| `compare.ts`               | `compareUrl`                                                                               | diffshub 链接                                                     |
| `rate-limit.ts`            | `rateLimited`                                                                              | 429/限流与可重试判定                                              |
| `fast-forward.ts`          | `fetchOrigin`、`fastForward`、`otherTransport`                                             | 只快进；SSH/HTTPS 回退                                            |
| `project-identity.ts`      | `projectKey`、`githubRepo`、`projectIdentity`                                              | GitHub key + 根提交                                               |
| `remote.ts`                | `resolveProject`、`Target`、`REMOTE_BYTES`                                                 | 当前/本机/remotes/云端解析                                        |
| `cloud.ts`                 | `cloudConfig`、`fetchRegister`、`machineName`、`httpBase`                                  | 只读用户设置；token 来自 secrets                                  |
| `acting-as.ts`             | `actingAs`                                                                                 | side chat 代表主会话                                              |

### 3. 进程组细节（复刻重点）

POSIX 启动串：

```sh
bash -c 'read -r _ || exit 1; exec "$0" "$@"' <program> <args…>
```

- 先写 `<pid>` 与 `<pid>.start`，父进程确认后写一行释放 handshake；父进程若在写 pid 前死亡，子进程读到 EOF 直接退出。
- `setsid` 让子进程成为新进程组 leader；`kill(-pid, SIGTERM)` → grace → `SIGKILL`。
- `stopGroup` 只对"可证明属于我们"的组发信号：leader 未回收或 pid 文件启动时间匹配。
- `sweepPidFiles(directory)` 在启动时清理崩溃遗留的组。

Windows：

- 一段 C#（`windowsJobSource`）编译后作为 Job Object owner；
- `CreateJobObject` + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`；
- 目标以 `CREATE_SUSPENDED` 创建，入 Job 后 `ResumeThread`；
- `identifyWindows(pid)` 用创建时间识别；`stopWindowsJob(name)` 可跨进程停止。

用途：shell 工具、automations 脚本、workspace setup、instance、setup-machine。

### 4. 数据/文件细节

- `writeTextAtomically`：写 `.<uuid>.tmp` → `fsync` → `rename`；目标为符号链接时写最终目标。
- `updateJson`：进程内 Promise 链按路径串行，避免读-改-写丢键。
- `chapters.ts`：首章就是 home；后续在 `chapters/<name>/`；切换写 `pending-chapter.json`，下次打开时完成；
  `continueIds` 抬高目标库 `durable_metadata.next_id`，保证 `#id` 跨分卷唯一。
- `inFlight` 直接只读 SQLite：`tasks.status != 'terminal' AND background = 0`。

### 5. 远程与云

`resolveProject(project, local, register, machine?)` 顺序：

1. 当前项目；2. 本机运行中项目（`project.json` + lock 的 URL）；3. `settings.remotes`；4. 云端 register 的 tailnet 地址。
   `REMOTE_BYTES = 1MiB`；所有读取通过对方 `/api/*`，不复制 SQLite。
   `cloudConfig` 只读用户设置，token 来自 `ULTIMATE_CLOUD_TOKEN` 或 secrets。

### 6. 复刻风险

- 进程组不做启动时间校验会误杀复用 pid 的进程；Windows 不用 Job Object 会留下孙子进程。
- `writeTextAtomically` 不 fsync 在断电时可能丢文件。
- `chapters` 不抬高 next_id 会导致跨分卷 id 冲突（`#123` 指向两个会话）。
- `agents` overlay 合并顺序错会导致工具权限被意外扩大。

### 7. 证据

`lib/*` 各文件；重点 `process-group.ts:11-335`、`windows-process-group.ts:292-357`、`json-file.ts:41-84`、
`chapters.ts:1-170`、`agents.ts:1-586`、`remote.ts:1-168`、`fast-forward.ts:1-121`。

---

## B.4 Pi Durable 运行时分析笔记（外部依赖）

### 1. 概览

Ultimate 的持久化、任务调度、会话、文档、提交与恢复全部来自 `@earendil-works/pi-durable@1.4.0`；模型与 provider 来自 `@earendil-works/pi-ai` 与 `pi-coding-agent`。Ultimate 只做装配与产品化，不重写运行时。本笔记给出复刻所需的 API 边界与装配方式。

### 2. 核心类型（`dist/types.d.ts`、`dist/harness/types.d.ts`）

#### 2.1 ID 与记录

```ts
type ConversationId = Id<'conversation'>;  type EntryId = Id<'entry'>
type TaskId<R> = Id<'task',R>;             type SubmissionId = Id<'submission'>
type DocumentId = Id<'document'>;           type Seq = number & …
const ROOT_CONVERSATION_ID = 1
```

- `ConversationRecord`：id、owner（conversation/task）、parent（fork 来源）、createdAt…
- `EntryRecord`：id、conversationId、kind、data、model?、head?、edits?、input?…
- `TaskRecord`：id、conversationId、kind、status（pending/running/waiting/sleeping/completing/terminal/blocked）、state、background、abortRequested、restartCount…
- `SubmissionRecord`：queued/placed/answered/aborted…，`requestId` 去重。

#### 2.2 文档

```ts
defineDoc<T>({
  kind, version, scope:'conversation'|'session'|'task',
  history:'latest'|'rewindable', fork:'current'|'initial'|'asOf',
  checkpointWhen(value, ops, info): boolean,
  initial(): T, migrate?(value, fromVersion): T,
})
```

内置：

- `AgentDoc`（`pi.agent`）：rewindable/asOf，`checkpointWhen:()=>true`；
- `LiveDoc`、`UsageDoc`、`InboxDoc`、`ProviderDoc` 等 `pi.*` 文档。

#### 2.3 Tx / Session / Storage

```ts
interface Tx {
  conversation(id); entry(id); task(id)
  scanConversations/scanEntries/scanTasks(query, limit, cursor?)
  createConversation({ownership}); forkConversation(parent, at, {ownership})
  appendEntry(conversationId, draft)
  createTask(task, input, options); createSubmission(create)
  settleSubmission(id, settlement); placeSubmission(id, entry)
  doc(token, …): Draft<T>; retireDoc(token, …)
}
interface Session extends DocumentObserver {
  commit<T>(fn:(tx:Tx)=>T|Promise<T>, context): Promise<T>
  subscribeCommits(listener); snapshot(...); documentState(...); watchDoc(...)
  close(context)
}
interface Harness extends Session {
  resume(); hold(); release(); wake()
  root(context,{agent?,init?}); conversation(id); createConversation(options)
  inspect(context); taskGraph(context); watchTaskGraph(context)
  abortTask(id); retryTask(id); waitForTask(id); usage(context)
  submission(id); abortSubmission(id)
}
```

#### 2.4 工具与扩展

```ts
type ToolRegistration = Tool & {
  replay?: 'safe' | 'unsafe'
  executionMode?
  prepareArguments?
  structuredOutputSchema?
  callers?: ('model' | 'tools')[]
  deferred?: true
  outputLimits?
  execute(args, api: ToolExecutionApi, context)
}
interface Extension {
  name
  tools?
  sections?
  hooks?
  wraps?
  tasks?
}
```

`ToolExecutionApi`：`taskId`、`conversationId`、`callId`、`agent()`、`models`、`env`、`output()`、`details()`、
`commit()`、`memo()`、`createTask()`、`getTask()`、`waitForTask()`、`conversation()`、`executeTool()`。

#### 2.5 设置

```ts
type HarnessSettings = {
  extensions?
  stream?
  retry?
  compaction?
  progress?
  toolExecution?
  steeringMode?: 'all' | 'one-at-a-time'
  followUpMode?
  contextRetentionMs?
  documentRetentionMs?
  afterFailedRun?
  restartLimit?
}
type HarnessOptions = {
  models
  registry
  settings?
  env?
  now?
  setTimer?
  onWake?
  onReport?
  conversationCreated?
}
```

### 3. Ultimate 的装配

`server/harness.ts`：

```ts
const runtime = await ModelRuntime.create()
const settings = SettingsManager.create(projectRoot)
const registry = createRegistry()
const trace = callTrace(...)
const modelCalls = modelTrace(trace)
registry.install(modelCalls.extension)
const modelRuntime = guardToolArguments(runtime, modelCalls)
const storage = await openNodeSqliteStorage(chapter.database)
const harness = await Harness.open(storage, {
  models: modelRuntime,
  registry,
  settings: createHarnessSettings(settings, sortedExtensions),
  env: ({cwd}) => nodeExecutionEnv(cwd),
  onReport: (error, info) => notice(reportMessage(error, info)),
}, context)
const root = await harness.root(context, { agent: {...} })
await root.commit(tx => { tx.doc(UiState, root.id); tx.doc(AgentDoc, root.id).model = model })
harness.resume()
```

要点：

- `HarnessSettings` 用 getter 读当前设置（模型/压缩/扩展排序）；
- `followUpMode:'all'`；
- 压缩按模型覆盖（`compactionOverrides`）；
- `env` 按 cwd 复用 `NodeExecutionEnv`；
- `openNodeSqliteStorage` 来自 `@earendil-works/pi-durable/storage/sqlite/node`；
- `context` 是 `BACKGROUND_CONTEXT`（chord），用于所有非用户触发的提交。

### 4. 恢复与一致性

- Storage 抛错是最终错误，Session 关闭；重开 Storage 后 Harness 从记录恢复。
- 未完成任务按 checkpoint 重跑；工具按 `replay` 决定重跑或标 interrupted。
- `restartLimit`（默认 5）连续崩溃后 park，`retryTask()` 恢复。
- `subscribeCommits` 同步回调，不能阻塞；Ultimate 用它刷新会话列表与 SSE。

### 5. 上游补丁（`patches/@earendil-works__pi-durable@1.4.0.patch`）

- `beforeInput` 事务钩子（在首输入前放条目）；
- 输入来源标记（`entry.input`）；
- 记录每次响应的 thinkingLevel；
- `Harness.hold()/release()`（暂停调度）。

这些是 `prompt` 扩展、`pause` 扩展与 `ui.navigated` 语义所依赖的；复刻时若无法打补丁，需要应用层替代。

### 6. 证据

`node_modules/@earendil-works/pi-durable/dist/types.d.ts:1-1039`；`dist/harness/types.d.ts:83-774`；
`dist/harness/harness.d.ts:16-19`；`dist/storage/sqlite/schema.d.ts:6-34`；`server/harness.ts:57-297`；
`docs/durability.md`、`docs/pi-upstream.md`、`patches/@earendil-works__pi-durable@1.4.0.patch`。

---

## B.5 工具链与构建分析笔记

### 1. 概览

Ultimate 不打包：服务端 `.ts` 由 Node 26 直接执行，浏览器由 core 内嵌的 Vite 编译；`vite-plus`（vp）统一
lint/format/test；TypeScript 分三套工程（服务端 / 浏览器 / swap 检查）。这使"改代码→热重载/换代"的路径最短。

### 2. 版本与依赖

- Node `>=26`（原生 TS、`node:sqlite`、`import.meta.main`）；
- pnpm `11.8.0`；
- TypeScript `7.0.2`、Vitest `5.0.5`、Vite `8.3.5`（`vite-plus@1.4.0` 封装）；
- React `19.3.0`、Tailwind `4.3.3`、Radix `1.6.7`、cmdk `1.1.1`、streamdown `2.7.0`、`@pierre/diffs` `1.5.2`。

所有 `@earendil-works/*` 精确固定 `1.4.0`（`pi-claude-code` 为 github pin）；三个 patchedDependencies；
`overrides.vite = 8.3.5`。

### 3. tsconfig

| 文件                 | 用途                                          | 关键设置                                                                                   |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `tsconfig.json`      | 服务端/脚本/扩展 `.ts`                        | NodeNext、`erasableSyntaxOnly`、`allowImportingTsExtensions`、`noEmit`、paths `@/*`        |
| `tsconfig.web.json`  | 浏览器 `.tsx` + `refs.ts` + 浏览器安全 helper | Bundler、`jsx:react-jsx`、`composite`、`emitDeclarationOnly`、`types:["vite-plus/client"]` |
| `tsconfig.swap.json` | 换代前只检查 `server/**` + `shared/**`        | 继承主配置，`include` 收窄                                                                 |

`tsconfig.web.json` 显式列出每个扩展的 `refs.ts` 与若干纯逻辑 `.ts`（如 `lib/entries.ts`），保证浏览器代码
不会意外依赖 Node/服务端。

### 4. Vite 配置

```ts
defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': <repo>/web/src } },
  lint: { plugins: [...], jsPlugins: ['./lint/ultimate.ts'], categories: {...}, rules: {...}, overrides: [...] },
  fmt: { semi:false, singleQuote:true },
  test: { root:'.', include:['test/**/*.test.ts'], exclude:['test/e2e/**'], maxWorkers:8, testTimeout:30000 }
})
```

运行时 `server/main.ts` 以 `middlewareMode` 加载同一配置，附加：

- `extensionModules()`：虚拟模块 `virtual:ultimate/web-facets`、CSS `@source`、依赖 dedupe、HMR；
- `ultimate:watchers`：Vite 配置重启后迁移 watcher 监听。

### 5. 脚本

| 脚本                     | 作用                                            |
| ------------------------ | ----------------------------------------------- |
| `pnpm start`             | `node bin/ultimate.ts`（监督者）                |
| `pnpm dev`               | `node server/main.ts`（无监督者，不能 restart） |
| `pnpm cli`               | `node bin/cli.ts`（逃生终端）                   |
| `pnpm check`             | `vp check`（fmt+lint+types）+ `scripts/deps.ts` |
| `pnpm test` / `test:e2e` | 快测 / 真实进程 e2e                             |
| `pnpm setup:machine`     | 机器初始化                                      |
| `pnpm reset` / `restore` | 状态备份/恢复                                   |

### 6. Lint 规则（自定义）

`api-file-shape`、`api-naming`、`api-only-imports`、`core-tier-deps`、`no-raw-services`、`no-raw-stream`、
`no-retired-ui`、`replay-safe-reason`、`no-silent-catch`、`no-test-timeout`、`no-real-wait-in-fast-tests`、
`no-local-test-polling`。

导入边界：

- `server/`、`bin/` 不得 import `extensions/`；
- `shared/` 独立；
- `lib/` 不得 import extensions/web/bin，server 只允许 type；
- 扩展不得 runtime import server/bin；
- 浏览器不得 import `node:*`/`server/**`/`extensions/**`。

### 7. 测试策略

- 快测：进程内、脚本化模型响应（faux provider），禁止真实等待/自定义超时/本地轮询；
- e2e：真实 supervisor/实例，覆盖 `disable-each`、重启、实例、UI；
- 复刻时至少保留：核心提交/恢复、SSE 快照+ops、扩展加载/卸载、UI 状态收敛、进程组清理。

### 8. 复刻检查

- [ ] `node --version` ≥ 26，`pnpm install` 无 peer 冲突；
- [ ] `pnpm check` 通过（types/lint/format/deps）；
- [ ] `pnpm dev` 能起页面；`pnpm start` 能换代；
- [ ] 修改 `web.tsx` 热更新不刷新；修改 `server/*.ts` 后 restart 生效；
- [ ] `tsconfig.web.json` 不包含任何服务端实现文件。

### 9. 证据

`package.json`、`pnpm-workspace.yaml`、`tsconfig*.json`、`vite.config.ts:5-204`、`server/main.ts:103-129`、
`bin/ultimate.ts:349-370`、`scripts/*`、`lint/ultimate.ts`。

---
