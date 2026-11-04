# 07 · 协议与浏览器 SDK

> 复刻目标：定义服务端/浏览器之间**唯一**的数据契约，以及扩展作者可用的全部编程面。
> 涉及 `shared/protocol.ts`、`shared/events.ts`、`shared/extension-api.ts`、`web/src/sdk/*`、`web/src/extensions.ts`。

## 1. 共享协议（`shared/protocol.ts`）

该文件必须**浏览器安全**（只 import type），是 HTTP/SSE 的类型来源。

### 1.1 请求/响应

```ts
interface SubmitRequest {
  text: string
  images?: { data: string; mimeType: string }[]
  whenBusy?: 'steer' | 'followUp'
}
interface SubmitResponse {
  submissionId: number
}
interface ConfigureRequest {
  model?: ModelRef
  thinkingLevel?: ModelThinkingLevel
}
type StreamedView = ConversationView & { older?: number } // older = 历史分页游标
interface HistoryResponse {
  entries: EntryRecord[]
  before?: number
}
interface CompactResponse {
  taskId: number
}
interface CreateConversationRequest {
  cwd?: string
  title?: string
}
interface CreateConversationResponse {
  id: number
}
interface ExtensionActionRequest {
  args: JsonValue
  conversationId?: number
}
interface ExtensionActionResponse {
  result: JsonValue
}
interface UiUpdateRequest {
  set?: Record<string, JsonValue>
  delete?: string[]
}
interface UiUpdateResponse {
  ok: true
  rev: number
}
const UI_REVISION = 'ui.rev'
```

限制常量：`imageMimeTypes = ['image/png','image/jpeg','image/webp','image/gif']`、
`maxImageBytes = 2MiB`、`maxImages = 4`。

### 1.2 摘要与系统信息

- `ConversationSummary`：`id / parentConversationId? / branchOf?{conversationId,at} / ownerTaskId? / label? / title? / cwd? / busy / inputAt? / answerAt?`
- `ExtensionInfo`：`name / enabled / core? / source('builtin'|'user'|'project') / replaces? / layer('default'|'user'|'project'|'folder') / path / actions[] / readme? / facets{server,web} / server?{loadedAt,tools[{name,description}],sections[],hooks,docs[],secrets?,error?}`
- `BuildInfo`：`id / at / generation / changed[] / core / lib / extensions{name:hash} / history[]`
- `SystemInfo`：见 05 章 §7
- `Notice`：`{level:'info'|'warning'|'error', message}`
- `ModelsResponse`：`providers[]` + `models[]`（仅 chat 模型；含 `available`、`thinkingLevels`、`cost`）

### 1.3 SSE 事件表

```ts
interface ServerEvents {
  system: SystemInfo
  conversations: ConversationSummary[]
  view: StreamedView
  ops: readonly Op[]
  ui: { value: Readonly<Record<string, JsonValue>> }
  uiOps: { ops: readonly Op[] }
  doc: { kind: string; value: Readonly<JsonObject> | null }
  docOps: { kind: string; ops: readonly Op[] }
  tasks: TaskGraph
  notice: Notice
}
```

## 2. 共享事件（`shared/events.ts`）

```ts
type EventContext = { traceId?; conversationId?; taskId?; entryId?; parentCall? }
type EventRecord<D> = { id:number; name:string; kind:string; v:number; at:string; data:D; context?:EventContext }
interface EventToken<D> { name; kind; version; is(record): record is EventRecord<D> }
defineEvent<D>(name, {version?}): EventToken<D>   // kind = `event.${name}`
```

内置事件：

- `ultimate.notice`：`{extension,message,level}`（每个 facet 每条不同消息只记一次）
- `ultimate.started`：`{generation,build}`
- `user.input`：`{conversation, kind:'prompt'|'steer'|'follow-up'|'answer'|'dismiss'|'review', entry?, submission?, message?, length} & Partial<Device>`
- `ui.navigated`：`{surface, conversation?} & Partial<Device>`
- `EVENT_FEED = 'ultimate.event-feed'`、`EVENT_FEED_SIZE = 100`

`Device = { device: string; login?: string; address?: string }`，由 `deviceOf(headers)` 生成。

## 3. 扩展契约原语（`shared/extension-api.ts`）

```ts
type Api<Name, Service> = { readonly name: Name; readonly service?: Service }
defineApi<Service>()(name)               // 服务契约
type DocRef<T> = { kind; value?: T }
docRef<T>(kind)
type ActionRef<Args, Result> = { extension; name; args?; result? }
actionRef<Args, Result>(extension, name)
const coreTier = /^export const tier = 'core'$/m
const defaultOff = ['cloud','parallel','tailscale','health','classify','phase','sounds','voice-live']
type Catalogue = { apis[{name,owner?,provider?,needs[],wants[]}], missing[], cycles[][] }
```

`DocRef`/`ActionRef` 的 phantom 字段只用于类型；运行时对象只有 `kind` 或 `extension/name`。
`refs.ts` 必须浏览器安全，且每个 action ref 都要有对应的 `implementAction`（`lib/actions.ts` 的类型检查 + `test/refs.test.ts`）。

## 4. Web 扩展模型（`web/src/sdk/types.ts`）

### 4.1 贡献点

| 字段                                                                | 类型                                   | 语义                                                 |
| ------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| `slots`                                                             | `Partial<Record<SlotName, Contribution | Contribution[]>>`                                    | 15 个命名插槽；`{component,order,phone}` |
| `panels`                                                            | `PanelContribution[]`                  | 右侧面板标签；`tab:false` 可隐藏                     |
| `surfaces`                                                          | `SurfaceContribution[]`                | 全屏应用；`agent` 为首页，`order` 排序，`mod+1…9`    |
| `tools`                                                             | `Record<toolName, ToolRenderer>`       | 工具卡渲染器，按发现顺序包裹（`core` 参数）          |
| `toolLines`                                                         | `Record<toolName, ToolLineRenderer>`   | compact 模式的一行摘要（最后一个胜出）               |
| `entries`                                                           | `Record<entryKind, EntryRenderer>`     | 条目渲染器；可包裹核心渲染                           |
| `inbox`                                                             | `InboxRenderer`                        | 排队输入渲染器（最后胜出）                           |
| `composer`                                                          | `ComposerRenderer`                     | 包裹 composer（按顺序嵌套）                          |
| `link`                                                              | `LinkRenderer`                         | Markdown 链接渲染器（嵌套）                          |
| `messageActions` / `messageDetails` / `answerLabels` / `userBubble` | 组件数组                               | 消息悬浮操作/详情/答案标签/用户气泡覆盖              |
| `compact`                                                           | `CompactContribution`                  | 决定会话是否 compact、哪些调用可见、静默行、摘要组件 |
| `intro`                                                             | `IntroContribution`                    | 空会话标题/提示/占位符/卡片（最后匹配者胜出）        |
| `documents`                                                         | `DocumentContribution[]`               | Documents 标签页的 kind 渲染器                       |
| `commands`                                                          | `CommandContribution[]`                | 命令面板/快捷键；`keys` 支持序列 `mod+k m`           |
| `provides`                                                          | `Provision[]`                          | 为其他扩展的 point 提供值（hook）                    |

`SlotName`：`sidebar`、`sidebar.top`、`titlebar.brand`、`titlebar.project`、`titlebar.left`、`titlebar.right`、
`header.right`、`statusline.left`、`statusline.right`、`composer.toolbar`、`composer.status`、`composer.actions`、
`conversation.overlay`、`transcript.start`、`transcript.end`、`overlay`。

### 4.2 Point（浏览器扩展点）

```ts
const P = definePoint<Input, Value>('owner.point')
<Provided point={P} input={x}>{value => …}</Provided>
<AllProvided point={P} input={x}>{values => …}</AllProvided>
provide(P, input => useValue(input))   // 在 web.tsx 的 provides 中
```

SDK 自带 point：

- `ParkedRuns`（pause 提供：被暂停的 run 集合）
- `RunStart`（tasks 提供：任务首次运行时间）
- `ConversationKind`（messages 提供：标题前的种类，如 `branch · coordinator`）
- `MessageReference`（codemode 提供：可复制的消息引用文本）

### 4.3 工具调用视图

```ts
interface ToolCallView {
  id; name; args; status:'streaming'|'pending'|'running'|'done'|'error'|'interrupted'
  output; images; details?; diagnostics[]; dropped?{bytes,lines}; startedAt?; endedAt?; result?
}
```

渲染器签名 `({call, core})`；`core` 是内核/前一个渲染器的结果，便于包裹而不是重写。

## 5. Store（`web/src/sdk/store.ts`）

### 5.1 State

```ts
interface State {
  connection: { status:'connecting'|'open'|'reconnecting'; since:number }
  requested?: number           // 想看的会话（undefined=root）
  view?: StreamedView          // 当前会话副本
  restored?: boolean           // 是否用缓存立即绘制
  viewsOf: Record<number, StreamedView|undefined>  // ConversationScope 保留的副本
  docs: Record<string, JsonObject|null>            // 当前会话的扩展文档
  docsOf: Record<number, Record<string, JsonObject|null>>
  shared?: Record<string,JsonValue>                // root 的 ultimate.ui
  system?; conversations[]; tasks?; models?; notices[]
  ui: { paletteOpen; dialogs; theme; surface?; open? }
}
```

### 5.2 算法要点

1. **单主 EventSource**：`/api/events?conversation=<requested>&docs=<sorted kinds>`；文档 watch 变化时重连（快照语义）。
2. **视图缓存**：最近 6 个 `{view, raw}`；`show(id)` 若有缓存立即 `set({view,restored:true})`，随后快照替换；相同 raw 不触发重渲染。
3. **增量应用**：`ops`/`uiOps`/`docOps` 用 `applyImmutable`；`doc` 快照直接替换；未知 kind 的 ops 丢弃。
4. **多会话作用域**：`watchConversation(id)` 与 `watchDocOf(id,kind)` 引用计数，按会话合并成独立流；`syncDocs()` 0ms 去抖。
5. **重连**：`error` 时若 `readyState===CLOSED` 则 1s 后手动 `connect()`；从未打开且无视图 → 回退 root 并 `onFallback()`。
6. **模型刷新**：收到 `system` 且（无 models 或 pid/generation 变化）→ `refreshModels()`。

## 6. Registry（`web/src/sdk/registry.ts`）

- **加载**：`setLoaders(map)` 并行 import；每个 facet 有 token 防过期安装；`pending`/`failed`/`ready` 状态；
  8s 未就绪则 `timedOut=true`；收到首个 `system` 且所有 loader settle → `ready`。
- **校验**：`shapes` 表逐字段检查；不合法 → `fail(name)`，保留上一版本。
- **安装**：`version++`，触发 error boundary 重置与 `ultimate:extension-loaded`。
- **热更新**：`replace(name,module)` / `fail(name,error)`。
- **选择算法**：
  - `slotItems`: 按 `order` 排序（稳定，同 order 保持发现顺序）；
  - `surfaceItems`: `agent` 恒第一，其余按 order+title；同 id 后者覆盖；
  - `resolveSurface`: 已选 → 项目 `defaultSurface`（若已安装）→ `agent`；加载中缺失 = pending；加载完缺失 = 回退 + missing；
  - `panelItems`/`shownPanels`: 第一个有 tab 的面板为默认；`tab:false` 仅在选中时出现；
  - `commandItems`: 核心命令 + surface 切换命令 + 扩展命令，同 id 后者覆盖；
  - `documentItems`: 同 kind 后者覆盖；
  - `entryRenderers`/`toolRenderers`/`linkRenderers`: 数组（按发现顺序嵌套）；
  - `toolLine`/`inboxRenderer`/`introOf`/`provisionOf`: 最后一个胜出；
  - `compactTools`: 合并所有匹配 facet 的 `tools`/`quiet`/`summary`；异常被捕获并上报，不影响 transcript。

## 7. Hooks（`web/src/sdk/hooks.ts`）

| Hook                                                                     | 作用                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `useReady()`                                                             | `{ready,timedOut,failed,pending}`，粘性                            |
| `useStore(select)`                                                       | `useSyncExternalStore` 选择切片                                    |
| `useConversation(select?)`                                               | 作用域内/当前会话的派生状态（entries/agent/usage/live/inbox/busy） |
| `getConversation(id?)` / `getState()`                                    | 非 React 读取                                                      |
| `useSystem/useConversations/useTasks/useModels/useNotices/useConnection` | 全局切片                                                           |
| `useDoc(ref)` / `useDocKind(kind)` / `useDocOf(id,ref)`                  | 文档订阅（自动 watch/unwatch）                                     |
| `useEvents({events?,limit?})`                                            | 读 root 事件 feed，倒序过滤                                        |
| `useUltimate()`                                                          | `{...actions, conversationId, surface}`                            |
| `useShownSurface()`                                                      | 解析当前 surface                                                   |
| `useUiState(key,initial)`                                                | 持久 UI 状态（root 文档）                                          |
| `useExtensionUiState(key,initial)`                                       | 自动加 `ext.<name>.` 前缀                                          |
| `useRegionOpen('sidebar'                                                 | 'panels')`                                                         | 桌面共享 / 窄屏本标签页 |
| `useTranscript()`                                                        | 当前 transcript 的全部已加载 entries（含分页历史）                 |
| `useCompact()` / `useCompactQuiet()`                                     | compact 判定函数                                                   |
| `useCommands()` / `useDocumentRenderers()` / `useIntro()`                | 贡献查询                                                           |
| `useAction(ref,args?,{enabled,onError})`                                 | 调服务端 action；自动 abort 旧请求；错误变 notice                  |
| `useRestart()`                                                           | `{pending,busy,error,run,clear}`；跟踪 generation 切换与回滚       |
| `useCopy()`、`useNow()`、`useToolDuration()`                             | 工具型 hooks                                                       |
| `useDialog(id)`                                                          | 对话框开关（存于 `ui.dialogs`）                                    |

`useConversation` 的派生逻辑（`derive`）：从 `view.docs` 读 `pi.agent`、`pi.usage`、`pi.live`、`pi.inbox`；
`busy = !!live.run`；用 WeakMap 按 view 缓存，避免流式渲染时全量重算。

## 8. Actions / API 客户端

### 8.1 全局动作（`actions.ts`）

```ts
switchConversation(id,{replace?})  // 关闭覆盖层 → 写 shell.conversation
showSurface(id)                    // 写 shell.surface
openPanel(id?) / closePanel() / togglePanel() / toggleSidebar()
runCommand(id) / open(dialog) / close(dialog) / openPalette() / focusComposer() / setTheme()
```

持久键：`shell.conversation`、`shell.surface`、`shell.shownSurface`、`shell.panel`、`shell.panelOpen`、
`shell.sidebarOpen`、`shell.dock.<surface>.<side>`。
窄屏（phone/tablet）的 sidebar/panel 开关存于 `state.ui.open[viewport]`，不跨设备共享；覆盖层互斥。

### 8.2 HTTP 客户端（`api.ts`）

```ts
api.submit(text, whenBusy?, id?, images?)
api.history(id, before, signal?, after?)
api.abort(id?) / cancelSubmission(sid,id?)
api.configure(change,id?) / compact(instructions?,id?)
api.createConversation({cwd?,title?})
api.restart()
api.action(ref, args?, {conversationId?,signal?,keepalive?})
api.updateUi({set?,delete?})
```

- 默认会话 = 当前视图的 conversation id，否则 `requested`，否则 `ROOT=1`。
- 非 2xx → `HttpError(status,error)`；action 包装为 `ActionError(extension,action,status,message)`；
  未被捕获的 `ActionError` 通过 `unhandledrejection` 变 notice。
- `keepalive` 允许请求在页面关闭后继续（如取消任务）。

### 8.3 UI 状态同步（`ui-state.ts`，复刻重点）

问题：多标签页/多设备共享 UI 状态，且服务端提交是异步的，快照可能落后于本地写入。

方案：

- `remote`（流快照）+ `local`（未确认写入）合并成 `values`；
- 每次 `set` 本地立即生效，150ms 去抖批量 `POST /api/ui`；
- 服务端每批 commit 递增 `ui.rev` 并返回；流按序推送提交；
- 收到快照时若 `rev < shown` 丢弃；本地写入保留到 `entry.rev <= shown` 才释放；
- 页面切换服务器进程（pid/generation 变化）时 `restarted()`：epoch++、忽略旧回复、等新快照；
- `flush()` 在 `pagehide` 时强制发送；
- 无 `write`（detached 页面）时只本地保存，不写服务器。

### 8.4 恢复绘制（`resume.ts`）

- `pagehide` 时把当前 DOM（离屏元素折叠成占位、记录 scrollTop、textarea 值）与全部 CSS 规则存入 `sessionStorage.ultimate.resume`；
- `index.html` 在模块加载前把这段 HTML 画出来（`#resume`），避免白屏/闪 splash；
- App 渲染并"稳定"（700ms 上限、120ms 静默）后 200ms 淡出并移除；
- `resumed` 导出给 loading overlay 判断"这是刷新不是首启"。

## 9. 扩展加载（`web/src/extensions.ts`）

```ts
loaders = virtualModule            // { "<abs>/web.tsx": () => import(...) }
loadExtensions(map = loaders) → registry.setLoaders(map)
window.__getReactRefreshIgnoredExports = ({id}) => extensionName(id) ? ['default'] : []
if (import.meta.hot) {
  accept('virtual:ultimate/web-facets', next => loadExtensions(next.loaders))
  accept(next => loadExtensions(next.loaders))         // 结构变化/整页
  on('vite:afterUpdate', updates => 逐个 import 新 web.tsx → registry.replace)
  on('vite:error', err => registry.fail(name, err.message))
}
```

`extensionName(path)` 用正则从 `extensions/<name>/web.tsx` 提取名称（兼容 Windows 反斜杠与 query）。

## 10. 复刻要点

1. **协议文件只放类型与常量**，两端共享；任何运行时逻辑都放到 `store/registry/hooks`。
2. **SSE 快照 + ops 是唯一同步模型**；不要给页面加 REST 轮询（除 models）。
3. **UI 状态必须解决"本地乐观写入 vs 服务端提交顺序"**，`ui.rev` + 覆盖层是核心；否则多标签页会回跳。
4. **Web facet 的失败必须局部化**：形状校验、error boundary、保留旧版本三件套。
5. **Slot/Point/Panel/Surface 的"最后胜出/嵌套"规则要固定**，否则扩展组合行为不可预测。
6. **前端不直接访问 Pi Durable**：只通过 HTTP/SSE 的 `ConversationView`、`EntryRecord`、`TaskGraph` 等 DTO。

## 11. 证据索引

- `shared/protocol.ts:1-211`、`shared/events.ts:1-86`、`shared/extension-api.ts:1-83`
- `web/src/sdk/types.ts:1-317`
- `web/src/sdk/store.ts:1-435`
- `web/src/sdk/registry.ts:26-639`
- `web/src/sdk/hooks.ts:39-563`
- `web/src/sdk/actions.ts:17-219`
- `web/src/sdk/api.ts:27-160`
- `web/src/sdk/ui-state.ts:1-166`
- `web/src/sdk/resume.ts:1-127`
- `web/src/sdk/client.ts:32-146`
- `web/src/extensions.ts:20-79`
