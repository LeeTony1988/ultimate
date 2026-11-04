# 17 · 验收规格（可执行场景）

> 每个场景给出：前置、步骤、期望。可直接转成 e2e 测试或手工验收。命令默认 `BASE=http://127.0.0.1:4747`，
> `HOME=~/.ultimate/projects/<name>-<hash>`。

## A. 进程与生命周期

### A1 首次启动

```
pnpm start
期望：
- 终端出现 "Ultimate: http://127.0.0.1:4747"
- HOME 下有 ultimate.lock、storage.lock、state.sqlite、trace.sqlite、supervisor.log
- curl -s $BASE/api/events -N 收到 event: system（含 generation=1）
- 浏览器打开显示 Get ready 或 Agent 空态
```

### A2 端口递增

```
pnpm start（已有一个实例）→ 第二个实例
期望：第二个实例监听 4748（未指定 --port）；日志显示 URL
```

### A3 重复启动打开窗口

```
ultimate <同一项目>
期望：进程读取 owner.port，打开窗口后 exit 0，不启动第二个 core
```

### A4 崩溃恢复

```
kill -9 $(jq .pid $HOME/storage.lock)
期望：
- supervisor 日志 "Core N exited unexpectedly"
- 500ms 后启动 generation N+1
- 浏览器 SSE 自动重连，view 快照恢复，对话不丢
```

### A5 热替换成功

```
改 server/system.ts 一行（加注释）→ 在 Agent 里调用 restart 工具
期望：
- 终端 "checking" → "swapping" → "ready"，generation +1
- 工具卡显示 from/to generation 与 build
- transcript 出现 prompt.build 分隔线（若 build 变化）
- 旧 SSE 断开后重连
```

### A6 热替换类型检查失败

```
在 server/ 写一个类型错误 → restart
期望：tsc 失败；旧 core 继续服务；工具返回 tsc 输出；generation 不变
```

### A7 热替换激活失败回滚

```
让新 core 在 go 阶段抛错（如 Harness.open 抛错）
期望：旧 core reacquire；system.process.activationError 有值；工具/重启 UI 显示 rolled back
```

### A8 中断的 reset

```
touch $HOME/reset.json → pnpm start
期望：拒绝启动，提示重跑 pnpm reset/restore
```

## B. HTTP / SSE

### B1 提交与流

```
curl -X POST $BASE/api/conversations/1/submit -H 'content-type: application/json' \
  -d '{"text":"Say hi"}'
期望：202 {submissionId}
curl -N "$BASE/api/events?conversation=1"：
- 首帧 system/conversations/view/ui/tasks
- 随后 ops 增量，assistant 消息流式出现
- 结束后 busy=false
```

### B2 历史分页

```
for i in $(seq 1 200) …（或用脚本造 200 条）
GET $BASE/api/conversations/1/history?before=999999
期望：64 条；before 为下一游标；继续翻到 1；不重复不丢
```

### B3 图片校验

```
提交 5 张图 → 413
提交 3MB 图 → 413
提交非法 base64 → 400
提交 4 张 2MB 内 → 202
```

### B4 abort

```
提交长任务 → POST /abort
期望：当前 run 停止；队列中的 follow-up 保留；下一次输入时它们排在前面
```

### B5 排队取消

```
忙碌时提交 steer → 从 inbox 取 submissionId → POST /inbox/:id/cancel
期望：200；inbox 中消失；若已处理则 409
```

### B6 UI 状态

```
POST /api/ui {"set":{"shell.panel":"info"}} → {ok, rev}
再 POST {"delete":["shell.panel"]}
期望：rev 递增；非法 key 400；>256KB 413
```

### B7 安全

```
curl -H 'Origin: https://evil.example' -H 'Sec-Fetch-Site: cross-site' $BASE/api/models
期望：403
curl -H 'Origin: http://127.0.0.1:4747' $BASE/api/models
期望：200
```

## C. 扩展系统

### C1 hello 扩展

```
extensions/hello/{README.md,server.ts,web.tsx}
期望：状态栏出现、Extensions 面板有 hello、server.tools 含 hello
```

### C2 web facet 热更新

```
修改 hello/web.tsx 文案
期望：不刷新页面，300ms 内更新
```

### C3 web facet 失败

```
在 web.tsx 抛错
期望：该扩展错误卡；其他 UI 正常；修复后自动恢复
```

### C4 server facet 失败

```
在 server.ts 抛错
期望：server.error 显示；旧工具仍可用；其余扩展正常
```

### C5 禁用/启用

```
settings.json disable ["hello"]
期望：工具消失（下一次请求）、状态项消失；enable 后恢复
```

### C6 core 保护

```
disable ["conversations"]
期望：诊断 "conversations is core and stays enabled"；仍加载
```

### C7 项目信任

```
新项目 .ultimate/extensions/x + 未信任
期望：不加载；Extensions 面板显示"项目设置未启用"
批准后：加载
```

### C8 typed API

```
A need B；B 禁用
期望：A 加载时报 "A needs B, which no enabled extension provides"（或诊断）
catalogue().missing 包含 B
```

## D. 树 / 子智能体 / 工作区

### D1 branch

```
@ultimate: "构建一个 hello 扩展"
期望：出现 branch 会话；首轮上下文含 memory brief；coordinator 开始工作
```

### D2 assessment 流程

```
功能类请求
期望：coordinator 只返回 assessment（含复杂度/代码增量/推荐/替代/风险/编号决策），不改代码
```

### D3 worker 隔离

```
coordinator 委派 worker
期望：worker cwd = $HOME/worktrees/<child id>；提交后父级收到报告（含 sha、测试命令、divergence）
```

### D4 landing

```
workspace submit
期望：lander 合并远程 + 全量检查 + fast-forward + push（若配置 origin）；失败时诊断并保留现场
```

### D5 子智能体回答

```
start worker（前台）→ 等待
期望：返回答案且只投递一次；重启父级后仍只投递一次
```

### D6 无回答

```
让子智能体结束但不产生文本
期望：父级收到 "[subagent <id> failed: ended its turn without an answer]"，不是静默
```

## E. 上下文与消息

### E1 问题卡

```
@ultimate 发 message {to:'user', questions:[…]}
期望：用户气泡 + 回答卡；To-dos 面板出现；回答后卡片消失，答案回到 @ultimate
```

### E2 side chat

```
打开 side chat → 提问 → Summarize & inject
期望：主会话收到 "Side chat #N … summary"；side chat 可丢弃
```

### E3 compact

```
长会话 → compact
期望：summary 出现在下一次请求；transcript 折叠；go-back 条目被排除
```

### E4 事件反应器

```
让 reactor 抛错一次
期望：业务写入与 cursor 回滚；failure 记录；下次提交重试成功
```

## F. 数据与恢复

### F1 重启恢复

```
提交一个长任务 → kill -9 core → 重启
期望：任务从最近 checkpoint 继续；已展示内容不丢；子智能体/消息恢复
```

### F2 分卷

```
请求切换到新 chapter → 重启
期望：chapters.json active 变化；新库 id 从旧库最大值之后开始；切回旧 chapter 可读旧会话
```

### F3 reset

```
pnpm reset --dry-run → --yes
期望：状态移动到 backups/reset-<time>/；home 清空；启动后为全新状态
```

### F4 restore

```
pnpm restore <name> --yes
期望：备份装回；id 连续；对话可读
```

### F5 密钥

```
Secrets 面板设置 KEY=value
期望：~/.ultimate/secrets.json 0600；action 返回元数据不含 value；trace 不含 value
```

## G. 性能与稳定性

### G1 长会话

```
1000 条 entry
期望：首屏 <2s；滚动流畅；历史分页可用
```

### G2 多标签

```
两个标签同时改 UI 状态
期望：不互相回跳；最终一致；无重复面板
```

### G3 SSE 断线

```
断网 10s 再恢复
期望：自动重连；快照恢复；无重复消息
```

### G4 扩展风暴

```
同时保存 10 个 web.tsx
期望：逐个热更新；无整页崩溃；错误隔离
```

## H. 安全

### H1 跨源

```
恶意 Origin 请求 /api/* → 403
```

### H2 Tailscale

```
只有 allowlist 的 login 能通过；其他 403
X-Forwarded-For 伪造内网地址被忽略
```

### H3 扩展动作

```
curl 无 Origin/Sec-Fetch 直接 POST action → 403
```

### H4 trace 脱敏

```
调用 secrets/models 的 action
期望：trace 中无参数/结果/错误消息，仅错误类
```

## I. 验收通过标准

- A–H 全部通过；
- `pnpm check` 与 `pnpm test` 通过；
- 任意一次 `kill -9` 不导致数据丢失或重复投递；
- 53 个扩展中至少 core 15 个与 agent 主流程可用；
- 快速验收（10 分钟）：A1、A4、A5、B1、C1、C2、D1、D3、E1、F1。

## J. 证据索引

- 各章"验收"小节；`test/e2e`（本仓库未纳入分析，复刻时应实现同类场景）。
