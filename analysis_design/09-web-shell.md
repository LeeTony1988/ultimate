# 09 · Web 外壳（`web/`）

> 复刻目标：一个只提供"框架"的单页应用——surface 宿主、transcript、composer、命令面板、侧栏/面板/状态线原语——其余 UI 全部由扩展贡献。
> 涉及 `web/index.html`、`web/src/main.tsx`、`web/src/app/*`、`web/src/components/*`、`web/src/index.css`。

## 1. 页面启动

```
GET / → index.html
  ├─ <div id="resume">  上一页快照（reload 时由 resume.ts 注入并立即绘制）
  ├─ <div id="app">
  └─ <script type="module" src="/src/main.tsx">
main.tsx:
  createRoot(document.getElementById('app')).render(<App />)
  启动 loadExtensions()（异步，不阻塞首屏）
  store.start()  ← 建立 EventSource
```

- `index.html` 内联脚本在模块加载前读取 `sessionStorage['ultimate.resume']`，把上次的 HTML/CSS 画到 `#resume`，
  再设置主题 class、`theme-color` meta；`resume.ts` 在 App 渲染稳定后淡出。
- PWA：`manifest.webmanifest`、`icon-*.png`；`display: standalone`，配合 supervisor 的 `--app` 窗口。

## 2. App 组合（`app/App.tsx`）

```tsx
<App>
  <TooltipProvider delayDuration={400}>
    <div className="safe-area flex flex-col">
      {loaded && !embedded && <TitleBar />}
      {loaded && !pending && <Surfaces surfaces={[surface, home]} />}
    </div>
    {loaded && <Shortcuts />}
    <CommandPalette />
    <ExtensionErrors />
    <Slot name="overlay" />
  </TooltipProvider>
</App>
```

关键行为：

| 行为                 | 实现                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| **就绪门槛**         | `useReady().ready` 且 `state.shared/system` 都到；surface 与其快捷键在 ready 后才渲染，overlay 可先渲染     |
| **surface 回退链**   | `Surfaces` 依次尝试 `[当前 surface, agent]`；`SurfaceBoundary` 捕获异常→渲染 fallback；扩展版本变化自动重试 |
| **记录当前 surface** | `onScreen()` 写 `store.ui.surface = {id,title}`（用于标题、`useUltimate().surface`、prompt）                |
| **文档标题**         | `项目名 · 会话 label/#id`（Agent）或 `项目名 · surface 标题`；busy 时前缀 `●`                               |
| **缺失 surface**     | ready 后若 chosen 不存在 → warning notice（"Agent shows"）                                                  |
| **嵌入模式**         | `window.top !== window` 时不渲染 TitleBar（被另一个 Ultimate 内嵌）                                         |
| **恢复绘制**         | ready + surface 已定 + view 已到 → `rendered()` 开始淡出上一页快照                                          |

`SurfaceBoundary` 细节：`getDerivedStateFromProps` 比较 `surface.version`，热更新后重置 `failed`；`componentDidCatch`
打印 `[surface id]` 并 notice；`componentDidMount/Update` 只在未失败时 `onScreen`。

## 3. 布局原语（`app/primitives.tsx`，SDK 导出）

### 3.1 StatusLine

- 高 28px，等宽 11.5px，左右两个 slot；
- 手机（`useViewport()==='phone'`）只保留 `phone:true` 的项，其余进 `⋯` popover（每项仍可打开自己的 popover）；
- 平板触屏给圆角屏留 `px-8 pb-3`。

### 3.2 Conversation

```tsx
<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
  <Transcript dock={variant === 'dock'} />
  <Composer dock={variant === 'dock'} />
  <Slot name="conversation.overlay" />
</div>
```

### 3.3 Sidebar / Panels / Dock

- `Sidebar`：`useMountRegion('sidebar')` 让 header 显示开关；空时返回 null；桌面 `w-72` 左列；窄屏为左滑 `Overlay`（85% 宽，最大 26rem，支持滑动关闭）。
- `Panels`：右侧 22rem；标签行 `PanelTabs` 会测量宽度：先隐藏非当前标签的文字，再把装不下的移入 `⋯` 菜单；`tab:false` 面板仅在选中时出现。
- `Dock`：可折叠/可拖拽侧区（默认 416px，最小 280，最大 `window.innerWidth-360`）；状态存 `shell.dock.<surface>.<side>`；
  折叠时变 10px 轨道并显示忙碌点；双击分隔条重置宽度。

### 3.4 Header

`<Header>`：可选侧栏开关（`mod+b`）→ `children ?? <Trail/>` → `header.right` slot → 面板开关（`mod+alt+b`）。
`Trail` 显示祖先会话（面包屑，手机上隐藏）、busy 点、`ConversationKind` point（如 `branch · coordinator`）、标题、`#id`。

## 4. Transcript（`app/transcript.tsx`）

### 4.1 顶层结构

```tsx
<Conversation contextRef={stick} key={id} resize={busy ? 'smooth' : 'instant'}>
  <ConversationContent className={column(dock)}>
    <TranscriptEntries />
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

- 使用 `use-stick-to-bottom`：只有原本在底部时才跟随；用户上滚后不被拉回；发送消息（`ultimate:sent`）强制回底；
- `key={id}`：切换会话不继承滚动位置；
- 首次加载：从下往上 14ms 错峰淡入（尊重 `prefers-reduced-motion`；恢复/缓存视图不播放）；
- 骨架占位在加载完成后淡出 300ms；
- `ResizeObserver` 在 composer 变高时保持"跟随"状态，不把读者拉走。

### 4.2 行渲染

- `EntryView` 用 `memo` + 自定义 `sameRow`：只有条目本身或其可见工具调用变化才重渲染（流式时性能关键）。
- `coreEntry(entry)` 是内核渲染：用户消息、assistant 消息（思考/工具/文本）、工具结果、压缩、未知 kind。
- 扩展 `entries[kind]` 渲染器按发现顺序**包裹** `coreEntry`；`blocks` 允许 compact 行只显示部分内容块。
- 工具卡：`ToolCallBlock` 汇总 call + result + live 状态，按 `tools[toolName]` 渲染器嵌套；无渲染器用通用卡。
- 消息悬浮操作：`MessageActions`（复制、时间、usage、go back、引用）。
- `transcript.start` / `transcript.end` slot：在全部历史加载后/最后一行之后。

### 4.3 历史分页

- 流只给最近 150 条（`older` 游标）；`TranscriptEntries` 在滚动到顶部时调用 `api.history(id, older)` 拉更早的 64 条（`after` 时 512 条）；
- 拉回的历史放在 `history` state，与 active entries 合并去重；
- 到顶后显示"Beginning of conversation"分隔线；
- 分页游标与 `view` 快照切换时要丢弃过期历史（按 `windowKey` 判断）。

### 4.4 Compact 模式

由扩展的 `compact.when(conversation, docs)` 决定（典型：@ultimate/branch 等长会话）。规则：

- 两次用户输入之间的工具调用/思考折叠为一行 `worked · N steps`，点击展开；
- `compact.tools` 列出的调用保持可见（如 `message`），支持函数测试；
- `compact.quiet(row, docs)` 把"背景行"（agent 间消息等）折叠成一行；连续 ≥2 行才折叠；
- `compact.summary` 组件渲染折叠行文案；
- 折叠状态持久化（`useFold`，键按会话/组）；
- go-back 的条目集合（`setAsideIds`）在模型上下文中被排除，UI 单独分组。

### 4.5 实时状态

- `LiveLines` 显示当前 run 的过渡态：思考中、运行中的工具、重试、压缩；
- `ParkedRuns` point 为真时显示"已暂停"；
- `RunStart` point 提供开始时间给计时器；
- 流式 assistant 消息用 `partialOf` 合并到最后一行，避免每次 chunk 重建全部行。

## 5. Composer（`app/composer.tsx`）

### 5.1 草稿

- 每个会话一个 `drafts` 条目（模块级 Map），键 `ultimate.draft.<id>` 存 `localStorage`；
- `revision` 计数防止异步发送完成后覆盖用户新输入；
- `fillComposer(id,text)` / `insertIntoComposer(id,text)` 供扩展/命令写入草稿（光标位置保持）。

### 5.2 发送

```ts
send(whenBusy?):
  if loading/empty/blocked/sending → return
  mode = busy ? (whenBusy ?? 'steer') : undefined
  if (mode==='steer') previous = await withdrawQueuedSteer(...)   // 合并排队 steer
  events.emit('ultimate:sent', {conversationId})
  await api.submit(text.trim(), mode, id, images)
  清空草稿（仅当 revision 未变）
```

- Enter = steer（忙碌时）/发送（空闲）；Alt+Enter = follow-up；Shift+Enter 换行；触摸键盘 Enter 不发送；
- ↑ 在首行且无 target 时召回所有排队输入到编辑器（逐条 cancel）；
- 忙碌时显示 Stop（`api.abort`）；
- `blockedBy(agent, models)`：无模型或模型不可用 → 显示原因并禁用发送；
- 图片：粘贴/选择，≤4 张、每张 ≤2MiB；`ImagePreviews` 可删除。

### 5.3 扩展点

- `Slot composer.toolbar`（左侧工具）、`composer.actions`（Send 旁）、`composer.status`（下方状态行）；
- `composer` 渲染器按发现顺序包裹核心 composer（`core` 参数），可套 `ComposerRedirect` 把发送改到别处（side chat）；
- `inbox` 渲染器包裹排队项（`{item, core, cancel}`），最后一个胜出。

## 6. 命令面板与快捷键

### 6.1 Palette

- `mod+k` 打开；`cmdk` 的 `CommandDialog`；按 `group ?? extension` 分组；隐藏"打开面板"自身与当前 surface 的切换项；
- `keywords` 含 id/extension，`value` 含标题+id，支持模糊搜索。

### 6.2 快捷键（`keyboard.ts`）

- 解析 `mod+shift+m` 与序列 `mod+k m`；`chordOf` 统一平台（mac ⌘ / 其他 Ctrl）；
- 命中规则：
  - 带修饰键的 chord 总是可用；
  - 普通键在输入框内不触发，除非命令标 `whileTyping` 且焦点在 composer（不在 dialog）；
  - 序列第二键允许在空命令面板输入框中输入；
  - 1.2s 内无后续键则清空 pending；
- 作用域：`scopeOf(event.target)` 找到最近的 `ConversationScope`，作为 `context.conversationId`。

## 7. 样式系统（`web/src/index.css`）

- Tailwind v4：`@import 'tailwindcss'` + `@theme inline` 映射 CSS 变量到 `--color-*`；
- 字体：Inter Variable（`@fontsource-variable/inter`）+ 等宽栈；
- 颜色全部 oklch；`--brand` 紫色（亮 0.52/暗 0.75），`--diff-add/--diff-del`、`--terminal`、`--sidebar-*`；
- 明暗：`:root` 与 `.dark`；`@custom-variant dark (&:where(.dark, .dark *))`；由 `store.ui.theme` 切换 `html.dark`；
- 半径 `--radius: 0.5rem`；动画：`shimmer`、`pulse-dot`、`fade-in`、`sweep`；
- `@layer base` 设置全局排版、滚动条、safe-area；
- 扩展目录通过 Vite 插件注入 `@source`，Tailwind 会扫描用户/项目扩展的 class。

## 8. 响应式与输入模式（`sdk/viewport.ts`）

- `phone`（<640px）/`tablet`（<1024 或粗指针）/`desktop`；
- `overlays(region, viewport)`：窄屏时侧栏/面板以覆盖层出现；
- 手机隐藏部分 titlebar/status 项，用 popover 收纳；
- `touchKeyboard()` 检测触摸键盘，决定 Enter 行为与 autoFocus；
- `safe-area` class 处理刘海/圆角。

## 9. 性能要点（复刻时容易踩坑）

1. **行级 memo**：transcript 每行只随自身 entry 变化；流式 partial 只更新最后一行。
2. **`useSyncExternalStore` + 选择器**：避免整树因任一 SSE 事件重渲染。
3. **视图缓存**（store 最近 6 个）让会话切换即时；快照相同 raw 不触发 set。
4. **历史窗口化**：一次最多 150 条，向上分页；不要全量渲染长会话。
5. **HMR 保留状态**：`web.tsx` default 导出被排除 Fast Refresh 校验；registry 热替换组件时 boundary 按 version 重置。
6. **图片/大输出**：工具输出有 `dropped` 统计；diff/code 用虚拟化或折叠。

## 10. 可访问性与交互细节

- 所有图标按钮有 `aria-label`；tooltip 400ms 延迟；
- 命令面板、对话框用 Radix（焦点陷阱、Escape）；
- `prefers-reduced-motion` 时禁用入场动画；
- 覆盖层用 `inert` 阻止背景交互；
- 状态提示用 `role="status"`；
- 移动端侧滑关闭阈值 64px。

## 11. 复刻检查清单

- [ ] 首次加载显示 splash/骨架，不出现白屏；刷新时上一页快照先绘制再淡出。
- [ ] `mod+k` 能搜索所有扩展命令；`mod+1…9` 切换 surface；`mod+b`/`mod+alt+b` 切换侧栏/面板。
- [ ] 会话切换保留各自滚动位置与草稿；发送后强制跟随。
- [ ] 忙碌时 Enter=steer、Alt+Enter=follow-up、Esc=stop；↑ 召回队列。
- [ ] 单个 surface 崩溃回退到 Agent 并提示；单个工具卡崩溃只坏该卡。
- [ ] 手机宽度下侧栏/面板变为覆盖层，状态栏收纳到 ⋯。
- [ ] 明暗主题切换立即生效且持久到 localStorage；页面 `theme-color` 同步。

## 12. 证据索引

- `web/src/main.tsx`、`web/index.html`、`web/src/app/App.tsx:34-190`
- `web/src/app/primitives.tsx:37-500`
- `web/src/app/transcript.tsx:84-190,186-715,721-921,1011-1370`
- `web/src/app/composer.tsx:74-441`
- `web/src/app/header.tsx:23-162`、`titlebar.tsx:32-376`
- `web/src/app/palette.tsx:31-82`、`keyboard.ts:22-79`
- `web/src/index.css:1-172`
- `web/src/sdk/viewport.ts`、`resume.ts`
