# 20 · Ultimate 子 Agent 编排机制分析与复刻 Spec

| 字段     | 值                                                                             |
| -------- | ------------------------------------------------------------------------------ |
| 文档 ID  | AD-20                                                                          |
| 需求前缀 | `REQ-A-*` / 验收 `AC-A-*`                                                      |
| 状态     | 1.0（通过质量门）                                                              |
| 证据基线 | `3f7b7bec`（2026-10-27）                                                       |
| 前置阅读 | `../self-evolution/10-self-evolution-spec.md` §2（不变量）、`../00-plan.md` §4 |
| 读者     | 要实现多 agent 委派/编排系统的 AI agent / 架构师                               |

---

## 0. 一句话结论

Ultimate 的子 agent 编排不是"函数调用另一个模型"，而是一套**持久化的会话委派协议**：

- 每个子 agent 是一个独立 conversation（有 id、上下文、工具、工作目录、生命周期）；
- 父与子通过** durable task + reporter + requestId** 传递指令和答案，跨崩溃/重启仍恰好一次；
- 子 agent 的生命周期**不依附于父的当前 run**（独立 background anchor），父停止不会杀死子；
- 代码隔离通过 **Git worktree**，集成通过 **land（ff-only）**，不通过共享内存；
- 分支（branch）、常驻 agent（standing）、自动化 run、review team 都复用同一套 child/definition 机制，但所有权和入口不同。

复刻时最容易做错的三件事：把 foreground 当生命周期、把 reporter 当普通回调、把 worktree 当沙箱。这三件事 Ultimate 都明确否定了。

---

## 1. 目标、非目标与需求

### 1.1 目标

| ID     | 目标                                                                        |
| ------ | --------------------------------------------------------------------------- |
| G-A-01 | 解释子 agent 从定义发现到销毁的完整生命周期                                 |
| G-A-02 | 解释"恰好一次"答案投递的机制与崩溃恢复                                      |
| G-A-03 | 解释任务图/所有权/隔离区/landing 的关系                                     |
| G-A-04 | 解释 branch、standing agent、automation run、review team 如何复用同一套机制 |
| G-A-05 | 给出可被 agent 直接实现的复刻 spec（模块、接口、算法、测试）                |
| G-A-06 | 给出可视化所需的可观测性契约（供 AD-30/AD-40 使用）                         |

### 1.2 非目标

- 不实现模型推理本身；只定义 agent 配置如何解析、路由。
- 不实现通用工作流引擎（DAG 调度、重试策略引擎）；这里只做"会话委派"。
- 不把子 agent 做成沙箱；Ultimate 的隔离是工作目录隔离，不是安全边界。
- 不要求复刻 Pi Durable 的全部 API；用其语义即可。

### 1.3 需求清单

| ID        | 需求                                                                                                                                  | 优先级 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| REQ-A-001 | 子 agent 必须是独立 conversation，id 即子 agent id                                                                                    | P0     |
| REQ-A-002 | 定义必须支持 Markdown+frontmatter、三目录发现、同名覆盖、overlay                                                                      | P0     |
| REQ-A-003 | 定义的工具必须是父工具的子集；默认不继承 `subagent` 工具/扩展                                                                         | P0     |
| REQ-A-004 | 模型解析顺序必须为 preview > 显式 override > 定义 pin（有登录）> 父模型                                                               | P0     |
| REQ-A-005 | `start` 必须支持 foreground/background 等待风格、fork、isolate                                                                        | P0     |
| REQ-A-006 | 子 agent 必须由独立 background anchor 拥有，父停止不杀死子                                                                            | P0     |
| REQ-A-007 | 每个 start/message 必须创建一个 reporter，答案恰好投递一次                                                                            | P0     |
| REQ-A-008 | reporter 必须跨崩溃/重启恢复，且不能重复投递                                                                                          | P0     |
| REQ-A-009 | `wait` 必须可被 steering 打断并返回状态而非答案                                                                                       | P0     |
| REQ-A-010 | `message` 默认 steer；`steer:false` 必须排队为 follow-up                                                                              | P0     |
| REQ-A-011 | `stop` 必须取消当前工作 + 待处理 reporter/input，且不删除代码                                                                         | P0     |
| REQ-A-012 | `stop` 必须列出子 agent worktree 中未提交的文件                                                                                       | P1     |
| REQ-A-013 | `list` 必须返回子 agent、agent 名、背景标志、workspace、busy 状态                                                                     | P1     |
| REQ-A-014 | `land` 必须只 fast-forward：子 worktree clean、源 checkout 在 target 分支、子无 live run/queued input；源 checkout 的无关脏文件不阻塞 | P0     |
| REQ-A-015 | `discard` 只能删除 idle、非 preparing 的 checkout（脏 checkout 由 `git worktree remove` 拒绝），保留 branch                           | P1     |
| REQ-A-016 | worktree 必须从父已提交 HEAD 创建，路径与 branch 可预测                                                                               | P0     |
| REQ-A-017 | worktree setup 必须可重复执行、超时 2 分钟、失败保留输出尾部                                                                          | P1     |
| REQ-A-018 | 子 agent 必须在无答案结束时给出明确失败文本，不得静默                                                                                 | P0     |
| REQ-A-019 | provider 错误必须交给 watchdog：一次重试，之后 failure card/given-up                                                                  | P1     |
| REQ-A-020 | 子 agent 只能 message 其父；只有 @ultimate 能 message 用户                                                                            | P0     |
| REQ-A-021 | branch 必须与 subagent 区分：branch 是顶层 ownerless 会话，不是子 agent                                                               | P0     |
| REQ-A-022 | standing agent 必须由 `resident:true` 定义、每项目一个会话、可刷新/退休                                                               | P1     |
| REQ-A-023 | automation run 必须复用定义与 createChild，但忽略 isolate                                                                             | P1     |
| REQ-A-024 | review team 必须支持 `reviewer-*` 并行 leaf + lead 合并                                                                               | P2     |
| REQ-A-025 | 子 agent 必须能关联 coordinator 的 plan task                                                                                          | P2     |
| REQ-A-026 | 系统必须发出 `subagents.started` 等事件，足以重建生成树                                                                               | P0     |
| REQ-A-027 | 系统必须提供任务图（owner/status/background/aborts）                                                                                  | P0     |
| REQ-A-028 | 消息/报告必须带 sender、agent、失败标志、answer id                                                                                    | P1     |
| REQ-A-029 | fork 必须按文档 fork 策略复制，不复制父的 Subagents 索引                                                                              | P1     |
| REQ-A-030 | 父级必须在每次请求前看到运行中/排队中的子 agent 摘要                                                                                  | P2     |
| REQ-A-031 | 子 agent 的工具限制不是安全边界，文档必须明确                                                                                         | P1     |
| REQ-A-032 | 所有持久操作必须可重放（memo/requestId/receipt）                                                                                      | P0     |
| REQ-A-033 | 子 agent 的 cwd/instructions 必须在 isolate 创建后重写                                                                                | P0     |
| REQ-A-034 | 子 agent 的默认标题必须取自 task 首行，且不覆盖已有标题                                                                               | P2     |
| REQ-A-035 | 复刻必须提供崩溃/重复投递/并发 stop 的验收测试                                                                                        | P0     |

---

## 2. 术语与不变量

### 2.1 术语

| 术语           | 定义                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| child          | 由某个父 conversation 通过 `subagent start` 创建的子 conversation        |
| parent         | 发起 start 的 conversation；也是 reporter 的所有者                       |
| anchor         | 一个 background task，拥有 child；使 child 不依附父的当前 run            |
| reporter       | 每个 start/message 创建的 background task，负责把子 agent 的答案投递回父 |
| action         | `Subagents` 文档中按 tool call id 记录的一次委派动作                     |
| foreground     | start/message/wait 的一种**等待风格**：调用者等待答案；不是所有权        |
| background     | start 后立即返回 id；答案以后加入父的 run 或唤醒父                       |
| isolate        | 子 agent 的独立 Git worktree；不是沙箱                                   |
| branch         | 顶层 feature conversation，由 lineage 创建，不归父 conversation 所有     |
| standing agent | `resident:true` 的常驻 agent，每项目一个 ownerless conversation          |
| definition     | `agents/<name>.md`，描述角色、模型、工具、隔离、指令                     |
| profile        | child/standing 会话记录的来源定义（`ultimate.agent-profile`）            |
| watchdog       | 失败重试/失败卡扩展；provider 错误的唯一负责人                           |

### 2.2 不变量

| ID       | 不变量                                               | 强制点                                                                                                                        | 违反症状                         |
| -------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| INV-A-01 | child id == conversation id                          | `createChild()` 返回 conversation；`details.conversationId`                                                                   | 两套 id 映射，UI/停止/查询错位   |
| INV-A-02 | child 由独立 anchor 拥有，父停止不杀 child           | `tx.createTask(Anchor, ..., { background:true })`；child `owner:{kind:'task'}`（`subagents/server.ts:990-1008`）              | 父一停，所有 worker 被取消       |
| INV-A-03 | 每次 start/message 恰好一个 reporter                 | `tx.createTask(Reporter, ...)`（`extensions/subagents/server.ts:1028-1037`）                                                  | 答案丢失或重复                   |
| INV-A-04 | 答案按 answer entry id 去重                          | `reported: EntryId[]`；`answerRequest(answer)`（`extensions/subagents/server.ts:82-83,155-169`）                              | 同一条答案投递两次               |
| INV-A-05 | 投递提交必须带稳定 requestId                         | `subagent:<taskId>` / `subagent-report:<taskId>` / `subagent-answer:<answer>`（`extensions/subagents/server.ts:143,247-248`） | 重启后重复输入                   |
| INV-A-06 | 工具返回答案后，队列中的 reporter 必须被标记为已投递 | `afterTools` hook（`extensions/subagents/server.ts:772-817`）                                                                 | 工具结果 + 异步报告双份          |
| INV-A-07 | foreground 不是所有权；`wait` 可 yield               | `waitInterruptibly`（`extensions/subagents/server.ts:287-347`）                                                               | 把 wait 取消当成 child 取消      |
| INV-A-08 | `stop` 只取消捕获的 run/inputs/reporters/watchdogs   | `stop` 先 snapshot 再操作（`extensions/subagents/server.ts:1092-1163`）                                                       | 重放误杀后续 run                 |
| INV-A-09 | 定义工具必须是父工具子集                             | start 时检查（`extensions/subagents/server.ts:950-955`）                                                                      | 子 agent 获得父没有的能力        |
| INV-A-10 | 默认不继承 `subagent` 工具/扩展                      | `excludeTools/excludeExtensions`（`extensions/subagents/server.ts:1002-1003`）                                                | 无限递归委派                     |
| INV-A-11 | child 的答案必须是非空文本且非 aborted/error         | `answered()`（`extensions/subagents/server.ts:84-91`）                                                                        | 空 thinking 被当成答案           |
| INV-A-12 | 无答案结束必须显式失败                               | `reportText`/`replyText`（`extensions/subagents/server.ts:94-102`）                                                           | 父永远等一个不会来的答案         |
| INV-A-13 | worktree 从父已提交 HEAD 创建，不包含未提交改动      | `workspaces.create` + warning（`extensions/subagents/server.ts:956-962`）                                                     | 子看不到父的未提交工作却以为看到 |
| INV-A-14 | land 只 ff，不 rebase/reset/force                    | `workspaces` README "Lander"                                                                                                  | 覆盖目标分支历史                 |
| INV-A-15 | branch 不是 subagent                                 | `lineage` branch；`kind:'branch'`                                                                                             | 把 branch 当 child 停止/统计     |
| INV-A-16 | 子 agent 只能 message 父                             | `messages` README "A subagent may message only that parent"                                                                   | 越级上报/绕过 coordinator        |
| INV-A-17 | 只有 @ultimate 能 message 用户                       | `messages` README                                                                                                             | 多个 agent 直接轰炸用户          |
| INV-A-18 | 工具限制不是安全边界                                 | `subagents/README.md` "Deferred tools are not a security boundary"                                                            | 把只读 agent 当沙箱              |
| INV-A-19 | 所有持久副作用必须可重放                             | `replay:'safe'` + memo + requestId                                                                                            | 崩溃后重复创建/重复投递          |
| INV-A-20 | fork 不继承父的 Subagents 索引                       | fork 文档策略（`subagents/README.md` "History forks"）                                                                        | 子看到不属于自己的子 agent       |

---

## 3. 机制分析

### 3.1 定义发现与解析

#### 3.1.1 文件格式

```markdown
---
name: worker
description: Implement one bounded task, verify it, and report evidence in one focused commit.
model: openai-codex/gpt-6.1-sol
thinking: high
tools: [read, bash, edit, write]
denyTools: [instance]
isolate: worktree
fast: true
summaries: false
---

You implement one bounded task...
```

字段规则（`lib/agents.ts:245-317`）：

- 必填：`name`（`^[a-zA-Z0-9_-]+$`）、`description`、body（instructions）
- 可选：`model`、`thinking`、`tools`、`denyTools`、`isolate`、`resident`、`onFailure`、`fast`、`summaries`
- 未知字段直接报错（不是忽略）
- `model` 用 Pi 的 `resolveCliModel`：支持 `provider/id`、模糊 id/name、`:thinking` 后缀；未知模型报错
- `thinking` 必须是 `off|minimal|low|medium|high|xhigh|max`
- `tools` 是显式白名单；省略=继承父级
- `denyTools` 从显式或继承集合中移除；未知工具名静默忽略
- `isolate` `none|worktree`；`resident` 布尔；`onFailure` `diagnose|fix`（仅 lander 读）；`fast` 布尔；`summaries` 默认 true，false 关闭自动摘要

#### 3.1.2 发现顺序与覆盖

```
clone agents/                       (builtin)
→ enabled extensions' agents/       (builtin)
→ ~/.ultimate/agents/               (user)
→ <project>/.ultimate/agents/       (project, only if trusted)
```

后出现同名文件覆盖前面；overlay 例外（`lib/agents.ts:330-420`）：

- overlay 由 `addTools` 标记（空列表表示只改设置）
- 只能覆盖 settings、追加 `addTools`/`denyTools`、追加 body
- 不能声明 `tools`；不能删除基础工具；不能改写基础指令
- 没有基础定义时 overlay 报错

保存（`lib/agents.ts:486-618`）：

- `saveDefinition` 先序列化，再按 discovery 回读；失败不写
- 内置定义永不改写；保存到 user/project 形成同名覆盖
- 已有 overlay 时保存为 overlay diff（只写不同部分）
- `deleteDefinition` 删除 user/project 文件后，被覆盖的内置/用户定义重新生效

#### 3.1.3 Agent 配置生成

`definitionAgent(definition, parent, modelRuntime)`（`lib/agents.ts:115-160`）返回：

```ts
{
  modelTools: { add: deferredToolsNamedByDefinition },
  tools: parentTools minus denyTools, filtered by definition.tools if present,
  extensions: parent.extensions minus excluded,
  instructions: definition.instructions ?? parent.instructions,
  model: preview ?? override ?? pinnedIfLoggedIn ?? parent.model,
  thinkingLevel: clamp(override ?? definition.thinking ?? parent.thinking)
}
```

要点：

- **模型 pin 只有在有登录时才生效**；否则回退父模型，不会把会话卡死。
- **preview 模型覆盖一切**（`ULTIMATE_MODEL`），用于实例预览。
- **deferred 工具**：定义显式列出的 deferred 工具会加入 `modelTools.add`，但不是安全边界（`subagents/README.md` "Deferred tools are not a security boundary"）。
- **工具限制是选择，不是沙箱**：`scout` 只有 read/bash，但 bash 仍能写文件；安全靠指令 + 评审，不靠工具白名单。

### 3.2 子 agent 创建与所有权

#### 3.2.1 `start` 的持久步骤

以 `subagents/server.ts:926-1087` 为准：

```text
start {agent, task, background?, fork?, isolate?}
 1. 校验 task 非空、agent 存在、定义工具是父工具子集
 2. 解析 isolate（定义 isolate / 参数覆盖）
 3. 若 isolate 且父有未提交改动 → 警告（不会带入 worktree）
 4. 若 fork：
      - 取父当前 viewState
      - 找到调用工具的那条 assistant entry
      - forkAt = 前一条 entry（不包含当前调用）
 5. 单个 commit：
      a. 若已有同一 callId 的 action → 直接返回（重放）
      b. 请求父会话的 spawn summary（可选）
      c. 创建 Anchor task（background，conversation ownership）
      d. createChild：
           - new conversation 或 fork
           - configure 模型/思考/工具/扩展/instructions/cwd
           - metadata.label = 定义名；title = task 首行（短标题）
           - Profile.definition = 定义名
           - summaries:false → 关闭自动摘要
      e. emit subagents.started {id, agent, kind:'child', model?, thinking?, parent?}
      f. Subagents.agents[childId] = {conversationId, agent, background, reported:[]}
      g. 若 isolate：workspaces.create(tx, childId, parent.cwd)；configure 追加
         "Work only in <path> on <branch>, cut from <base>. Commit... Never push..."
      h. 创建 Reporter task（background），记录 actions[callId] = {conversationId, reporter}
 6. 若 background → 返回 "Started <id>."
 7. 否则 waitInterruptibly(...)：
      - 若 yield → 返回 "Wait yielded..." + details.yielded
      - 若完成 → 读 actions[callId].answer，返回答案文本 + details.answerId
```

#### 3.2.2 所有权图

```
parent conversation
  ├─ Anchor task (background, owner = parent conversation)
  │    └─ child conversation (owner = Anchor task)
  ├─ Reporter task (background, owner = parent conversation)
  └─ action (callId → child, reporter, answer?, status?)
```

为什么需要 anchor：

- 如果 child 直接归父的当前 run 所有，父 run 结束/停止时 child 会被级联取消；
- anchor 是 background task，归属父 **conversation** 而不是某次 run，因此 child 的生命周期独立；
- 父停止只停止父的 run，不停止 anchor/reporter/child；要停 child 必须显式 `stop {id}`。

证据：`extensions/subagents/server.ts:990-1008,1028-1037`；`subagents/README.md:1`。

#### 3.2.3 Fork

`fork: true`：

- 只对**有定义**的 start 有效；没有定义时忽略（`extensions/subagents/server.ts:967`）。
- fork 点是"包含本次工具调用的 assistant message 的前一条 entry"，不包含 pending call。
- child 获得父的可见历史 + 定义指令；task 文本仍是第一条新输入。
- 文档 fork 策略：
  - `pi.agent`、`codemode.store`、`ultimate.ui` 复制 `asOf` fork entry；
  - `ultimate.subagents`、`ultimate.metadata`、`models.login`、Pi inbox/live/usage 从 `initial` 开始；
  - 没有内置文档使用 `current`。
- fork 成本高，但共享前缀通常命中 prompt cache。

证据：`subagents/README.md` "History forks"；`extensions/subagents/server.ts:964-977`。

### 3.3 Reporter：恰好一次投递

#### 3.3.1 为什么不用普通回调

子 agent 可能在父进程重启后继续；答案可能由工具同步返回，也可能异步到达；父可能正在忙。普通回调会丢、会重、会竞态。Ultimate 用**持久 task + 稳定 requestId + answer receipt**解决。

#### 3.3.2 Reporter 状态机

```
deliver
  ├─ child.submit(input {requestId: subagent:<taskId>, whenBusy: steer|followUp})
  ├─ wait settled
  ├─ settled.done && input:
  │    ├─ action.answer = answer
  │    ├─ if answer in agent.reported → report phase without text (already delivered)
  │    ├─ else push answer to reported; checkpoint report = "[subagent id (agent) answered] ..."
  ├─ settled.unanswered && (model_error|no_model):
  │    └─ action.status = failed; report phase (watchdog owns the failure)
  ├─ settled.unanswered && reason != aborted:
  │    └─ report phase with failure text
  ├─ settled.unanswered && aborted:
  │    └─ action.status = interrupted; report phase (no text)
  └─ error:
       └─ action.status = failed; report phase with error message

report
  ├─ if report text:
  │    parent.submit(input {
  │      content: "[subagent id failed: ...]" or report,
  │      entry: subagents.report {sender, kind, agent, failed, body, entry?},
  │      whenBusy: steer,
  │      requestId: subagent-report:<taskId> | subagent-answer:<answer>
  │    })
  └─ terminal completed
```

证据：`extensions/subagents/server.ts:103-269`。

#### 3.3.3 去重三道闸

1. **action 级**：`actions[callId]` 在 start/message 的同一 commit 创建；重放同一 callId 直接返回（`extensions/subagents/server.ts:979-1041`）。
2. **answer 级**：`agent.reported` 记录已投递的 answer entry id；同一答案不再投递（`extensions/subagents/server.ts:155-169`）。
3. **submission 级**：`requestId` 固定；`tx.createSubmission` / `settleSubmission` 保证同一 request 只入队一次（`extensions/subagents/server.ts:143,247-248`）。

#### 3.3.4 工具结果与异步报告的竞争

场景：父调用 `start` 前台等待，reporter 已把答案作为 report 输入排到父队列；同时工具结果也返回同一个 answer。若不处理，父会看到两份。

`afterTools` hook（`extensions/subagents/server.ts:772-817`）：

- 扫描本轮所有 tool result；成功结果若 `details.answerId`（subagent）或 `details.subagentAnswers`（codemode）存在；
- 找到对应的 submission（requestId = `subagent-answer:<answer>`）；
- 若 submission 还在 queued：从 inbox 移除，并 `settleSubmission(status:'unanswered', reason:'subagent-tool-delivered')`；
- 若还没有 submission：创建一个 `unanswered` 的占位 submission，防止 reporter 之后重复投递。

这就是"**工具返回是收据，不是投递**"：只有提交后的外层结果才能确认答案已送达。

#### 3.3.5 崩溃点分析

| crash 点                      | 状态                             | 恢复行为                                        |
| ----------------------------- | -------------------------------- | ----------------------------------------------- |
| createChild 前                | 无 child                         | start 重放，创建一次                            |
| createChild 后、reporter 前   | child 存在，action 可能未写      | 同一 commit 原子；若整体回滚，child 也不存在    |
| reporter 创建后、input 提交前 | reporter task 存在，input 未入队 | 恢复后 reporter 从 deliver 继续，requestId 去重 |
| input 提交后、settled 前      | input 在 child 队列/运行         | reporter 等 settled；child 继续                 |
| settled 后、report commit 前  | 答案已产生，report 未提交        | reporter 重放 report 阶段；answer receipt 防重  |
| report 提交后、terminal 前    | 父已收到报告                     | 重放 report 提交同一 requestId，无副作用        |
| 父在 report 投递时忙          | input 以 steer 进入              | 父在当前工具轮后看到；不会丢                    |

### 3.4 Wait / steer / follow-up

#### 3.4.1 三种输入语义

| 工具                    | 默认 whenBusy           | 语义                                                  |
| ----------------------- | ----------------------- | ----------------------------------------------------- |
| `start`                 | 前台等待 / 后台立即返回 | 创建 child + reporter                                 |
| `message`               | `steer: true`           | 子 agent 忙时，在当前工具轮边界插入；不忙时启动新 run |
| `message {steer:false}` | `followUp`              | 排到当前 run 之后；不打断                             |

`wait` 不是输入；它只等待 reporter 完成。

#### 3.4.2 `waitInterruptibly`

`extensions/subagents/server.ts:287-347`：

```text
waitInterruptibly(api, childId, reporters, idle):
  - 读父 InboxDoc，监听 steer 项
  - completion = 等所有 reporters 完成；若 idle 还等 child idle
  - race:
      completion -> true
      steering -> 若 reporter 已 ready（answer 已产生）则等 completion -> true
                  否则 false（yield）
  - finally: 取消本地监听，停止 inbox watch
```

关键：

- **只取消本地等待**，不取消 child；
- steering 可以打断 wait；
- **follow-up 不会打断 wait**（只有 steer 和其他 child 的 answer 会）；
- 已完成的答案优先于 steering。

#### 3.4.3 父级提示

每次请求前，`subagent_state` section 列出：

- `Still running subagents: id (agent), ...`
- `Pending subagent inputs: id (agent), ...`
- 规则："yielded wait is not a child answer; use message/stop/wait; parent stop does not stop them; queued inputs delivered only at normal boundary."

证据：`extensions/subagents/server.ts:820-845`。

### 3.5 Stop / land / discard

#### 3.5.1 Stop

`extensions/subagents/server.ts:1092-1187` 的精确顺序：

1. 读 child `LiveDoc.run`（当前 run task id + inputs）；
2. 读父 `Subagents` 状态，收集该 child 的所有 reporters；
3. 扫描父的 `watchdog.failure` tasks，收集与该 child 相关的 watchdog retry 请求；
4. `api.memo('stopTarget', {run, inputs, watchdogs, reporters})` 固化目标；
5. abort 所有 reporter + watchdog task，并等待；
6. 找这些 reporter/watchdog 对应的 queued submissions，abort；
7. 循环：读 child `LiveDoc.run`；若仍是捕获的 run 或包含捕获的 input，abort 当前 task 并等待；
8. 读 child workspace；若 ready，列出 staged/unstaged/untracked 文件；
9. 返回 "Stopped <id>. Left uncommitted in <path>: ..."。

关键：

- **先捕获身份，再取消**：重放不会误杀后来复用的 run；
- **不 commit、不删除**：代码留给 coordinator 决定；
- **列出未提交文件**：防止"stop 即丢失"。

#### 3.5.2 Land

`workspaces.land(id)`：

- 前置：workspace ready；child 无 live run；无 queued input；child worktree clean；source checkout 停在 target 分支；worktree 停在记录的分支；
- 只 `git merge --ff-only` 到保存的 source branch；**source checkout 的无关脏文件不阻塞**，只有真正重叠时 Git 拒绝合并；
- 返回 commits、paths、target、是否已集成（tip 相同则 no-op）；
- 不 rebase、不 push。

`subagent land` 只是 `workspaces.land` 的包装（`extensions/subagents/server.ts:917-925`）。

#### 3.5.3 Discard

`workspaces.discard(id)`：

- 只能删除 idle、非 preparing 的 checkout；代码没有显式 clean 检查，依赖 `git worktree remove`（不带 `--force`）拒绝脏工作区；
- 保留 branch（未 land 的提交仍可恢复）；
- 下次输入会按同一路径重建。

### 3.6 隔离区（Worktree）

#### 3.6.1 创建

- 路径：`<home>/worktrees/<conversationId>`（可预测）
- branch：`ultimate/<sha256(home) 前 6 位>-<conversationId>`（可预测；source map §6）
- base：父的**已提交 HEAD**；未提交改动不会带入（会警告）
- setup 命令来自项目 `.ultimate/settings.json`：

```json
{
  "isolates": {
    "worktree": { "setup": ["pnpm install --frozen-lockfile --prefer-offline"] }
  }
}
```

- 命令在 host shell 中按顺序执行，closed stdin，2 分钟超时；`ULTIMATE_SOURCE` 指向父 checkout；
- 必须可重复执行（中断后会重跑）；
- 失败保留输出尾部，只删除干净 checkout；脏输出保留。

#### 3.6.2 cwd 与指令

创建后 `configure` 追加：

```
Work only in <path> on <branch>, cut from <base>.
Commit your work on this branch with clear messages.
Never push and never touch other checkouts.
```

子 agent 的 `cwd` 指向 worktree（`extensions/subagents/server.ts:1017-1026`）。这不是沙箱：绝对路径仍可访问其他 checkout。

#### 3.6.3 嵌套与恢复

- 嵌套 isolate 先准备其 source ancestor checkouts；
- 删除/移除后，下次模型请求按同一路径重建；
- 已存在 branch 有未 land 提交 → 原样 checkout，tip 作为新 base；
- 已合并/缺失 branch → 从当前 target tip 开始。

证据：`extensions/workspaces/README.md` 前 70 行；`subagents/README.md` "Isolates"。

### 3.7 Branch / Standing / Automation / Review team

#### 3.7.1 关系图

```
@ultimate (standing, resident)
  ├─ branch → coordinator (top-level, ownerless, memory brief)
  │    ├─ subagent scout (child, no isolate)
  │    ├─ subagent worker (child, worktree)
  │    ├─ subagent designer (child, worktree)
  │    └─ subagent reviewer (child, read-only; may lead reviewer-* team)
  ├─ @lander (standing)
  ├─ @watcher (standing, automation scripts)
  └─ automation run (child kind, from definition)
```

#### 3.7.2 差异表

| 维度      | subagent child            | branch                       | standing agent        | automation run                 |
| --------- | ------------------------- | ---------------------------- | --------------------- | ------------------------------ |
| 创建者    | 父 conversation           | lineage / @ultimate `branch` | `resident:true` 定义  | automation                     |
| 所有权    | anchor task               | ownerless                    | ownerless             | anchor/task                    |
| 是否顶层  | 否                        | 是                           | 是                    | 否                             |
| 上下文    | 父的 cwd/fork 可选        | root memory brief            | 项目根                | 定义/根配置                    |
| 工具      | 定义子集，默认无 subagent | 正常 coordinator 工具        | 定义工具              | 定义工具减 automation/subagent |
| 隔离      | 可 worktree               | 可 worktree                  | 无（项目根）          | 忽略 isolate                   |
| 报告      | reporter → 父             | message → @ultimate          | message → @ultimate   | 作为 run 结果                  |
| 停止      | 显式 stop                 | 用户/结论                    | 不可（standing 常驻） | abort run                      |
| 事件 kind | `child`                   | `branch`                     | `standing`            | `child`                        |

#### 3.7.3 Branch 不是 subagent

`branch` 由 `lineage` 创建：

- ownerless conversation，fork 自 root 或指定 entry；
- 可带 memory brief；
- 有自己的 worktree（默认隔离）；
- 通过 `message` 与 @ultimate 往返，而不是 reporter；
- 它的答案不是"子 agent 答案"，而是 coordinator 的报告/决策。

把 branch 当 child 会导致：停止语义错误、任务图错误、成本统计错误、记忆 brief 丢失。

#### 3.7.4 Review team

- 没有 `reviewer-*` 定义：shipped `reviewer` 自己评审。
- 有 `reviewer-*`：shipped `reviewer` 作为 lead，**并行**启动所有 leaf，自己不评审；只合并：
  - 每个问题只报一次，列出所有提出者；
  - 分歧并列展示；
  - 全部 APPROVED 才 APPROVED。
- leaf 工具必须是 lead 工具的子集（`read`,`bash`,`subagent`）。
- 报告格式固定：`Reviewed range` / `Reviewers` / `Blocking` / `Non-blocking` / `Disagreements`。

证据：`extensions/subagents/README.md` "Review team"；`agents/reviewer.md`。

### 3.8 委派简报与报告契约

#### 3.8.1 何时委派

`agents/coordinator.md:32-45` 给出四条同时成立才委派：

1. **有界**：能用几句话说明范围与"done"；
2. **独立**：不依赖尚未做的决定；
3. **可验证**：能廉价确认结果（diff、测试、引用行）；
4. **划算**：自己做要很多步，或会把大量材料灌进上下文。

不适合：需求、架构、验收标准、最终评审——这些是协调者的判断，不能外包。

#### 3.8.2 Brief 模板（必须六段）

1. 目标与为什么重要；
2. 精确范围：可改文件/区域，禁改什么；
3. 输入：已知信息，避免重新发现；
4. 验收标准与验证命令，每条标记 **core test**（提交）或 **prove once**（一次性证明，报告后删除）；
5. "Do not expand scope. Report problems instead of working around them."
6. 返回格式：结论 + `file:line` 证据，不要原始 dump。

#### 3.8.3 报告契约

- 前台/等待/异步答案都带 `Returned model: provider/model`（从存储的 assistant message 读取，不是配置或自报）。
- 成功工具答案带 `details.answerId`。
- 异步报告前缀：`[subagent <id> (<agent>) answered] ...`。
- 无答案：`[subagent <id> failed: ended its turn without an answer]`。
- 子 agent 的报告应包含：结论、改动、验证命令与输出、风险、与任务的偏差（"None" 如果一致）。
- 协调者必须验证：读 diff、核对引用、读子 agent 最后一次完整测试输出；"idle/finished" 不是证据。

### 3.9 任务图与 Plan 关联

#### 3.9.1 任务图

每个 conversation 的 live work 是一棵 task 树：

```
generation task
  ├─ tool call task
  │    └─ child conversation (owned by anchor task)
  ├─ reporter task
  └─ compaction/summary task
```

`tasks` 事件提供 `TaskGraph`：每个节点有 owner edge、status、background/aborting 标记、拥有的 conversations。UI 的 Tasks tab 显示：

- 每个 conversation 的 live tasks；
- 状态（pending/running/waiting/completing）；
- 运行时长（>10 分钟警告色）；
- parked（连续 5 次崩溃）与 Retry；
- 顶层 conversation 的 feature tag；
- 关联 plan task 的 `TaskChip`。

#### 3.9.2 Plan 关联

- coordinator 用 `plan` 工具创建 epic/task；
- `update {key, child}` 把 child conversation 链接到 task；
- 同一 commit 重写 `ultimate.plan.tasks` 索引：`childId → {coordinator, epic, key, title, status}`；
- 子 agent 只能读 coordinator 的 ledger，不能改（“Only conversation N edits this plan”）；
- 子 agent 的 UI 显示 `TaskChip` + `↑ #coordinator`。

证据：`extensions/plan/README.md`。

### 3.10 可观测性（供可视化）

要重建"生成树 / 泳道 / 消息 / 工具调用"，至少需要：

| 数据          | 来源                                              | 字段                                               | 用途                     |
| ------------- | ------------------------------------------------- | -------------------------------------------------- | ------------------------ |
| 生成事件      | `subagents.started`                               | id, agent, model?, thinking?, parent?, kind        | 树边、泳道、agent 标签   |
| 生成调用      | trace `context.parentCall` / `system.lanes.spawn` | call id, at, inferred?                             | 从父的哪个工具调用生出   |
| 消息          | `board.sent`                                      | message, from, to, reply, steer                    | 消息边（不含文本）       |
| 报告          | `subagents.report` entry                          | sender, agent, failed, body, entry                 | 答案卡、失败标记         |
| 工具/模型调用 | trace                                             | conversation, task, kind, name, ok, ms, tokens     | 活动块、失败率、成本     |
| 任务图        | `tasks` event                                     | owner, status, background, aborting, conversations | 任务树、阻塞             |
| 工作区        | `ultimate.workspaces` doc                         | path, branch, base, state, landed                  | worktree 泳道、land 状态 |
| 计划          | `ultimate.plan.tasks`                             | coordinator, epic, key, title, status              | 任务 chip、进度          |
| 对话元数据    | `ultimate.metadata`                               | label, title, inputAt, answerAt                    | 标题、最近活动           |
| 成本          | usage / model trace                               | input/output/cache tokens                          | 成本视图                 |

缺口（需要在复刻中补）：

- `subagents.started` 没有 `workspace`、`planTask`、`parentCall` 的稳定字段（`parentCall` 只在 trace context）；
- `board.sent` 不带消息文本（有意保护隐私），可视化只能显示"有消息"；
- reporter 的 deliver/report 阶段没有独立事件，只能从 task 图和 `Subagents.actions` 推导；
- `stop` 的取消范围没有事件，只能从任务状态变化推断。

建议：在复刻中增加只读视图模型（不是新事件）：

```ts
interface AgentNodeView {
  id: number
  parent?: number
  kind: 'child' | 'branch' | 'standing'
  agent: string
  model?: string
  title?: string
  status: 'idle' | 'running' | 'waiting' | 'done' | 'failed'
  workspace?: { path: string; branch: string; base?: string; landed?: string }
  planTask?: { key: string; title: string; status: string }
  spawn?: { call?: string; at: number; inferred?: boolean }
}
```

### 3.11 消息与 board

- `message {to, text, reply?, steer?, images?}`：持久消息；`to` 可为 `#id`、`@name`、`@lander`、`user`（仅 @ultimate）。
- 发送时 emit `board.sent {message, from, to, reply, steer}`（不含文本）。
- 空闲接收者被唤醒；忙碌接收者按 steer/follow-up 处理。
- 回复以 `board.reply` 回到发送者；未回答的输入产生失败回复。
- 子 agent 只能 message 父；自动化 run/顶层会话可 message 任意 agent；只有 @ultimate 能 message 用户。
- `reply:false` 是单向：唤醒接收者但不返回答案；子 agent 给父的单向更新写成 `board.message`（note），不启动 run。

证据：`extensions/messages/README.md` "Messaging" 节。

---

## 4. 数据契约

### 4.1 Subagents 文档

```ts
interface SubagentsDoc {
  agents: Record<
    string,
    {
      conversationId: number
      agent: string
      background: boolean
      reported: number[] // answer entry ids already delivered
    }
  >
  actions: Record<
    string,
    {
      // key = tool call id
      conversationId: number
      reporter: number // task id
      answer?: number // entry id
      status?: 'done' | 'unanswered' | 'interrupted' | 'failed' | 'given-up'
    }
  >
}
```

### 4.2 Standing / Profile

```ts
type StandingDoc = Record<string, number> // name -> conversationId, on root
interface ProfileDoc {
  definition?: string
}
```

### 4.3 事件

```ts
interface StartedEvent {
  id: number
  agent: string
  model?: string // provider/modelId
  thinking?: string
  parent?: number
  kind: 'child' | 'standing' | 'branch'
}
```

### 4.4 Reporter task 输入/状态

```ts
interface ReporterInput {
  conversationId: number
  text: string
  steer: boolean
  sourceEntry?: number
  answer?: number
}

type ReporterState = { phase: 'deliver' } | { phase: 'report'; report?: string; answer?: number }
```

### 4.5 工具结果 details

```ts
interface SubagentDetails {
  conversationId: number
  background?: true
  yielded?: true
  answerId?: number
}
```

### 4.6 工作区记录

```ts
interface WorkspaceRecord {
  conversationId: number
  path: string
  branch: string
  base?: string
  target?: string
  state: 'preparing' | 'ready' | 'removed' | 'failed'
  landed?: string
  error?: string
}
```

### 4.7 可视化视图模型

见 §3.10 的 `AgentNodeView`；AD-40 会在此基础上扩展消息边和调用树。

### 4.8 Anchor 与 createChild 契约

依赖 `10` §4.7 的 `DurableHost` 原语；本节只定义子 agent 特有的记录。

```ts
/** A background task that exists only to own a child; its sole phase completes at once. */
export interface AnchorTask {
  id: number
  kind: 'ultimate.subagent-anchor'
  background: true
  status: 'done'
}

export interface CreateChildOptions {
  owner: { kind: 'task'; taskId: number } // the AnchorTask
  definition?: AgentDefinition
  parentAgent: Agent
  modelRuntime: ModelRuntime
  metadata: MetadataDoc
  label: string // definition name / label
  title: string // task first line, may be ''
  fork?: { conversationId: number; at: number }
  cwd?: string
  excludeTools?: string[]
  excludeExtensions?: string[]
  model?: { provider: string; modelId: string }
  thinking?: ModelThinkingLevel
}

export interface ChildRecord {
  id: number // == conversation id
  owner: { kind: 'task'; taskId: number }
  metadata: { label: string; title?: string }
  profile: { definition?: string }
}

export function createChild(tx: Tx, options: CreateChildOptions): Promise<ChildRecord>
```

行为：

1. `definitionAgent(definition, parentAgent, modelRuntime)` 计算 model/thinking/tools/extensions/instructions；
2. 新建或 fork conversation，`owner` 指向 Anchor；
3. `configure(tx, child.id, {...change, cwd})`；
4. 写 `metadata.label`、`metadata.title`（空标题则删除）；
5. 写 `Profile.definition`；
6. `definition.summaries === false` → `setAutomaticSummaries(false)`；
7. 返回 child；**不**发事件、**不**建 reporter（由调用方在同一事务里做）。

> Anchor 的存在理由：child 的所有权必须独立于父的当前 run。若 `owner` 是父的 tool task，父停止会级联取消 child；若 owner 是 conversation，则 worker 可能活得比父 run 久但无法被精确停止。Anchor 是两者的折中：background + task 所有权 + 立即 terminal。

---

## 5. 状态机

### 5.1 Child 生命周期

| 当前     | 事件             | 守卫                                     | 下一            | 副作用                         |
| -------- | ---------------- | ---------------------------------------- | --------------- | ------------------------------ |
| none     | start            | 定义合法、工具子集                       | creating        | 建 anchor + child + reporter   |
| creating | createChild ok   | —                                        | idle            | metadata/profile/started event |
| creating | createChild fail | —                                        | none            | 事务回滚                       |
| idle     | message steer    | child 不忙                               | running         | 新 run                         |
| idle     | message followUp | —                                        | queued          | 输入排队                       |
| running  | message steer    | —                                        | running         | 当前工具轮后插入               |
| running  | message followUp | —                                        | running(queued) | 当前 run 后执行                |
| running  | answer           | 非空文本                                 | idle            | reporter 投递                  |
| running  | stop             | —                                        | stopping        | abort run/reporters            |
| stopping | aborted          | —                                        | idle            | 列出未提交文件                 |
| idle     | land             | child clean、无 queued、源在 target 分支 | idle            | ff 到 target                   |
| idle     | discard          | idle、非 preparing                       | removed         | 删除 checkout，保留 branch     |
| removed  | next input       | —                                        | preparing       | 重建同路径                     |

### 5.2 Reporter

| 当前    | 事件                  | 守卫          | 下一              | 副作用                    |
| ------- | --------------------- | ------------- | ----------------- | ------------------------- |
| deliver | input admitted        | —             | waiting           | requestId 固化            |
| waiting | settled done          | answer 新     | report            | reported.push；checkpoint |
| waiting | settled done          | answer 已投递 | report            | 不发文本                  |
| waiting | model_error/no_model  | —             | report            | action.status=failed      |
| waiting | unanswered != aborted | —             | report            | 失败文本                  |
| waiting | aborted               | —             | report            | action.status=interrupted |
| waiting | error                 | —             | report            | action.status=failed      |
| report  | parent.submit ok      | —             | terminal          | 父收到 report             |
| any     | abort（父 stop）      | —             | terminal(aborted) | action.status=unanswered  |

### 5.3 Action 状态

`unset → done | unanswered | interrupted | failed | given-up`

- `unset`：投递中
- `done`：答案已投递
- `unanswered`：父 stop 取消
- `interrupted`：子会话内被用户 stop
- `failed`：provider 错误或投递错误
- `given-up`：watchdog 已报告，不再重试（终态）

### 5.4 Workspace

| 当前      | 事件           | 守卫                                | 下一      | 副作用                 |
| --------- | -------------- | ----------------------------------- | --------- | ---------------------- |
| none      | create         | git 可隔离                          | preparing | 建 worktree/branch     |
| preparing | setup ok       | —                                   | ready     | 子可运行               |
| preparing | setup fail     | —                                   | failed    | 保留输出；阻止工具     |
| ready     | land           | child clean、idle、无 queued、可 ff | ready     | ff target；记录 landed |
| ready     | discard        | idle、非 preparing                  | removed   | 删除目录（Git 拒绝脏） |
| removed   | next input     | —                                   | preparing | 重建                   |
| failed    | next tool call | —                                   | preparing | 重试 setup             |

---

## 6. 接口契约

### 6.1 `subagent` 工具

```ts
type SubagentArgs =
  | {
      action: 'start'
      agent: string
      task: string
      background?: boolean
      fork?: boolean
      isolate?: 'none' | 'worktree'
      steer?: boolean
    }
  | { action: 'message'; id: number; text: string; steer?: boolean }
  | { action: 'wait'; id: number }
  | { action: 'stop'; id: number }
  | { action: 'list' }
  | { action: 'land'; id: number }
  | { action: 'discard'; id: number }
```

`start` 的 `steer` 与 `message` 同义：控制 reporter 把首条输入以 steer 还是 follow-up 投给 child；默认 true（`extensions/subagents/server.ts:1033`）。

返回：

- start background：`Started <id>.` + details
- start foreground：答案文本 + `details.answerId`；或 `Wait yielded...`
- message：同 start（foreground 语义）
- wait：最新答案或状态文本
- stop：`Stopped <id>.` + 未提交文件
- list：JSON 数组 `{conversationId, agent, background, workspace, busy}`
- land/discard：workspaces 返回的 JSON

错误：

| 错误                                                | 触发                    |
| --------------------------------------------------- | ----------------------- |
| `Unknown agent: X. Pass agent: one of ...`          | 定义不存在              |
| `Definition tools must be a subset of parent tools` | 定义工具越权            |
| `id must identify a child of this conversation`     | id 不是本会话的子 agent |
| `start requires task` / `message requires text`     | 空输入                  |
| `Workspace operation interrupted; call again`       | land/discard 重放保护   |

### 6.2 定义 actions

见 `extensions/subagents/refs.ts:89-112`：`standing`、`definitions`、`definition`、`saveDefinition`、`deleteDefinition`。

### 6.3 事件

| 事件                | 数据                                                           | 何时                                 |
| ------------------- | -------------------------------------------------------------- | ------------------------------------ |
| `subagents.started` | id, agent, model?, thinking?, parent?, kind                    | 创建 child/standing/branch 的 commit |
| `board.sent`        | message, from, to, reply, steer                                | 每次 message 提交                    |
| `workspaces.landed` | submission, sha, base, target, commits, paths, divergence, ... | land 成功                            |
| `workspaces.check`  | submission, command, passed/failed/flaky/timeout, ms           | 每次 lander 检查                     |

### 6.4 任务图查询

`tasks` SSE 事件 + `TaskGraph`：

- 节点：task id、owner、status、background、aborting、conversations
- 父子：owner edge
- 运行时长：task.startedAt
- parked：crash-loop guard

---

## 7. 算法与伪代码

### 7.1 `start`

```text
function start(args, api, ctx):
  assert args.task.trim() != ''
  definitions = discoverAgents()
  def = definitions.find(args.agent) or throw
  parent = api.agent()
  assert def.tools subset parent.tools
  isolated = (args.isolate ?? def.isolate ?? 'none') == 'worktree'
  if isolated and git(parent.cwd).dirty: warn

  forkAt = args.fork && def ? entryBefore(assistantCall) : undefined
  action = api.commit(tx => {
    if tx.doc(Subagents, api.conversationId).actions[api.callId]: return existing
    anchor = tx.createTask(Anchor, null, {ownership: conversation, background: true})
    child = createChild(tx, {
      owner: {kind:'task', taskId: anchor},
      definition: def,
      parentAgent: parent,
      ...(forkAt ? {fork: {conversationId: api.conversationId, at: forkAt}} : {}),
      cwd: parent.cwd,
      excludeTools: def.tools?.includes('subagent') ? [] : ['subagent'],
      excludeExtensions: def.tools?.includes('subagent') ? [] : ['subagents'],
    })
    emit Started {id: child.id, agent: def.name, kind: 'child', parent: api.conversationId}
    doc.agents[child.id] = {conversationId: child.id, agent: def.name, background: args.background === true, reported: []}
    if isolated:
      ws = workspaces.create(tx, child.id, parent.cwd)
      configure(tx, child.id, {instructions: def.instructions + isolateInstructions(ws)})
    reporter = tx.createTask(Reporter, {conversationId: child.id, text: args.task, steer: true, sourceEntry: assistant})
    doc.actions[api.callId] = {conversationId: child.id, reporter}
    return doc.actions[api.callId]
  })
  if args.background: return "Started <id>."
  if !waitInterruptibly(api, child.id, [reporter], false): return "Wait yielded..."
  settled = snapshot(actions[callId])
  answer = settled.answer ? entry(settled.answer) : undefined
  return answerText(answer) + details
```

### 7.2 `message`

与 start 相同，但：

- 不创建 child/definition；
- 使用已存在的 child id；
- `steer = args.steer !== false`；
- reporter 的输入是 `text`，不是 `task`；
- background 取 `agents[id].background`（不是参数）。

### 7.3 `wait`

见 §3.4.2。返回最新答案：

```text
function wait(id):
  reporters = actions where conversationId == id
  if !waitInterruptibly(api, id, reporters, true): return "Wait yielded..."
  latest = newest AssistantEntry of child
  if latest and not reported: reported.push(latest)
  return answerText(latest)
```

### 7.4 `stop`

见 §3.5.1。核心是"先捕获、再取消、不删除"。

### 7.5 `recover`（重启后）

启动时扫描所有 `done` submissions：

```text
for submission in scanSubmissions({status:'done'}):
  recover(submission)
```

`recover` 重建 reporter 的 report 阶段，使用 answer requestId 去重；已投递的 answer 不再投递。

### 7.6 worktree setup

```text
function prepareWorkspace(tx, childId, source):
  ws = create record {path: home/worktrees/childId, branch: ..., state:'preparing'}
  git worktree add -b branch path source.HEAD
  for cmd in settings.isolates.worktree.setup:
    run(cmd, cwd=path, env={ULTIMATE_SOURCE: source}, timeout=120s, stdin=closed)
  on success: state='ready'
  on failure: keep output tail; remove only clean checkout; state='failed'
```

### 7.7 review team

```text
function review(range, criteria):
  leaves = definitions matching 'reviewer-*'
  if leaves.empty: return reviewer.review(range, criteria)
  results = parallel(leaves.map(leaf => start(leaf, brief(range, criteria))))
  return merge(results):
    - dedupe issues by (file, line, category)
    - list all reporters per issue
    - disagreements side by side
    - APPROVED only if all APPROVED
```

---

## 8. 复刻文件清单与模块边界

```
orchestra/
├─ definitions/
│  ├─ parser.ts          # frontmatter 解析/校验
│  ├─ discovery.ts       # 三目录 + overlay 合并
│  └─ resolver.ts        # definitionAgent：模型/工具/扩展/指令
├─ children/
│  ├─ create.ts          # createChild + anchor + metadata/profile
│  ├─ lifecycle.ts       # start/message/wait/stop/list
│  └─ stop.ts            # 捕获-取消-报告
├─ delivery/
│  ├─ reporter.ts        # deliver/report 状态机
│  ├─ receipts.ts        # action/answer/submission 去重
│  └─ inbox.ts           # steer/follow-up 队列
├─ workspaces/
│  ├─ create.ts          # worktree + setup
│  ├─ land.ts            # ff-only
│  └─ discard.ts         # clean/idle 检查
├─ branches/
│  └─ lineage.ts         # branch（可选，但与 child 区分）
├─ standing/
│  └─ residents.ts       # standing 创建/刷新/退休
├─ review/
│  └─ team.ts            # reviewer-* 并行/合并
├─ observability/
│  ├─ events.ts          # subagents.started/board.sent
│  └─ views.ts           # AgentNodeView/任务图
└─ prompts/
   ├─ coordinator.md
   ├─ worker.md
   ├─ scout.md
   └─ reviewer.md
```

依赖方向：

```
definitions ← children ← delivery ← workspaces ← observability
                     ↘ branches/standing/review（复用 children）
```

禁止：`definitions` 依赖 `children`；`delivery` 依赖 UI；`workspaces` 依赖 prompts。

### 8.1 与 Ultimate 源文件映射

| 参考模块                | Ultimate                                                                 |
| ----------------------- | ------------------------------------------------------------------------ |
| `definitions/*`         | `lib/agents.ts`                                                          |
| `children/create.ts`    | `extensions/subagents/children.ts`                                       |
| `children/lifecycle.ts` | `extensions/subagents/server.ts:864-1218`                                |
| `delivery/reporter.ts`  | `extensions/subagents/server.ts:103-269`                                 |
| `delivery/receipts.ts`  | `extensions/subagents/api.ts` + `extensions/subagents/server.ts:772-817` |
| `workspaces/*`          | `extensions/workspaces/*`                                                |
| `branches/lineage.ts`   | `extensions/lineage/*`                                                   |
| `standing/residents.ts` | `extensions/subagents/server.ts:549-760`                                 |
| `review/team.ts`        | `agents/reviewer.md` + subagents start                                   |
| `observability/*`       | `extensions/system/*` + `extensions/tasks/*`                             |
| `prompts/*`             | `agents/*.md`                                                            |

---

## 9. 实施顺序（M0–M8）

### M0 — 定义注册表（1–2 天）

- 解析 frontmatter、发现三目录、overlay、模型解析。
- 单测：合法/非法字段、覆盖顺序、overlay 追加、模型登录回退。
- 验收：`AC-A-001`、`AC-A-002`。

### M1 — Child 创建与所有权（2 天）

- `createChild`、anchor、metadata/profile、`subagents.started`。
- 验证：child id == conversation id；父停止不杀 child。
- 验收：`AC-A-003`、`AC-A-004`。

### M2 — Reporter 投递（3 天，最难）

- deliver/report 状态机、requestId、reported、afterTools 收据。
- 验证：正常答案、空答案、provider 错误、重启恢复、工具+异步竞争。
- 降级：若宿主没有 durable task，禁止 background start，只允许 foreground；reporter 用 SQLite outbox + 唯一键实现。
- 验收：`AC-A-005` ~ `AC-A-008`。

### M3 — Wait / steer（1–2 天）

- `waitInterruptibly`、inbox 监听、yield、答案优先。
- 验证：steering 打断 wait、follow-up 不打断、其他 child 答案唤醒。
- 验收：`AC-A-009`、`AC-A-010`。

### M4 — Stop / land / discard（2 天）

- 捕获身份、abort、未提交文件列表、workspaces 前置条件。
- 验证：stop 后代码保留、land ff、discard 保留 branch。
- 验收：`AC-A-011` ~ `AC-A-013`。

### M5 — Worktree（2–3 天）

- 创建、setup、cwd/instructions、嵌套、重建。
- 验证：未提交改动不带入；setup 失败阻止工具；land 后 release。
- 降级：若没有 Git worktree，禁止 `isolate:"worktree"`，只允许 `none`，并在 UI/报告标注。
- 验收：`AC-A-014` ~ `AC-A-016`。

### M6 — Branch / Standing / Automation（2 天）

- branch 区分、standing 创建/刷新/退休、automation run 复用。
- 验证：branch 不是 child；standing 模型保留；automation 忽略 isolate。
- 验收：`AC-A-017` ~ `AC-A-019`。

### M7 — Plan / Review team（1–2 天）

- plan 关联、reviewer-* 并行合并。
- 验证：TaskChip、ledger 只读、review 合并规则。
- 验收：`AC-A-020`、`AC-A-021`。

### M8 — 可观测性（1–2 天）

- `subagents.started`、`board.sent`、任务图、AgentNodeView。
- 验证：能从事件重建树、泳道、消息边。
- 验收：`AC-A-022`、`AC-A-023`。

### 非功能预算

| 指标             | 预算            | 说明                         |
| ---------------- | --------------- | ---------------------------- |
| `start` 事务     | p95 < 200 ms    | 不含模型/子 agent 首次请求   |
| reporter 首投递  | p95 < 2 s       | 从 child 答案产生到父收到    |
| 并发 child       | 100 / 项目      | 超过后 UI/任务图折叠，不阻塞 |
| `Subagents` 文档 | < 1 MB / 父会话 | 每父最多 1k action；超出归档 |
| 崩溃恢复         | < 5 s           | onOpen 扫描 done submissions |
| 重复投递         | 0               | 由 AC-A-005/006 保证         |

### 验收项归属

| 里程碑 | 覆盖的 AC                                                                                |
| ------ | ---------------------------------------------------------------------------------------- |
| M0     | AC-A-001, AC-A-002, AC-A-026                                                             |
| M1     | AC-A-003, AC-A-004, AC-A-033                                                             |
| M2     | AC-A-005, AC-A-006, AC-A-007, AC-A-008                                                   |
| M3     | AC-A-009, AC-A-010                                                                       |
| M4     | AC-A-011, AC-A-012, AC-A-013                                                             |
| M5     | AC-A-014, AC-A-015, AC-A-016                                                             |
| M6     | AC-A-017, AC-A-018, AC-A-019, AC-A-029                                                   |
| M7     | AC-A-020, AC-A-021, AC-A-030, AC-A-031                                                   |
| M8     | AC-A-022, AC-A-023, AC-A-024, AC-A-025, AC-A-027, AC-A-028, AC-A-032, AC-A-034, AC-A-036 |

> AC-A-034 的崩溃/并发测试在 M2/M4/M5 就开始写，M8 汇总；覆盖表按"最终归属"计。

---

## 10. 测试计划

参考实现以 Node/pnpm 为例；命令名可按技术栈替换，但**测试分组与断言必须保留**。

```bash
pnpm test -- orchestra/definitions     # UT-A-01..05
pnpm test -- orchestra/reporter        # UT-A-06..08
pnpm test -- orchestra/stop            # UT-A-09..10
pnpm test:e2e -- orchestra/lifecycle   # E2E
pnpm test:e2e -- orchestra/recovery    # crash injection
```

### 10.1 单元测试

| 编号    | 测试                 | 期望                              |
| ------- | -------------------- | --------------------------------- |
| UT-A-01 | 定义解析合法         | 全字段正确                        |
| UT-A-02 | 未知字段             | 报错                              |
| UT-A-03 | 工具非子集           | start 报错                        |
| UT-A-04 | overlay 合并         | 工具并集、指令追加、settings 覆盖 |
| UT-A-05 | 模型 pin 无登录      | 回退父模型                        |
| UT-A-06 | answer 去重          | 同一 answer 只投递一次            |
| UT-A-07 | 空答案判定           | aborted/error/空文本 → false      |
| UT-A-08 | requestId 稳定性     | 重放同一 task 产生同一 request    |
| UT-A-09 | stop 目标捕获        | 重放不取消后续 run                |
| UT-A-10 | worktree 路径/branch | 可预测、唯一                      |

### 10.2 集成测试

| 编号    | 场景             | 期望                                           |
| ------- | ---------------- | ---------------------------------------------- |
| IT-A-01 | start foreground | 返回答案 + answerId                            |
| IT-A-02 | start background | 立即返回 id；答案后到                          |
| IT-A-03 | message steer    | 子当前 run 的工具轮后看到                      |
| IT-A-04 | message followUp | 子当前 run 结束后看到                          |
| IT-A-05 | wait yield       | 返回 status，child 继续                        |
| IT-A-06 | 父 stop          | child 继续；显式 stop 才停                     |
| IT-A-07 | 子无答案         | 父收到失败文本                                 |
| IT-A-08 | provider 错误    | watchdog 一次重试，之后 failure/given-up       |
| IT-A-09 | 工具+异步双返回  | 只投递一次                                     |
| IT-A-10 | 重启恢复         | 未投递答案只投递一次                           |
| IT-A-11 | worktree 隔离    | 父未提交改动不在子                             |
| IT-A-12 | land             | ff 成功；冲突拒绝                              |
| IT-A-13 | discard          | 删除 idle checkout；脏时 Git 拒绝；branch 保留 |
| IT-A-14 | branch vs child  | branch 不出现在 parent.agents                  |
| IT-A-15 | standing 刷新    | 模型保留，除非定义 pin                         |
| IT-A-16 | review team      | 并行 leaf；合并裁决                            |

### 10.3 崩溃注入

- kill 在 createChild 后、reporter 前；
- kill 在 reporter deliver 后、settled 前；
- kill 在 report commit 前；
- kill 在 stop 的 abort 循环中；
- 重复投递同一 answer；
- 两个父同时 start 同名 child；
- worktree setup 中途 kill；
- land 时 target 变化。

### 10.4 E2E

- coordinator → scout（只读）→ worker（worktree）→ reviewer → land → submit；
- 父重启后 worker 继续，报告到达一次；
- 用户 stop worker，父收到明确状态，代码保留；
- review team 三个 leaf 并行，lead 合并。

---

## 11. 验收 Checklist

| ID       | 验收项（二元）                                                      | 覆盖 REQ             |
| -------- | ------------------------------------------------------------------- | -------------------- |
| AC-A-001 | 定义三目录覆盖顺序正确；overlay 只能追加                            | REQ-A-002            |
| AC-A-002 | 定义工具非父工具子集时 start 报错                                   | REQ-A-003            |
| AC-A-003 | child id == conversation id；`subagents.started` 含 parent          | REQ-A-001, REQ-A-026 |
| AC-A-004 | 父停止后 child 仍运行；显式 stop 才停                               | REQ-A-006            |
| AC-A-005 | 正常答案只投递一次（工具+异步竞争）                                 | REQ-A-007, REQ-A-008 |
| AC-A-006 | 重启后未投递答案只投递一次                                          | REQ-A-008            |
| AC-A-007 | 空答案结束返回明确失败文本                                          | REQ-A-018            |
| AC-A-008 | provider 错误一次重试；之后 failure/given-up                        | REQ-A-019            |
| AC-A-009 | wait 可被 steer 打断；follow-up 不打断                              | REQ-A-009, REQ-A-010 |
| AC-A-010 | message 默认 steer；steer:false 排队                                | REQ-A-010            |
| AC-A-011 | stop 取消 reporter/run，列出未提交文件                              | REQ-A-011, REQ-A-012 |
| AC-A-012 | land 只 ff；child clean；源无关脏文件不阻塞；子无 live/queued       | REQ-A-014            |
| AC-A-013 | discard 只删 idle/非 preparing；脏由 Git 拒绝；branch 保留          | REQ-A-015            |
| AC-A-014 | worktree 从父 HEAD 创建；路径/branch 可预测                         | REQ-A-016            |
| AC-A-015 | setup 可重复；失败保留输出；工具被阻止                              | REQ-A-017            |
| AC-A-016 | 子 cwd/instructions 指向 worktree                                   | REQ-A-033            |
| AC-A-017 | branch 不出现在 parent.agents；kind=branch                          | REQ-A-021            |
| AC-A-018 | standing 每项目一个会话；刷新保留模型                               | REQ-A-022            |
| AC-A-019 | automation run 复用定义；忽略 isolate                               | REQ-A-023            |
| AC-A-020 | plan 关联写入 `ultimate.plan.tasks`；子只读                         | REQ-A-025            |
| AC-A-021 | reviewer-* 并行；lead 合并；全 APPROVED 才 APPROVED                 | REQ-A-024            |
| AC-A-022 | 事件足以重建生成树/消息边/任务图                                    | REQ-A-026, REQ-A-027 |
| AC-A-023 | 可视化视图模型含 parent/spawn/workspace/planTask                    | REQ-A-026            |
| AC-A-024 | fork 不继承 Subagents 索引；按文档策略复制                          | REQ-A-029            |
| AC-A-025 | 父请求前看到 running/queued 子 agent                                | REQ-A-030            |
| AC-A-026 | 模型解析顺序为 preview > override > 有登录的 pin > 父模型           | REQ-A-004            |
| AC-A-027 | start 支持 background/fork/isolate，且 fork 从调用前一条 entry 开始 | REQ-A-005            |
| AC-A-028 | list 返回 agent/background/workspace/busy，且不含 reported          | REQ-A-013            |
| AC-A-029 | 子 agent 只能 message 父；只有 @ultimate 能 message 用户            | REQ-A-020            |
| AC-A-030 | `subagents.report` 含 sender/agent/failed/body/entry                | REQ-A-028            |
| AC-A-031 | 文档明确工具限制不是安全边界，且有针对越权的测试                    | REQ-A-031            |
| AC-A-032 | 所有持久副作用有 memo/requestId/receipt，重放不重复                 | REQ-A-032            |
| AC-A-033 | child 标题取 task 首行；已有标题不被覆盖                            | REQ-A-034            |
| AC-A-034 | 崩溃/重复投递/并发 stop 的测试全部通过                              | REQ-A-035            |
| AC-A-036 | §9 非功能预算达标（start p95、reporter p95、100 child、恢复 <5s）   | REQ-A-035            |

---

## 12. 失败矩阵

| 失败                      | 原因                 | 检测                        | 恢复                                           | 用户可见                    |
| ------------------------- | -------------------- | --------------------------- | ---------------------------------------------- | --------------------------- |
| 定义不存在                | 名称错/文件删        | start 前 discover           | 报错并列出可用名称                             | 工具错误                    |
| 定义工具越权              | 子集检查失败         | start                       | 拒绝                                           | 工具错误                    |
| 子 agent 无答案           | 空文本/aborted/error | `answered()`                | 失败文本；可 message 继续                      | `[subagent id failed: ...]` |
| provider 错误             | 模型/网络            | reporter settled            | watchdog 60s 后重试一次；仍失败 → failure card | `watchdog.failure`          |
| 父忙时报告到达            | 父在 run 中          | reporter `whenBusy:'steer'` | 当前工具轮后插入                               | 无额外 UI                   |
| 报告重复                  | 工具+异步            | afterTools + reported       | 标记 delivered，移除 queued                    | 无                          |
| 重启丢 reporter           | 进程崩溃             | 启动 recover                | 重建 report 阶段；requestId 去重               | 无（可能延迟）              |
| stop 误杀后续 run         | 重放                 | memo stopTarget             | 只取消捕获的 run/inputs                        | 后一个 run 不受影响         |
| worktree setup 失败       | 依赖/网络/权限       | 命令退出码                  | 保留输出；下次工具调用重试                     | 工具被阻止 + 错误           |
| worktree 脏               | 子未提交             | stop 扫描                   | 列出文件，不删除                               | `Left uncommitted...`       |
| land 冲突                 | target 变了          | ff 失败                     | 更新 workspace 后重试；不 rebase               | 失败原因                    |
| discard 被拒              | 脏/忙/未 land        | 前置检查                    | 保留 checkout                                  | 原因                        |
| branch 被当 child         | 调用 stop/branch id  | id 不在 parent.agents       | 报错                                           | `id must identify a child`  |
| 子越级 message            | 目标非父             | messages 检查               | 拒绝                                           | 工具错误                    |
| 递归委派                  | 定义含 subagent      | 默认 exclude                | 子无 subagent 工具                             | 无（除非显式开启）          |
| 子 agent 看到父未提交改动 | worktree 从 HEAD     | 创建时 warning              | 明确告知                                       | 警告                        |

---

## 13. 证据索引

| REQ                  | 主题                     | 证据                                                                                              |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| REQ-A-001            | child=conversation       | `extensions/subagents/api.ts:15-47`；`extensions/subagents/server.ts:990-1016`                    |
| REQ-A-002            | 定义解析/发现/overlay    | `lib/agents.ts:245-420`                                                                           |
| REQ-A-003            | 工具子集/默认无 subagent | `extensions/subagents/server.ts:950-955,1002-1003`                                                |
| REQ-A-004            | 模型解析                 | `lib/agents.ts:115-160`                                                                           |
| REQ-A-005            | start 参数/foreground    | `extensions/subagents/server.ts:864-891,1046-1087`                                                |
| REQ-A-006            | anchor 所有权            | `extensions/subagents/server.ts:990-1008`；`subagents/README.md:1`                                |
| REQ-A-007, REQ-A-008 | reporter 恰好一次        | `extensions/subagents/server.ts:103-269,772-817`                                                  |
| REQ-A-009, REQ-A-010 | wait/steer               | `extensions/subagents/server.ts:287-347,1033`；`messages/README.md`                               |
| REQ-A-011, REQ-A-012 | stop                     | `extensions/subagents/server.ts:1092-1187`                                                        |
| REQ-A-013            | list                     | `extensions/subagents/server.ts:901-911`                                                          |
| REQ-A-014, REQ-A-015 | land/discard             | `extensions/subagents/server.ts:917-925`；`workspaces/README.md`                                  |
| REQ-A-016, REQ-A-017 | worktree                 | `workspaces/README.md` 前 70 行；`extensions/subagents/server.ts:956-962,1017-1026`               |
| REQ-A-018            | 无答案失败               | `extensions/subagents/server.ts:84-102,221-251`                                                   |
| REQ-A-019            | watchdog                 | `extensions/watchdog/README.md`                                                                   |
| REQ-A-020            | message 限制             | `extensions/messages/README.md`                                                                   |
| REQ-A-021            | branch 区分              | `extensions/lineage/README.md`；`subagents/README.md` "Coordinator behaviour"                     |
| REQ-A-022            | standing                 | `extensions/subagents/server.ts:549-760`；`subagents/README.md` "Standing agents"                 |
| REQ-A-023            | automation run           | `extensions/automations/README.md` "Agent and tool"                                               |
| REQ-A-024            | review team              | `agents/reviewer.md`；`subagents/README.md` "Review team"                                         |
| REQ-A-025            | plan 关联                | `extensions/plan/README.md`                                                                       |
| REQ-A-026, REQ-A-027 | 事件/任务图              | `extensions/subagents/refs.ts:71-83`；`extensions/tasks/README.md`；`extensions/system/README.md` |
| REQ-A-028            | 报告字段                 | `extensions/subagents/server.ts:228-251`；`messages.tsx`                                          |
| REQ-A-029            | fork 策略                | `subagents/README.md` "History forks"；`extensions/subagents/server.ts:964-977`                   |
| REQ-A-030            | 父级提示                 | `extensions/subagents/server.ts:820-845`                                                          |
| REQ-A-031            | 工具限制非沙箱           | `subagents/README.md` "Deferred tools..."；"Isolates"                                             |
| REQ-A-032            | 重放                     | `extensions/subagents/server.ts:869-870,979-1041,1117-1128`                                       |
| REQ-A-033            | cwd/instructions         | `extensions/subagents/server.ts:1017-1026`                                                        |
| REQ-A-034            | 标题                     | `extensions/subagents/children.ts:76-81`；`extensions/subagents/server.ts:1001`                   |
| REQ-A-035            | 验收测试                 | 本文 §10-§11                                                                                      |

---

## 14. 未决问题与假设

| ID     | 类型 | 内容                                          | 处理                                 |
| ------ | ---- | --------------------------------------------- | ------------------------------------ |
| Q-A-01 | 假设 | 宿主提供 conversation、task、doc、commit 原语 | 否则用 SQLite + outbox 实现          |
| Q-A-02 | 假设 | 宿主支持 background task 独立于父 run         | 否则需要显式子进程/actor             |
| Q-A-03 | 未决 | reporter 的 report 是否必须走父的 inbox       | 是；否则父忙时会丢                   |
| Q-A-04 | 未决 | 是否允许子 agent 递归委派                     | 默认禁止；定义显式 `subagent` 才开   |
| Q-A-05 | 风险 | worktree 不是沙箱                             | 复刻时必须在文档与 UI 明示           |
| Q-A-06 | 未决 | 是否复刻 plan 关联                            | 建议复刻；它是可视化"业务语义"的关键 |
| Q-A-07 | 未决 | 是否复刻 review team                          | 可选；但复刻成本低、收益高           |
| Q-A-08 | 未决 | 是否把 reporter 状态暴露为事件                | 建议；否则可视化只能推导             |

---

## 15. 文档与代码冲突（复刻时以代码为准）

| #   | 文档说法                                                                     | 代码事实                                                                                                                                                          | 决策                                                                                              |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `subagents/README.md:88`：land 要求"Both checkouts must be clean"            | 只检查 child worktree 干净（`workspaces/workspaces.ts:656-657`）；源 checkout 无关脏文件不阻塞（`workspaces/README.md:39`），`merge --ff-only` 只在真正重叠时拒绝 | 按代码：child clean + 源在 target 分支 + 可 ff；文档修正为"source may have unrelated dirty files" |
| 2   | 同处：discard "removes only a clean … checkout"                              | 代码没有显式 clean 检查（`workspaces/workspaces.ts:973-986`），依赖 `git worktree remove`（无 `--force`）拒绝脏工作区                                             | 按代码：idle + Git 拒绝脏；文档写"clean 由 Git 保证"                                              |
| 3   | `subagents/README.md:1`：start 参数 `{agent, task, background?, fork?}`      | schema 还接受 `isolate`、`steer`（`subagents/server.ts:871-891`）                                                                                                 | 按代码：文档列全参数                                                                              |
| 4   | `lineage/README.md:12`：`lineage.branch` 只存 `{from, at, intent}`           | 代码还写 `brief: true`（`lineage/server.ts:947-952`）                                                                                                             | 按代码：`lineage.branch` 可带 `brief`                                                             |
| 5   | `subagents/README.md:29-30`：branch 的 `Started` 带"the agent the fork kept" | lineage 实际写死 `agent: 'branch'`（`lineage/server.ts:976-980`），定义名只在 `metadata.label='coordinator'`                                                      | 按代码：branch 事件的 `agent` 不是定义名；可视化需从 metadata 补                                  |

> 这些冲突不是"文档错了就忽略"，而是复刻时的**决策点**：以代码行为为准，文档只表达意图。复刻者应在自己的 README 中修正，避免把冲突带进实现。
