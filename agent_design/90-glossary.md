# 90 · 术语表

本表是四份 spec 的**唯一命名来源**。同一概念只允许一个中文名 + 一个英文标识符。出现新术语时先加到本表，再在正文使用。

| 中文         | 英文 / 标识符             | 定义                                                                         | 唯一真相 / 出处                         |
| ------------ | ------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| 自进化       | self-evolution            | agent 在不丢失会话的前提下修改自己的知识、指令、工具或代码，并验证结果       | `10` §0                                 |
| 自修改面     | self-modification surface | 可被 agent 修改的一类对象（L1–L6）                                           | `10` §3.1                               |
| 记忆         | memory                    | root 会话上的持久决策/事实/教训，按 slug 索引                                | `lineage.memory` 文档                   |
| 记忆项       | memory item               | `{kind,line,body,source,updated}`                                            | `extensions/lineage/memory.ts:20-24`    |
| 记忆操作     | memory op                 | `add` / `update` / `delete`                                                  | `extensions/lineage/memory.ts:52-69`    |
| 记忆简报     | memory brief / brief      | 新 branch 从 root 记忆开始的压缩上下文                                       | `extensions/lineage/memory.ts:240-257`  |
| 记忆蒸馏     | memory distillation       | landing 后由 summary model 生成记忆 ops                                      | `extensions/lineage/memory.ts:320-431`  |
| 记忆审查     | memory review             | 只读 branch 返回记忆变更集                                                   | `lineage/README.md` "Memory review"     |
| 反思会话     | dream session             | 一次 dream 的持久会话                                                        | `dream.sessions` 文档                   |
| 交接         | handoff                   | @ultimate 在上下文满前写下的交接文本                                         | `dream.sessions[session].handoff`       |
| 反思分支     | dream branch              | 执行六 passes 的 coordinator branch                                          | `extensions/dream/DREAM.md`             |
| 六 passes    | six passes                | memory/failures/tools/corrections/codify/project                             | `extensions/dream/DREAM.md:81-115`      |
| 反思日志     | journal                   | 三行 learned + Markdown + proposals + chapter                                | `extensions/dream/refs.ts:27-28`        |
| 提案         | proposal                  | dream 提出的变更建议                                                         | `extensions/dream/refs.ts:13-25`        |
| 提案状态     | proposal status           | open/approved/rejected/applied/landed                                        | `extensions/dream/refs.ts:20`           |
| 入睡         | fall asleep / asleep      | 归档 journal、结算提案、gate 通过后切换章节                                  | `dream/server.ts:591-667`               |
| 章节         | chapter                   | dream 之间的工作阶段名                                                       | `extensions/dream/refs.ts:27-28`        |
| 系统提示     | system prompt             | 每次请求前由 sections 渲染的提示                                             | `extensions/prompt/server.ts:264-374`   |
| 提示段       | prompt section            | 可注册的提示片段                                                             | `extensions/prompt/server.ts:264-374`   |
| 构建说明     | build note                | `prompt.build` 输入条目，说明 build/指令/文档变化                            | `prompt/server.ts:215-262`              |
| 指令热更新   | instruction hot reload    | @ultimate 定义文本在下一次输入前重新应用                                     | `prompt/server.ts:139-164`              |
| Agent 定义   | agent definition          | `agents/<name>.md` + frontmatter                                             | `lib/agents.ts:245-275`                 |
| 覆盖层       | overlay                   | 用 `addTools` 标记、只追加不替换的定义文件                                   | `lib/agents.ts:295-317`                 |
| 常驻 agent   | standing agent / resident | `resident:true`、每项目一个会话的 agent                                      | `subagents/README.md` "Standing agents" |
| 技能         | skill                     | `SKILL.md` 过程知识，按需读取                                                | `server/skills.ts`                      |
| 扩展         | extension                 | `extensions/<name>/`，含 server/web facet                                    | `docs/extensions.md:3-8`                |
| 服务端 facet | server facet              | `server.ts`，提供 sections/tools/actions/tasks/docs                          | `docs/extensions.md`                    |
| 浏览器 facet | web facet                 | `web.tsx`，提供 surfaces/panels/slots/renderers                              | `docs/extensions.md`                    |
| 表面         | surface                   | 整屏应用，通过 web facet 注册                                                | `extensions/agent/README.md`            |
| 热重载       | hot reload                | 不重启进程重新加载 facet/指令                                                | `AGENTS.md` Layers 表                   |
| 核心换代     | core swap / restart       | supervisor 用新 core 进程替换旧 core                                         | `bin/ultimate.ts:394-457`               |
| 代           | generation                | 每次 core 启动递增的代号                                                     | `ULTIMATE_GENERATION`                   |
| 监督者       | supervisor                | 管理 core 进程、端口、换代的父进程                                           | `bin/ultimate.ts`                       |
| 类型检查门   | type-check gate           | swap 前 `tsc --noEmit`                                                       | `bin/ultimate.ts:356`                   |
| 回滚         | rollback                  | swap 失败时 reacquire 旧 core 或 recover                                     | `bin/ultimate.ts:424-456`               |
| 上游更新     | upstream update           | clone 对 origin 的 fast-forward                                              | `extensions/update/README.md`           |
| 快进         | fast-forward              | 只允许 `git merge --ff-only`                                                 | `workspaces` land                       |
| 预览实例     | preview instance          | `instance start` 起的第二个 Ultimate                                         | `extensions/instance/README.md`         |
| 落地         | land                      | 把子/分支 worktree 的提交 ff 到源分支                                        | `workspaces.land`                       |
| 提交落地     | workspace submit          | 把 coordinator 的 tip 排入 lander 队列                                       | `workspaces/README.md` "Lander"         |
| 着陆器       | lander                    | 合并、检查、ff、push 的常驻 agent                                            | `agents/lander.md`                      |
| 看门狗       | watchdog                  | provider 失败重试/失败卡                                                     | `extensions/watchdog/README.md`         |
| 子 agent     | subagent / child          | 由父 conversation 委派的独立 conversation                                    | `20` §2.1                               |
| 父           | parent                    | 发起 start 的 conversation                                                   | `20` §2.1                               |
| 锚点任务     | anchor                    | 拥有 child 的 background task                                                | `subagents/server.ts:66-79`             |
| 报告器       | reporter                  | 把 child 答案投递回父的 background task                                      | `subagents/server.ts:103-269`           |
| 动作         | action                    | `Subagents` 文档中按 callId 记录的一次委派                                   | `subagents/api.ts:25-38`                |
| 答案         | answer                    | child 的 assistant entry，非空且非 aborted/error                             | `subagents/server.ts:84-91`             |
| 递送状态     | action status             | done/unanswered/interrupted/failed/given-up                                  | `subagents/api.ts:31-36`                |
| 等待         | wait                      | 等待 reporter 完成；可被 steering 打断                                       | `subagents/server.ts:287-347`           |
| 让位         | yield                     | wait 被 steering 打断，返回状态而非答案                                      | `subagents/server.ts:331-342`           |
| 转向         | steer                     | 忙碌时在当前工具轮边界插入的输入                                             | `messages/README.md`                    |
| 跟进         | follow-up                 | 当前 run 之后执行的输入                                                      | `messages/README.md`                    |
| 停止         | stop                      | 取消捕获的 run/inputs/reporters/watchdogs，不删除代码                        | `subagents/server.ts:1092-1187`         |
| 丢弃         | discard                   | 删除 idle checkout，保留 branch                                              | `workspaces.discard`                    |
| 隔离区       | isolate / worktree        | 子 agent 的独立 Git checkout                                                 | `workspaces/README.md`                  |
| 分支         | branch                    | 顶层 ownerless feature conversation                                          | `lineage/README.md`                     |
| 协调者       | coordinator               | 分支的负责 agent                                                             | `agents/coordinator.md`                 |
| 侦察者       | scout                     | 只读子 agent                                                                 | `agents/scout.md`                       |
| 工人         | worker                    | 有界实现子 agent                                                             | `agents/worker.md`                      |
| 设计师       | designer                  | UI/设计子 agent                                                              | `agents/designer.md`                    |
| 评审者       | reviewer                  | 只读评审子 agent；可领导 review team                                         | `agents/reviewer.md`                    |
| 评审团队     | review team               | `reviewer-*` 并行 leaf + lead 合并                                           | `subagents/README.md` "Review team"     |
| 消息         | message                   | conversation 之间的持久消息                                                  | `messages/README.md`                    |
| 消息边       | message edge              | 可视化的 from→to 消息关系（不含正文）                                        | `40` §4.3                               |
| 生成边       | spawn edge                | parent→child 的生成关系，含 spawn call                                       | `40` §4.2                               |
| 泳道         | lane / swimlane           | 每个 agent 一行、按时间铺开的视图                                            | `40` §6.1                               |
| 运行块       | run block                 | 泳道上一段连续活动（间隔 >20s 切分）                                         | `40` §7.2                               |
| 调用         | call                      | 一次工具或模型调用                                                           | `server/trace.ts`                       |
| 轨迹         | trace                     | 一次调用链的 id/父子关系                                                     | `server/trace.ts`                       |
| 跨度         | span                      | trace 中的一个节点                                                           | `30` §2.2                               |
| 事件         | event                     | append-only 的领域事实                                                       | `shared/events.ts`                      |
| 任务图       | task graph                | live task 的 owner/status/background 树                                      | `extensions/tasks/README.md`            |
| 任务         | task                      | 可被调度的持久工作单元                                                       | Pi Durable `TaskRecord`                 |
| 运行         | run                       | 一次编排执行（`runId`）                                                      | `30` §4.1                               |
| 尝试         | attempt                   | 同一任务的第 N 次执行                                                        | `30` §4.2                               |
| 投影         | projection                | 从事件/任务派生的视图模型                                                    | `30` §3.2                               |
| 回放         | replay                    | 按时间重建状态                                                               | `30` §7.5、`40` §7.5                    |
| 快照         | snapshot                  | 回放用的状态检查点                                                           | `30` §7.5                               |
| 数据源       | source                    | Ultimate / OTel / JSONL                                                      | `30` §3.3                               |
| 适配器       | adapter                   | 把源事件归一化为 `orchestra.event.v1`                                        | `30` §3.3                               |
| 只读模式     | read-only                 | 默认模式，不修改源系统                                                       | `30` §3.4、`40` §3.4                    |
| 控制面       | control plane             | 可选 steer/stop，需授权+审计                                                 | `40` §3.4                               |
| 审计日志     | audit log                 | 记录控制动作的 who/when/what/result                                          | `40` §3.4                               |
| 深链         | deep link                 | 从桌面 app 打开 Ultimate 会话的 URL                                          | `40` §6.4                               |
| 关键路径     | critical path             | 最长执行链                                                                   | `30` §7.3                               |
| 关键链       | critical chain            | 按 self-time 加权的最长 agent 链                                             | `40` §7.3                               |
| 成本         | cost                      | 按 token/价格表计算的费用                                                    | `40` §6.5                               |
| 缓存命中率   | cache hit rate            | `cacheRead / (input + cacheRead)`                                            | `40` §6.5                               |
| 数据新鲜度   | ingestion lag             | 最后事件与当前时间的差                                                       | `30` §6.2                               |
| 冷读测试     | cold-read test            | 未参与写作者只读文档复述实施步骤                                             | `00` §7                                 |
| 证据基线     | evidence baseline         | 本次分析对应的 commit                                                        | 本目录 README                           |
| 需求         | REQ                       | 编号需求，必须被 AC 覆盖                                                     | `00` §4.2                               |
| 验收项       | AC                        | 二元验收条件                                                                 | `00` §4.2                               |
| 工作区记录   | workspace record          | 一个 conversation 的 worktree 记录：`{path,branch,base,source,target,state}` | `extensions/workspaces/types.ts:3-12`   |
| 源检出       | source checkout           | 被隔离的项目主 checkout；`source` 是其 realpath                              | `lib/git.ts:27-40`                      |
| 目标分支     | target                    | 源检出当前检出的分支，landing 的快进目标                                     | `lib/git.ts:36`                         |
| 工作区分支   | workspace branch          | `ultimate/<home-hash6>-<conversationId>`                                     | `workspaces.ts:939`                     |
| 准备任务     | preparation task          | 创建/重建 checkout 的后台持久任务 `workspaces.prepare`                       | `workspaces.ts:314-436`                 |
| Setup 命令   | setup commands            | `isolates.worktree.setup` 中的命令串，在 checkout 内运行                     | `setup.ts:9-40`                         |
| 工具门禁     | tool gate                 | 每次工具调用前检查 checkout ready 的 hook                                    | `server.ts:249-257`                     |
| 待落地工作   | kept work                 | `{id,uncommitted,unlanded,reason?,descendant?}`，回收与侧栏共用              | `17`/`workspaces.ts:92-110`             |
| 提交队列     | submit queue              | 源检出维度的 `QueueEntry[]`，按到达顺序处理                                  | `types.ts:14-32`                        |
| 着陆器会话   | lander conversation       | 每个源检出固定一个 `@lander` 常驻会话，运行 lander 任务                      | `workspaces.ts:209-232`                 |
| 落地结果     | landing result            | `Landed`/`LanderOutcome`：sha/base/commits/paths/flaky/pushed                | `types.ts:33-75`                        |
| 分歧说明     | divergence                | submit 必填：结果与原始请求的差异，或 `None`                                 | `workspaces.ts:717-726`                 |
| 回收         | release                   | 释放已结束会话的干净、已落地 checkout；不强制删除                            | `workspaces.ts:571-647`                 |
| 重放/重建    | recreate                  | 已移除 checkout 在下一次模型请求时按原路径重建                               | `workspaces.ts:805-910`                 |
| 工作区面板   | Workspaces panel          | Info 面板中的队列、当前 checkout、统计与磁盘                                 | `workspaces/panel.tsx:42-57`            |
| 落地卡       | LandingCard               | 提交/落地结果的统一卡片，tone 为 landed/pushFailed/failed                    | `landing.tsx:186-265`                   |
