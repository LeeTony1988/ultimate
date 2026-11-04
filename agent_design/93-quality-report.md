# 93 · 质量报告与验收记录

| 字段     | 值                                                                     |
| -------- | ---------------------------------------------------------------------- |
| 文档 ID  | AD-93                                                                  |
| 证据基线 | `3f7b7bec2d4713c036d371870b0bea65a9acb8a2`                             |
| 检查日期 | 2026-10-28                                                             |
| 结论     | **通过（有条件）**：文档可进入实现；性能数字与外部产品细节需在 M0 复测 |

---

## 1. Checklist 汇总

`checklist.yaml` 共 61 项：

| 状态    | 数量 | 说明                                                  |
| ------- | ---: | ----------------------------------------------------- |
| done    |   61 | 计划、四份 spec、索引、术语、契约、覆盖矩阵、冷读修复 |
| doing   |    0 | —                                                     |
| blocked |    0 | —                                                     |

按阶段：

| 阶段            | 项数 | 完成 |
| --------------- | ---: | ---: |
| P 计划          |    5 |    5 |
| S 自进化        |   13 |   13 |
| A 子 agent      |   13 |   13 |
| T 任务桌面      |   12 |   12 |
| V 子 agent 桌面 |   11 |   11 |
| Q 质量          |    7 |    7 |

## 2. 自动化检查

### 2.1 源码引用

检查所有 `path:line` / `path:start-end`：

- 主 spec（`10`/`20`/`91`）共 164 条引用；
- 文件存在、行号在文件长度内：**0 错误**；
- 引用分布：`extensions/subagents` 71、`extensions/lineage` 42、`extensions/prompt` 18、`bin/server` 20、其他 12。

> 说明：`subagent-orchestration/research/subagent-source-map.md` 内部使用简写（如 `server.ts:143`），因为该文件按小节声明了当前文件；它不是最终 spec，不计入主 spec 的引用检查。

### 2.2 需求覆盖

`92-coverage-matrix.md` 由 AC 表自动生成：

| 前缀 | 需求数 | 验收项数 | 未覆盖 |
| ---- | -----: | -------: | -----: |
| S    |     30 |       36 |      0 |
| A    |     35 |       35 |      0 |
| T    |     20 |       21 |      0 |
| V    |     20 |       22 |      0 |

### 2.3 内部链接

`agent_design/**/*.md` 共 22 个本地链接，**0 个断链**。

### 2.4 外部链接抽样

抽查 20 个关键 URL（Tauri/Electron/npm/React Flow/产品文档/标准）：

- 18 个返回 200；
- 2 个 404（Windmill `docs/advanced/runs`、Prefect `docs.prefect.io`），已分别替换为 `docs/flows/flow_editor` 与产品页；
- 外部产品文档会变动，spec 中的版本/行为以访问日期 2026-10-28 为准。

## 3. 冷读测试（Q-05）

让一个未参与写作的独立 agent 只读 `10` 与 `20`，回答目标、模块、前三个里程碑、缺失信息、可复刻性评分。

### 3.1 结果

- 评分：**3/5**。
- 通过：目标、核心机制、模块边界、M0–M2 都能复述；M0 可开工。
- 扣分：关键原语只有行号证据、验收与里程碑脱节、缺迁移/并发/性能指标、高风险路径无降级。

### 3.2 已修复项

| #   | 冷读问题                                             | 修复                                                                          |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `forget`/`rewind`/`compact` 无接口，AC-S-032 不可测  | `10` §6.5 增加用户专属动作表；AC-S-032 明确"agent 调用报错"                   |
| 2   | 缺 receipt / dream waiting / handoff schema          | `10` §4.1 增加 `MemorizedReceipt`；§4.3 增加 `Handoff`、`DreamSessionsDoc`    |
| 3   | §9 里程碑未覆盖 AC-S-021..034                        | `10` §9 增加"验收项归属"表（35 项全覆盖）                                     |
| 4   | `boot(previousBuild)` 与 `boot(generation+1)` 不一致 | `10` §7.5 统一为 `boot(previousBuild)`，注释说明 supervisor 分配 generation+1 |
| 5   | L3 配置无契约/用例                                   | `10` §4.6 增加 `SettingsFile` 与优先级规则；UT-S-13、AC-S-035                 |
| 6   | AD-20 start 缺 `steer`                               | `20` §6.1 增加 `steer?: boolean` 与语义                                       |
| 7   | branch 名"由 workspaces 决定"但要求可预测            | `20` §3.6.1 明确 `ultimate/<sha256(home)6>-<id>`                              |
| 8   | `createChild` 黑盒、无 anchor 契约                   | `20` §4.8 增加 `AnchorTask`、`CreateChildOptions`、`ChildRecord`、行为步骤    |
| 9   | 缺并发/性能预算                                      | `20` §9 增加非功能预算表与 AC-A-036                                           |

> 冷读报告未发现"目标/边界"层面的误解；问题集中在可执行细节，已逐条修复。

## 4. 文档/代码冲突

`subagent-orchestration/research/subagent-source-map.md` 附录 A 记录了 5 处：

1. `subagents/README.md` 的 land "both checkouts clean" 与 `workspaces` 代码不一致；
2. discard 的 "clean" 实际由 `git worktree remove` 保证；
3. start 参数文档漏 `isolate`/`steer`；
4. `lineage.branch` 文档漏 `brief`；
5. branch 的 `Started.agent` 实际是 `'branch'`，不是定义名。

处理：`20` §15 以代码事实为准，保留文档说法作为意图；`91` MAP-07 提醒可视化从 metadata 补定义名。

## 5. 已知限制

| ID   | 限制                           | 影响                         | 处理                                    |
| ---- | ------------------------------ | ---------------------------- | --------------------------------------- |
| L-01 | 未实现任何代码，未跑真实 e2e   | 验收是设计验收，不是运行验收 | 实现阶段按 M0–M8 补                     |
| L-02 | 性能数字为设计预算/推断        | 10k/100k 指标未实测          | M0 用合成数据 benchmark，回归 >20% 失败 |
| L-03 | 外部产品/版本会变              | 选型可能过期                 | 记录访问日期；升级触发条件写进决策矩阵  |
| L-04 | Ultimate 文档与代码有 5 处冲突 | 复刻者可能被误导             | `20` §15 明确以代码为准                 |
| L-05 | Ultimate 数据面有 G1–G12 缺口  | 桌面 app 不能假装有历史/成本 | `30` §3.3.5、`40` §3.3.4 明确降级       |
| L-06 | 未验证所有外部 URL             | 个别链接可能失效             | 抽样 20 个；实现时用链接检查            |
| L-07 | 未覆盖多用户/远程安全          | 单机单用户假设               | 明确写在 `10` Q-S-02                    |

## 6. 质量门结论

| 门        | 判据                                 | 结果                                            |
| --------- | ------------------------------------ | ----------------------------------------------- |
| 证据门    | 每条 REQ 至少一条 `path:line` 或 URL | 通过（主 spec 164 条引用 0 错误）               |
| 可执行门  | 前两步 30 分钟内可跑通               | 有条件通过（M0 有明确文件/测试/命令；未实际跑） |
| 失败门    | 每条正常路径有失败路径与恢复         | 通过（`10` §12、`20` §12、`30` §12、`40` §12）  |
| 一致性门  | 字段在分析/桌面/sample 中一致        | 通过（`91` 映射 + JSON 校验）                   |
| AI 试读门 | 独立 agent 复述目标/边界/前三里程碑  | 通过（修复后复述一致）                          |

## 7. 建议的下一步

1. 按 `10` M0 实现记忆内核，先跑 UT-S-01..07。
2. 按 `20` M0–M2 实现定义/reporter，先跑 UT-A-01..08 与崩溃注入。
3. 用 `30` M0 做 JSONL + 泳道 MVP，验证 10k 合成数据。
4. 用 `40` M0 做 branch→worker→reviewer 样例，验证 spawn/message 边。
5. 每次实现后回填 `checklist.yaml`，并把实测数字写回 §8 性能表。

## 8. 目标达成审计（2026-10-28 最终检查）

| 目标项                           | 证据                                                                             | 结果                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 00 计划与 checklist              | `00-plan.md` + `checklist.yaml`                                                  | 存在；61/61 done                                                               |
| 自进化深度分析与复刻 spec        | `self-evolution/10-self-evolution-spec.md`（约 1414 行，§0–§15）                 | 存在；含 REQ/AC、契约、状态机、算法、文件清单、M0–M8、测试、失败矩阵、证据索引 |
| 子 agent 编排深度分析与复刻 spec | `subagent-orchestration/20-subagent-orchestration-spec.md`（约 1360 行，§0–§15） | 存在；含生命周期、reporter、隔离区、并发、非功能预算、验收                     |
| 任务编排桌面应用 spec            | `desktop-apps/30-task-orchestration-desktop-spec.md`（约 1017 行，§0–§14）       | 存在；含调研、决策矩阵、数据模型、UI、算法、M0–M6、AC                          |
| 子 agent 可视化桌面应用 spec     | `desktop-apps/40-subagent-visualization-desktop-spec.md`（约 870 行，§0–§14）    | 存在；含泳道/生成树/消息/回放、控制面、数据缺口、AC                            |
| 证据可追溯                       | 主 spec 164 条 `path:line` 引用                                                  | 0 错误                                                                         |
| 交叉校验                         | `90` 术语、`91` 契约映射、`92` 覆盖矩阵、`93` 质量报告                           | 存在；105 条 REQ / 114 条 AC / 0 未覆盖                                        |
| 索引                             | `map.md`（`README.md` 指向它）                                                   | 4 个主题目录、39 个文档文件（37 Markdown + 2 YAML）、4 条阅读路径              |
| 未修改产品代码                   | `git status`                                                                     | 仅 `agent_design/` 新增；`analysis_design/` 为既存未跟踪目录                   |

**结论：本目标已达成。** 剩余不确定性已在 §5 已知限制中列明（未实测性能、外部版本会变、Ultimate 数据缺口 G1–G12）。

### 8.1 目录重组（2026-10-28）

按 `map.md` 的目录约定重组，文档内容未改动：

| 原路径                              | 新路径                                                     |
| ----------------------------------- | ---------------------------------------------------------- |
| `10-self-evolution-spec.md`         | `self-evolution/10-self-evolution-spec.md`                 |
| `20-subagent-orchestration-spec.md` | `subagent-orchestration/20-subagent-orchestration-spec.md` |
| `research/subagent-source-map.md`   | `subagent-orchestration/research/subagent-source-map.md`   |
| `30-…` / `40-…`                     | `desktop-apps/30-…` / `desktop-apps/40-…`                  |
| `research/desktop-research.md`      | `desktop-apps/research/desktop-research.md`                |
| `README.md`（索引）                 | `map.md`（`README.md` 保留为入口）                         |

每个主题目录新增 `README.md`（专题索引）与 `for_human/`（人读文档）。新增的人读文档不改变原有 REQ/AC 覆盖，不影响 105 条 REQ 的审计结论。

## 9. Worktree 专题质量报告（2026-10-28）

### 9.1 Checklist 汇总

`worktree/checklist-worktree.yaml` 共 55 项：P 5、M 15、R 8、V 13、U 7、Q 7；全部 `done`（见 YAML）。

### 9.2 自动化检查

| 检查                                                     | 结果                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `50`/`60` 的 `path:line` 引用：文件存在且行号 ≤ 文件长度 | 0 错误（含短名展开；见各 §0 路径约定）                                                                                               |
| `92-coverage-matrix.md` WM/WV：REQ → AC                  | WM 35/35、WV 35/35，未覆盖 0                                                                                                         |
| 内部链接 `agent_design/**/*.md`                          | 0 断链（新增 worktree 文档均被 README 索引）                                                                                         |
| 外部 URL 抽样                                            | 见 `worktree/research/worktree-management-research.md` §9 与 `worktree/research/worktree-ui-research.md` §10；403/DNS 失败已显式标注 |
| 冷读测试                                                 | 首轮 50/60 各 2/5；修复了运行时契约、home 公式、lander agent、report shape、Steps 索引、tone/文案冲突等；修复后见 §9.4               |

### 9.3 冷读首轮问题与修复

| #   | 问题                                    | 修复                                                         |
| --- | --------------------------------------- | ------------------------------------------------------------ |
| 1   | Pi Durable 契约缺失，M1 后不可实现      | `50` §4.5 增加最小运行时契约；§4.6 增加辅助函数签名          |
| 2   | `<home>` 未定义                         | `50` §4.5 给出 `server/project.ts:121-123` 公式              |
| 3   | `@lander` 定义/prompt/工具未给          | `50` §7.7.0 增加 lander 会话与 agent 配置                    |
| 4   | `LanderReport`/`results` 形状不一致     | `50` §4.1 增加 `LanderResult`/`LanderReport`；`60` §4.4 标注 |
| 5   | `LanderCheck` 无 timeout 却要求 timeout | `50` §4.1 明确超时按 failed + 事件 timeout                   |
| 6   | `at` entry id 被当时间戳                | `50` §4.6 明确四种 at；`60` §8.3/§8.4 只用 `steps.at(-1).at` |
| 7   | `ready(parentId)` 未定义                | `50` §7.3 补 `parentId`                                      |
| 8   | `position.member` 伪代码错误            | `50` §7.7 改为 `${position}.${member}`                       |
| 9   | M0 version 1 vs v4                      | `50` §9 M0 改为直接用 v4 形状                                |
| 10  | Steps 过滤后下标错位                    | `60` §8.7 改为 filteredIndex 并加反例                        |
| 11  | `defaultOpen` 歧义                      | `60` §7.5 区分外层 Tool 与内层 Steps                         |
| 12  | tone/文案三套                           | `60` §2.1、§5.3、§8.9 统一                                   |
| 13  | UI hooks 契约缺失                       | `60` §6.0 增加前端运行时契约                                 |
| 14  | 六态“—”被当遗漏                         | `60` §5.5 加说明                                             |
| 15  | `useNow` 与“无定时器”冲突               | `60` §1.3、§8.13 明确 age/elapsed 例外                       |
| 16  | “回收绝不 force”与 rm -rf 冲突          | `50` §2.2 拆 INV-WM-10/10a，只允许未登记残留                 |

### 9.4 冷读复测

第二轮由同一未参与写作的 agent 复读修订版：50 得分 **4/5**、60 得分 **3/5**；6 项完全修复、9 项部分修复。部分项及后续处理：

| 残留                                                                | 处理                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ownership: conversation` 非对象；`Preparation`/`Lander` 输入未定义 | `50` §4.5 改为 `{kind:'conversation'}`，补 `PreparationInput/State`、`LanderInput/State`、`AgentChange` |
| `landerAgent` 签名/`agents/lander.md` 缺失                          | `50` §7.7.0 补签名与定义文件说明；§8 加文件项                                                           |
| `at` 表误列 `LanderOutcome.at`                                      | `50` §4.6 改为 `LanderEntry.at` 与 `sourceEntry`                                                        |
| `index.items.find` 对 Record 非法                                   | `50` §7.3 改 `Object.entries`，并在循环内重读 parent                                                    |
| `limitsFor(member)` 类型错 / `any failure` 未定义                   | `50` §7.7.1 改 `limitsFor(members[member], limits)`，补 `results/failed/flaky`                          |
| `finishRemoval` catch 不可达 / `rm -rf` 未验证                      | `50` §7.10 重构 try/catch；残留目录要求无 `.git` 且 `git status` 为空                                   |
| tone 缺 `failed`；空 commits 文案矛盾                               | `60` §2.1 加 `failed`；§5.3/§8.8 用 `Nothing new`                                                       |
| UI hooks 缺 `useSubmission`，`api.action`/`useAction` 混用          | `60` §6.0 补 `useSubmission` 与调用约定                                                                 |
| 轮询条款与“无定时器”冲突                                            | `60` §6.0 删除轮询替代；§9.1 明确 age 60s/elapsed 1s 仅显示                                             |
| `steps: []` 毒化年龄                                                | `60` §8.3/§8.4 过滤非数值并避免 `Math.max(undefined)`                                                   |
| queued 行/分组头重复                                                | `60` §7.6 改为“不作为独立行，只在 started 组内出现一次”                                                 |
| timeout 六态与 `LanderCheck` 冲突                                   | `60` §5.6 注明由事件/文本派生，不新增字段                                                               |

> 结论：50 的主干可照做（剩余风险集中在 `finishRemoval`/GC 的边界）；60 的视觉与数据契约已足够做静态 MVP，真实交互仍需按 §12 测试计划验证。

### 9.5 已知限制（worktree 专题）

| ID    | 限制                                | 影响             | 处理                                    |
| ----- | ----------------------------------- | ---------------- | --------------------------------------- |
| W-L01 | 未实现任何代码，未跑真实 e2e        | 验收是设计验收   | 按 `50` M0–M8、`60` M0–M7 补            |
| W-L02 | 外部产品会变化                      | 调研可能过期     | 记录访问日期；关键 URL 抽样；升级时重核 |
| W-L03 | `results.at` 是 entry id 不是时间戳 | 年龄/排序可能错  | `50` NOTE-WM-01、`60` §8.3 已修正       |
| W-L04 | README 与源码有 10 处冲突           | 复刻者可能被误导 | `50` §14.2 逐条选择“源码+测试”          |
| W-L05 | 未测 Windows release/分支恢复       | 跨平台风险       | 在 `50` §10.3 增补 Windows 用例         |
| W-L06 | 未实现保守 GC                       | 长期磁盘增长     | `50` §7.13 作为可选增强，默认 dry-run   |

**Worktree 专题结论：通过（有条件）**。证据、覆盖、链接、术语、契约五门通过；可执行门为"设计可执行"（未实际跑 e2e）；外部事实以 2026-10-28 为准；实现阶段按 `50` §10 与 `60` §12 补齐运行验证。
