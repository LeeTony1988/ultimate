# 92 · 需求 → 验收覆盖矩阵

本矩阵由 `agent_design/*.md` 的 AC 表自动抽取；覆盖检查脚本见 §4。

## S · 自进化

| 验收项   | 内容                                                                                                     | 覆盖需求             |
| -------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| AC-S-001 | 记忆批次非法时零写入，错误含 op 序号                                                                     | REQ-S-004, REQ-S-005 |
| AC-S-002 | 只有 standing `ultimate` 能成功调用 `remember`；branch 调用报错                                          | REQ-S-006            |
| AC-S-003 | 有记忆的 root 的新 branch，首条模型可见消息是 brief 而非 tally                                           | REQ-S-008            |
| AC-S-004 | brief 含索引、最近 10 landing、完整 tally 读取指引                                                       | REQ-S-008            |
| AC-S-005 | 构建变化时下一输入出现 `Build changed`，system prompt 字节不变                                           | REQ-S-002, REQ-S-003 |
| AC-S-006 | 改 `AGENTS.md` 后出现 `Docs changed`；改 `agents/ultimate.md` 后出现 `Instructions changed` 且指令已更新 | REQ-S-003            |
| AC-S-007 | 同名定义覆盖顺序为 builtin < user < project；overlay 只能追加                                            | REQ-S-014            |
| AC-S-008 | 保存非法定义不写文件；保存内置同名生成覆盖而非改写内置                                                   | REQ-S-015            |
| AC-S-009 | 改 web facet 无整页刷新；坏 facet 只影响自己                                                             | REQ-S-018            |
| AC-S-010 | 改 server facet 后下一次工具调用用新代码；运行中的调用用旧代码完成                                       | REQ-S-018            |
| AC-S-011 | 改 `server/` 后 restart 成功，generation+1，会话继续                                                     | REQ-S-019, REQ-S-020 |
| AC-S-012 | 类型检查失败时旧 core 继续，返回 tsc 尾部                                                                | REQ-S-020            |
| AC-S-013 | 激活失败时旧 core reacquire，`activationError` 可见；重放不再次 swap                                     | REQ-S-020, REQ-S-021 |
| AC-S-014 | dream 六 passes 都运行并记录状态                                                                         | REQ-S-011, REQ-S-012 |
| AC-S-015 | journal 只能归档一次；重复调用返回已归档 journal                                                         | REQ-S-013            |
| AC-S-016 | 所有 proposal settled 后 session 自动结束；`landed` 由 landing 自动标记                                  | REQ-S-013            |
| AC-S-017 | 未通过 check/test 的改动不能 submit                                                                      | REQ-S-023            |
| AC-S-018 | UI 改动未经用户预览批准不能 submit                                                                       | REQ-S-023            |
| AC-S-019 | update 五类拒绝条件均零改动                                                                              | REQ-S-022            |
| AC-S-020 | update 成功后若 lockfile 变化，状态提示 restart，且不自动重启                                            | REQ-S-022            |
| AC-S-021 | 记忆蒸馏对同一 landing 只执行一次（receipt 唯一）                                                        | REQ-S-009            |
| AC-S-022 | 蒸馏失败不阻塞 landing，且最多重试一次                                                                   | REQ-S-009            |
| AC-S-023 | 记忆审查 branch 不写任何记忆                                                                             | REQ-S-025            |
| AC-S-024 | dream 本身不修改代码/记忆/设置                                                                           | REQ-S-014            |
| AC-S-025 | 自改提案必须带证据（trace/事件/复现）并记录结果                                                          | REQ-S-024, REQ-S-027 |
| AC-S-026 | 六层自修改面各自有写入口、生效方式、回滚方式，且有一条对应测试或检查                                     | REQ-S-001            |
| AC-S-027 | 任意 agent 可读记忆索引与单条全文；branch 可读其 root                                                    | REQ-S-007            |
| AC-S-028 | 用户 Dream、70% 上下文、离开 8h 三种触发都可启动；无 handoff 30 分钟超时                                 | REQ-S-010            |
| AC-S-029 | 技能多目录同名覆盖正确；`/skill:<name>` 展开为 skill 块 + args                                           | REQ-S-016            |
| AC-S-030 | 扩展目录含 README/api/refs/server/web；facet 契约检查通过                                                | REQ-S-017            |
| AC-S-031 | 上下文越过 70% 时自动请求 handoff 并启动 dream                                                           | REQ-S-026            |
| AC-S-032 | `forget`/`rewind`/`compact`/`asleep`/`end` 对 agent 调用报错                                             | REQ-S-028            |
| AC-S-033 | 单个 facet 加载失败时其余 facet 正常，旧版本保留                                                         | REQ-S-029            |
| AC-S-034 | §10 的失败注入可全部执行，且每项有期望状态/文案/恢复                                                     | REQ-S-030            |
| AC-S-035 | 配置优先级正确；core 扩展忽略 disable；非法 JSON 不覆盖旧文件                                            | REQ-S-001            |
| AC-S-036 | §3.12 非功能预算达标（写入/读取/brief/装配/热重载/swap/恢复）                                            | REQ-S-030            |

## A · 子 agent 编排

| 验收项   | 内容                                                                | 覆盖需求             |
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

## T · 任务编排桌面应用

| 验收项   | 内容                                                           | 覆盖需求             |
| -------- | -------------------------------------------------------------- | -------------------- |
| AC-T-001 | 应用冷启动 < 2s，显示空状态                                    | REQ-T-001, REQ-T-019 |
| AC-T-002 | JSONL fixture 能完整加载并显示 run                             | REQ-T-002, REQ-T-017 |
| AC-T-003 | Ultimate SSE 能实时显示新任务                                  | REQ-T-002, REQ-T-012 |
| AC-T-004 | 事件先落 SQLite，重启后仍在                                    | REQ-T-003            |
| AC-T-005 | DAG 可缩放/平移/选择/折叠                                      | REQ-T-004            |
| AC-T-006 | 1k 节点布局 < 300ms                                            | REQ-T-011            |
| AC-T-007 | 关键路径高亮正确                                               | REQ-T-008            |
| AC-T-008 | 时间线缩放/对齐正确                                            | REQ-T-005            |
| AC-T-009 | DAG 选择联动时间线                                             | REQ-T-005            |
| AC-T-010 | Inspector 显示状态/耗时/错误/日志/产物                         | REQ-T-006            |
| AC-T-011 | 过滤/搜索/命令面板可用                                         | REQ-T-007, REQ-T-014 |
| AC-T-012 | 回放前进/后退正确                                              | REQ-T-009            |
| AC-T-013 | 两次 run diff 正确                                             | REQ-T-010            |
| AC-T-014 | 导出 PNG/JSON/CSV                                              | REQ-T-013            |
| AC-T-015 | 10k 任务首屏 < 1.5s，自动聚合                                  | REQ-T-011            |
| AC-T-016 | 断线显示 stale 并可恢复                                        | REQ-T-012, REQ-T-018 |
| AC-T-017 | 暗色/亮色/高对比度可用                                         | REQ-T-015            |
| AC-T-018 | 签名安装包可启动，自动更新可用                                 | REQ-T-016            |
| AC-T-019 | 无数据/加载/错误状态有明确文案                                 | REQ-T-019            |
| AC-T-020 | 性能基准脚本可复现                                             | REQ-T-020            |
| AC-T-021 | 缺失字段（endedAt/attempt/cost）显示 unknown/partial，不填假值 | REQ-T-003            |

## V · 子 agent 可视化桌面应用

| 验收项   | 内容                                                 | 覆盖需求                                   |
| -------- | ---------------------------------------------------- | ------------------------------------------ |
| AC-V-001 | JSONL fixture 能显示泳道/树/消息                     | REQ-V-002, REQ-V-004, REQ-V-005, REQ-V-006 |
| AC-V-002 | 泳道按 spawn 树缩进、按时间铺开                      | REQ-V-004                                  |
| AC-V-003 | Ultimate SSE 实时出现新 agent/消息                   | REQ-V-002, REQ-V-015                       |
| AC-V-004 | 事件落 SQLite，重启后仍在                            | REQ-V-003                                  |
| AC-V-005 | 生成树显示 parent/spawn call/kind                    | REQ-V-005                                  |
| AC-V-006 | 消息边显示方向/reply/steer，不含正文                 | REQ-V-006, REQ-V-018                       |
| AC-V-007 | 悬停高亮祖先/后代链                                  | REQ-V-008                                  |
| AC-V-008 | Inspector 显示模型/token/工具/workspace/plan         | REQ-V-007, REQ-V-012                       |
| AC-V-009 | 成本按 agent 聚合，缓存命中率正确                    | REQ-V-012                                  |
| AC-V-010 | 回放前进/后退正确                                    | REQ-V-010                                  |
| AC-V-011 | 两次 run 对比正确                                    | REQ-V-011                                  |
| AC-V-012 | 200 agents/100k calls 首屏 <1.5s                     | REQ-V-014                                  |
| AC-V-013 | 30m/2h/24h/全部切换正确                              | REQ-V-009                                  |
| AC-V-014 | 深链能打开 Ultimate 对应会话                         | REQ-V-013                                  |
| AC-V-015 | 断线显示 stale 并可恢复                              | REQ-V-015                                  |
| AC-V-016 | 控制默认关闭；开启需授权+确认                        | REQ-V-016, REQ-V-017                       |
| AC-V-017 | 控制动作写入审计日志                                 | REQ-V-017                                  |
| AC-V-018 | 默认不存 prompt/response                             | REQ-V-018                                  |
| AC-V-019 | 空/加载/错误状态明确                                 | REQ-V-019                                  |
| AC-V-020 | 基准脚本可复现                                       | REQ-V-020                                  |
| AC-V-021 | 默认只读：代码中不存在写源系统的路径，控制需显式开启 | REQ-V-001                                  |
| AC-V-022 | 缺口字段显示 unknown/inferred/partial，不填假值      | REQ-V-003                                  |

## WM · Worktree 管理机制

| 验收项    | 内容                                                                                       | 覆盖需求   |
| --------- | ------------------------------------------------------------------------------------------ | ---------- |
| AC-WM-001 | 非 Git/无分支/无 commit 三种目录，`create` 分别返回对应 reason，不产生记录                 | REQ-WM-001 |
| AC-WM-002 | 同一 id 第二次 `create` 抛 `Conversation already has a workspace`                          | REQ-WM-002 |
| AC-WM-003 | 同一 home + id 两次运行得到相同 path/branch；branch 以 `ultimate/` 开头且含 home hash 6 位 | REQ-WM-003 |
| AC-WM-004 | `create` 返回时 state=preparing 且 task 已存在；无同步 `worktree add`                      | REQ-WM-004 |
| AC-WM-005 | setup 命令收到 `ULTIMATE_SOURCE`；在 checkout cwd 执行；120s 超时                          | REQ-WM-005 |
| AC-WM-006 | preparing/failed/missing/unregistered 四种情况工具被 block，文案含状态                     | REQ-WM-006 |
| AC-WM-007 | setup 失败后记录 failed + error tail；修正 PATH 后下一次工具调用成功                       | REQ-WM-007 |
| AC-WM-008 | discard 后重建，未落地分支的 tip 不变且仍是 base                                           | REQ-WM-008 |
| AC-WM-009 | dirty 时 land 拒绝；目标分支未检出时拒绝                                                   | REQ-WM-009 |
| AC-WM-010 | 分叉仓库 land 拒绝；成功后 `git log` 无 merge commit、无 rebase 痕迹                       | REQ-WM-010 |
| AC-WM-011 | land 输出含 commits、paths、files 的 added/removed、needsRestart（server/shared 变更时）   | REQ-WM-011 |
| AC-WM-012 | 空 divergence 拒绝；子 agent 调用拒绝；dirty 拒绝                                          | REQ-WM-012 |
| AC-WM-013 | 两次 submit 返回 position 1/2；同 tip 重复 submit 复用 entry                               | REQ-WM-013 |
| AC-WM-014 | 同一 source 只有一个 live task；landing 期间新 submit 只排队                               | REQ-WM-014 |
| AC-WM-015 | 远端领先时 lander fetch 并 merge；checkout 是 detached                                     | REQ-WM-015 |
| AC-WM-016 | 顺序和并发组都执行；2min 无输出/timeout 分别报 `Stalled`/`Timed out`                       | REQ-WM-016 |
| AC-WM-017 | 失败后重跑通过 → `flaky`；两次失败 → `failed`，只跑两次                                    | REQ-WM-017 |
| AC-WM-018 | 检查期间改文件/移动 HEAD → `the integration checkout changed during checks`                | REQ-WM-018 |
| AC-WM-019 | 目标移动 1 次后成功；持续移动 3 次后失败                                                   | REQ-WM-019 |
| AC-WM-020 | ff 后 kill lander → 重启只 push/report，不重复 merge/check                                 | REQ-WM-020 |
| AC-WM-021 | push 拒绝重试一次；仍失败时 outcome=landed + reason=Push failed                            | REQ-WM-021 |
| AC-WM-022 | 提交会话收到 `workspaces.lander-report`；results 最多 50 条                                | REQ-WM-022 |
| AC-WM-023 | diagnose 不改 checkout；fix 成功后再跑全部检查；第二次失败不再给模型                       | REQ-WM-023 |
| AC-WM-024 | 匹配前缀才发送；同 submission 重放不重复发送                                               | REQ-WM-024 |
| AC-WM-025 | 有未提交/未落地/busy/descendant 时保留；干净已落地才删                                     | REQ-WM-025 |
| AC-WM-026 | discard 后 branch 仍存在                                                                   | REQ-WM-026 |
| AC-WM-027 | 嵌套 child 的 source 是父 worktree；父未 ready 时先准备父                                  | REQ-WM-027 |
| AC-WM-028 | 并发 land/submit 不产生交错 ff；记录更新与 task 创建同事务                                 | REQ-WM-028 |
| AC-WM-029 | landed/check 事件字段齐全；lander 日志不进入模型上下文                                     | REQ-WM-029 |
| AC-WM-030 | `C:\A` 与 `C:/a` 视为同一路径                                                              | REQ-WM-030 |
| AC-WM-031 | 并发 disk 请求只跑一次；60s 内复用；stats 不写                                             | REQ-WM-031 |
| AC-WM-032 | 10 个故障注入全部通过                                                                      | REQ-WM-032 |
| AC-WM-033 | lander 工具列表无 `workspace`；无 `subagent` 定义时也无 `subagent`                         | REQ-WM-033 |
| AC-WM-034 | 落地后报告 run 与子 agent 空闲 → 自动 conclude；等待回复/子 agent 运行 → 保持              | REQ-WM-034 |
| AC-WM-035 | 保守 GC：未合并/脏/有子代/有未推送提交都不删；dry-run 列出清单；默认 30 天                 | REQ-WM-035 |

## WV · Worktree 可视化

| 验收项    | 内容                                                                                                           | 覆盖需求   |
| --------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| AC-WV-001 | 项目根为 worktree 时标题栏和侧栏都出现 `<project> #<id>`；非 worktree 不出现                                   | REQ-WV-001 |
| AC-WV-002 | 每个 open branch 行显示 title/feature/state/age；缺 feature 不留空标签                                         | REQ-WV-002 |
| AC-WV-003 | 7 种状态各渲染对应词与 tone；颜色之外有文字                                                                    | REQ-WV-003 |
| AC-WV-004 | `unlanded=3/uncommitted=4` 显示 `3 commits` `+ 4 edits`；都为 0 时整行不渲染                                   | REQ-WV-004 |
| AC-WV-005 | `@lander` 行显示 fixing/diagnosing/landing/queue N/last age                                                    | REQ-WV-005 |
| AC-WV-006 | 同 feature 多次落地合成一行；连续 range 可点开；非连续无 range                                                 | REQ-WV-006 |
| AC-WV-007 | 有队列时 meta=`N landing`；否则显示当前 checkout 状态                                                          | REQ-WV-007 |
| AC-WV-008 | path/branch 可复制；target 显示 `in <source>`；ahead 数字正确；landed 7 位；增强版 WIP 与 Review 按钮可用      | REQ-WV-008 |
| AC-WV-009 | 队列按最旧优先，显示 conversation/tip/step 或 target                                                           | REQ-WV-009 |
| AC-WV-010 | 统计 5 行齐全；btrfs 时显示 `· N real`；disk 失败显示 unknown                                                  | REQ-WV-010 |
| AC-WV-011 | submit 卡标题 `submit · tip → target`；chip 状态正确；工具耗时在无 state 时显示                                | REQ-WV-011 |
| AC-WV-012 | queued/landing 默认展开；outcome 后默认折叠；手动 toggle 保持                                                  | REQ-WV-012 |
| AC-WV-013 | `checking:` 被 `checked:` 取代；最后一步/并发组正确 active；耗时正确                                           | REQ-WV-013 |
| AC-WV-014 | 一次 submission 的日志有分组头、步骤、check、outcome；queued 不单独显示                                        | REQ-WV-014 |
| AC-WV-015 | 三种 tone 的色条/图标/标签正确；headline 文案正确                                                              | REQ-WV-015 |
| AC-WV-016 | root note 显示 LandingCard；State at landing 可展开                                                            | REQ-WV-016 |
| AC-WV-017 | 提交者 transcript 出现 report 卡，含 commits/paths/divergence                                                  | REQ-WV-017 |
| AC-WV-018 | 三种 spec 都能打开 review；无 provider 时退化正确                                                              | REQ-WV-018 |
| AC-WV-019 | GitHub 时 commit 数可点 compare；非 GitHub 不显示↗                                                             | REQ-WV-019 |
| AC-WV-020 | 代码中无 worktree 相关 setInterval；committed/run 变化触发重取（elapsed/age 本地计时除外）                     | REQ-WV-020 |
| AC-WV-021 | 每组件六态均有可渲染分支；无 undefined/空白                                                                    | REQ-WV-021 |
| AC-WV-022 | 所有 icon 按钮有 aria-label；Tab 可达；aria-current 正确                                                       | REQ-WV-022 |
| AC-WV-023 | 390px 宽度无横向滚动；关键信息仍可见                                                                           | REQ-WV-023 |
| AC-WV-024 | 10 个分支只发 1 次 progress；stats 不按 timer；disk 60s 复用                                                   | REQ-WV-024 |
| AC-WV-025 | 复制 path/branch 与记录完全一致                                                                                | REQ-WV-025 |
| AC-WV-026 | open #id/entry 能切到会话并定位 breadcrumb                                                                     | REQ-WV-026 |
| AC-WV-027 | 有 workspace 时状态行显示 `#id`，tooltip 有 path+branch                                                        | REQ-WV-027 |
| AC-WV-028 | 所有字段名与 `50` §4 一致；无前端重命名                                                                        | REQ-WV-028 |
| AC-WV-029 | 三域状态都能映射到 §5.7 的唯一词表，无组件自定义词                                                             | REQ-WV-029 |
| AC-WV-030 | 基线 position 与 `useSubmission` 一致（整条 source 队列，含 landing）；增强版 queued-only 口径标注清楚，不混用 | REQ-WV-030 |
| AC-WV-031 | 六种 step 状态各有图标/文案/tone；pending 不显示为 running                                                     | REQ-WV-031 |
| AC-WV-032 | 复制 sha、compare、log 三个动作可用；无 GitHub 时 compare 隐藏                                                 | REQ-WV-032 |
| AC-WV-033 | 四类空态文案正确，且不出现空 section 标题                                                                      | REQ-WV-033 |
| AC-WV-034 | ⌘K 能搜到四个命令；深链 `#id/entry` 可复制并打开                                                               | REQ-WV-034 |
| AC-WV-035 | compact/comfortable 切换生效；51 行时启用虚拟滚动且键盘可达                                                    | REQ-WV-035 |

## 汇总

| 前缀 | 范围                    | 需求数 | 验收项数 | 未覆盖需求 |
| ---- | ----------------------- | -----: | -------: | ---------: |
| S    | 自进化                  |     30 |       36 |          0 |
| A    | 子 agent 编排           |     35 |       35 |          0 |
| T    | 任务编排桌面应用        |     20 |       21 |          0 |
| V    | 子 agent 可视化桌面应用 |     20 |       22 |          0 |
| WM   | Worktree 管理机制       |     35 |       35 |          0 |
| WV   | Worktree 可视化         |     35 |       35 |          0 |

## 覆盖检查脚本

```python
import re, pathlib
for prefix, doc in [("S","self-evolution/10-self-evolution-spec.md"),("A","subagent-orchestration/20-subagent-orchestration-spec.md"),("T","desktop-apps/30-task-orchestration-desktop-spec.md"),("V","desktop-apps/40-subagent-visualization-desktop-spec.md"),("WM","worktree/50-worktree-management-spec.md"),("WV","worktree/60-worktree-visualization-spec.md")]:
    text = pathlib.Path("agent_design", doc).read_text(encoding="utf-8")
    reqs = set(re.findall(rf"REQ-{prefix}-\d+", text))
    acs = set()
    for line in text.splitlines():
        if re.search(rf"\| AC-{prefix}-\d+ \|", line):
            acs |= set(re.findall(rf"REQ-{prefix}-\d+", line))
    print(prefix, "missing:", sorted(reqs - acs))
```
