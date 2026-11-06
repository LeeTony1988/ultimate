# 全局资源与预算：实测、Q1 结论、开源调研与租约规格

| 字段     | 值                                                                          |
| -------- | --------------------------------------------------------------------------- |
| 证据基线 | `d8b7f4e6`（2026-11-06，`dev/lxy`）                                         |
| 状态     | 调研 + 规格草案；**不含产品代码改动**                                       |
| 上游     | #71600；计划 `agent_design/projects/20-resource-budget-research-plan.md`    |
| 机器     | Windows 11；Intel Core Ultra 9 285H；16 逻辑核；31.5 GB RAM；Node 26.11.1   |
| 运行时   | Vitest 5.0.5；`vp`（vite-plus 1.4.0）；测试配置 `vite.config.ts` / e2e 配置 |

## 0. 结论摘要

1. **Q1 的字面答案：不能。** Vitest 的 worker 是某一个 Vitest 进程内的 `Pool` 通过 `child_process.fork()` 或 `worker_threads.Worker` 创建的子进程/线程；`Pool` 的队列是进程内内存，worker 的 IPC 只连着自己的父进程。两个独立的 Vitest 进程无法把同一个 worker 交给对方，也没有跨进程的 worker 注册表。
2. **但等价目标可以达成，而且比计划假设的更便宜。** Vitest 的 `test.projects` 可以在**一个进程里跑多个 project root**：`createPool()` 只创建一个 `Pool`，所有 project 的测试任务都排进这个池；默认 `sequence.groupOrder = 0` 时它们共享同一个 `maxWorkers`。`--maxWorkers` 又通过 `PROJECT_CLI_OVERRIDES` 覆盖每个 project 的配置。因此 "一个进程、一个池、N 个 project root、总共 8 个 worker" 是 Vitest 原生支持的，不需要自己写 worker 共享协议。
3. **但 `test.projects` 不能替代跨 project 的资源预算。** 它要求所有 root 在同一个 Vitest 版本、同一个进程、同一套配置加载路径下；而产品的每个 project 是独立 host 进程，可能在不同分支、不同依赖、不同 Vitest 版本上。跨进程仍然需要一个全局租约账本。
4. **推荐单一方案：租约式预算（A），账本用现有 SQLite 锁模式实现，不新增常驻守护进程。** 把 `test.projects` 的能力限制为 A 的一个可选批处理模式：只有当一次检查确实要跑同一 checkout/同一版本下的多个 root 时，才用一个 Vitest 进程吃掉一份租约。OS 级限制（C）只作最后防线，不做主方案。
5. **建议预算：`BUDGET_CPU = 8` 个 worker-equivalent（详见 §2 数据与 §2.4 推导）。** 这不是拍脑袋的 8：实测 1×8 三次为 20–21 个失败文件（空载基线 20），2×8（16 个 worker）为 26–28 个失败文件（+6~8）、失败测试 106–111（+27~32）、墙钟约 580 s；3×8（24 个 worker）为 38–42 个失败文件（+18~22）、墙钟约 713 s。红率开始上升的峰值在 8 与 16 之间。预算取在阈值下沿，并用 e2e 权重、landing 预留和 OS 兜底吸收误差。

> 本文的 "worker-equivalent" 是预算单位：1 个普通 unit worker = 1；1 个 e2e worker = 2（e2e worker 会再拉 preview/server 进程，见 §2.5）；构建任务按实测 CPU 权重折算。这个单位是预算表的一部分，不是随意命名。

---

## 1. 测量方法（可复现）

### 1.1 目的

计划 §1 要求：在 1 / 2 / 3 个并发 project 下各跑 3 次 unit 与 e2e，记录墙钟、峰值 worker 数、负载、红率；用数据找出红率开始上升的峰值 worker 阈值，再据此定预算。

### 1.2 环境与隔离

- 所有测量在同一个 `d8b7f4e6` 上做，三个独立的 `git worktree`（`measure/a`、`measure/b`、`measure/c`），每个 worktree 的 `node_modules` 用 Windows junction 指向基准 checkout。这样每个 "project" 有独立的 cwd、独立的 Vite 缓存和独立的临时目录，但依赖只装一份。
- 每个 worktree 初始都是同一提交；运行前 `git status --porcelain` 为空（测试只写临时目录）。
- 测量期间不跑其他测试；宿主上常驻的 Ultimate host 与文件索引仍存在，因此绝对墙钟包含背景噪声，但 1/2/3 并发之间是同一噪声水平，可横向比较。
- 机器：16 逻辑核，31.5 GB；Windows 11；Node 26.11.1；Vitest 5.0.5；unit 配置 `maxWorkers: 8`（`vite.config.ts:223`），e2e 配置 `maxWorkers: 4`（`test/e2e/vitest.config.ts:10`）。

### 1.3 运行方式

每个 "project" 是一个独立的 `vp test run --reporter=dot` 进程：

```powershell
# 1 个 project
Start-Process node_modules\.bin\vp.cmd -ArgumentList 'test','run','--reporter=dot' -WorkingDirectory measure\a
# 2 个 project：同时启动 a、b；3 个：同时启动 a、b、c
```

- unit 批次跑完整 `test/**/*.test.ts`（191 个文件；`test/e2e` 被 exclude）。
- e2e 批次跑 `--config test/e2e/vitest.config.ts`（36 个文件），每个 project 仍然 `maxWorkers: 4`。
- 每批开始前记录时间；所有子进程退出后记录结束时间，墙钟取 `End - Start`。

### 1.4 采样

每 500 ms 采一次：

1. **每个 root 的进程树**：从 `Start-Process` 返回的 PID 出发，用 `Win32_Process.ParentProcessId` 递归求后代；统计其中 `node.exe` 且命令行含 `--experimental-import-meta-resolve` 的进程数，作为 "worker 数"（Vitest 给 worker 的 `execArgv` 一定包含这个参数，见 `node_modules/vitest/dist/chunks/index.1TqnEahn.js:6199-6202`）。
2. **系统负载**：`Win32_PerfFormattedData_PerfOS_System.ProcessorQueueLength`（Windows 上没有 `/proc/loadavg`，这是计划允许的替代）与 `Win32_PerfFormattedData_PerfOS_Processor` 的 `_Total.PercentProcessorTime`。每批记录最大值与平均值。
3. **红率**：从 Vitest 的 stdout/stderr 解析 `Test Files X failed | Y passed (Z)`、`Tests ...` 与 `FAIL test/xxx.test.ts`。`FailedFiles` 用唯一文件名集合。

> 采样器本身每 500 ms 枚举一次进程表，对 16 核机器的干扰小于一个 worker 的百分之几；所有批次同样采样，横向可比。

### 1.5 基线说明（重要）

这台 Windows + Node 26 checkout 上，完整 unit 套件在**空载**时也有 **20 个文件 / 79 个测试**失败（`node26-verification` 记忆记录：Node 24 与 Node 26 下都是 20/183 文件）。失败集中在 Windows 路径语义（`attachments` 期望 `/`）、`bash` 工具在 Windows 上不存在（`codemode` 期望 `bash`）等，与负载无关。因此：

- 绝对红率会包含这 20 个基线失败；
- **本调研同时报告 "额外红文件"（相对空载基线的新增文件）**，阈值判断以额外红率为准；
- 这也是为什么验收线必须是 "有预算时与独占时持平"，而不是 "全绿"。

### 1.6 数据文件

原始结果保存在 `.measure/results/`（实验脚手架，提交前删除/不纳入 diff）；每个批次一个 JSON 和两个日志。`run-batch.ps1` 与 `run-unit-matrix.ps1` 是本文所述方法的实现，放在 `.measure/` 下，明确标记为**实验脚手架**。

---

## 2. 测量数据

### 2.1 Unit：完整套件（191 文件）

> `peak workers` 是每个 project 的峰值；`total peak` 是同一批次各 project 之和。`queue` 是系统 Processor Queue Length 的最大值/平均值；`cpu` 是系统总 CPU 百分比的最大值/平均值。

| 批次       | 并发 project | 每 project 配置 | 墙钟 (s) | peak workers / project | total peak | queue max/avg | cpu max/avg |     失败文件 |        失败测试 | 额外红文件 vs 空载 |
| ---------- | -----------: | --------------: | -------: | ---------------------: | ---------: | ------------: | ----------: | -----------: | --------------: | -----------------: |
| unit-n1-r1 |            1 |               8 |    423.1 |                      8 |          8 |      36 / 3.5 |   88 / 62.5 |           21 |              81 |                 +1 |
| unit-n2-r1 |            2 |               8 |    587.3 |                  8 / 8 |         16 |     69 / 24.8 |   90 / 74.2 |      27 / 27 |       106 / 106 |                 +7 |
| unit-n3-r1 |            3 |               8 |    719.7 |      8 / 8 / 8（配置） |         24 |     83 / 34.1 |   91 / 76.4 | 41 / 41 / 42 | 142 / 143 / 150 |    +21 / +21 / +22 |
| unit-n1-r2 |            1 |               8 |    352.6 |                      8 |          8 |      31 / 3.9 |   87 / 73.4 |           20 |              79 |                  0 |
| unit-n2-r2 |            2 |               8 |    573.9 |                  8 / 8 |         16 |     84 / 20.7 |   89 / 74.2 |      27 / 27 |       109 / 108 |                 +7 |
| unit-n3-r2 |            3 |               8 |    727.1 |      8 / 8 / 8（配置） |         24 |    111 / 37.4 |   93 / 72.6 | 41 / 41 / 42 | 143 / 144 / 148 |    +21 / +21 / +22 |
| unit-n1-r3 |            1 |               8 |    340.4 |                      8 |          8 |      26 / 2.4 |   87 / 70.2 |           21 |              79 |                 +1 |
| unit-n2-r3 |            2 |               8 |    578.9 |          8 / 8（配置） |         16 |     59 / 22.5 |   91 / 74.4 |      28 / 26 |       111 / 107 |            +6 / +8 |
| unit-n3-r3 |            3 |               8 |    692.8 |      8 / 8 / 8（配置） |         24 |     99 / 35.0 |   90 / 75.0 | 38 / 39 / 38 | 134 / 135 / 137 |    +18 / +19 / +18 |

空载基线（主 worktree、同一提交、`vp test run` 一次）：**375.2 s；20 失败文件 / 79 失败测试**。

三次重复的均值（同一并发级别的三个 root 先按 run 平均）：

| 并发 | 总峰值 worker | 平均墙钟 (s) | 平均失败文件 | 平均失败测试 | 额外红文件 vs 空载 |
| ---: | ------------: | -----------: | -----------: | -----------: | -----------------: |
|    1 |             8 |        372.0 |         20.7 |         79.7 |               +0.7 |
|    2 |            16 |        580.0 |         27.3 |        107.8 |               +7.3 |
|    3 |            24 |        713.2 |         40.3 |        141.8 |              +20.3 |

换算成红率（失败文件 / 191；失败测试 / 1324）：1 project = 10.8% 文件 / 6.0% 测试；2 project = 14.3% / 8.1%；3 project = 21.1% / 10.7%。空载基线是 10.5% / 6.0%。**红率的拐点在 8 → 16 worker 之间，16 已经比基线高 3.8 个百分点（文件）和 2.1 个百分点（测试）。**

### 2.2 E2E：完整套件（36 文件）

| 批次      | 并发 project | 每 project 配置 | 墙钟 (s) |              peak workers / project | total peak | queue max/avg | cpu max/avg |     失败文件 |        失败测试 |  额外红文件 vs 空载 |
| --------- | -----------: | --------------: | -------: | ----------------------------------: | ---------: | ------------: | ----------: | -----------: | --------------: | ------------------: |
| e2e-n1-r1 |            1 |               4 |    526.5 |                                   4 |          4 |      54 / 2.2 |   88 / 42.3 |           20 |             107 |           0（基线） |
| e2e-n2-r1 |            2 |               4 |    640.6 |                       4 / 4（配置） |          8 |    104 / 11.0 |   89 / 70.3 |      21 / 22 |       109 / 110 |             +1 / +2 |
| e2e-n3-r1 |            3 |               4 |    829.2 |                   4 / 4 / 4（配置） |         12 |    132 / 32.1 |   98 / 83.1 | 22 / 22 / 22 | 146 / 152 / 151 |        +2 / +2 / +2 |
| e2e-n1-r2 |            1 |               4 |    539.2 |                                   4 |          4 |      69 / 4.1 |   89 / 56.5 |           19 |             105 |                  -1 |
| e2e-n2-r2 |            2 |               4 |    655.8 |                       4 / 4（配置） |          8 |    103 / 16.2 |   94 / 76.6 |      20 / 20 |       104 / 104 |         +0.5 / +0.5 |
| e2e-n3-r2 |            3 |               4 |   1041.6 |                   4 / 4 / 4（配置） |         12 |    138 / 47.7 |   95 / 85.9 | 30 / 26 / 29 | 170 / 170 / 168 | +10.5 / +6.5 / +9.5 |
| e2e-n1-r3 |            1 |               4 |    767.9 | 4（配置；采样到 5 为 PID 复用伪影） |          4 |     77 / 15.2 |   94 / 75.4 |           20 |             102 |                +0.5 |
| e2e-n2-r3 |            2 |               4 |   1031.1 |                       4 / 4（配置） |          8 |    141 / 40.2 |   93 / 84.5 |      24 / 24 |       161 / 161 |         +4.5 / +4.5 |
| e2e-n3-r3 |            3 |               4 |   1195.1 |                   4 / 4 / 4（配置） |         12 |    145 / 52.3 |   96 / 84.9 | 27 / 27 / 27 | 174 / 175 / 170 |  +7.5 / +7.5 / +7.5 |

E2E 每个 worker 还会 spawn 服务器/preview 子进程，因此 4 个 e2e worker 的 CPU/进程占用显著高于 4 个 unit worker；预算必须对 e2e 使用权重（见 §6）。

E2E 的读数与 unit 不同：基线本身已有约 20/36 个文件失败（Windows 环境），同一配置三次重复的墙钟波动很大（n1: 526–768 s；n2: 641–1031 s；n3: 829–1195 s），所以 e2e 的细粒度阈值不可靠。可确定的是：4 个 e2e worker（1 project）稳定在 19–20 个红文件；8 个（2 project）最坏一次升到 24；12 个（3 project）升到 22–30、失败测试 146–175（基线 102–107）。这支持 e2e worker 权重 2、总预算 8 时最多 4 个 e2e worker 的保守设定。

| 并发 | 总 e2e worker | 平均墙钟 (s) | 平均失败文件 | 平均失败测试 |
| ---: | ------------: | -----------: | -----------: | -----------: |
|    1 |             4 |          611 |         19.7 |        104.7 |
|    2 |             8 |          776 |         21.8 |        124.8 |
|    3 |            12 |         1022 |         25.8 |        164.0 |

### 2.3 预算验证批次（实测受宿主负载污染，未作为阈值证据）

| 批次          | 并发 | 每 project `--maxWorkers` | 总授权 |   墙钟 | 失败文件 |  失败测试 | 备注                                                                                                                                                                    |
| ------------- | ---: | ------------------------: | -----: | -----: | -------: | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit-n2-b8-r1 |    2 |                         4 |      8 | 1256.0 |  33 / 32 | 123 / 129 | 同期宿主有 `ego` / `quark` / `Taskmgr` 等外部 CPU 消耗；88 个 `Test timed out`，CPU 平均 78.9%，队列平均 24.1；与 16-worker 的 574 s、27 红差异不能归因于预算，**作废** |
| unit-n2-b12   |    2 |                         6 |     12 |      — |        — |         — | 未执行（时间盒）                                                                                                                                                        |
| unit-n3-b9    |    3 |                         3 |      9 |      — |        — |         — | 已取消（同一污染窗口）                                                                                                                                                  |

> 结论：预算 8 的数来自 §2.1 的 1/2/3 × 8 主矩阵（同一时段、可重复），不是来自这次受污染的 b8 验证。b8 的正确复跑应在宿主空闲时做，验收线见 §8.5。

### 2.4 阈值与预算推导

实测趋势（第一轮）：

- **1 个 project × 8 worker（总计 8）**：冷启动 r1 为 423 s、21 个红文件（多出的 `lineage-memory.test.ts` 是冷缓存下的 30 s timeout）；热启动 r2 为 **352.6 s、20 个红文件 / 79 个失败测试，与空载基线完全一致**；r3 为 340.4 s、21 个红文件（多出的 `automations.test.ts` 是一个无失败测试的 unhandled error，不是负载 timeout）。**8 个 worker 是安全的**；r1/r3 的 ±1 是冷缓存/偶发噪声，不是预算问题。
- **2 个 project × 8 worker（总计 16）**：墙钟 587 s（+39%）；两个 project 各自从 21 个红文件涨到 27 个（额外的 `extension-styles`、`lineage-abstracts`、`lineage`、`onboarding-flow`、`projects`、`side-chat` 等 timeout 型失败）；失败测试从 81 涨到 106。**红率在 8 → 16 之间明显抬头。**
- **3 个 project × 8 worker（总计 24）**：r1 为 719.7 s，r2 为 727.1 s；三个 root 分别有 41 / 41 / 42 个失败文件（空载 20），143–150 个失败测试；60 个测试被跳过（部分文件在超时/资源错误下没有执行）。**红率从 16 worker 起已明显上升，24 worker 时是灾难性的。**

因此：

1. 红率开始上升的峰值区间是 **(8, 16]**，取保守下沿 **8** 作为总预算：8 个 worker 的热启动红率与空载完全一致（20/79），16 个时已 +7 文件 / +27 测试，24 个时 +21 文件以上。
2. 预算 8 的含义不是 "每个 project 8"，而是 **所有 project 加起来 8 个 worker-equivalent**。单 project 独占时正好可以用满 8（不劣化现有单跑墙钟）；两个 project 并发时是 4+4；三个时 3+3+2（或按优先级分配）。
3. 预算验证批次没有形成有效数据（§2.3：宿主外部负载污染，b8 出现 88 个 timeout），因此 **12 只能作为后续在空闲窗口复跑后的候选**；在此之前规格按 8 写死。
4. 为什么不是按默认 `maxWorkers` 的 8 拍脑袋：8 是单 project 配置，不是全局预算；本文的数据说明 16 已经开始红，8 是唯一有实测支撑的安全下沿。

### 2.5 测量有效性威胁

- **冷缓存**：每个 worktree 的第一次运行包含 Vite 依赖预构建与 transform 冷启动；同一 worktree 的后续重复会更快。表中 r1 是冷启动，r2/r3 是同 worktree 热启动，比较时以 r2/r3 的稳态为准，r1 只用于红率（红率不受缓存影响）。
- **背景噪声**：宿主常驻 host、文件监听、Windows Defender、以及用户同时运行的 `ego` / `quark` / `Taskmgr` 等应用会带来 ±10–15% 墙钟波动；本文所有批次同一环境，绝对值不应当作基准线，趋势与红率是结论依据。e2e 的 r2/r3 与 b8 验证批次明显落在高噪声窗口（CPU 平均 79–86%、墙钟比前一轮高 2–3 倍），因此这些批次只作现象记录，不进入阈值推断。
- **峰值采样**：500 ms 采样可能漏掉短于 500 ms 的尖峰；worker 启动后至少存活数秒，漏计概率低。`peak node` 会包含 `spawn-helper` 等子进程（8 worker 时 19 个 node 进程），说明 "worker 数" 不是全部进程数；预算按 worker-equivalent 计，OS 兜底按进程树计。并发批次中单 root 的 `PeakWorkers` 会被 Windows PID 复用污染（一个 run 结束后其孤儿 worker 的旧 ParentProcessId 可能被后启动的 `cmd.exe` 复用），因此**以批次总峰值 24（3×8）和配置值 8/root 为准**；n3 JSON 里 c=24 是采样伪影，不是 c 一个 root 开了 24 个 worker。
- **基线失败**：20 个空载失败文件是环境性的，不是本调研引入。额外红文件是相对同一空载基线的差集；`failed files` 列表见各批次 `.log.err`。
- **e2e 权重**：unit 8 worker 的峰值是 19 个 node 进程；e2e 4 worker 的峰值是 16 个 node 进程，e2e 8 worker（2 project）是 24 个；e2e 8 worker 时 CPU 平均 70.3%，与 unit 16 worker 的 74.2% 接近。因此 **1 个 e2e worker ≈ 2 个 unit worker-equivalent**，§6 的预算权重来自这组实测，不是拍脑袋。

---

## 3. Q1：Vitest 的 worker 能否跨进程共享

### 3.1 默认 pool 与 worker 的创建者

- 默认 pool 是 **`forks`**：`resolveTestConfig` 在未指定时设置 `resolved.pool ??= "forks"`（`node_modules/vitest/dist/chunks/index.1TqnEahn.js:8802`）。CLI 帮助也写 `default: forks`（`node_modules/vitest/dist/chunks/cac.CLrZKo1g.js:928`）。本机实测：worker 的 `isMainThread === true`、PID 与父进程不同，确认是 fork 而非 thread。
- `ForksPoolWorker.start()` 调用 `fork(this.entrypoint, [], {...})`（`index.1TqnEahn.js:5479-5484`）。`entrypoint` 是 `dist/workers/forks.js`（`:5465`）。所以 **worker 是启动它的 Vitest 进程的子进程**，父子关系由 `child_process.fork` 的 IPC 通道绑定。
- `ThreadsPoolWorker` 走 `new Worker(...)`（`:5585-5590`），同理是当前进程的 worker thread。`Pool` 按 task 的 `worker` 字段选择 `forks` / `vmForks` / `threads` / `vmThreads` / `typescript`（`:5992-5996`）。

### 3.2 一个 worker 能否服务第二个 run

- `Pool` 的 `queue` 和 `activeTasks` 都是实例字段（`index.1TqnEahn.js:5853-5855`），`run()` 只是把 task 推进这个内存队列（`:5866-5878`）。没有跨进程队列，也没有 "把 worker 注册到全局" 的接口。
- 默认 `isolate: true` 时，一个 worker 只服务一个测试文件；任务完成后 `runner.stop()` 结束 worker（`:5932-5941`：只有 `task.isolate === false` 且配置相等时才把 runner 放入 `sharedRunners` 复用；否则 `exitPromises.push(runner.stop(...))`）。`ForksPoolWorker.stop()` 直接 `fork.kill()`，500 ms 后 `SIGKILL`（`:5497-5524`）。
- `Pool.close()` 调用 `cancel()`，`cancel()` 拒绝队列、停止所有 active task 与 shared runner（`:5971-5973`、`:5950-5969`）。
- **同一个 Vitest 实例的 watch 模式可以复用 pool 跑第二次 run**：`this.pool` 在实例上懒创建（`cli-api.De07GUeT.js:12863`），watch rerun 继续用同一个 pool（`:12863-12871`）。但这是 "同一个进程的第二次 run"，不是 "另一个进程的 run"。**跨进程共享 worker：没有。**

### 3.3 `--maxWorkers` 到底在哪生效

- CLI 定义：`--maxWorkers <workers>`，"Maximum number or percentage of workers to run tests in"（`cac.CLrZKo1g.js:942-945`）。
- 解析：`resolved.maxWorkers = resolved.maxWorkers ? resolveMaxWorkers(...) : getDefaultMaxWorkers(...)`（`index.1TqnEahn.js:8849`）；百分比按 `availableParallelism()` 计算（`:1626-1633`）；默认 run 模式是 `cores - 1`（`:1622-1624`，本机为 15，但项目配置写死 8）。
- 生效点：`Pool.setMaxWorkers()` 设置 `this.maxWorkers` 与 `workerIds` 映射（`:5862-5865`），`Pool.schedule()` 的第一行是 `if (this.queue.length === 0 || this.activeTasks.length >= this.maxWorkers) return;`（`:5881`）。`activeTasks` 每项对应一个正在执行的 runner；默认 isolate 下就是一个 worker。因此它**限制的是池里同时活跃的 worker 数，不只是调度器的排队数**。
- `VITEST_MAX_WORKERS` 环境变量会在配置解析后覆盖 `maxWorkers`（`:9008-9011`），可作为宿主级的保守默认值。

### 3.4 关键发现：一个进程可以跑多个 project root，而且共享一个池

官方文档明确："Vitest provides a way to define multiple project configurations within a single Vitest process"（[vitest.dev/guide/projects](https://vitest.dev/guide/projects)）。源码层面：

1. `createPool(ctx)` 只创建一个 `Pool`（`index.1TqnEahn.js:6065-6071`）；`executeTests` 里所有 task group 都调用同一个 `pool.run(task, method)`（`:6162-6167`）。
2. `groupSpecs()` 按 `spec.project.config.sequence.groupOrder` 分组（`:6273`）；每个 group 只有一个 `maxWorkers` 值（`:6277-6281`）；同一 groupOrder 下不同 project 的 `maxWorkers` 不一致会直接报错（`:6282-6285`）。默认 `sequence.groupOrder ??= 0`（`:9090`），所以多个 project 默认在同一个 group、共享同一个 `maxWorkers`。
3. `--maxWorkers` 在 `PROJECT_CLI_OVERRIDES` 列表中（`:6847`），会覆盖每个 project 的配置，因此不会触发上面的 "different maxWorkers" 错误。
4. 每个 project 可以用 inline 的 `test.root` / `root` 指定自己的目录（`:7021-7023`）；文件/目录型 project 也支持（`:7044-7054`）。

**结论：** "8 个 worker 被所有 project 进程共享" 的字面版本不存在；但 "一个 Vitest 进程里，多个 project root 共享一个 8-worker 池" 是原生存在的。这是 B 路线（中央执行器）比计划预期便宜的关键。

### 3.5 实测探针：两个 root、一个进程、一个池

实验（`.measure/projects`，8 个各 sleep 1.5 s 的测试文件，p1/p2 各 4 个）：

- 配置：`projects: [{ test: { name:'p1', root:'./.measure/projects/p1', maxWorkers:4 } }, { test: { name:'p2', root:'./.measure/projects/p2', maxWorkers:4 } }]`；两个 project 都是默认 `groupOrder: 0`。
- 运行 `vitest run --config .measure/projects/vitest.config.ts`（不传 `--maxWorkers`）：**一个 Vitest 主进程**，8 个测试全部通过，峰值 worker = **4**（不是 4+4=8）——证明两个 project 共用同一个 `maxWorkers: 4` 池。
- 运行 `... --maxWorkers 2`：峰值 worker = **2**，8 个测试仍全部通过——证明 `--maxWorkers` 对整个多 project 池生效，而不是只限制调度器。
- 对照：如果把两个 project 的 `maxWorkers` 改成 4 和 2 且保持 `groupOrder: 0`，Vitest 会抛出 "Projects ... have different 'maxWorkers' but same 'sequence.groupOrder'"（源码 `:6282-6285`）；这正是为什么预算必须通过 CLI/env 统一注入，而不是让每个 project 自己写一个数。

> 注：探针只验证机制，不代表产品应该把不同 project 塞进一个进程；生产建议见 §4 与 §9。

### 3.6 Q1 的完整回答

| 问法                                              | 答案                                                                                                                                         | 证据                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 8 个 worker 能否被所有 project **进程**字面共享？ | **不能**。worker 是某个 Vitest `Pool` 的 fork/thread，IPC 绑定父进程；`Pool` 队列在内存；`stop()` 杀死 worker；没有跨进程注册/租借接口。     | `index.1TqnEahn.js:5479-5484`、`:5853-5878`、`:5932-5941`、`:5971-5973`                                       |
| 一个 worker 能否服务第二个 Vitest run？           | 同一进程的 watch rerun 可以复用同一 pool；跨进程/跨 run 不行。                                                                               | `cli-api.De07GUeT.js:12863-12871`                                                                             |
| `--maxWorkers` 是否只限制调度器？                 | 不是。它限制池内同时活跃的 runner（默认 isolate = 1 worker/runner），worker 数峰值 ≤ `maxWorkers`。                                          | `index.1TqnEahn.js:5881`、`:5862-5865`                                                                        |
| 一个进程能否跑多个 project root？                 | **能**，`test.projects` / `workspace` 功能；一个 `Pool`、一个 `maxWorkers`。                                                                 | `index.1TqnEahn.js:6065-6071`、`:6162-6167`、`:6277-6285`、`:9090`；[文档](https://vitest.dev/guide/projects) |
| 等价目标是什么？                                  | 两条：① 同进程多 root 共享一个池（真·全局池，但要求同版本/同执行器）；② 跨进程租约预算，Σ `maxWorkers` ≤ 全局预算（每个 run 仍有自己的池）。 | §4、§8                                                                                                        |

---

## 4. 三条路线评分

评分 1–5，5 最好。权重按本项目的实际约束：可行性、隔离性、失败面、改动量、可观测性各 20%。

### A. 租约式预算（semaphore）

**机制**：每个 run 先向全局账本申请 N 个 slot；拿到租约后以 `--maxWorkers N`（或 `VITEST_MAX_WORKERS=N`）启动；进程退出/心跳过期后归还。每个 run 保留自己的 Vitest 进程池，隔离性不变。

| 维度     |      分数 | 理由                                                                                                                                      |
| -------- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 可行性   |         5 | `--maxWorkers` 已实测能封顶池（§3.5）；SQLite `BEGIN EXCLUSIVE` + pid/start-time 身份在 `server/lock.ts` 已有现成模式；不需要新守护进程。 |
| 隔离性   |         5 | 每个 run 仍是独立进程、独立 cwd、独立 Vite 缓存；不共享运行时。                                                                           |
| 失败面   |         3 | 需要所有入口走账本；租约持有者崩溃会占用额度直到 TTL 过期（设计成 15–30 s）；账本 DB 本身是单点，但 SQLite 损坏面小于一个 daemon。        |
| 改动量   |         3 | 新账本模块 + schema + 所有入口接入（lander、agent test、dream、preview）；估计 1.5–2.5k LOC + 测试。                                      |
| 可观测性 |         4 | 租约是行，`resources` 面板可直接列出 holder/queue/剩余；需要额外采集心跳与进程树。                                                        |
| **合计** | **20/25** |                                                                                                                                           |

### B. 中央执行器

**机制**：一个常驻进程代所有 project 跑测试；一个 Vitest 进程/一个 pool。若用 `test.projects`，可以一个进程加载多个 root，且一个 `maxWorkers` 覆盖全部。

| 维度     |      分数 | 理由                                                                                                                                                                              |
| -------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 可行性   |         3 | 同版本、同 checkout 的多个 root：4（`test.projects` 实证）；跨 project（不同分支/依赖/Vitest 版本）：2。需要一个新服务 + IPC + 鉴权/配额。                                        |
| 隔离性   |         2 | 所有 project 共享一个进程；一个 project 的 OOM/坏插件/未捕获异常会杀死所有；`test.projects` 的 inline project 还可能共享 Vite server（源码 `:6985-7010` 的 shared server 逻辑）。 |
| 失败面   |         2 | 单点故障；升级/重启会中断所有在跑测试；结果归属、cwd、stdout 多路复用都要自己做。                                                                                                 |
| 改动量   |         2 | 新常驻服务、协议、客户端、结果回传、UI；最大。                                                                                                                                    |
| 可观测性 |         3 | 集中视图容易，但 "哪个 project/会话/check 的哪个结果" 需要额外归属层。                                                                                                            |
| **合计** | **12/25** | 技术上可行，但不值得作为全局架构；只适合作为 A 下的 "批处理模式"（见 §9）。                                                                                                       |

### C. OS 级限制

**机制**：Windows Job Object（`lib/windows-process-group.ts` 已有）扩展 CPU rate control；Linux cgroup v2 `cpu.max` / systemd `CPUQuota`；macOS 无等价硬限额。

| 维度     |      分数 | 理由                                                                                                                                                      |
| -------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 可行性   |         3 | Windows Job Object 有 `JOBOBJECT_CPU_RATE_CONTROL_INFORMATION`（hard cap/weight）；但 Node 侧要新增 P/Invoke；Linux 要 cgroup v2 + 权限；macOS 基本没有。 |
| 隔离性   |         5 | 内核强制，进程树内所有后代都受控，最彻底。                                                                                                                |
| 失败面   |         4 | 不会因应用层 bug 失效；但配置错误会全机变慢；不能区分优先级，只能 weight 近似。                                                                           |
| 改动量   |         3 | 扩展 `windows-process-group.ts` + Linux helper + 跨平台测试；中等。                                                                                       |
| 可观测性 |         2 | 只能看 CPU 时间/配额，不能回答 "谁占了几个 worker、谁在排队、谁是 landing"。                                                                              |
| **合计** | **17/25** | 适合做最后防线，不能做主预算。                                                                                                                            |

### 4.1 评分结论

**A 是唯一同时满足 "跨 project 进程" 与 "保留隔离" 的路线。** B 的 12/25 不是技术不可行，而是产品代价：它会引入一个常驻单点，并把 "每个 project 自己的 host" 这个已经成立的隔离边界破坏掉（`10-multi-project-workspace-design.md` 的 H2 明确反对共享进程）。C 只能兜底，不能表达优先级与队列。

---

## 5. 开源项目调研

> 以下每个条目都区分 **adopt（采用设计/依赖）**、**adapt（改造后借用）**、**reject（拒绝并说明原因）**。许可证用 GitHub API / npm registry 核对于 2026-11-06。

### 5.1 Bazel resource sets — **adopt（设计）**

- **问题**：本地构建/测试的 action 资源需求不同；只限 `--jobs` 会让 CPU-bound 与 memory-bound action 互相挤压，导致超时。
- **机制**：action 通过 `resource_set` 回调声明 `{cpu, memory (MB), local_test}`；Bazel 的本地调度器只在 "所有运行中 action 的声明总和 ≤ `--local_resources`" 时启动下一个 action。默认 `HOST_CPUS`、`HOST_RAM*.67`；`--local_resources=cpu=...` 可显式设预算。Bazel 9.2+ 还让 `exec_properties` 的 `resources:cpu` / `resources:memory` 进入本地调度（[actions 文档](https://bazel.build/rules/lib/builtins/actions)、[Bazel 9.2 PR](https://github.com/bazelbuild/bazel/pull/29284)）。
- **许可证**：Apache-2.0（[bazelbuild/bazel](https://github.com/bazelbuild/bazel)）。
- **值得抄**：预算不是 "最大并发数"，而是**每种资源一个总量，action 声明需求量，调度器做准入**。我们的租约应该按 `{cpu, heavy, disk, model}` 四维声明，而不是只发一个 worker 数。
- **不适用**：Bazel 的调度器在一个 server 进程里，能看到所有 action；我们的 project 是独立进程，必须把这份 "看到全部" 的能力外置成账本。Bazel 的估计是静态声明，测试 run 事先不知道会用多少内存；而且声明错了 Bazel 也不会在运行时纠正——我们同样不能让租约变成 "声明即真相"，必须用进程树/worker 数做审计。

### 5.2 Gradle Worker API / `org.gradle.workers.max` — **adapt**

- **问题**：一个 build 里的编译、测试、代码生成都想并发，但 JVM/CPU 有限。
- **机制**：`WorkerExecutor` 提交 work；`org.gradle.workers.max` 是**daemon/build 级**的最大 worker 数，默认 CPU 数；`--max-workers` 可覆盖；worker 可以是线程、进程或隔离 classloader（[Gradle Build Environment](https://docs.gradle.org/current/userguide/build_environment.html)、[Worker API](https://docs.gradle.org/current/userguide/worker_api.html)）。
- **许可证**：Apache-2.0。
- **值得抄**：**一个 daemon 一个计数器，所有 task 共享**，不是每个 task 自己设一个上限。这正是我们需要的 "全局 budget" 而不是 "每个 project 的 maxWorkers"。
- **不适用**：Gradle 的 daemon 只服务一个 build invocation；我们的多个 host 进程是长期独立的，不能靠 "一个 build 的 daemon" 统一。Gradle 的 worker 预算也不跨 build/跨用户。

### 5.3 Nx task orchestration — **adapt**

- **问题**：monorepo 里多个 project 的 target 有依赖关系，要并行又不能超过机器。
- **机制**：`nx.json` 的 `parallel`（历史上默认 3）或 `--parallel=N|N%` 是 workspace 级上限；task graph 决定可并行的 target；Nx Cloud DTE 把 task 动态打包到多台 agent，支持 `dte.scheduling-constraints` 约束端口等共享资源（[Nx parallelization](https://nx.dev/docs/concepts/ci-concepts/parallelization-distribution)、[Run Tasks in Parallel](https://nx.dev/docs/kb/run-tasks-in-parallel)）。
- **许可证**：MIT。
- **值得抄**：**一个 workspace 一个 `parallel`**，并且把 "资源约束" 做成命名约束（端口、机器标签）而不是只数 task。我们的预算也需要 "named resource" 概念（`disk`、`model`、`port` 以后可扩展）。
- **不适用**：Nx 自己 spawn 每个 task，所以它天然知道 task 何时开始/结束；我们的 project host 不被任何 orchestrator spawn。Nx 的 `parallel` 数的是 **task 数**，一个 task 内部仍可再开 8 个 vitest worker——如果我们照搬 Nx 的 parallel，仍然挡不住 8×N。必须把 "task 并发" 与 "worker 并发" 分开建模。

### 5.4 Turborepo `--concurrency` — **adapt**

- **问题**：JS monorepo 的 task graph 并行，限制同时跑的任务数。
- **机制**：`turbo run --concurrency=N|N%`（默认 10；百分比按逻辑核）；`turbo.json` 的 `concurrency` 可固化；task graph 保证依赖（[Turborepo run](https://turborepo.dev/docs/reference/run)、[配置](https://turborepo.dev/docs/reference/configuration)）。
- **许可证**：MIT。
- **值得抄**：**百分比语法**（`50%`）比写死数字更适合不同机器；我们的预算配置也应允许 `cpu: "50%"` 并在启动时解析为绝对值。
- **不适用**：和 Nx 相同：数 task 不数 worker；只在一次 `turbo` 调用内有效；没有租约/恢复。

### 5.5 BullMQ stalled jobs / locks — **adopt（设计），不依赖**

- **问题**：分布式 job 队列里 worker 可能崩溃、卡死或事件循环阻塞，job 不能永远停在 active。
- **机制**：worker 取 job 时在 Redis 上拿锁（`lockDuration` 默认 30 s，`lockRenewTime` 默认一半时长续租）；`stalledInterval`（默认 30 s）扫描锁已过期的 active job，将其移回 waiting；`maxStalledCount` 限制重复；锁 token 保证只有持有者能续/完成（[BullMQ Stalled Jobs](https://docs.bullmq.io/guide/workers/stalled-jobs)、[Concurrency](https://docs.bullmq.io/guide/workers/concurrency)）。
- **许可证**：MIT。
- **值得抄**：**token + heartbeat + TTL + 独立 stalled 扫描 + 幂等重试**，这是 §4 恢复状态机的直接模板。特别是 "worker 自己发现续租失败就要停止工作"（`onCompromised` 语义），避免一个已经失去租约的进程继续跑测试。
- **不适用**：BullMQ 需要 Redis；它的语义是 at-least-once，job 会被**重新执行**。我们的测试 run 不应被另一个进程重跑（重复 CPU 与副作用），我们要的是**回收额度**，不是重新执行任务。因此只借状态机，不依赖 BullMQ；账本用本地 SQLite 足够。

### 5.6 Celery — **adapt（只借 ack/visibility 语义）**

- **问题**：分布式任务队列的 worker 并发、消息丢失与重投。
- **机制**：prefork pool 的 `concurrency`；`task_acks_late` 让任务执行完才 ack；Redis transport 的 `visibility_timeout`（默认 1 小时）在超时后重投；`worker_prefetch_multiplier` 控制预取（[Celery workers](https://docs.celeryq.dev/en/stable/userguide/workers.html)、[Redis visibility](https://docs.celeryq.dev/en/latest/getting-started/backends-and-brokers/redis.html)、[配置](https://docs.celeryq.dev/en/latest/userguide/configuration.html)）。
- **许可证**：BSD-3-Clause。
- **值得抄**：**late ack = 租约在任务完成后才释放**；**prefetch = 不要一次预占超过实际能跑的 slot**。我们的 `acquire` 必须一次只申请一个 run 需要的最小额度，不能先占 8 再慢慢用。
- **不适用**：默认 1 小时的 visibility timeout 会让我们整台机器卡一小时；Python + broker 的运维重量完全不合适。只借 "ack 前资源仍属于你" 的语义，TTL 调到 15–30 s。

### 5.7 Temporal — **reject（依赖），adapt（heartbeat/timeout 语义）**

- **问题**：持久化 workflow、activity 的可靠执行与 worker 并发控制。
- **机制**：worker 轮询 task queue；`maxConcurrentActivityTaskExecutions` 限制单个 worker 的并发；activity 通过 `heartbeat_timeout` 检测卡死；server 持久化事件历史，支持重试与恢复（[Temporal WorkerOptions](https://typescript.temporal.io/api/interfaces/worker.WorkerOptions)、[Timeouts](https://docs.temporal.io/evaluate/features/timeouts-and-retries)）。
- **许可证**：MIT（SDK 与 server 均为 MIT）。
- **值得抄**：**heartbeat timeout 是 activity 的一等公民**；worker 侧并发上限与 task queue 分离；不同优先级可以用不同 task queue。
- **不适用**：Temporal 是完整集群（server + 数据库 + worker 部署），为 "本机测试预算" 引入它是用大炮打蚊子；而且它持久化的是 workflow 历史，我们的测试 run 不需要 replay。只借 heartbeat + timeout + 分队列概念。

### 5.8 proper-lockfile — **reject（依赖），adapt（staleness 模型）**

- **问题**：Node 里跨进程/跨机器的文件互斥。
- **机制**：用原子 `mkdir` 拿锁；持有者按 `update` 间隔刷新锁文件 `mtime`；`stale` 阈值后允许抢占；`onCompromised` 在续租失败时抛错；`retries` 支持等待（[proper-lockfile](https://github.com/moxystudio/node-proper-lockfile)）。
- **许可证**：MIT。
- **值得抄**：**mtime 心跳 + stale 阈值 + compromised 自检**；以及 "抢占者可能和原持有者同时认为拿到锁" 的竞态教训（上游 #121 的修复）——我们的账本必须用单事务 compare-and-swap，而不是 "读-判断-写" 三步。
- **不适用**：它是**排他锁**，不是计数信号量；一个锁只能保护一个文件/资源，不能表达 "8 个 slot、每种资源多个单位、排队优先级"。而且它依赖文件系统 mtime，Windows 时钟粒度/网络盘行为都不可靠。我们已经有一个更强的原语：`server/lock.ts` 的 SQLite `BEGIN EXCLUSIVE` + `readOwner` + `identify(pid)`（见 §7.1），不需要再引入 proper-lockfile。

### 5.9 systemd `CPUQuota` / cgroup v2 `cpu.max` / Windows Job Object — **reject（主方案），保留（兜底）**

- **问题**：操作系统级限制一个服务/进程树的 CPU 带宽。
- **机制**：cgroup v2 `cpu.max = $QUOTA $PERIOD`（如 `50000 100000` = 半个 CPU），`cpu.weight` 做相对份额；systemd `CPUQuota=` / `CPUWeight=`（[systemd.resource-control](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)）。Windows Job Object 的 `JOBOBJECT_CPU_RATE_CONTROL_INFORMATION` 支持 hard cap 或 weight（[Microsoft 文档](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_cpu_rate_control_information)）。
- **许可证**：systemd GPL-2.0（内核接口本身不是链接库）；Windows API 是系统 API。
- **值得抄**：**对绕过应用层预算的进程树仍然有效**；可以用 Windows Job Object（项目已有 `lib/windows-process-group.ts` 的 KillOnJobClose 基础）给每个 project 树加 CPU rate cap，作为最后一道闸。
- **不适用**：它只能限 CPU 时间，不能限 worker 数、临时磁盘、模型并发；不能表达 "landing 优先于 dream"（weight 只能近似，不能保证）；cgroup v2 需要 Linux + 权限，macOS 没有等价物；Windows Job Object CPU rate control 需要在现有 C# P/Invoke 里新增结构体与调用，且 hard cap 会让所有进程一起变慢，不适合做精细调度。

### 5.10 Jest `maxWorkers` — **reject（作为方案），确认行业惯例**

- **问题**：测试 runner 的 worker 池大小。
- **机制**：`maxWorkers`（数字或百分比）限制**单次 Jest 调用**的 worker 池；默认 run 模式是 cores−1；`workerIdleMemoryLimit` 回收 worker；`jest-worker` 自己管理子进程池（[Jest 配置](https://jestjs.io/docs/configuration)、[jest-worker](https://github.com/jestjs/jest/tree/main/packages/jest-worker)）。
- **许可证**：MIT。
- **值得抄**：百分比语法、按内存回收 worker。
- **不适用**：和 Vitest 一样，**每个 Jest 进程自己的池**；没有跨进程协调。它恰好证明 "per-run maxWorkers" 是行业默认，不能解决我们的问题。

### 5.11 Playwright `workers` — **reject（作为方案）**

- **问题**：浏览器测试的并行度。
- **机制**：`workers`（数字或百分比）限制单次 Playwright 运行的 worker 进程；`shards` 把测试分到多台机器；worker 进程由 runner 自己 spawn（[Playwright 并行](https://playwright.dev/docs/test-parallel)、[配置](https://playwright.dev/docs/test-configuration)、[分片](https://playwright.dev/docs/test-sharding)）。
- **许可证**：Apache-2.0。
- **值得抄**：**workers（并行度）与 shards（分布式）分开**；百分比配置；"workers 是每台机器上的进程数" 的清晰语义。
- **不适用**：只在单次 run 内有效；没有跨 run 的预算，也没有租约。

### 5.12 调研小结

| 项目                      | 许可证             | 判定                          | 最值得抄的一点                              | 最不适用的一点                        |
| ------------------------- | ------------------ | ----------------------------- | ------------------------------------------- | ------------------------------------- |
| Bazel resource sets       | Apache-2.0         | adopt 设计                    | 按资源种类声明 + 全局准入                   | 调度器在单进程，需外置账本            |
| Gradle Worker API         | Apache-2.0         | adapt                         | daemon 级一个计数器                         | 只服务一个 build                      |
| Nx                        | MIT                | adapt                         | workspace 级 `parallel` + named constraints | 数 task 不数 worker                   |
| Turborepo                 | MIT                | adapt                         | `N%` 并发语法                               | 单次 `turbo` 调用                     |
| BullMQ                    | MIT                | adopt 设计                    | token + heartbeat + stalled 扫描            | 需 Redis，at-least-once 重跑          |
| Celery                    | BSD-3-Clause       | adapt                         | late ack / prefetch                         | 1 h visibility timeout、Python/broker |
| Temporal                  | MIT                | reject 依赖 / adapt heartbeat | heartbeat timeout 一等公民                  | 完整集群，过重                        |
| proper-lockfile           | MIT                | reject 依赖 / adapt 模型      | mtime 心跳 + compromised                    | 排他锁，不是计数信号量                |
| systemd/cgroup/Job Object | GPL-2.0 / 系统 API | reject 主方案 / 兜底          | 内核强制、无法绕过                          | 不能表达优先级/worker 数              |
| Jest                      | MIT                | reject                        | 百分比 maxWorkers                           | 每进程自己的池                        |
| Playwright                | Apache-2.0         | reject                        | workers 与 shards 分离                      | 单次 run                              |

---

## 6. Q2：预算管哪些资源、边界到哪里

### 6.1 资源清单

| 资源                  | 单位                                                                   | 谁持有                         | 何时申请                        | 释放条件                                                |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------ | ------------------------------- | ------------------------------------------------------- |
| **CPU slots**         | worker-equivalent（1 unit worker = 1；e2e worker = 2；构建按实测权重） | 每个测试/构建 run              | 启动 Vitest 前                  | 进程树退出 + 心跳停止；崩溃由 TTL 回收                  |
| **Heavy slots**       | 实例数（1 = 一个 preview host / lander / 子代理进程树）                | preview host、lander、子代理   | 创建实例/启动 lander 前         | 进程退出或被 `stop`；cleanup 完成后                     |
| **Temp disk**         | MB（预留值 + 实际峰值采样）                                            | worktree、preview home、bundle | 创建 worktree/home 前按估算预留 | 目录真正 `rm` 成功之后；`EBUSY` 时保持 `releasing` 重试 |
| **Model concurrency** | 在飞请求数（可按 provider 分组）                                       | 每个 host 的模型调用           | 发起模型请求前                  | 响应/错误/超时/abort 返回                               |

默认预算（16 核 / 31.5 GB 机器）：**CPU 8 worker-equivalent、heavy 4 个进程树、disk 8192 MB、model 6 个在飞请求**。CPU 有本文实测支撑；其余三项是保守初值，Phase 1 用实际占用校准（见 §9.1）。

### 6.2 边界（明确不做）

- **不做 GPU/网络带宽/端口预算**：v1 只做四类；端口冲突用命名约束以后再加（Nx 的 `dte.scheduling-constraints` 是参考）。
- **不做 per-test 内存硬限制**：只采集 RSS 作为告警；真正的内存硬限制交给 OS Job Object/cgroup（C 路线）。原因：测试的峰值内存难以在启动前准确估算，错误预留会让预算长期空转。
- **不把磁盘和 CPU 绑成一个租约**：CPU 随进程退出释放，磁盘必须等 `rm` 完成；两者生命周期不同。租约可以同时申请两类，但释放分开记账。
- **不做跨机器预算**：本机资源管理器只管本机；未来多机可以把 SQLite 换成中心服务，接口不变。

### 6.3 优先级

| 优先级                             | 典型持有者                              | 排队规则                                                  | 抢占                                          |
| ---------------------------------- | --------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| **P0 landing gate**                | lander 的 check                         | 最高优先；可直接插队到队首；队列为空时立即授予            | 可抢占 P2（preemptible）的租约；不抢占 P1     |
| **P1 foreground check**            | 用户会话/agent 的 `pnpm test`、前台构建 | 严格 FIFO（同优先级）；不能插队                           | 不抢占；等待 P0 释放                          |
| **P2 background dream/automation** | dream、定时任务、非紧急索引             | 只用空闲额度；预计等待超过 `maxWaitMs` 直接放弃（不排队） | 可被 P0/P1 抢占；必须设置 `preemptible: true` |

**饥饿保护**：P1 等待超过 `agingMs`（例如 10 分钟）时，下一次 P0 释放后优先满足最早的 P1；P2 不参与 aging，允许长期让路。

**降级**：额度不足时，P1 可以 `wait`（默认），P2 直接 `skip`（返回 `ResourceUnavailable`，不启动测试）；P0 永远 `wait` 并在 60 s 后告警（不能悄悄失败）。

---

## 7. Q3：租约模型与回收状态机

### 7.1 账本：SQLite 文件 + 无守护进程

不新增 daemon。使用一个用户级 SQLite 文件：

```
~/.ultimate/resources/budget.sqlite
```

理由：

- Windows 上 `node:sqlite` 已内建（项目 `server/lock.ts`、`extensions/instance/cleanup.ts` 都在用 `DatabaseSync`）。
- 现有 `acquireLock()` 已经示范了 `BEGIN EXCLUSIVE` + `busy_timeout = 0` + pid sidecar + `identify(pid)` 的组合；租约用同一套原语，不引入新依赖。
- 每个 contender 只做短事务（毫秒级）；读用 WAL/普通 SELECT；写用 `BEGIN IMMEDIATE`（或 `BEGIN EXCLUSIVE`）串行化，避免 "读-判断-写" 竞态。
- 没有常驻进程就没有 "协调者挂了所有 project 都卡住" 的单点；每个 host 自带 reaper 定时器，谁先看到过期谁回收。

表结构（草案）：

```sql
CREATE TABLE leases (
  id            TEXT PRIMARY KEY,          -- UUID/ULID
  token         TEXT NOT NULL,             -- 随机 128-bit，心跳/归还必须匹配
  owner_project TEXT NOT NULL,
  owner_conv    INTEGER,
  owner_pid     INTEGER NOT NULL,
  owner_start   TEXT NOT NULL,             -- identify(pid) 的结果，防 PID 复用
  kind          TEXT NOT NULL,             -- lander | check | dream | preview | model
  priority      INTEGER NOT NULL,          -- 0 landing, 1 foreground, 2 background
  cpu           INTEGER NOT NULL DEFAULT 0,
  heavy         INTEGER NOT NULL DEFAULT 0,
  disk_mb       INTEGER NOT NULL DEFAULT 0,
  model         INTEGER NOT NULL DEFAULT 0,
  state         TEXT NOT NULL,             -- queued | granted | releasing | done | expired | revoked | canceled
  preemptible   INTEGER NOT NULL DEFAULT 0,
  queued_at     INTEGER NOT NULL,
  acquired_at   INTEGER,
  heartbeat_at  INTEGER,
  expires_at    INTEGER,
  note          TEXT
);
CREATE INDEX leases_state_priority ON leases(state, priority, queued_at);
```

### 7.2 令牌

```ts
interface LeaseToken {
  id: string // 租约 id
  token: string // 随机 secret，防止旧进程误释放新租约
  owner: {
    project: string
    conversation?: number
    pid: number
    start: string // identify(pid)，PID 复用检测
  }
  slots: { cpu: number; heavy: number; diskMb: number; model: number }
  priority: 0 | 1 | 2
  acquiredAt: number // epoch ms
  expiresAt: number // epoch ms；heartbeat 刷新
  heartbeatAt: number
}
```

### 7.3 状态与转换

```
                 acquire (capacity available)
   [queued] ───────────────────────────────────▶ [granted]
      │                                             │  │
      │ cancel                                       │  │ release()
      ▼                                             │  ▼
   [canceled]                                       │ [releasing] ── cleanup ok ──▶ [done]
                                                     │      │
                                                     │      └─ cleanup EBUSY ──▶ 保持 releasing，退避重试
                                                     │
                       heartbeat 超时 + pid 已死/身份不符
                                                     ▼
                                                  [expired]

                       higher-priority preempt
                                                     ▼
                                                  [revoked]
```

| 转换                  | 触发                         | 资源处理                                 | 幂等性                                           |
| --------------------- | ---------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `queued → granted`    | 事务内计算 `free >= request` | 预占全部 slot                            | 重复 acquire 返回同一 id（按 `requestKey` 去重） |
| `queued → canceled`   | 调用方取消/超时              | 无需释放                                 | 重复 cancel 成功                                 |
| `granted → releasing` | `release(token)`             | CPU/heavy 立即释放；disk 继续保留        | 重复 release 成功                                |
| `releasing → done`    | cleanup 确认目录已删         | 释放 disk 预留                           | 重复 done 成功                                   |
| `granted → expired`   | reaper 判定                  | 释放全部 slot                            | 重复 expire 成功                                 |
| `granted → revoked`   | 高优先级抢占                 | 先发 SIGTERM，宽限期后 SIGKILL；释放全部 | 重复 revoke 成功                                 |

### 7.4 `acquire` / `heartbeat` / `release` 算法

**acquire（单事务）**

1. 开 `BEGIN IMMEDIATE`。
2. 先 `reapExpired()`（见 §7.5）。
3. 计算 `used = SUM(cpu/heavy/disk/model) WHERE state IN ('granted','releasing')`。
4. 若 `used + request <= budget`：插入 `granted` 行，返回 token；提交。
5. 否则：插入 `queued` 行；提交；等待通知或每 250 ms 轮询（`waitMs` 超时则取消并返回 `ResourceUnavailable`）。
6. 优先级：查询队列时 `ORDER BY priority ASC, queued_at ASC, id ASC`；P0 可越过 P1/P2，P1 严格 FIFO，P2 只在无 P0/P1 等待时授予。

**heartbeat**

- 调用方每 `heartbeatMs = 5 s`（建议）更新 `heartbeat_at = now`、`expires_at = now + ttlMs`；`ttlMs = 30 s`（e2e 可 60 s）。
- 必须带 `id + token + pid + owner_start`；任何一项不匹配返回 `LEASE_LOST`。持有者收到 `LEASE_LOST` 后**必须停止启动新 worker，并在宽限期内终止当前 run**（借鉴 BullMQ `onCompromised`）。
- 心跳本身用 `setInterval` 放在 host/lander 主进程，不放在 worker 里（worker 是 CPU-bound，事件循环可能被测试阻塞）。

**release**

```ts
async function release(id, token) {
  // 单事务
  const lease = SELECT ... WHERE id = ?
  if (!lease) return                   // 幂等
  if (lease.token !== token) throw LEASE_TOKEN_MISMATCH
  if (lease.state === 'done' || lease.state === 'expired' || lease.state === 'revoked') return
  if (lease.disk_mb > 0) {
    UPDATE leases SET state='releasing', cpu=0, heavy=0, model=0 WHERE id=?
    // 提交后做两阶段清理；清理成功再 UPDATE state='done', disk_mb=0
  } else {
    UPDATE leases SET state='done', cpu=0, heavy=0, model=0 WHERE id=?
  }
}
```

### 7.5 崩溃回收：TTL 与 PID 身份必须组合

判定一个 `granted` 租约死亡，必须**同时**满足：

1. `now > expires_at`（心跳已过期，说明持有者至少 `ttlMs` 没有报活）；并且
2. `!alive(lease.owner_pid)` **或** `identify(lease.owner_pid) !== lease.owner_start`（进程已死，或 PID 被复用成另一个进程）。

只满足其中一个都不能回收：

- **只看 PID**：PID 会被复用，旧租约可能把新进程当成持有者，永远不会回收。
- **只看 TTL**：长测试/长构建可能心跳延迟（GC、机器卡顿），会被误杀。

补充 `hardTtlMs`（建议 `3 × ttlMs`）：如果进程仍活着但心跳已超过 `3 × ttlMs`，标记为 `suspect` 并告警；超过 `6 × ttlMs` 才强制回收。这样既不会误杀正常长任务，也不会让一个死循环的持有者永久占住额度。

**强制回收必须先杀进程树，再归还额度**：如果 pid 仍活着且身份匹配，reaper 不能只把租约改成 `expired` 就放额度——那会让仍在跑的 8 个 worker 变成预算外的黑户。正确顺序是：`suspect → revoked`，对租约记录的进程组发 `SIGTERM`（Windows 走 Job Object 的 `stop`），宽限 10 s，必要时 `SIGKILL`，确认进程树结束后才释放 slot。只有在 pid 已死或 `identify(pid)` 与 `owner_start` 不符时，才可以直接 `expired` 并释放。

`identify(pid)` 已经在 `lib/process-group.ts` 实现：Windows 用进程创建时间（`identifyWindows`），Linux 用 `/proc/<pid>/stat` 第 22 字段 + boot id，macOS 用 `ps -o lstart=`。`server/lock.ts` 的 `alive(pid)` 是 `process.kill(pid, 0)`。两者组合正好满足计划 §4 的 "pid 存活 + TTL 双条件"。

### 7.6 `EBUSY` 的教训：清理不能对着打开的句柄做

`cleanPreview` 在 `8eb9dce9` 中修复的模式（`extensions/instance/cleanup.ts:11-23`、`:45-75`）：

1. 清理前先读 `ultimate.lock` / `storage.lock` 的 owner；有活进程就直接放弃，不删。
2. 对两个 SQLite 数据库 `BEGIN EXCLUSIVE`，拿不到（`errcode === 5`，SQLITE_BUSY）也放弃。
3. 所有 worktree/branch 清完后，**先 `release()` 关闭数据库句柄**，再检查一次 live owner，最后才 `rm(home)`。
4. `rm` 失败（Windows EBUSY/EPERM）时不假装成功；保持 `releasing` 状态，退避重试，下一次 sweep 继续。

租约规格必须继承这四点：

- **CPU 与磁盘分开释放**：CPU 可以随进程退出立即归还；磁盘要等 `releasing → done` 的清理确认，不能提前把 `disk_mb` 还给池子，否则下一个 run 会在没删干净时又预留同一块磁盘。
- **清理任务本身持有租约的 `releasing` 状态**，不能被 reaper 当成死租约回收。
- **不要用 `rm -rf` 作为 "释放" 的同义词**：`rm` 成功才算释放；失败就保持占用并记录 `cleanupError`。
- **close before unlink**：SQLite 连接先 close，再删数据库文件；Windows 不允许删除打开的文件（这正是 `cleanPreview` 的根因）。

### 7.7 可观测性

`resources status`（CLI/面板）至少回答：

```json
{
  "budget": { "cpu": 8, "heavy": 4, "diskMb": 8192, "model": 6 },
  "used": { "cpu": 6, "heavy": 2, "diskMb": 2048, "model": 1 },
  "free": { "cpu": 2, "heavy": 2, "diskMb": 6144, "model": 5 },
  "leases": [
    {
      "id": "...",
      "owner": "project-a#123",
      "kind": "check",
      "priority": 1,
      "slots": { "cpu": 4 },
      "state": "granted",
      "pid": 1234,
      "ageSec": 42,
      "heartbeatAgeSec": 2,
      "expiresInSec": 28
    }
  ],
  "queue": [
    { "id": "...", "owner": "project-b#456", "priority": 0, "slots": { "cpu": 8 }, "waitedSec": 13 }
  ],
  "warnings": ["lease ... suspect: heartbeat 95s old, process alive"]
}
```

每个 host 的 `resources` 页面读同一个 SQLite 文件，不需要 IPC。所有 acquire/release/expire/revoke 都写审计行（`lease_events` 表），支持 "谁在什么时候拿了多少、为什么没拿到"。

---

## 8. 规格：推荐路线（A）的接口与接入

### 8.1 TypeScript 接口（草案）

```ts
export type ResourceKind = 'cpu' | 'heavy' | 'disk' | 'model'
export type Priority = 0 | 1 | 2 // 0 landing, 1 foreground, 2 background

export interface Owner {
  project: string
  conversation?: number
  pid: number
  start: string // identify(pid)
}

export interface ResourceRequest {
  owner: Owner
  kind: 'lander' | 'check' | 'dream' | 'preview' | 'model'
  priority: Priority
  slots: Partial<Record<ResourceKind, number>>
  ttlMs?: number // default 30_000
  waitMs?: number // default: P0 0 (wait forever), P1 300_000, P2 0 (skip)
  preemptible?: boolean // P2 must be true
  requestKey?: string // optional idempotency key
}

export interface Lease {
  id: string
  token: string
  slots: Required<Record<ResourceKind, number>>
  priority: Priority
  acquiredAt: number
  expiresAt: number
}

export interface ResourceLedger {
  acquire(request: ResourceRequest): Promise<Lease>
  heartbeat(lease: Lease): Promise<{ state: 'granted' | 'lost'; expiresAt: number }>
  release(lease: Lease): Promise<void>
  cancel(id: string, token: string): Promise<void>
  status(): Promise<BudgetSnapshot>
}

export interface BudgetSnapshot {
  budget: Record<ResourceKind, number>
  used: Record<ResourceKind, number>
  free: Record<ResourceKind, number>
  leases: LeaseView[]
  queue: QueueView[]
  warnings: string[]
}
```

### 8.2 接入点

| 入口                                    | 接入                                                                                                                                               | 租约参数                              | 失败行为                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------- |
| **lander check**                        | 在启动 check 子进程前 `acquire({kind:'lander', priority:0, slots:{cpu: n}})`；把 `n` 写入 `--maxWorkers` / `VITEST_MAX_WORKERS`；`finally release` | `n = min(8, remaining)`；e2e 用权重 2 | 等待；60 s 未授予则告警但仍排队 |
| **agent `powershell` 里的 `pnpm test`** | 统一走 `ultimate test` 包装器（或注入 `ULTIMATE_LEASE_ID` 环境变量，由 `test/setup.ts` 检查）                                                      | 前台 P1，cpu = 4–8                    | 默认等待；P2 直接 skip          |
| **dream / 自动化**                      | 启动前 `acquire({priority:2, preemptible:true})`；心跳周期内检查 `LEASE_LOST`                                                                      | cpu = 2–4                             | 拿不到就跳过，不排队            |
| **preview host**                        | 创建 home 前申请 `heavy:1 + disk:estimatedMb`；cleanup 时走 `releasing`                                                                            | `estimatedMb` 由模板/上次实测         | 拿不到就拒绝启动 preview        |
| **model 调用**                          | 每个 host 的模型客户端发请求前 `acquire({kind:'model', slots:{model:1}})`；响应/abort 释放                                                         | model 1                               | 拿不到可排队/降级到小模型       |

### 8.3 如何防止绕过（最大风险）

计划已经指出：所有发起方都走同一入口，否则预算形同虚设。具体做四层：

1. **官方入口全部接入**：lander、agent 的测试命令、dream、preview 都通过 `ResourceLedger`。这是主路径。
2. **宿主级默认上限**：每个 host 进程启动测试子进程时默认设置 `VITEST_MAX_WORKERS=<保守值>`（例如 4）。Vitest 在配置解析后读这个变量并覆盖 `maxWorkers`（`index.1TqnEahn.js:9008-9011`），所以即使用户手工 `vp test` 没走账本，也最多 4 个 worker，而不是默认 15。租约运行的子进程则显式设置 `VITEST_MAX_WORKERS=<grant>`（或 `--maxWorkers`）。
3. **进程树审计**：每个 host 每 5 s 统计自己的测试进程树里的 worker 数；若 "无租约且 > 默认上限" 持续 30 s，记录 `unleased-run` 告警并在 `resources` 面板显示；可选地在 lander/CI 环境直接 kill（默认只告警，避免误杀）。
4. **OS 兜底**：C 路线的 Job Object/cgroup CPU cap 作为最后一道闸；即使有人绕过账本，也不能把整机打满。

明确边界：**不可能对拥有管理员权限、刻意绕过的用户做到绝对强制**；目标是 "没有任何正常入口能意外绕过"，并把恶意/手工绕过限制在宿主默认上限内。

### 8.4 `resources` 读接口

- CLI：`ultimate resources status`、`ultimate resources leases`、`ultimate resources queue`。
- 面板：在 host 的 "System" 页显示 budget/used/free、活跃租约、等待队列、suspect 告警。
- 事件：`lease.granted`、`lease.released`、`lease.expired`、`lease.revoked`、`lease.suspect`，写入现有 events 表，可被 trace/日志消费。

### 8.5 验收线（对应计划 §5）

| 指标                | 现状                                     | 验收线                                               |
| ------------------- | ---------------------------------------- | ---------------------------------------------------- |
| 峰值并发 worker     | 无上限（N × 8）                          | ≤ 预算（8）                                          |
| 单 project 独占墙钟 | 340–353 s（r2/r3 稳态）                  | ≤ 431 s（空载 375 s 的 +15%）                        |
| 3 project 并发墙钟  | 713 s（24 worker 无预算，但 +20 红文件） | ≤ 900 s 且额外红文件 0（预算批次需在宿主空闲时复跑） |
| 红率                | 16 worker 时 +7 文件                     | 与独占时持平（额外红文件 = 0）                       |
| 崩溃恢复            | —                                        | ≤ 30 s 额度自动回池，无需重启                        |

---

## 9. 单一建议与成本

### 9.1 建议

**做 A：SQLite 租约账本 + `--maxWorkers`/`VITEST_MAX_WORKERS` 强制；B 只作为 A 下的可选批处理模式，不做常驻中央执行器；C 只做 OS 兜底。**

具体落地顺序：

1. **Phase 1（只读 + 观测）**：建 `budget.sqlite`、`leases`/`lease_events` 表；实现 `status()`；在 lander/agent test 里只申请/记录，不强制。用 1 周数据校准真实峰值与 e2e 权重。
2. **Phase 2（强制执行）**：所有 lander check 和 agent 测试入口走 `acquire`，把 grant 写进 `--maxWorkers`；设置宿主 `VITEST_MAX_WORKERS` 默认上限。验收峰值 ≤ 8。
3. **Phase 3（优先级/抢占）**：dream 用 P2 + `preemptible`；lander P0 可抢占；验证 30 s 内回收。
4. **Phase 4（磁盘/模型）**：preview 的 heavy+disk 租约；model 并发租约；`releasing` 两阶段清理接 `cleanPreview`。
5. **Phase 5（可选 B）**：仅当一次检查需要跑同一 checkout 的多个 root 时，允许 `vitest --project ...` 单进程批处理，共享一份租约；不把它做成跨 project 常驻服务。

### 9.2 成本

- 新代码：`lib/resource-budget/`（ledger、schema、reaper、types）约 **800–1,200 LOC**；集成（lander、test wrapper、dream、preview、CLI/面板）约 **700–1,300 LOC**；测试约 **500–800 LOC**。合计 **2–3k LOC**。
- 人力：**8–12 engineer-days**（含并发/崩溃/Windows EBUSY 测试），不含 UI 美化。
- 运维：零新进程；一个 SQLite 文件 + 备份/清理。风险是账本 DB 损坏：用 WAL、定期 `VACUUM`/备份、损坏时降级为 "无预算 + 告警"（fail-open 或 fail-closed 需产品决定；建议 fail-closed 仅对 lander，其他 fail-open 并告警）。

### 9.3 为什么不是 B

B 的吸引力在 "字面全局池"，`test.projects` 确实让它在同版本多 root 时可行；但产品的 project 是独立 host、独立扩展、独立 SQLite（`10-multi-project-workspace-design.md` 的 H1/H2）。把测试搬进一个中央进程会把 H2 的隔离边界打破：一个 project 的坏扩展/OOM 会杀死所有 project 的测试；升级一个 Vitest 版本会要求所有 project 一起升级；结果归属/cwd/stdout 都要重做。**B 作为 "A 的批处理优化" 是收益，作为全局架构是负债。**

---

## 10. 证据索引

### 10.1 Vitest 源码（`node_modules/vitest@5.0.5`）

| 主题                                            | 位置                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| 默认 pool = forks                               | `dist/chunks/index.1TqnEahn.js:8802`；CLI help `dist/chunks/cac.CLrZKo1g.js:928` |
| fork worker                                     | `dist/chunks/index.1TqnEahn.js:5479-5484`                                        |
| thread worker                                   | `dist/chunks/index.1TqnEahn.js:5585-5590`                                        |
| Pool 队列/activeTasks                           | `dist/chunks/index.1TqnEahn.js:5853-5878`                                        |
| `maxWorkers` 生效                               | `dist/chunks/index.1TqnEahn.js:5862-5865`、`:5881`                               |
| 默认 maxWorkers = cores−1                       | `dist/chunks/index.1TqnEahn.js:1622-1624`                                        |
| 百分比解析                                      | `dist/chunks/index.1TqnEahn.js:1626-1633`                                        |
| CLI `--maxWorkers`                              | `dist/chunks/cac.CLrZKo1g.js:942-945`                                            |
| `VITEST_MAX_WORKERS`                            | `dist/chunks/index.1TqnEahn.js:9008-9011`                                        |
| worker 复用仅 non-isolate                       | `dist/chunks/index.1TqnEahn.js:5932-5941`                                        |
| pool 关闭/取消                                  | `dist/chunks/index.1TqnEahn.js:5950-5973`                                        |
| 一个 Vitest 实例一个 pool（懒创建，watch 复用） | `dist/chunks/cli-api.De07GUeT.js:12863-12871`、`:12986`                          |
| 多 project 一个 pool                            | `dist/chunks/index.1TqnEahn.js:6065-6071`、`:6162-6167`                          |
| groupOrder / 共享 maxWorkers / 冲突报错         | `dist/chunks/index.1TqnEahn.js:6273-6286`、`:9090`                               |
| `--maxWorkers` 覆盖每个 project                 | `dist/chunks/index.1TqnEahn.js:6847`                                             |
| inline project 的 root                          | `dist/chunks/index.1TqnEahn.js:7021-7023`                                        |
| 文件/目录 project                               | `dist/chunks/index.1TqnEahn.js:7044-7054`                                        |
| pool 类型选择                                   | `dist/chunks/index.1TqnEahn.js:5992-5996`                                        |

### 10.2 仓库源码

| 主题                            | 位置                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| 每个 project 一个 host          | `bin/ultimate.ts:283-288`（fork `server/main.ts`，`cwd = projectRoot`）；`server/main.ts:68` |
| unit worker 配置 8              | `vite.config.ts:223`                                                                         |
| e2e worker 配置 4               | `test/e2e/vitest.config.ts:10`                                                               |
| SQLite 锁 + pid/start-time 身份 | `server/lock.ts:8-95`、`lib/process-group.ts:35-66`                                          |
| Windows Job Object              | `lib/windows-process-group.ts:1-120`                                                         |
| `cleanPreview` 的 EBUSY 修复    | `extensions/instance/cleanup.ts:11-120`；提交 `8eb9dce9`                                     |

### 10.3 外部资料

- Vitest Test Projects: https://vitest.dev/guide/projects
- Vitest config `projects`: https://vitest.dev/config/projects.html
- Bazel actions / resource_set: https://bazel.build/rules/lib/builtins/actions
- Bazel local resources: https://bazel.build/reference/command-line-reference
- Gradle Build Environment: https://docs.gradle.org/current/userguide/build_environment.html
- Gradle Worker API: https://docs.gradle.org/current/userguide/worker_api.html
- Nx parallelization: https://nx.dev/docs/concepts/ci-concepts/parallelization-distribution
- Nx run tasks in parallel: https://nx.dev/docs/kb/run-tasks-in-parallel
- Turborepo run: https://turborepo.dev/docs/reference/run
- BullMQ stalled jobs: https://docs.bullmq.io/guide/workers/stalled-jobs
- BullMQ concurrency: https://docs.bullmq.io/guide/workers/concurrency
- Celery workers: https://docs.celeryq.dev/en/stable/userguide/workers.html
- Celery Redis visibility: https://docs.celeryq.dev/en/latest/getting-started/backends-and-brokers/redis.html
- Temporal WorkerOptions: https://typescript.temporal.io/api/interfaces/worker.WorkerOptions
- Temporal timeouts: https://docs.temporal.io/evaluate/features/timeouts-and-retries
- proper-lockfile: https://github.com/moxystudio/node-proper-lockfile
- systemd resource control: https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html
- Windows Job Object CPU rate: https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_cpu_rate_control_information
- Jest configuration: https://jestjs.io/docs/configuration
- Playwright parallelism: https://playwright.dev/docs/test-parallel

### 10.4 实验脚手架

- `.measure/run-batch.ps1`：启动 N 个 worktree 的 Vitest 进程，500 ms 采样，输出 JSON。
- `.measure/run-unit-matrix.ps1`：1/2/3 并发 × 3 次的 unit 矩阵。
- `.measure/projects/`：两 root 单池探针（8 个 sleep 测试）。
- 所有 `.measure/` 与 `.tmp-*` 文件在提交前删除，不进入产品 diff。
