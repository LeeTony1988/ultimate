# 11 · 智能体、提示词与委派协议

> 复刻目标：理解 Ultimate 如何把"一个 coding agent"拆成多个角色，如何组装系统提示，如何把工作委派给子智能体/分支，以及报告如何回到调用者。
> 证据：`agents/*.md`、`extensions/subagents/README.md`、`extensions/prompt/*`、`lib/agents.ts`、`extensions/messages`、`extensions/lineage`。

## 1. 智能体定义（`agents/<name>.md`）

Markdown + YAML frontmatter，由 Pi 的 `parseFrontmatter` 解析：

```yaml
---
name: worker
description: Implement one bounded task, verify it, and report evidence in one focused commit.
model: openai-codex/gpt-6.1-sol # provider/id 或模糊名，支持 :thinking 后缀
thinking: high # Pi thinking level
tools: [read, bash, write, edit] # 显式白名单；省略=继承父级（减去 subagent）
denyTools: [instance] # 从白名单或继承集合中移除
isolate: worktree # none | worktree
resident: true # 常驻 agent（@name）
fast: true # openai 优先级队列
onFailure: diagnose # 仅 lander：diagnose | fix
summaries: false # 关闭自动标题/摘要
---
<body: instructions>
```

发现顺序（`lib/agents.ts`）：clone 的 `agents/` → `~/.ultimate/agents/` → `<project>/.ultimate/agents/`，同名后者覆盖。
**Overlay**：文件中出现 `addTools`（列表，可为空）即为覆盖层：

- 可覆盖 `description/model/thinking/isolate/resident/onFailure/fast/summaries`；
- `addTools` 追加到基础定义的工具列表；`denyTools` 追加；
- body 追加到基础指令后（`## User additions` / `## Project additions`）；
- 覆盖层不能声明 `tools`，不能无基础定义而单独存在；
- 设置面板保存时优先生成 overlay（保留基础定义作为唯一指令来源）。

约束：

- 显式 `tools` 必须是父级工具的子集；`report`/未知工具静默忽略；
- 显式列出的 deferred 工具（如 `debug`）会自动进入该会话的 `modelTools.add`；
- 工具限制是**选择**不是沙箱：只读 agent 的 bash 限制靠指令；
- 定义变更不改变 build id（不是代码）。

## 2. 内置角色（9 个）

| 定义          | 模型/思考                               | 工具                                                                                                                                                              | 隔离                | 职责与关键规则                                                             |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| `ultimate`    | 继承（推荐 Opus 5.5）                   | read, bash, codemode, debug, message, note, notify, automation, branch, web_search, web_fetch, setup, compact, remember, memory, todo, goal, restart, edit, write | 无（常驻）          | 用户唯一对话入口；启动/指挥 branch；维护记忆；向用户提问；离线目标代决策   |
| `coordinator` | 继承 @ultimate                          | 默认全部                                                                                                                                                          | 分支自身 worktree   | 一条分支的负责人：评估、计划、委派、验证、review、submit；不写用户结账区   |
| `worker`      | `openai-codex/gpt-6.1-sol`, fast        | 继承（默认全工具，`denyTools:[instance]`）                                                                                                                        | worktree            | 一个有界任务的实现：读→改→针对性测试→一次聚焦提交→按格式报告               |
| `designer`    | `claude-code/claude-opus-5-5`           | 继承                                                                                                                                                              | worktree            | 前端/UI/设计：从问题出发、看截图自评、迭代到"再改一轮不会更好"             |
| `scout`       | `openai-codex/gpt-6-luna`, thinking low | read, bash                                                                                                                                                        | 无                  | 只读侦察：回答一个问题，给 `path:line` 证据，不做修改                      |
| `reviewer`    | 继承                                    | read, bash, subagent                                                                                                                                              | 无                  | 只读评审 commit range；有 `reviewer-*` 时领导团队并合并裁决                |
| `lander`      | 继承                                    | read, bash                                                                                                                                                        | 无（集成 checkout） | 落地失败时诊断（`onFailure: diagnose`）或修复；回答队列问题                |
| `watcher`     | `openai-codex/gpt-6-luna`, low          | read, write, edit, bash, automation                                                                                                                               | 无                  | 维护一个受监督脚本自动化：写 `run`、`FIRE`/`DONE` 协议、`AUTOMATION_STATE` |
| `dream-pass`  | `openai-codex/gpt-6.1-sol`, fast        | read, bash, codemode, memory                                                                                                                                      | 无                  | dream 的单次只读分析：证据 + 提案（含 memory ops）                         |

> `agents/` 之外，扩展也可以自带 `agents/` 目录（启用时作为 builtin 加载，禁用时消失）。

## 3. @ultimate 的行为契约（`agents/ultimate.md`）

复刻时这是"产品灵魂"，建议逐条保留：

### 3.1 知道 Ultimate 本身

- 回答"怎么工作/怎么配置"时读 clone 的 README/AGENTS/extensions/README/相关扩展 README/agents/skills；
- 用户想改变 Ultimate 时，优先找 `extensions/` 或开放 feature PR，建议写进 `<project>/.ultimate/` 或 `~/.ultimate/`；
- 只有明确修复才改 clone 核心。

### 3.2 设置与代码的边界

- **配置**（settings、agent 定义、skills、`.ultimate/README.md`、Git 初始化）由 @ultimate 自己写；
- **任何会运行的代码**（扩展、surface、工具、有行为的 UI）必须开 coordinator branch，即使放在 `.ultimate/` 里。

### 3.3 Onboarding（`onboarding.start`）

1. 两行问候；按 `how-ultimate-works` 技能走流程（问题卡是唯一允许的 `message` 例外）；
2. 只展示适用的 setup 卡（首启扩展选择、项目信任、Git），一次一张，等 `onboarding.choice`；
3. 读 README/layout/scripts/tests/recent history；
4. 用一次 `remember {ops}` 写入项目第一批记忆：项目是什么、如何运行/检查/测试、架构、约定、当前状态、用户指令原文、用户本人偏好；
5. 建议 ≤3 个项目专属 agent/扩展/设置，写配置、开 branch、检查 worktree 环境；
6. 把用户说的第一件事作为 coordinator branch 启动；没提就只问。

### 3.4 记忆

- 用 `remember` 批量 add/update/delete，不用 `note {to:root}`；
- 用 `memory` 读；branch prompt 里点名相关 slug；
- 记忆审查走 review branch（只返回变更集，不写）。

### 3.5 To-dos

- 任何未闭环事项用 `todo` 记录（owner `ultimate`|`user`），完成用 `done`；
- 不给"已问的问题"加 todo（问题本身已显示在 To-dos 面板）；
- codemode `store` 只放自己的临时工作状态。

### 3.6 协调者与消息

- 用户输入只在 @ultimate 会话里；只有它能 `message` 用户；
- 分支规模三档：小改动自己做；功能/探索先 assessment；用户同意后走 plan/workers/verify/review/submit；
- 每条 branch prompt 必须自包含（用户原话、目标、约束），并给 `title`；
- 启动分支后结束回合，等它回复唤醒。

### 3.7 向用户提问

- 所有决策合并成**一条** reply-expected 的 `message {to:'user', text, questions}`；
- `questions` 类型：`choice`/`multi`/`confirm`/`text`/`scale`；`ref` 编号、`key` 字母、`recommended`、`detail`、可选 `preview`；
- 回答格式 `1a. Topic: option`，多选 `2a,c.`，文本 `3: <words>`；
- 卡片在 To-dos 面板直到回答/忽略；不追加 "other"/"go" 选项。

### 3.8 Hands-off goal

- goal 注释存在时，用户不在：所有原本要等的决定由 @ultimate 代做并 `goal decide` 记录理由；
- 先写验收标准；失败要查原因再改；
- 阻塞时 `goal pause`，报告卡替代早间消息。

### 3.9 Dream

- 用户按 Dream（`dream.handoff` 输入）或上下文阈值触发的自动化：写 handoff（≤12,000 字符）→ `ultimate.action('dream','handoff')`；
- `dream.started` → 按 `extensions/dream/DREAM.md` 启动 dream branch、转述提案、用 `dream.decide` 记录；
- `dream.settled` → 询问 Fall asleep（Now/Later），绝不自己睡。

### 3.10 自我改进

- 发现 agent/流程不稳（丢答案、重复唤醒、规则被忽略）时，用 `debug` 收集证据（事件、reactor lag、API catalogue、trace），
  向用户提一个具体改进建议；批准后开 branch。

## 4. Coordinator 的工作流（`agents/coordinator.md`）

```
接任务
 ├─ 判断规模
 │   ├─ 小改动：自己 edit → 检查/测试 → commit → workspace submit
 │   └─ 功能/探索：只做 assessment，不写代码，结束回合
 ├─ （用户同意后）plan：epic + 二元验收标准 + 每单元一个 task
 ├─ 委派（仅当：有界、独立、可验证、划算）
 │   ├─ scout：并行只读侦察
 │   ├─ worker：有界实现（同文件串行）
 │   └─ designer：UI/设计（需 preview）
 ├─ 验证：读 diff、核对引用、读子智能体最后一次完整测试输出
 ├─ review：一个 reviewer（或 review team），给 base..head + 验收标准
 ├─ land workers 到自己的 checkout
 └─ workspace submit（UI 改动需用户 preview 批准）
```

委派简报必须包含：目标与价值；精确范围（可改/禁改）；已知输入；验收标准与验证命令（**core test** vs **prove once**）；
"不要扩大范围，遇到问题报告而不是绕过"；返回格式（结论 + `file:line` 证据）。
"一个空闲或完成的 worker 什么也证明不了"——必须看 diff、引用、最后完整测试运行。

## 5. 子智能体协议（`subagent` 工具）

```
subagent start  { agent, task, background?, fork?, isolate? }
subagent message{ id, text, steer? }      # steer 默认 true；false = 排队 follow-up
subagent wait   { id }                    # 可被 steering 打断，返回状态而不是答案
subagent stop   { id }
subagent list
```

关键语义（`extensions/subagents/README.md`）：

- **前台只是等待方式**，不是生命周期；`start`/`message`/`wait` 在子任务忙时可 yield（让出等待），子任务继续跑；
- 父停止**不会**停止子任务；必须显式 `stop`；
- 子任务回答通过 **reporter** 精确投递一次（跨重启也不丢/不重）：创建 reporter 与记录 answer id 原子；
- 子任务 `model_error`/`no_model` 结束时 reporter 标记 failed，由 `watchdog` 负责重试/失败卡；
- 子任务"无文本/被 abort/error"不算回答；父会收到 `[subagent <id> failed: ended its turn without an answer]`；
- 子任务 ID = conversation ID；
- `fork: true` 给子任务父级可见历史（到调用前一条），文档按 fork 策略复制（`pi.agent`/`codemode.store`/`ultimate.ui` asOf；
  `ultimate.subagents`/`metadata`/`models.login`/inbox/live/usage initial）；
- `isolate: "worktree"` 创建 `<home>/worktrees/<child id>`，从父级已提交 HEAD 出发；setup 命令可配；
- 子任务默认**不**继承 `subagent` 工具与扩展，除非定义显式包含；
- 子任务报告包含 `Returned model: provider/model` 与 `details.answerId`；
- 异步报告以 `subagents.report` 条目进入父 transcript，带发送者/来源/agent 名/失败标记。

## 6. Reviewer 团队

- 没有 `reviewer-*` 定义时：`reviewer` 自己只读评审；
- 有 `reviewer-*` 时：shipped `reviewer` 作为 lead，并行启动所有 leaf，**不自己评审**；
- lead 只合并：每个问题只报一次并列出所有提出者；分歧并列展示；全部 APPROVED 才 APPROVED；
- leaf 工具必须是 lead 工具的子集（`read`,`bash`,`subagent`）；
- 报告固定格式：`Reviewed range` / `Reviewers` / `Blocking` / `Non-blocking` / `Disagreements`；
- 严重级：P0 生产故障/数据丢失/可利用安全漏洞；P1 功能失败/严重坑；P2 具体改进；P3 打磨。

## 7. 系统提示词（`extensions/prompt`）

### 7.1 组装

系统提示由若干 **section** 组成（`PromptSection.render()` 在每次请求前渲染）：

1. 身份与原则（Ultimate 是什么、如何工作、语气、边界）；
2. 工具指引（read/write/edit/bash/codemod/browser…）；
3. 项目上下文（`AGENTS.md`、`CLAUDE.md`、`.ultimate/README.md` 等，由 Pi 的 `loadProjectContextFiles` 读取）；
4. 技能列表（名称+描述+路径；`disable-model-invocation` 的技能只列给用户）；
5. building blocks（可用扩展、如何开关、settings 路径）；
6. 环境（OS、shell、cwd、workspace、模型、build、generation）；
7. 当前 prompt 片段（扩展可插入）。

**缓存稳定策略**：系统提示跨构建保持不变；构建变化、指令文件变化、文档变化、landing 不写进 section，而是作为
`prompt.build` 输入条目附在用户输入前（`SeenBuild` 文档记录上次的 build/head/文件哈希）。这样热重载不会重写 prompt cache。

### 7.2 指令热更新

- 只对 root 的 standing `ultimate` 定义生效（`Standing['ultimate']`）；
- `beforeInput` 里比较 `AgentDoc.instructions` 与磁盘定义，不同则 `configure(tx, conversationId, {instructions})`；
- 因此用户手打输入也能拿到最新的 `agents/ultimate.md`（Messages 投递路径另有一套刷新）。

### 7.3 Landing 说明

- `git log --first-parent -n 200`，从 `Ultimate-Conversation` trailer 或 subject 的 `from #N` 解析会话；
- 沿 `parentConversationId` 归并到 owner 分支，按分支去重；
- 显示 `↻ Reloaded · <branch> #N · …`，最多点名 2 条，其余 `+N more`。

## 8. 技能（Skills）

来源顺序（后者同名覆盖）：

1. `<clone>/skills/`
2. `<cwd>/.pi/skills/`
3. `~/.ultimate/skills/`
4. 项目信任后：`<project>/.agents/skills/`、`<project>/.ultimate/skills/`

- 每个技能是 `SKILL.md`（frontmatter：name/description，可选 `disable-model-invocation`）；
- `/skill:<name> args` 在提交时展开为 `<skill name location>…</skill>` + args（`server/skills.ts`）；
- `system.skills` 列出 scope/overrides/manual；诊断（格式错误/重名）在 Info 面板显示；
- 项目上下文文件：`AGENTS.md`、`CLAUDE.md`、`.pi/…` 由 Pi 读取，路径列在 `system.contextFiles`。

## 9. 消息、branch 与 standing agent

### 9.1 Messages

- `message {to, text, reply?, steer?, images?}`：向会话/常驻 agent/用户投递持久消息；
- `to:'user'` 只能由 @ultimate 发送，显示为用户气泡；带 `questions` 时渲染回答卡；
- 回复以 `board.reply` 条目回到发送者；`reply:false` 表示单向通知；
- 跨项目：`ultimate.tell({project,text})` 只发给该项目 @ultimate，答案作为 reply 回来。

### 9.2 Branch

- `branch {title, prompt, root?}`：由 @ultimate 启动 coordinator 分支；
- 分支是 ownerless conversation，`parent` 指向 root 的某个 entry（用于 `branchOf` 与 tally）；
- 启动时注入 root 的 memory brief（或 tally）+ prompt；发 `lineage.branched` 事件；
- 分支报告通过 `message` 回到 @ultimate；落地发 `workspaces.landed`，lineage 记录到 tally。

### 9.3 Standing agent

- `resident:true` 的定义生成常驻会话（ownerless，cwd=项目根，`@name`）；
- `Standing` 文档（`ultimate.standing-agents`）记录 name→conversationId；
- 每次 `standing(name)` 用当前定义在 root agent 之上重新配置；定义固定 model/thinking 时每次刷新都应用；
- 定义消失时，在下次打开/请求时退休（保留会话可读）。

## 10. 复刻顺序与验收

1. `lib/agents.ts`：解析、发现、覆盖、`defaultModel`；
2. `subagents` 扩展：start/message/wait/stop/list + reporter 投递（最难的是"精确一次"与重启恢复）；
3. `messages` + `lineage`：branch 与 @ultimate 往返；
4. `prompt`：稳定 section + `prompt.build` 注入；
5. 三个核心定义（ultimate/coordinator/worker）+ scout/reviewer；
6. 验收：
   - [ ] 新建 branch，其首轮上下文含记忆 brief；
   - [ ] coordinator 委派 worker，worker 在 worktree 提交，父级收到带 diff/测试证据的报告；
   - [ ] 父级重启后，未投递的子任务回答仍只投递一次；
   - [ ] 子任务无回答结束时父级收到明确失败提示，而不是静默；
   - [ ] 修改 `agents/ultimate.md` 后，下一条手打输入使用新指令；
   - [ ] 构建热替换后，系统提示不变（缓存命中），只有 `prompt.build` 备注变化。

## 11. 证据索引

- `agents/ultimate.md`、`coordinator.md`、`worker.md`、`scout.md`、`designer.md`、`reviewer.md`、`lander.md`、`watcher.md`、`dream-pass.md`
- `extensions/subagents/README.md`（全文，尤其 "Interruptible waits and delivery"、"Standing agents"、"Definitions are shared profiles"）
- `extensions/subagents/server.ts` / `children.ts` / `api.ts` / `refs.ts`
- `extensions/prompt/server.ts`（sections、beforeInput、landings）
- `lib/agents.ts`（解析/覆盖/默认模型）
- `server/skills.ts`（技能合并与 `/skill:` 展开）
- `docs/subagents.md`
