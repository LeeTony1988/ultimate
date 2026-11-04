# 每个会话一个 worktree

## 一、为什么需要它

一个 agent 在改登录页，另一个在重构设置模块。如果它们在同一个目录里工作：

- 两个进程同时改文件，后写的覆盖先写的；
- 一个跑 `git checkout` 或切分支，另一个的半成品直接消失；
- 谁也不敢跑测试，因为工作区是脏的、混合的。

Git worktree 解决的正是这个问题：同一个仓库，多个独立检出，各自有自己的 HEAD 和工作区，共享一份对象库。

Ultimate 在这个基础上加了一层管理：谁有 worktree、在哪里、什么状态、什么时候回收。

## 二、公式，不是随机

```
路径：<home>/worktrees/<conversationId>
分支：ultimate/<home-hash6>-<conversationId>
起点：创建时父 checkout 的 HEAD
```

三个部分都是确定的：

- **conversation id** 决定目录名，一个会话最多一条记录；
- **home hash** 防止不同项目（不同 home）的同名会话撞车；
- **base** 是创建那一刻父 checkout 的 HEAD，之后的改动不会自动流进来。

公式化不是为了好看，而是为了**可重建**。进程崩溃、记录丢失、checkout 被回收之后，系统能按同样的路径和分支名把它找回来。

## 三、创建是两步，不是一步

```
workspaces.create(tx, id, cwd)
  │
  ├─ 同步：写一条 state = preparing 的记录
  │
  └─ 异步（持久后台任务）：
       1. git worktree add <path> -b <branch> <base>
       2. 在 checkout 里跑项目 setup 命令（默认 2 分钟超时）
       3. 成功 → state = ready
          失败 → 保留输出尾部，下一次工具调用重试
```

为什么不在创建时同步做完？因为 `git worktree add` 和 setup 都可能很慢，放在请求路径里会卡住整个会话。写成持久任务之后，即使进程重启，准备也会继续。

setup 命令来自项目设置，在 checkout 内、通过宿主 shell、带 `ULTIMATE_SOURCE` 环境变量执行。这意味着它知道"我是从哪个源 checkout 派生的"，可以做项目特有的初始化。

## 四、门禁：记录不算数，Git 才算

每次工具调用前，系统检查三件事：

| 检查                         | 失败时                           |
| ---------------------------- | -------------------------------- |
| 记录状态是 `ready`           | 工具被 block，返回当前状态与原因 |
| checkout 在磁盘上存在        | 标记需要重建，block              |
| `git worktree list` 里有登记 | 标记需要重建，block              |

这个顺序很重要：**记录只是缓存，Git 才是真相。** 用户手动删目录、Git 自己清理元数据、磁盘换挂载点，都会让记录和现实脱节。

门禁失败不是"报错就完了"：下一次工具调用会尝试原地修复（重新 prepare / 重新登记），修不好才继续 block。

## 五、谁可以创建

只有三个原生入口：

- `lineage.branch(isolated)`——开一个隔离分支；
- `subagents start(isolate: worktree)`——给子 agent 一个隔离工作区；
- `workspaces.create` action——直接创建。

**不要**让 agent 直接跑 `git worktree add`。绕过记录和门禁的 checkout 不会被回收，也不会有状态、队列和落地能力，最后变成孤儿目录。

## 六、边界

| 边界         | 含义                                                         |
| ------------ | ------------------------------------------------------------ |
| 不是沙箱     | 只改工作目录；绝对路径仍可访问其它 checkout                  |
| 单进程串行   | 同一 source 的写操作在进程内排队；跨进程没有锁               |
| 不自动解冲突 | 合并冲突交给 lander 模型或提交者                             |
| Windows 差异 | 路径比较大小写不敏感、分隔符统一；超时用 Job Object 杀进程树 |
| 不保证 push  | 本地落地与推送是两个阶段                                     |

## 七、常见误解

**"worktree 让 agent 更安全。"**
不。它让并行写更安全，不是权限边界。

**"创建返回了就能用。"**
不能。要等状态变成 `ready`，而且每次调用前还会再验一遍。

**"父会话的未提交改动，子 agent 能看到。"**
看不到。worktree 从已提交的 HEAD 创建；父的未提交改动不会带过去。

**"可以手动 `git worktree add` 省事。"**
省的是当下的事，代价是绕过门禁、回收和状态管理。

## 八、想深入

- 数据契约与磁盘布局：`../50-worktree-management-spec.md` §4
- 创建与准备的算法：§7.1–§7.3
- 门禁与自愈：§3.3、§7.4
- 回收、重建、嵌套：§7.10
- 与其它 agent 产品的差异：`../research/worktree-management-research.md` §7–§8
