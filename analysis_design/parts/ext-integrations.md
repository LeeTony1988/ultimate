# 外部集成与打磨分析笔记

## 1. 概览

这十个扩展都不属于 core tier（core tier 仅有 agent、prompt、coding-tools、conversations、models、documents、notices、secrets、theme、workspaces、subagents、lineage、messages、onboarding、sidebar，见 `docs/extensions.md:64-76`），它们把 Ultimate 接到外部世界并把体验补完整：`cloud` 把项目状态加密备份到用户自建的 Cloudflare Worker，`tailscale` 把本机 UI 发布到 tailnet HTTPS 并自带准入校验，`browser` 用 Playwright 提供截图/驱动兜底工具，`voice` 把麦克风听写塞进输入框，`voice-live` 用 GPT-Live 做耳朵、用常驻 Voice 代理把请求转给 @ultimate，`parallel` 用 parallel.ai 提供 `web_search`/`web_fetch`，`claude-code` 把外部 CLI 注册成原生 provider，`fast` 给 OpenAI 请求加 `service_tier: "priority"`，`sounds` 只对 @ultimate 的关键事件发声，`splash` 在启动时画 ULTIMATE 字标。十者之间没有循环依赖，全部通过 `api.ts`（cloud/tailscale）、action ref、event token 或浏览器事件总线协作。

| 名称        | 一句话职责                                       | 服务端入口                                                     | 浏览器入口                                                       | 是否 core tier |
| ----------- | ------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------- | -------------- |
| cloud       | 加密项目备份 + 云端登记簿 + Join 向导            | `server.ts`（`state`/`backup`/`joinState`/`join`，`CloudApi`） | `web.tsx`（`statusline.right`、`JoinDialog`、命令 `cloud.join`） | 否（默认关闭） |
| tailscale   | 用 Tailscale Serve 发布本机 UI，仅放行白名单登录 | `server.ts`（`status`/`retry`，`TailscaleApi`）                | `web.tsx`（`statusline.right` 指示器、命令 `tailscale.panel`）   | 否（默认关闭） |
| browser     | Playwright 的 `screenshot`/`browser` 兜底工具    | `server.ts`（tools + `visual_verification` section）           | `web.tsx`（两个 tool 渲染器）                                    | 否（默认开启） |
| voice       | 输入框旁的语音听写                               | `server.ts`（`status`/`transcribe`）                           | `web.tsx`（`composer.actions`）                                  | 否（默认开启） |
| voice-live  | GPT-Live 语音 + Voice 常驻代理转 @ultimate       | `server.ts`、`brief.ts`、`relay.ts`、`session.ts`              | `web.tsx`、`live.tsx`                                            | 否（默认关闭） |
| parallel    | parallel.ai 的网页搜索与抽取                     | `server.ts`（tools + `web_tools` section）                     | `web.tsx`（tool 渲染器）                                         | 否（默认关闭） |
| claude-code | 外部 Claude Code CLI 作为原生 provider           | `server.ts`（`registerNativeProvider` + `status`）             | `web.tsx`（panel `claude-code`、命令）                           | 否（默认开启） |
| fast        | OpenAI 优先服务层开关                            | `server.ts`（provider overlay + `beforeRequest`）              | `web.tsx`（`composer.toolbar`）                                  | 否（默认开启） |
| sounds      | @ultimate 的问题/完成/失败提示音                 | 无（纯浏览器）                                                 | `web.tsx` + `cues.ts` + `tones.ts`；`ui.tsx` 供他人复用          | 否（默认关闭） |
| splash      | 启动字标动画遮罩                                 | 无                                                             | `web.tsx`（`overlay`）+ `electric.tsx`                           | 否（默认开启） |

## 2. 逐扩展规格

### 2.1 cloud

**职责与用户可见行为**：状态行显示 `backed up 3h ago`、`no backup yet`、`backing up…`、`backup refused`；无 GitHub origin 时显示 `not backed up`，卫星机显示 `satellite · no backups`（`web.tsx:219-253`）。弹层含上次备份（机器、大小）、**Back up now** 与进度条、被拒时的 Worker 原句与 **Back up anyway**（二次确认 **Replace it**），以及 `pnpm restore <name>` 提示（`web.tsx:87-213`）。⌘K **Join cloud backups** 打开 `JoinDialog`（`join.tsx:384-397`），四步 `check`/`secrets`/`settings`/`done`（`join.tsx:21-26`）。

**导出与契约**：actions `state`、`backup`、`joinState`、`join`；`userActions = ['join']`（`server.ts:195`，代理不得替用户存密钥）。事件 `BackupEvent` = `cloud.backup`，负载 `{phase:'started'|'done'|'failed', project, bytes?, uploaded?, ms, reason?, error?}`（`refs.ts:19-23`）。API `CloudApi` 提供 `backup()` 与 `status(): 'off'|'local'|'satellite'|'on'`（`api.ts:7-14`）。secrets 声明 `ULTIMATE_CLOUD_TOKEN`、`ULTIMATE_CLOUD_SNAPSHOT_KEY`（`server.ts:20-26`）。依赖：`need(SecretsApi)`，`want(TailscaleApi)`、`want(PauseApi)`（`server.ts:202-205`）。配置键只在用户设置：`cloud.url`、`cloud.machine`、`cloud.satellite`，环境变量 `ULTIMATE_CLOUD_URL`/`_TOKEN`/`_SNAPSHOT_KEY`/`_MACHINE` 优先（`lib/cloud.ts:23-54`）。`cloud.state` 的返回即 `CloudState`（`types.ts:11-32`）。

**状态与持久化**：章节目录下 `cloud-backup.json` = `{key, parent, last}`（`backup.ts:13-18`），首章 key 为 `github.com/<owner>/<repo>`，后续章为 `<key>@<name>`（`chapterKey`，`backup.ts:24-25`）。运行态（`backup` 进度、`conflict`、`lastError`）放在 `host.resource('cloud.backup')`，只活在进程内（`server.ts:36-40,67`）。快照 id = `Date.now().toString(36)-<16 hex>`；对象写一次、Worker 保留策略；单次备份上限 10 分钟（`BACKUP_CAP`，`server.ts:29`）。

**UI 位置**：`statusline.right` + `overlay`（`web.tsx:285-290`）；命令 `cloud.join`。

**关键流程**：1）`setup()` 读 `cloudConfig`，判定 `off`/`satellite`/`local`/`on` 并算出 `chapterKey`（`server.ts:43-57`）。2）`backup()` 先拒绝并发与暂停，置进度占位，再查无 origin、卫星、未配置（`server.ts:70-90`）。3）`record` 提交 `started`。4）读 `ULTIMATE_CLOUD_SNAPSHOT_KEY`（env 优先），取 `TailscaleApi.status().url` 作 `tailnet`。5）`uploadSnapshot`：`VACUUM INTO` 复制库、`git bundle create --branches=ultimate/*`、zstd、按 16 MiB 分块、每块 AES-256-GCM（nonce‖密文‖tag），AAD 为 `id:kind:index:last|more`，密钥 HKDF-SHA256(secret, salt=projectKey, info=`ultimate-snapshot:<id>`)，最后上传 manifest 才使快照完整（`snapshot.ts:59-104,165-190,193-244`）。6）`POST /sync/backups/<sha256(key)>/<id>`，body 带 `key,name,chapter,machine,parent,force?,createdAt,bytes,uploaded,tailnet?`（`backup.ts:100-118`）。7）200 写 `cloud-backup.json` 并把新 id 当 parent；409 时若 `latest.id === done.id` 视为成功，若 `latest` 是本机在已记录 parent 之上的备份则采纳并重试一次，否则抛 `Conflict`（`backup.ts:121-156`）。8）成功/失败各提交 `done`/`failed`，`classify` 把异常映射为 `conflict`/`missing snapshot key`/`integrity check failed`/`timed out`/`HTTP 5xx`/`failed`（`backup.ts:164-177`）。

**失败与恢复**：冲突保留 parent 与已上传分块，UI 给 **Back up anyway**（`force`）；网络错误与 5xx 重试两次（`snapshot.ts:295-315`）；`PUT` 重试遇 409 视为已写成功；`downloadSnapshot` 校验 manifest 的 `id`/`key`/`root`、`PRAGMA integrity_check`、逐块大小与明文 SHA-256，失败只删自己的文件（`snapshot.ts:107-160,247-280`）；分支只做快进式写入，冲突存 `refs/heads/ultimate-moved/<id>/<name>`（`snapshot.ts:328-371`）。`backup.ts` 只负责上传/提交，`pnpm restore` 在 `scripts/restore.ts`（范围外）。

**关掉它会发生什么**：`CloudApi` 解析为 undefined，Dream 的睡前备份显式跳过并记 `Cloud extension is not enabled`（`extensions/dream/server.ts:364-372`）；状态行与 Join 命令消失；已存在的 `cloud-backup.json` 原样留在磁盘。

**复刻要点**：父链（parent）是防两台机器互相覆盖的唯一机制，必须与 Worker 的 409 语义一起实现；加密的 AAD 必须覆盖快照 id、部件、序号、是否末块，否则乱序/换块无法被发现；`chapter` 只影响 key 与目录，恢复路径的绝对路径校验在 restore 脚本里。

**证据**：`extensions/cloud/server.ts:20-26,29,43-57,59-65,70-90,92-152,154-193,195-207`；`backup.ts:13-25,41-47,79-161,164-177`；`snapshot.ts:47-52,59-104,107-160,165-190,193-244,247-280,282-315,328-371`；`join.ts:9-31,45-95,112-137`；`refs.ts:7-50`；`api.ts:7-14`；`types.ts:11-32`；`web.tsx:53-64,87-213,219-290`；`join.tsx:19-26,327-397`。

### 2.2 tailscale

**职责与用户可见行为**：默认关闭；开启后把本机 supervisor 端口用 `tailscale serve --bg --yes --https=<port> http://127.0.0.1:<localPort>` 映射到 `https://<dns>:<port>`，只有 `tailscale.allow`（缺省为机器 owner 的 `User.LoginName`）能进（`server.ts:144-148,201-208,266-290`）。状态行 `tailnet`：ready 绿点、问题琥珀点；off/starting 不显示（`web.tsx:317-351`）。弹层 ready 显示二维码、URL、Copy/Open、允许名单与 "Tailnet only"；问题态给出标题、hint，hint 里的命令变成可复制 chip，并提供 **Check again**（`web.tsx:114-236`）。

**导出与契约**：`StatusAction`（`tailscale`/`status`）、`RetryAction`（`tailscale`/`retry`）（`refs.ts:26-28`）；`Status` 的九个状态 `disabled|starting|ready|not-installed|not-running|not-operator|https-disabled|port-conflict|error`，含 `url?`、`allow`、`hint?`（`refs.ts:8-23`）。`TailscaleApi` 暴露 `status()`（`api.ts:10-15`）。设置键 `tailscale.allow`（仅用户设置）；`TAILSCALE_COMMAND` 可换 CLI（`server.ts:59-60`）。`export const reloadOnSettings = true`（`server.ts:40`）。

**状态与持久化**：`<home>/.ultimate/tailscale.json` = `{ ports: { "<projectRoot 或 home>": { port, owner, temporary? } } }`，写入走 `acquireLock`（pid 所有，进程死亡自动释放）+ 0600（`server.ts:65,85-120,273-277`）。端口优先本机 supervisor 端口，否则从 4747 起找空闲；排除 443、现有 Serve 映射与其它登记（`server.ts:230-265`）。只有默认 home 的服务器以 `projectRoot` 为键；preview/`mktemp` 实例以 `home` 为键并标 `temporary`（`server.ts:66-72`）。

**UI 位置**：`statusline.right`，命令 `tailscale.panel` 发 `tailscale:open` 事件把弹层从空锚点打开（`web.tsx:320,353-362`）。

**关键流程**：1）`onOpen(begin)` 启动，`begin` 串行化（`server.ts:303-308`）。2）已有 `ownedPort` 时先 `intact()`：owner token 仍是自己且 Serve 目标等于本机 URL 才算 `own`，否则重新申请（`server.ts:121-143`）。3）`tailscale status --json`，ENOENT 时回退 macOS app 路径；仍无则 `not-installed` 且只给状态不发 notice（`server.ts:150-169`）。4）解析 `BackendState`、`Self.DNSName`、`Self.UserID`→`User.LoginName`（UserID 用 reviver 保留原数字串，避免超 `MAX_SAFE_INTEGER`），检查 `CertDomains` 含该 DNS（`server.ts:171-208`）。5）在登记表锁内清理死 owner 的 loopback 映射（仅当目标不是 live supervisor）、分配端口、写 Serve、`host.access.allow({origin, verify})` 注册准入，verify 读 `tailscale-user-login` 并要求在 allow 内（`server.ts:210-291`）。

**失败与恢复**：stderr 里 permission/operator → `not-operator`（提示 `sudo tailscale set --operator=$USER`）；not running/logged out/needslogin → `not-running`；其余 `error`（截 500 字）（`server.ts:292-300`）。`retry` 在启动中会等待同一次启动；ready 后只修复丢失的映射（`server.ts:50-53,303-308`）。关闭时先等 `opening`，仅当 token 仍拥有且 Serve 目标仍是自己时才 `serve off`，临时条目删除，失败只报错不阻止关闭（`server.ts:310-330`）。真正的请求准入（Forwarded 头、Origin、`Sec-Fetch-Site` 放宽仅限根导航 `GET`+`navigate`+`document`+无 `Upgrade`）在核心里（`server/request-security.ts:39-58`）。

**关掉它会发生什么**：`TailscaleApi` 缺失，`instance` 的 preview 没有 tailnet 地址（`extensions/instance/server.ts:195-205`），`setup` 不报 Tailscale 区域（`extensions/setup/server.ts:228-233`），cloud 提交不带 `tailnet`；`access.origins` 少一个 origin，状态行无指示器，预览不发布。

**复刻要点**：端口登记表必须"项目条目长存、临时条目随 home 消失"；owner token 让延迟的旧关闭不会删掉继任者的映射；identity 只信 Serve 注入的头，且 Funnel/带标签设备因无头一律拒绝。

**证据**：`extensions/tailscale/server.ts:19-54,59-72,85-131,132-301,303-330`；`refs.ts:8-28`；`api.ts:10-15`；`web.tsx:30-43,49-67,114-236,285-310,317-362`；`server/request-security.ts:39-58`。

### 2.3 browser

**职责与用户可见行为**：兜底浏览器工具（首选 ego-browser，见 README 与 `visual_verification` section，`server.ts:154-160`）。`screenshot` 载入页面、等 `waitMs`（默认 1500）、截图并返回压缩图 + 标题 + 控制台/页面错误；`browser` 按 `click|fill|press|wait|eval|send|until` 逐步驱动，可末尾截图。

**导出与契约**：两个 `defineTool`：`screenshot`（`replay: 'safe'`）与 `browser`（不 safe，因为可能提交 prompt），参数 `url/path/timeoutMs` + 各自扩展（`server.ts:138-151,162-302`），`outputSchema` 统一 `{type:'object'}`。`browserBinary()` 与 `screenshotFile()` 是导出的纯辅助（`server.ts:19-86`）。无 API、无事件、无设置键。

**状态与持久化**：进程级 `host.resource('browser')` 持有懒启动的 `Browser`，host 关闭时关闭（`server.ts:130-137`）。每次调用新建隔离 `BrowserContext`，结束/取消即关；截图默认存 `<home>/screenshots/<ts>-<uuid>.png`，传 `path` 则相对会话 cwd 且必须以 `.png` 结尾（`server.ts:79-86,370-375`）。

**UI 位置**：`tools` 渲染器 `screenshot`/`browser`（缩略图、步骤 ✓/✗、`eval` 返回值、错误列表，`web.tsx:76-239`）。

**关键流程**：1）解析 Chromium：`ULTIMATE_CHROMIUM` → Windows 各 `ProgramFiles` 下的 Chrome/Edge 与 `%LOCALAPPDATA%\ms-playwright\chromium-*`（按版本倒序）→ Linux `/usr/bin/chromium`、`google-chrome-stable`、`~/.cache/ms-playwright/...`（`server.ts:19-76`）。2）懒启动 headless，`TMPDIR` 置空以避开 Chromium singleton socket 路径问题（`server.ts:347-367`）。3）`newContext({viewport: 1440×900, colorScheme: theme})`、`newPage`、`setDefaultTimeout`。4）对任意 Ultimate 页面注入 `sessionStorage['ultimate.driven']=1`；同源时再注入 `ultimate.detached=1` 与 `ultimate.theme`，使被驱动页面不推动用户标签（`server.ts:385-397`）。5）`send` 调 `window.ultimate.send(text,{conversation})`，`until` 调 `window.ultimate.until(condition,{conversation,timeoutMs})`，默认 5 分钟（`server.ts:249-289`）。6）截图后 `resizeImage(maxWidth/Height 1600)` 并带尺寸注记（`server.ts:110-128`）。

**失败与恢复**：每步 30 s（`timeoutMs` 可覆盖），整次 `4*stepMs+显式等待`；`eval` 也用 `Promise.race` 包住（`server.ts:95-108,333-342`）。`until` 超时会说明仍在忙什么或等到了什么；无 `window.ultimate` 的页面直接报"not an Ultimate UI"。关闭 context 限 5 s，关不掉则关共享 browser 并让下次重启（`server.ts:439-456`）。

**关掉它会发生什么**：两个工具与 `visual_verification` 段落消失，agent 失去内建截图/驱动能力（codemode 的 `tools` 也不再含它们）；无后台资源。

**复刻要点**：必须把"页面属于本 UI"与"普通网页"分开处理（detached/theme 注入只在同源）；`until` 的语义完全依赖 `web/src/sdk/test-hook.ts`，复刻时先复刻 hook。

**证据**：`extensions/browser/server.ts:19-76,79-93,110-128,130-151,154-160,162-302,305-436,439-456`；`web.tsx:17-35,76-124,141-241`。

### 2.4 voice

**职责与用户可见行为**：`composer.actions` 里的麦克风；录制中变为 Cancel + 计时 + 电平条 + Stop；停止后转写并**插入草稿光标处**，绝不自动发送（`web.tsx:94-273`）。无 key 时按钮变暗，点按发 `secrets:open` 打开 `OPENAI_API_KEY` 行（`web.tsx:249-256`）。

**导出与契约**：`StatusAction`（`voice`/`status`）→ `{available:true}|{available:false,reason}`；`TranscribeAction`（`voice`/`transcribe`）`{audio: base64, mimeType}` → `{text}`（`refs.ts:5-12`）。secrets 声明 `OPENAI_API_KEY`（`server.ts:13-19`）。无 API、无事件产生方；监听浏览器事件 `secrets:changed`。

**状态与持久化**：无文档、无 SQLite；只读 secret 或 Pi `openai` provider 的 API key（OAuth 登录被排除，`server.ts:24-31`）。`MAX_AUDIO_BYTES = 8 MiB`，请求超时 65 s（`server.ts:9-11`）。

**UI 位置**：`composer.actions`；插槽组件内自带错误行与 `transcribing…`。

**关键流程**：1）`unsupported()` 检查 secure context 与 `MediaRecorder`（`web.tsx:33-38`）。2）`getUserMedia({echoCancellation,noiseSuppression})`，按 `audio/webm;codecs=opus` → `audio/mp4` → `audio/webm` 选类型，`recorder.start(1000)`（`web.tsx:141-185`）。3）`stop` 时停轨、关 AudioContext、把 chunks 合成 Blob 交给 `transcribe`（`web.tsx:170-180`）。4）base64 后调用 action；服务端组 `FormData`（`file`、`model=gpt-4o-mini-transcribe`、`response_format=json`）POST `https://api.openai.com/v1/audio/transcriptions`（`server.ts:37-68`）。5）`insertIntoComposer(id, text)`（`web.tsx:124-139`）。

**失败与恢复**：401/413/429 与其它状态各有文案（`server.ts:71-77`）；超时提示缩短录音；`NotAllowedError`/`NotFoundError` 有专门提示；错误 8 秒后自清（`web.tsx:111-115,148-158`）。录制随 composer 卸载而取消并释放麦克风；超过 `MAX_MS` 自动停止（`web.tsx:107-110`）。

**关掉它会发生什么**：麦克风按钮消失，输入框只剩打字；`OPENAI_API_KEY` 声明仍在 secrets 目录里（由 secrets 扩展决定展示），但无消费者。

**复刻要点**：README 写"10 分钟自动停止"，代码是 `MAX_MS = 5 * 60_000`（`web.tsx:19`）——以代码为准，属文档漂移；`openaiTranscribe` 是唯一知道端点/字段的位置，替换供应商只改这里。

**证据**：`extensions/voice/server.ts:7-19,24-31,37-77,81-110`；`refs.ts:5-12`；`web.tsx:19-21,33-38,94-185,187-273,275-277`。

### 2.5 voice-live

**职责与用户可见行为**：默认关闭；开启后 `agents/voice.md`（`resident: true`，模型 `openai-codex/gpt-6-luna`、`thinking: low`、`fast: true`、`tools: [voice_say, voice_ask_ultimate, voice_note, codemode]`）随扩展启用而加载。用户点麦克风后：GPT-Live（`gpt-live-1`，voice `marin`，`delegation.type='client'`）只做听觉界面与寒暄，Voice 代理决定是否转给 @ultimate，并把答复压缩成 2–4 句口语（`server.ts:47-58,447-464`；`agents/voice.md:1-28`）。

**导出与契约**：actions `status`、`start`（`{sdp}`→`{sdp,conversation}`）、`heard`、`log`、`end`，全部列入 `userActions`（`server.ts:67`）。task `voice-live.answer`；doc `voice-live.forwarded`（`scope:'task'`，`checkpointWhen:()=>false`，`server.ts:60-66`）。entry kind：`voice.line`、`voice.heard`、`voice.answer`、`voice.session`、`voice.context`、`voice.utterance`（`refs.ts:15-48`）。tools：`voice_say {text}`、`voice_ask_ultimate {request}`、`voice_note {text}`（`server.ts:580-714`）。依赖 `need` MessagesApi、SubagentsApi、LineageApi、ConversationsApi（`server.ts:544-547`）。secrets `OPENAI_API_KEY`（只 API key，非 OAuth，`server.ts:36-44`）。

**状态与持久化**：全部写在 Voice 会话的 durable entries 里；session 分隔用 `voice.session`（`started`/`ended`+`seconds`），brief 用 `voice.context` 且 `transient: true`、带 `edits:[{target: previous.id, action:'omit'}]` 让只有最新 brief 进入模型（`server.ts:120-142`）。`host.resource('voice-live.briefs')` 保存"brief 正在生成"的 promise，使首条 `heard` 等它（`server.ts:93-95,493-495`）。前端 `live.tsx` 把 `mode` 与 `session` 放在 React 之外的模块单例里，`web.tsx` 热更新不会孤儿化会话（`live.tsx` 自身 dispose 时才关闭）；`front` 不持久（`live.tsx:41-48`）。

**UI 位置**：`composer.actions`（StartButton）、`titlebar.right`（LiveIndicator）、`conversation.overlay`（Stage 前推/折叠卡）、`transcript.end`（LiveTurn 实时字幕）、`overlay`（Relay 播报）、`composer`（VoiceDock 取代 Voice 会话的输入框）、`provides`：`UnderUltimate`（sidebar 行）、`Unlisted`（Voice 会话不进侧栏其他列表）；entries 渲染器覆盖 `voice.line`/`voice.heard`/`voice.answer`/`voice.session`/`voice.context`/`voice.utterance`/`pi.assistant`；命令 `voice-live.start|front|mute|end`，⌥V/Alt+V（`web.tsx:56,1391-1442`）。

**关键流程**：1）浏览器 `getUserMedia`、把 track 加入 `RTCPeerConnection`、先建 `oai-events` 再 `createOffer`（`session.ts:25-87`）。2）`start` 用 `SubagentsApi.standing('voice')` 取会话 id，并行组 brief（`voiceBrief`：`LineageApi.memoryBrief` + 最近 5 条用户请求及答复首行 + 最多 8 个未 conclude 分支，`brief.ts:16-19,71-148`），把最近 10 条 Voice 行（各截 200 字，过滤 `note`）作为 `input` 种子，POST `https://api.openai.com/v1/live/sessions`（30 s 超时），成功后写 `voice.session started` 并异步 `placeBrief`（`server.ts:408-488`）。3）浏览器把 SDP answer 设回，等 `session.started`，播放远端音轨，启动 100 ms `relay.tick`（`session.ts:88-164`）。4）`Relay` 拼接输入碎片：句末 1200 ms、未完 2800 ms 静默才成行，`[unintelligible]`/`[inaudible]` 变 `…`（`relay.ts:3-23,63-80`）。5）成行即 `HeardAction`，作为 `voice.heard` 输入（`whenBusy:'steer'`）进 Voice（`server.ts:489-506`）；同时前端把 `voice.line` 中 `ultimate` 且 `speech` 的行转成 `session.commentary.append` 朗读，`note` 转成 `session.thinking.append`（`web.tsx:333-365`；`live.tsx:320-331,334-337`）。6）Voice 调 `voice_ask_ultimate`：`api.commit` 内写 `Forwarded.scheduled` 并 `createTask(answerTask(...,{conversationId, ownership:'conversation', background:true}))`，再写 `userLine`（`voice:line:<taskId>`），保证重放不重复（`server.ts:646-690`）。7）answer task 写转发行，找 @ultimate 最新未答问题，有则 `MessagesApi.answer` 并等消息 `entry` 落地、拿 `board:<reply>` 的 submission receipt；否则提交 `voice.utterance` 给 @ultimate，随后 `receipt.wait`（`server.ts:226-315`）。8）取答复：优先该 run 内与 tool call 匹配的 `message` 文本（含编号问题/选项），否则 assistant 文本；`answerVoice` 以 `voice:answer:<line>` 写 `voice.answer`（`source` 指向 @ultimate 的 answer entry），再终止 task（`server.ts:345-394`）。9）`beforeRequest` 钩子在 compaction 把最新 brief 切掉时重新 append 一条 `again:true` 的 brief 并追加到本次请求消息（`server.ts:551-579`）。

**失败与恢复**：brief 失败变成带 `error` 的 `voice.context`，会话照常开始（`server.ts:418-432`）；`HeardAction` 等 brief 完成再提交；答复失败/被停止会写 `notice` 并让 Voice 口头解释（`server.ts:316-343`）；`voice_say` 用 `voice:say:<taskId>`、answer 用 `voice:answer:<line>` 等稳定 requestId 做幂等；空闲 120 s（`IDLE_MS`）自动 `release('paused')`，收到答复时若浏览器无用户激活则显示 `Tap to hear`，否则自动续会（`live.tsx:340-354`）；`pagehide` 与 HMR dispose 都会关闭会话并释放麦克风（`live.tsx:380-389`），关闭最多等 `session.closed` 5 s（`session.ts:122-150`）。20 s 后每 45 s 说一次 "Still on it."（`live.tsx:235-244`）。

**关掉它会发生什么**：`voice` agent 定义不再被发现（`lib/agents.ts:330-336` 只加载已启用扩展的 `agents/`），`Standing.voice` 无法创建；所有 UI 入口、工具、task 与 `voice.*` 渲染器消失；旧 Voice 会话与其 entries 留在库里但侧栏不再有 `UnderUltimate` 行。

**复刻要点**：难点不在 WebRTC 而在幂等——`Forwarded` doc + `createTask` 同一事务、`voice:answer:<line>`、`MessagesApi.answer` 的 "These questions are no longer open" 容错、`re` 从工具轮前的输入反查，缺一都会重复转发或答错行；`voice.context` 的 omit 链是"只有最新 brief 进模型"的关键。

**证据**：`extensions/voice-live/server.ts:26-34,47-77,79-142,145-158,180-207,209-400,402-541,543-716`；`brief.ts:16-19,71-148`；`relay.ts:3-23,25-105`；`session.ts:25-199`；`live.tsx:41-48,55-73,165-169,262-309,311-331,334-378,380-389`；`web.tsx:56,136-190,198-317,333-365,374-514,520-583,635-696,811-890,895-954,969-1080,1325-1378,1391-1442`；`agents/voice.md:1-28`。

### 2.6 parallel

**职责与用户可见行为**：`web_search` 用 Search API（`mode:'turbo'`、`max_chars_total:40000`）返回标题/URL/日期/摘录；`web_fetch` 用 Extract API 取 1–20 个 URL 的干净 markdown（`server.ts:95-238`）。卡片默认折叠，失败自动展开；缺 key 时头部出现 **Add key/Replace key** 打开 Secrets 对应行，`secrets` 关闭时给 **Turn on secrets**（`web.tsx:97-112,115-187`）。

**导出与契约**：tools `web_search`（参数 `query`/`searchQueries`/`maxResults`/`afterDate`）与 `web_fetch`（`url` 可为字符串或数组、`objective`），均 `replay:'safe'`；`prepareArguments` 把以 `[` 开头的 `url` 字符串 JSON 解析成数组（`server.ts:143-153`）。`section('web_tools', guidance)` 写系统提示。`normalizeUrls`、`validateResponse` 已导出。secrets `PARALLEL_API_KEY`；环境变量 `ULTIMATE_PARALLEL_TEST_URL` 只用于本地假服务器（`client.ts:1-2,72`）。

**状态与持久化**：无文档；`host.resource('parallel:missing-key')` 只记"已发过缺 key notice"，保证每进程一次（`server.ts:33,50-54`）。输出上限 50 KiB / 2000 行，附截断说明（`output.ts:1-33`）。

**UI 位置**：`tools` 两个渲染器；`search` 标题带域名摘要与 `n results`，`fetch` 显示 `n pages`，内容在 disclosure 里、`disallowedElements=['img','picture','source']` 保证离线（`web.tsx:58-59,248-403`）。

**关键流程**：1）`key()` 先确认 `secrets` 扩展已启用且无错误，再 `readSecret('PARALLEL_API_KEY')`，其次 `process.env`（用户 secret 优先，`server.ts:34-55`）。2）`parallelRequest` 合并 abort 与 120 s 超时，`x-api-key` 头，解码 JSON 后先 `redact` 掉 key（含对象键名），再按状态映射错误（`client.ts:61-153`）。3）search 组装 `objective/search_queries/mode/max_chars_total/client_model/advanced_settings` 并 `validateResponse`。4）`api.details(...)` 写结构化 details（`status/searchId/sessionId/results/warnings`），文本走 `truncateToolOutput`。5）web_fetch 额外把每页 `content` 截 20000 字并记 `contentTruncated`，`errors` 截 20 条；全部失败时 `isError: true`（`server.ts:184-232`）。

**失败与恢复**：401/403 → "PARALLEL_API_KEY was rejected"；429 → 等一会；其它附 `ref_id`（`client.ts:134-152`）；网络/超时/空响应分别有文案；形状不符抛 "unexpected response shape"（`server.ts:295-334`）；错误 details 让 UI 显示 HTTP 状态与 ref 并提供换 key 入口。

**关掉它会发生什么**：两个工具与 `web_tools` 提示消失，agent 失去 `web_search`/`web_fetch`；`secrets` 扩展仍可在面板里展示该 secret，但无消费者。

**复刻要点**：`details` 是 UI 的唯一数据源，文本 output 只给模型；两处 `client_model` 从 `api.agent(context).model?.modelId` 取，便于计费归因；`redact` 必须在解析后做，否则转义的 key 会漏。

**证据**：`extensions/parallel/server.ts:14-55,60-131,139-239,243-269,276-334`；`client.ts:1-2,50-59,61-153`；`output.ts:1-33`；`web.tsx:47-55,97-112,115-187,248-403,405`。

### 2.7 claude-code

**职责与用户可见行为**：默认开启；把外部 Claude Code CLI 的登录作为实验性 provider 接入，模型出现在既有 model picker 里。⌘K **Claude Code setup…** 打开 panel：显示 `Checking CLI…`/`CLI not installed`/`Login not confirmed`/`Subscription connected`/`CLI connected · no subscription reported`，并给安装与 `claude auth login`、`claude auth status` 命令（`web.tsx:7-72`）。

**导出与契约**：`StatusAction`（`claude-code`/`status`）→ `{available, loggedIn, subscription, plan}`（`refs.ts:5-13`），只暴露元数据，绝不返回 CLI 输出或账号身份（`server.ts:88-93`）。`createUltimateClaudeCodeProvider()` 导出，用于把 `claude-sonnet-5` 的 `thinkingLevelMap.off` 置 `null`，并让 `getModels`/`getAllModels` 都走同一适配（`server.ts:13-26`）。无 API、无事件、无 settings key；环境变量 `PI_CLAUDE_CODE_COMMAND`、`PI_CLAUDE_CODE_CONFIG_DIR`（README 记录，上游读取）。

**状态与持久化**：`host.resource('claude-code.provider')` 持有跨 facet 重载的 provider、活跃 stream 集合与 `closing` 标志（`server.ts:29-64`）；`shared.facets` 计数保证重载期间不反注册，最后一个 facet 关闭才 `unregisterProvider`（`server.ts:68-73`）。无文档。

**UI 位置**：`panels` 里 `id: 'claude-code'`（`tab: false`，从 ⌘K 与 model picker 打开），命令 `claude-code.panel`（`web.tsx:74-93`）。

**关键流程**：1）`createClaudeCodeProvider()` 后删除 `auth.oauth.login`（外部登录，无应用内 OAuth），保留订阅元数据（`server.ts:66-67`）。2）`registerNativeProvider(provider)` 注册；`stream`/`streamSimple` 包装为 `track(...)`，把 `response.result()` 计入 `active`，并在 `closing` 时拒绝新请求（`server.ts:55-62,76`）。3）action `status` 先 `modelRuntime.refresh({allowNetwork:false})`，`aborted` 或 `errors.has('claude-code')` 则抛 `Claude Code status refresh failed`，再 `getClaudeStatus(claudeCodeEnv())`（`server.ts:81-94`）。4）浏览器每次拿到 data 就 `refreshModels()`，让登录/登出即时反映到 picker（`web.tsx:11-14`）。5）关闭时若有活跃流，等 `Promise.allSettled` 后再 `closeClaudeProcesses()`，避免把 harness 挂起变成错误（`server.ts:43-54`）。

**失败与恢复**：status 失败在面板显示 `Status check failed` 与重试按钮；不可读的 CLI 状态被上游当作"未确认登录"；`closing` 期间的新请求直接抛 `Claude Code provider is closing`；用户取消不重放，durable 重开会重放未完成请求（README 语义）。无新增重试分类。

**关掉它会发生什么**：provider 反注册、模型从 picker 消失，但**不杀正在进行的请求**（facet 关闭只反注册）；panel 与命令消失；CLI 本身不受影响。

**复刻要点**：provider 必须是进程级 host resource，facet 只是引用计数；`stream`/`streamSimple` 都要包，否则 warm worker 清理时漏流；不要复制上游的 OAuth login。

**证据**：`extensions/claude-code/server.ts:13-26,28-78,80-95`；`refs.ts:5-13`；`web.tsx:7-72,74-93`。

### 2.8 fast

**职责与用户可见行为**：当选中 `openai-codex/` 或 `openai/` 模型时，composer 工具栏出现 **fast** 开关；开启即把该模型加入用户 `fastModels`，对所有该模型的请求生效（不只当前会话）；项目设置决定列表时开关禁用并提示 `Fast models are set by project settings`（`web.tsx:7-47`）。

**导出与契约**：`StatusAction`（`fast`/`status`）→ `{models, project}`；`SetAction`（`fast`/`set`）`{model,on}` → 新状态（`refs.ts:5-13`）。`FAST_PROVIDERS = ['openai-codex','openai']`、`fastModels()`、`fastStream()` 均导出（`server.ts:27,48-54,109-129`）。设置键 `fastModels`（`"provider/id"` 数组，项目覆盖用户）。

**状态与持久化**：只写 `~/.ultimate/settings.json` 的 `fastModels`；项目设置永不写（`server.ts:84-102`）。`host.resource('fast.sessions')` 保存"定义 `fast: true` 的会话的 provider sessionId"集合（上限 10 000，超出删最早），跨 facet 重载共享（`server.ts:142-143,177-181`）。`reported` Set 让非法配置只 notice 一次（`server.ts:24,62-67`）。

**UI 位置**：`composer.toolbar`，`order: 1`（`web.tsx:49-51`）；监听浏览器事件 `fast:changed` 自行刷新（不是 durable 事件）。

**关键流程**：1）`fastSetting()` 读项目设置，若有 `fastModels` 键则项目优先，否则用户设置（`server.ts:34-42`）。2）`listedModels()` 校验每个条目都以两个 provider 开头，否则整体关闭并 notice（`server.ts:56-68`）。3）`fastModels()` 在有 preview 时追加 preview 的模型（`server.ts:48-54`）。4）`fastStream` 用 `lazyStream` 延迟到请求时才判断：sessionId 在集合里或模型在列表里，就给 `onPayload` 注入 `service_tier:'priority'`，其余原样透传（`server.ts:109-129`）。5）`beforeRequest` 钩子：读 `ProviderDoc` 的 `sessionId`、`AgentDoc` 的模型，模型属 OpenAI 时取 `Profile.definition` 否则 `host.metadata` 的 label，再 `discoverAgents` 找该定义当前的 `fast`，据此增删 session 集合（`server.ts:154-183`）。

**失败与恢复**：非法 `fastModels` 只告警并整体关闭；`set` 在项目接管时抛错；非 OpenAI 模型的 `fast: true` 被忽略；API key 与 ChatGPT 登录都接受 `priority`（ChatGPT 拒绝文档里的 `fast`）。

**关掉它会发生什么**：两个 provider 的 overlay 反注册（最后一个 facet 关闭时），所有请求回到标准层；`fast` 开关消失，`fastModels` 留在设置里但无人读；`fast: true` 的定义不再加速。

**复刻要点**：必须在 `onPayload` 里注入而不是 `streamSimple` 选项（pi-ai 会丢 `serviceTier`，`server.ts:120`）；`lazyStream` 保证每次请求重新读列表；`beforeRequest` 要按定义**当前**的 `fast` 判断，而不是建会话时。

**证据**：`extensions/fast/server.ts:24-42,48-73,75-103,109-129,131-186`；`refs.ts:5-13`；`web.tsx:7-51`。

### 2.9 sounds

**职责与用户可见行为**：只对 @ultimate（主 standing agent）发声：它发给用户且 `reply` 的 `message` → **Needs input**；非 reply 的 `message` 或对用户输入的答复 → **Finished**；`runState === 'error'` → **Failed**。分支、worker、lander、其他 standing agent、landing、`internalInput` 一律不响（`cues.ts:27-40`）。状态行 `sounds` 打开开关（总开关 + 每音效复选框 + 试听），底部注明 "For @ultimate only"（`web.tsx:65-124`）。

**导出与契约**：无 server、无 API、无 action、无事件。浏览器侧 `ui.tsx` 导出 `playNotes(notes, volume=0.18)` 与 `Note` 供 voice-live 复用（`ui.tsx:2-3`）。设置键是 UI state `ext.sounds.muted`（布尔）与 `ext.sounds.off`（`Sound[]`），由 `useExtensionUiState` 生成（`web.tsx:16-20`）。`Sound = 'input'|'finished'|'failed'`。

**状态与持久化**：`localStorage['ultimate.sounds.played']` 保留最近 100 个已播 `key`（`web.tsx:14,26-35`）；其余为 durable UI state。无文档。

**UI 位置**：`overlay`（无渲染的 `Player`）+ `statusline.right`（`Control`，`order:-1`）（`web.tsx:126-128`）。

**关键流程**：1）`Player` 读根会话（id 1）的 `OverviewDoc`、`MessagesDoc`、`StandingDoc.ultimate`（`web.tsx:41-46`）。2）`listener()` 首次只把当前所有 cue 记为"已听过"，之后只返回新增 key，保证"打开页面时已有的不响"（`cues.ts:46-58`）。3）`announce` 先查 `navigator.userActivation.hasBeenActive`，无用户激活的标签页直接放弃，让别的标签播（`web.tsx:26-35`）。4）在 `navigator.locks.request('ultimate.sounds.played')` 内查/写 localStorage，抢到才 `play`。5）`tones.ts` 用 Web Audio 合成：每个音 3 个 partial（1/0.12/0.04），指数衰减，`playNotes` 懒建 `AudioContext` 并在 suspended 时 `resume`（`tones.ts:36-62`）。

**失败与恢复**：`announce`/`preview` 的 rejection 只 `console.warn`；播放被浏览器拒绝时静默；`AudioContext` 单例复用。

**关掉它会发生什么**：状态行入口与 `Player` 消失，`playNotes` 对 voice-live 也不可用（voice-live 的音效随之静默，但 voice-live 仍工作）；`ext.sounds.*` 保留。

**复刻要点**：三重去重（内存 `heard`、localStorage key、Web Lock）缺一都会多标签重复播；只认根会话文档，别用通知或事件流，否则分支的动静也会响。

**证据**：`extensions/sounds/web.tsx:14-35,41-62,65-128`；`cues.ts:3-58`；`tones.ts:7-62`；`ui.tsx:2-3`；`extensions/conversations/types.ts:30-34`。

### 2.10 splash

**职责与用户可见行为**：启动时全窗遮罩，WebGL 闪电按 ULTIMATE 轮廓从左到右描出字标，扫完从中爆发涟漪/弧光，再稳定为电流轮廓；仍在加载则在字下画一条细线。ready 后 240 ms 内收束并淡入应用，最短 0.7 s（reduced motion 0.4 s）。首启（onboarding `StatusAction.firstRun`）以 0.8 倍速播签名版并交给 onboarding 页面；无 WebGL2 或 `prefers-reduced-motion` 只显示实心字标；`navigator.webdriver`（agent 的 browser/screenshot）不播；8 s 未 ready 由核心放行，`Late` 提示列出 `pending`/`failed`（`web.tsx:9,98-107,336-442`）。

**导出与契约**：无 server、无 API/actions/events/settings；入口 `slots.overlay`（`web.tsx:444`）；`Electric` 与 `ElectricProps` 由 `electric.tsx:569-607` 导出；依赖 onboarding 的 `StatusAction`（`web.tsx:5`）。

**状态与持久化**：无。`?splash` 排练并可点击重播，`?splash=first` 播首启版（`web.tsx:322-333`）。

**UI 位置**：`overlay`；`role="progressbar"`、`aria-label="Loading Ultimate"`、`aria-busy`、`aria-live="polite"`，遮罩 `z-[60]`，绘制层 `aria-hidden`。

**关键流程**：1）`useReady()` 给 `{ready,timedOut,pending,failed}`；挂载时已 ready、`resumed`（重载保留旧视图）或 `navigator.webdriver` 则直接 `gone`（`web.tsx:337-343`）。2）`shield()` 抢焦点并在 capture 阶段吞掉所有 key（F5/Ctrl+R 除外），释放时把焦点还给应用（`web.tsx:292-316`）。3）`play()` 用 `[data-sweep]` 隐形动画当时钟，`level()` 算 `reveal`/`presence`/`bursts` 供 `Lightning` 每帧读取（`web.tsx:139-212,46-69`）。4）`reveal()` 等最短时长，`hurry()` 把剩余动画加速到 240 ms，`handOver()` 去掉 `pointer-events` 并 `release()`，再按 still/signature/普通三种退场（`web.tsx:220-272`）。5）`signature()` 把 intro 降速到 0.8（`web.tsx:348-367`）。6）`Electric` 用 ogl 建 WebGL2 渲染器，把 SVG 栅格化成场，`uPresence/uSweep/uHead/uPulse` 驱动闪电与爆发（`electric.tsx:607-831`）。

**失败与恢复**：无 WebGL2 自动退回实心字标；动画异常 `store.notify` 后直接 `setGone(true)`；`document.hidden` 跳过表演直接交接（`web.tsx:369-380,232-236`）。

**关掉它会发生什么**：无启动遮罩，应用直接出现；`Late` 的未就绪提示与 `?splash` 排练消失（核心仍会在 8 s 后放行应用）。

**复刻要点**：shell 必须"ready 前不渲染应用"，否则晚到的遮罩会闪出应用；焦点盾与 `pointer-events` 要在淡出前交接；字标轮廓是数据（`letters`+`view`），不是字体运行时。

**证据**：`extensions/splash/web.tsx:9,16-40,46-107,139-275,277-316,322-343,348-404,414-444`；`electric.tsx:569-607,613-677`；`web/src/sdk/hooks.ts:40-46`。

## 3. 跨扩展协作

- **cloud → pause / secrets / tailscale / dream**：`host.want(PauseApi)?.paused()` 阻止暂停期间备份（`cloud/server.ts:73`）；`host.need(SecretsApi).set` 只在 Join 里写 secret（`cloud/server.ts:182-192`）；`TailscaleApi.status().url` 作为提交的 `tailnet`（`cloud/server.ts:109,118`）；Dream 通过 `CloudApi.status()` 判定 `on` 后 `backup()`，其它状态写 `skipped` 文案（`dream/server.ts:364-372`）。备份进度通过 `cloud.backup` 事件进 System stream。
- **tailscale → instance / setup / cloud / system**：`instance` 用 `TailscaleApi.status().url` 的 hostname 加 `~/.ultimate/tailscale.json` 的端口拼出每个 preview 的 tailnet 地址（`instance/server.ts:195-205`）；`setup` 把 `state==='ready'` 报成 "published on the tailnet"（`setup/server.ts:228-233`）；`access.allow` 注册的 origin 进入 `system.access.origins`；cloud 的 `tailnet` 与浏览器指示器则经 `TailscaleApi`/`status` 读取。
- **voice-live → subagents / messages / lineage / conversations / sounds / sidebar / side-chat**：`SubagentsApi.standing('voice')` 创建并取回 Voice 会话（`voice-live/server.ts:413`）；`MessagesApi.answer` + `Messages`/`Question` 回答 @ultimate 的开放问题（`server.ts:238-270`）；`LineageApi.memoryBrief` 组 brief（`brief.ts:122`）；`ConversationsApi.concluded` 过滤已 conclude 分支（`brief.ts:102`）；`sounds/ui.tsx` 的 `playNotes` 播连接/就绪/暂停/结束音（`live.tsx:8,55-73`）；`UnderUltimate`/`Unlisted` 提供侧栏行与隐藏（`web.tsx:1400`）；`SideChatsDoc` 与 Voice 前推互斥（`web.tsx:379-393`）。
- **voice ↔ voice-live ↔ secrets**：两者都以 `OPENAI_API_KEY` 为唯一凭据、都排除 OAuth（`voice/server.ts:24-31`；`voice-live/server.ts:36-44`）；两者都用浏览器事件 `secrets:open` 定位到该行，并监听 `secrets:changed` 刷新 `status`。
- **fast ← subagents / agent 元数据**：`Profile` doc 给出子代理、自动化、standing agent 运行的定义名，`host.metadata` 的 `label` 覆盖 branch 与 lander；`discoverAgents` 读当前定义（`fast/server.ts:154-183`）。`voice.md` 的 `fast: true` 因此让 Voice 走优先层。
- **browser → web SDK**：`send`/`until` 依赖 `window.ultimate`（`web/src/sdk/test-hook.ts`）与 `sessionStorage['ultimate.driven']`；`until` 的 `{event,where}` 匹配各扩展 `defineEvent` 的数据字段（`browser/README.md:9-11`）。
- **claude-code → models**：`host.modelRuntime.registerNativeProvider/refresh` 与浏览器 `refreshModels()` 让 model picker 在登录变化后无需刷新页面（`claude-code/server.ts:76,83`；`web.tsx:11-14`）。
- **splash ← onboarding / web core**：`StatusAction` 决定首启签名版；`useReady`/`resumed` 由 core registry 提供（`web/src/sdk/hooks.ts:40-46`；`web/src/sdk/resume.ts:22`）。
- **parallel ← secrets**：只有 `secrets` 扩展启用且无错误时才读 secret store，否则统一报缺 key（`parallel/server.ts:34-55`）。

## 4. 复刻顺序建议与风险

**顺序**（按依赖与风险递增）：

1. `fast`：只碰 modelRuntime 与设置，能先验证 provider overlay / `beforeRequest` / `discoverAgents` 三条底座。
2. `sounds`：纯浏览器，验证 `useDocOf`、根会话文档与 Web Lock 去重。
3. `splash`：验证 `useReady`/`resumed`/shell 启动时序与 overlay 槽。
4. `voice`：最小 action + secret + 媒体录制闭环，为 voice-live 打样。
5. `claude-code`：验证 host resource、facet 引用计数、native provider 生命周期。
6. `parallel`：验证 tool `details` 契约、输出截断、secret 优先级与 UI 渲染器。
7. `browser`：最大的是浏览器生命周期与超时，依赖 `window.ultimate` hook。
8. `tailscale`：端口登记表、Serve 映射、`access.allow` 与核心准入规则必须一起做。
9. `cloud`：加密、分块、父子链与 Worker 409 语义，最容易被"看起来能备份"骗过。
10. `voice-live`：跨 6 个扩展、WebRTC + durable task + 幂等，最后做。

**风险**：

- **加密与完整性**：`snapshot.ts` 的 AAD 只覆盖 `id:kind:index:last`，不含 `key`；跨项目防护靠 `cipherKey` 的 HKDF salt（project key）与 manifest 的 `key` 校验（`snapshot.ts:123-124,165-170`）。复刻时若把 salt 写成常量，另一个项目的密文就能互解。
- **父链与 409**：`backup.ts:121-156` 的两条"自己的 409"分支极易漏；漏掉会把"Worker 已登记但应答 500"误报成冲突，或把重试当成功之外的新备份。
- **恢复路径**：`downloadSnapshot` 在写任何文件前拒绝 `root` 不一致（`snapshot.ts:125-128`），因为会话/worktree 存绝对路径；复刻若省掉会在另一台机器产生不可用历史。
- **Tailscale 准入**：安全不靠扩展本身，而靠核心 `server/request-security.ts:39-58` 的 Forwarded/Origin/`Sec-Fetch-Site` 规则 + Serve 的 identity 头；只做 Serve 映射而不接 `access.allow` 等于把 UI 暴露给整个 tailnet。
- **端口登记表并发**：`withRegistry` 的 pid 锁、owner token、`temporary` 语义三者缺一，就会出现"旧实例关闭删掉新实例映射"或"preview 抢走正式地址"。
- **voice-live 幂等**：`Forwarded.scheduled` + `createTask` 同事务（`server.ts:658-672`）、`voice:answer:<line>`、`voice:line:<request>`、`voice:say:<taskId>` 任一缺失都会在 task 重放时重复转发/重复说话；`re` 必须从工具轮前的输入反查，不能用模型给的 id。
- **voice 文档漂移**：README 说录音 10 分钟自动停，代码是 5 分钟（`voice/web.tsx:19`）。复刻与验收以代码为准；同理 cloud 的 "next start on" 偏保守（推断）——`cloudConfig` 与 `readSecret` 每次调用都重读磁盘（`lib/cloud.ts:23-40`；`lib/secrets.ts:53-56`），实际无需重启。
- **browser 的 `eval` 与取消**：Playwright 的 `evaluate` 无超时，必须自己 `Promise.race`（`server.ts:99-108`）；取消时若只关 context 不处理 wedge，会永久占住共享 browser。
- **splash 的时序**：`minimum` 与 `hurry` 必须由 shell 的"ready 前不渲染应用"配合，否则遮罩晚到会闪一下应用；`shield` 的焦点归还若丢失，桌面端键盘会卡在 overlay 上。
- **fast 的 payload 注入点**：pi-ai 的 simple stream options 会丢 `serviceTier`，必须走 `onPayload` 且在调用方 hook 之后合并（`fast/server.ts:120-127`），否则"看起来设置了"但请求仍是标准层。
