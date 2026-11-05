# 15 · 源码文件清单（复刻对照表）

> 自动生成：仓库内全部源代码/文档文件（排除 node_modules/dist/build/test），含行数与首条注释摘要。
> 用于复刻时逐文件建立骨架、核对遗漏。

## agents

| 文件                  | 行数 | 摘要 |
| --------------------- | ---- | ---- |
| agents\coordinator.md | 55   | ---  |
| agents\designer.md    | 44   | ---  |
| agents\dream-pass.md  | 15   | ---  |
| agents\lander.md      | 13   | ---  |
| agents\reviewer.md    | 44   | ---  |
| agents\scout.md       | 9    | ---  |
| agents\ultimate.md    | 83   | ---  |
| agents\watcher.md     | 11   | ---  |
| agents\worker.md      | 25   | ---  |

## bin

| 文件               | 行数 | 摘要                                                                                    |
| ------------------ | ---- | --------------------------------------------------------------------------------------- |
| bin\cli.ts         | 79   |                                                                                         |
| bin\dashboard.ts   | 102  | Child diagnostics must not be able to control the terminal, including carriage returns. |
| bin\open-window.ts | 22   |                                                                                         |
| bin\tsconfig.json  | 4    |                                                                                         |
| bin\ultimate.ts    | 530  |                                                                                         |

## docs\architecture

| 文件                         | 行数 | 摘要 |
| ---------------------------- | ---- | ---- |
| docs\architecture\index.html | 965  |      |

## docs

| 文件                | 行数 | 摘要                                                                                                                     |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| docs\durability.md  | 14   | Conversations, tool calls, subagents, and documents are committed to SQLite (`$ULTIMATE_HOME/state.sqlite`, default      |
| docs\extensions.md  | 173  | Each extension is a folder `extensions/<name>/`: `server.ts` exports a Durable extension with that name                  |
| docs\pi-upstream.md | 40   | - `server/http.ts` — adapted HTTP dispatcher, not exported; prevents early provider stream termination. undici in pac... |
| docs\running.md     | 44   | - `pnpm install`, then `pnpm start` runs the supervisor on Node 26. It owns the public TCP port and single-instance l... |
| docs\settings.md    | 53   | Discovery is clone built-ins, then `~/.ultimate/`, then `<project>/.ultimate/`; later names replace earlier ones.        |
| docs\subagents.md   | 9    | Definitions with `resident: true` have one standing conversation per project, reached by the subagents service and pi... |
| docs\worktrees.md   | 36   | Run `git worktree add ../ultimate-preview -b preview`, then `cd ../ultimate-preview`, `pnpm install`, and `pnpm start... |

## extensions\activity

| 文件                          | 行数 | 摘要                                                                                                       |
| ----------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| extensions\activity\feed.tsx  | 334  |                                                                                                            |
| extensions\activity\README.md | 24   | The right panel's Activity tab: what happened in the project, newest first, from the durable event log.    |
| extensions\activity\refs.ts   | 12   | Activity in the browser: a page of the durable event log, older than the live feed holds. Browser-safe. */ |
| extensions\activity\server.ts | 30   |                                                                                                            |
| extensions\activity\web.tsx   | 233  |                                                                                                            |

## extensions\agent

| 文件                       | 行数 | 摘要                                                                                                                 |
| -------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| extensions\agent\api.ts    | 2    | Agent: the home surface, the conversation with the sidebar and the right panel beside it. Core tier, no service. */  |
| extensions\agent\README.md | 10   | The built-in Agent surface: the conversation in a centred column, with the sidebar and the right panel beside it. It |
| extensions\agent\web.tsx   | 77   |                                                                                                                      |

## extensions\automations

| 文件                                 | 行数 | 摘要                                                                                                                     |
| ------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\automations\api.ts        | 26   | Automations: resume, pause, run and inspect scheduled, event, context or supervised script triggers. */                  |
| extensions\automations\chip.tsx      | 48   |                                                                                                                          |
| extensions\automations\form.tsx      | 955  |                                                                                                                          |
| extensions\automations\panel.tsx     | 1010 |                                                                                                                          |
| extensions\automations\parts.tsx     | 374  |                                                                                                                          |
| extensions\automations\README.md     | 51   | Durable schedules, domain events, context thresholds and supervised scripts, with actions that start prompt runs or w... |
| extensions\automations\refs.ts       | 76   | Automations: durable triggers, actions, runs and script lifecycle events. Browser-safe. */                               |
| extensions\automations\schedule.ts   | 147  |                                                                                                                          |
| extensions\automations\scheduler.ts  | 282  |                                                                                                                          |
| extensions\automations\server.ts     | 845  |                                                                                                                          |
| extensions\automations\sidebar.tsx   | 130  |                                                                                                                          |
| extensions\automations\supervisor.ts | 712  |                                                                                                                          |
| extensions\automations\triggers.ts   | 279  |                                                                                                                          |
| extensions\automations\types.ts      | 116  | The labels automations gives the conversations it creates: a prompt run's, and a script's watcher. */                    |
| extensions\automations\web.tsx       | 213  |                                                                                                                          |

## extensions\browser

| 文件                         | 行数 | 摘要                                                                                                                     |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\browser\README.md | 7    | Prefer ego-browser (ego-lite) for browsing and browser-based testing. Before using it, read the shipped `skills/ego-b... |
| extensions\browser\server.ts | 448  |                                                                                                                          |
| extensions\browser\web.tsx   | 232  |                                                                                                                          |

## extensions\classify

| 文件                          | 行数 | 摘要                                                                                                                     |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\classify\api.ts    | 37   |                                                                                                                          |
| extensions\classify\README.md | 10   | Classify provides typed judgments from TypeSafe's Jev System One model to other server facets. It adds no tools, prom... |
| extensions\classify\server.ts | 61   |                                                                                                                          |

## extensions\claude-code

| 文件                             | 行数 | 摘要                                                                                                                     |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\claude-code\README.md | 8    | Claude Code is an experimental provider that uses the external CLI login, with a setup panel and no in-app OAuth flow.   |
| extensions\claude-code\refs.ts   | 11   | Claude Code in the browser: whether the local CLI is installed, logged in and on a subscription. Browser-safe. */        |
| extensions\claude-code\server.ts | 92   |                                                                                                                          |
| extensions\claude-code\web.tsx   | 91   | oxlint-disable-next-line typescript/no-floating-promises -- refreshModels catches fetch failures and retries on the n... |

## extensions\cloud

| 文件                         | 行数 | 摘要                                                                                                                   |
| ---------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| extensions\cloud\api.ts      | 13   | Cloud backups of the active chapter; optional because cloud ships disabled. */                                         |
| extensions\cloud\backup.ts   | 169  | One cloud backup: upload the snapshot, then commit it to the Worker's register with the parent it builds on.           |
| extensions\cloud\join.ts     | 130  | Joining this machine to the user's cloud backups: the Join card's `cloud.join` and `cloud.joinState` actions. */       |
| extensions\cloud\join.tsx    | 383  |                                                                                                                        |
| extensions\cloud\README.md   | 104  | Encrypted project backups in the user's cloud, inert until configured. A project runs on whichever machine the user    |
| extensions\cloud\refs.ts     | 48   | Cloud in the browser: this home's backups and joining the fleet. Browser-safe. */                                      |
| extensions\cloud\server.ts   | 198  |                                                                                                                        |
| extensions\cloud\snapshot.ts | 360  | Encrypted, chunked project backups in the cloud's private R2: a consistent database copy plus a bundle of the          |
| extensions\cloud\types.ts    | 31   | A finished backup: its snapshot id, when and from which machine, the bytes before compression and those uploaded. */   |
| extensions\cloud\web.tsx     | 279  | One poll shared by every component that reads it, running while any is mounted; a failed poll keeps the last value. */ |

## extensions\codemode

| 文件                            | 行数 | 摘要                                                                                                                     |
| ------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\codemode\api.ts      | 30   |                                                                                                                          |
| extensions\codemode\chapters.ts | 151  | Read a closed chapter without opening a harness, migrating its schema, or resuming its tasks. */                         |
| extensions\codemode\projects.ts | 25   |                                                                                                                          |
| extensions\codemode\README.md   | 55   | Run an async JavaScript function body in a fresh QuickJS/WASM sandbox. Only injected functions can access the host. P... |
| extensions\codemode\refs.ts     | 19   |                                                                                                                          |
| extensions\codemode\server.ts   | 819  |                                                                                                                          |
| extensions\codemode\summary.ts  | 154  |                                                                                                                          |
| extensions\codemode\web.tsx     | 254  |                                                                                                                          |

## extensions\coding-tools

| 文件                                     | 行数 | 摘要                                                                                                                     |
| ---------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\coding-tools\api.ts           | 3    | Coding tools: Pi's read, write, edit and shell tools (Bash, or PowerShell on Windows) and how the transcript shows th... |
| extensions\coding-tools\bash-command.tsx | 164  | The closing delimiter line as written. */                                                                                |
| extensions\coding-tools\diff.tsx         | 134  | Pi coupling (@earendil-works/pi-durable@1.5.0 src/tools/edit.ts and src/tools/edit-diff.ts — internal untyped details... |
| extensions\coding-tools\README.md        | 23   | Commits made through the shell tool (`bash`, or `powershell` on Windows) carry an `Ultimate-Conversation: <id>` trail... |
| extensions\coding-tools\refs.ts          | 26   | Coding tools in the browser: the event each commit made through the shell tool records. Browser-safe. */                 |
| extensions\coding-tools\server.ts        | 338  |                                                                                                                          |
| extensions\coding-tools\ui.tsx           | 2    | Coding tools for other extensions' browser code: the event each commit made through the shell tool records. */           |
| extensions\coding-tools\web.tsx          | 480  | Pi coupling (@earendil-works/pi-durable@1.5.0 src/tools/bash.ts and src/tools/edit.ts — internal bash exit_code diagn... |

## extensions\context

| 文件                            | 行数 | 摘要                                                                                                                     |
| ------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\context\breakdown.ts | 317  | Pi coupling (@earendil-works/pi-durable@1.5.0 src/harness/prompt.ts — internal remove-all pi.system entry immediately... |
| extensions\context\README.md    | 4    | What the model saw before a conversation's first input: a quiet header above it names the agent, its model and the es... |
| extensions\context\web.tsx      | 490  |                                                                                                                          |

## extensions\conversations

| 文件                                          | 行数 | 摘要                                                                                                                    |
| --------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| extensions\conversations\activity.ts          | 119  | Publish sidebar naming and activity in metadata; core reads the projection without interpreting history. */             |
| extensions\conversations\api.ts               | 104  |                                                                                                                         |
| extensions\conversations\compactions.ts       | 45   |                                                                                                                         |
| extensions\conversations\context.ts           | 154  |                                                                                                                         |
| extensions\conversations\dialogs.tsx          | 155  |                                                                                                                         |
| extensions\conversations\feature.tsx          | 76   | The root's overview rows by conversation id: one stream for all rows, unchanged when selection or expansion changes. */ |
| extensions\conversations\marks.tsx            | 80   | The display names of the agents Ultimate ships with; any other standing agent is its name, capitalised. */              |
| extensions\conversations\mention.tsx          | 42   |                                                                                                                         |
| extensions\conversations\overview.ts          | 163  |                                                                                                                         |
| extensions\conversations\README.md            | 186  | What each conversation is about: titles, summaries, features and reply summaries, the overview the sidebar reads,       |
| extensions\conversations\refs.ts              | 73   |                                                                                                                         |
| extensions\conversations\server.ts            | 329  |                                                                                                                         |
| extensions\conversations\summary-entry.tsx    | 57   |                                                                                                                         |
| extensions\conversations\summary-model-ref.ts | 19   |                                                                                                                         |
| extensions\conversations\summary-model.ts     | 128  | Titles, summaries and reply summaries use this model unless settings name another. */                                   |
| extensions\conversations\summary.ts           | 822  |                                                                                                                         |
| extensions\conversations\types.ts             | 49   | `model`: the summary model that answered, as in `ReplySummary`. */                                                      |
| extensions\conversations\ui.tsx               | 34   |                                                                                                                         |
| extensions\conversations\visible.tsx          | 23   | Conclude a whole conversation subtree, even when a descendant has live tasks. */                                        |
| extensions\conversations\web.tsx              | 24   |                                                                                                                         |

## extensions\debug

| 文件                       | 行数 | 摘要                                                                                                                     |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\debug\README.md | 9    | A read-only `debug` tool for finding out why something did or did not happen in the running Ultimate, and for followi... |
| extensions\debug\server.ts | 210  | The most text one call returns; rows past it are cut with a note. */                                                     |

## extensions\documents

| 文件                           | 行数 | 摘要                                                                                                                    |
| ------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| extensions\documents\api.ts    | 2    | Documents: the right panel's view of the shown conversation's extension documents. Core tier, no service. */            |
| extensions\documents\README.md | 2    | Show the shown conversation's extension documents in the right panel, each through its extension's renderer or as JSON. |
| extensions\documents\web.tsx   | 148  |                                                                                                                         |

## extensions\dream

| 文件                                  | 行数 | 摘要                                                                                                                |
| ------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| extensions\dream\before-compaction.ts | 498  |                                                                                                                     |
| extensions\dream\chapters.tsx         | 480  |                                                                                                                     |
| extensions\dream\delivery.ts          | 62   |                                                                                                                     |
| extensions\dream\DREAM.md             | 99   | Like people, agents need time to process what they learned. A dream is a working session: Ultimate reads back over  |
| extensions\dream\gate.ts              | 110  |                                                                                                                     |
| extensions\dream\journal.tsx          | 486  |                                                                                                                     |
| extensions\dream\modal.tsx            | 175  |                                                                                                                     |
| extensions\dream\moon.tsx             | 103  | How each pass reads to a person, in the journal's order. */                                                         |
| extensions\dream\morning.tsx          | 266  |                                                                                                                     |
| extensions\dream\pinned.tsx           | 55   | The dialog the pinned dream line opens: the session's journal card. */                                              |
| extensions\dream\README.md            | 144  | Dream: a working session in which Ultimate processes what it learned, like people do while they sleep. The process, |
| extensions\dream\refs.ts              | 158  | Dream sessions in the browser: the passes, the journal and the proposals followed to landing. Browser-safe. */      |
| extensions\dream\seed.ts              | 291  |                                                                                                                     |
| extensions\dream\server.ts            | 693  |                                                                                                                     |
| extensions\dream\sidebar.tsx          | 128  |                                                                                                                     |
| extensions\dream\sleep.tsx            | 347  |                                                                                                                     |
| extensions\dream\types.ts             | 168  | Everything a dream carries to a fresh chapter; numeric trigger targets and subscribers need recreating. */          |
| extensions\dream\web.tsx              | 147  |                                                                                                                     |

## extensions\fast

| 文件                      | 行数 | 摘要                                                                                                               |
| ------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| extensions\fast\README.md | 28   | Fast mode runs the OpenAI models named in `fastModels` on the priority service tier, about twice the output speed. |
| extensions\fast\refs.ts   | 11   | Fast mode in the browser: which OpenAI models run in fast mode, and the action that toggles one. Browser-safe. */  |
| extensions\fast\server.ts | 174  |                                                                                                                    |
| extensions\fast\web.tsx   | 49   | Fast mode for the composer's OpenAI model: on for every request to that model, wherever it runs. */                |

## extensions\goal

| 文件                        | 行数 | 摘要                                                                                                                     |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\goal\cards.tsx   | 318  |                                                                                                                          |
| extensions\goal\delivery.ts | 43   | A goal card for @ultimate: `goal.started` as an input that wakes it, `goal.report` as a write. */                        |
| extensions\goal\dialog.tsx  | 109  | The dialog ⌘K "Go hands-off…" opens. */                                                                                  |
| extensions\goal\README.md   | 42   | Hands-off goals: put @ultimate on a goal and go away; it decides what it would otherwise ask you, records each decisi... |
| extensions\goal\refs.ts     | 50   | Hands-off goals in the browser: the goal the user put @ultimate on, and every decision it took for them. Browser-safe... |
| extensions\goal\reminder.ts | 96   |                                                                                                                          |
| extensions\goal\server.ts   | 360  |                                                                                                                          |
| extensions\goal\web.tsx     | 36   | A quiet status-line mark while @ultimate works hands-off; it opens @ultimate, where the goal's card is. */               |

## extensions\health

| 文件                        | 行数 | 摘要                                                                                                                     |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\health\api.ts    | 13   |                                                                                                                          |
| extensions\health\README.md | 32   | Tracks whether each model provider works on this machine, from every real response, and reports a failing one to the ... |
| extensions\health\refs.ts   | 23   | Health in the browser: this machine's model provider health, which the status line warns about. Browser-safe. */         |
| extensions\health\server.ts | 80   | The entry a terminal provider message records: `error` → a failure, `aborted` → nothing, else a success. */              |
| extensions\health\store.ts  | 277  | One provider's record in `health.json`; times are epoch milliseconds. */                                                 |
| extensions\health\ui.tsx    | 2    | Health for other extensions' browser code: the event a provider's health change emits. */                                |

## extensions\info

| 文件                             | 行数 | 摘要                                                                                                                     |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\info\README.md        | 2    | What this Ultimate runs on, in the right panel's Info tab: the shown conversation's workspace (its checkout, the land... |
| extensions\info\skill-picker.tsx | 66   |                                                                                                                          |
| extensions\info\ui.tsx           | 100  | Info's components for other extensions: the panel's sections, copy buttons, meters and tags. */                          |
| extensions\info\web.tsx          | 459  |                                                                                                                          |

## extensions\instance

| 文件                           | 行数 | 摘要                                                                                                                     |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\instance\api.ts     | 10   | Standalone Ultimate instances for checking a scratch home, independent of conversation workspaces. */                    |
| extensions\instance\cleanup.ts | 114  | Cleanup must use the same owner validation and PID semantics as the storage lock.                                        |
| extensions\instance\links.ts   | 16   | `link`'s path, query and fragment on `base`'s origin; a path starting with `//` stays a path, never a new host. */       |
| extensions\instance\README.md  | 15   | Run an on-demand second Ultimate to test core changes before restarting the shared host, or, in another project, to c... |
| extensions\instance\refs.ts    | 15   | Instances in the browser: the preview servers started from this host, for the title bar and preview links. Browser-sa... |
| extensions\instance\server.ts  | 517  |                                                                                                                          |
| extensions\instance\web.tsx    | 364  |                                                                                                                          |

## extensions\keep-warm

| 文件                           | 行数 | 摘要                                                                                                                     |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\keep-warm\due.ts    | 26   | When a keep-warm ping is due. Browser-safe: the chip reads the hour too. */                                              |
| extensions\keep-warm\README.md | 18   | Keeps @ultimate's Claude prompt cache warm while you are away for a while, so your next message reads the whole conve... |
| extensions\keep-warm\refs.ts   | 29   | Keep warm in the browser: whether @ultimate's prompt cache is kept warm, and the last ping. Browser-safe. */             |
| extensions\keep-warm\server.ts | 264  |                                                                                                                          |
| extensions\keep-warm\web.tsx   | 96   |                                                                                                                          |

## extensions\lineage

| 文件                          | 行数 | 摘要                                                                                                                     |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\lineage\api.ts     | 66   |                                                                                                                          |
| extensions\lineage\catchup.ts | 442  |                                                                                                                          |
| extensions\lineage\memory.ts  | 412  |                                                                                                                          |
| extensions\lineage\README.md  | 209  | A project is a forest of conversation trees. Each root keeps a non-agent tally of one line of work: one intent line p... |
| extensions\lineage\refs.ts    | 109  |                                                                                                                          |
| extensions\lineage\rewind.ts  | 524  |                                                                                                                          |
| extensions\lineage\rewind.tsx | 296  |                                                                                                                          |
| extensions\lineage\server.ts  | 1702 |                                                                                                                          |
| extensions\lineage\types.ts   | 25   | One thing that happened in a root, newest first from the `recent` action, as its sidebar row lists it. */                |
| extensions\lineage\ui.tsx     | 46   |                                                                                                                          |
| extensions\lineage\web.tsx    | 615  |                                                                                                                          |

## extensions\messages

| 文件                             | 行数 | 摘要                                                                                                         |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| extensions\messages\accent.tsx   | 69   | A sender's quiet accent: a stripe on the side it writes from, a faint fill and the colour of its name. */    |
| extensions\messages\addresses.ts | 79   | Who a message is from and to: resolving addresses, naming senders, and a subagent's parent. */               |
| extensions\messages\api.ts       | 99   |                                                                                                              |
| extensions\messages\branch.ts    | 123  | The `branch` tool: start a lineage branch and send it its first message. */                                  |
| extensions\messages\caller.ts    | 10   | The stored response that made tool call `call`: going back from a message it sent returns there. */          |
| extensions\messages\cards.tsx    | 870  |                                                                                                              |
| extensions\messages\data.tsx     | 239  | How another project's Ultimate is named; the server says the same in its model text. */                      |
| extensions\messages\delivery.ts  | 424  | The `board.delivery` task: it places a message in its recipient, then returns the answer as a reply. */      |
| extensions\messages\images.ts    | 54   |                                                                                                              |
| extensions\messages\log.ts       | 16   | The shared Messages log: appending to it, and the terminal outcome its tasks commit. */                      |
| extensions\messages\points.tsx   | 5    | What shows under a message to the user (`questions` provides its answer card). */                            |
| extensions\messages\questions.ts | 150  |                                                                                                              |
| extensions\messages\README.md    | 231  | Durable messages between conversations, standing agents and the user. Built in and on by default.            |
| extensions\messages\refs.ts      | 98   |                                                                                                              |
| extensions\messages\remote.ts    | 244  | Messaging another project's Ultimate: `tell` out, and the `remote` and `remoteReply` actions it posts in. */ |
| extensions\messages\route.ts     | 113  | `board.route`: a branch's final answers reach the conversation that started it. */                           |
| extensions\messages\send.ts      | 220  | `send()`: validating, admitting and logging a message, and starting its delivery. */                         |
| extensions\messages\server.ts    | 271  |                                                                                                              |
| extensions\messages\triage.ts    | 223  |                                                                                                              |
| extensions\messages\ui.tsx       | 17   |                                                                                                              |
| extensions\messages\web.tsx      | 113  |                                                                                                              |

## extensions\models

| 文件                          | 行数 | 摘要                                                                                                                     |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\models\api.ts      | 17   |                                                                                                                          |
| extensions\models\fallback.ts | 47   |                                                                                                                          |
| extensions\models\login.tsx   | 620  |                                                                                                                          |
| extensions\models\picker.tsx  | 239  |                                                                                                                          |
| extensions\models\README.md   | 6    | Model, thinking, and login, as Pi does them: a model button and a thinking-level button in the composer toolbar, a se... |
| extensions\models\refs.ts     | 40   |                                                                                                                          |
| extensions\models\server.ts   | 241  |                                                                                                                          |
| extensions\models\state.tsx   | 110  | Dialog ids this extension's overlays read with `useDialog`. */                                                           |
| extensions\models\switches.ts | 48   |                                                                                                                          |
| extensions\models\ui.tsx      | 3    | Models for other extensions' browser code: one model as the picker lists it, and the login-changed event. */             |
| extensions\models\web.tsx     | 239  |                                                                                                                          |

## extensions\notices

| 文件                         | 行数 | 摘要                                                                                                                     |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\notices\api.ts    | 2    | Notices: server and browser notices as toasts under the header. Core tier, no service. */                                |
| extensions\notices\README.md | 2    | Notices as small toasts centred under the header, so they never cover the sidebar or an open right panel: what the se... |
| extensions\notices\web.tsx   | 60   | How long a notice stays, by level; hovering keeps them. */                                                               |

## extensions\onboarding

| 文件                               | 行数 | 摘要                                                                                                                  |
| ---------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| extensions\onboarding\api.ts       | 2    | Onboarding: first-run setup, setup cards and the Extensions panel. Core tier: @ultimate's first run depends on it. */ |
| extensions\onboarding\choices.tsx  | 60   |                                                                                                                       |
| extensions\onboarding\onboarded.ts | 8    |                                                                                                                       |
| extensions\onboarding\pages.tsx    | 429  |                                                                                                                       |
| extensions\onboarding\panel.tsx    | 601  |                                                                                                                       |
| extensions\onboarding\parts.tsx    | 143  | The Extensions panel's setup entry point; the overlay routes it to @ultimate, not a dialog. */                        |
| extensions\onboarding\README.md    | 114  | Inline setup choices, the first-run prerequisites, and the Extensions panel that turns extensions on and off live.    |
| extensions\onboarding\refs.ts      | 113  |                                                                                                                       |
| extensions\onboarding\server.ts    | 555  |                                                                                                                       |
| extensions\onboarding\survey.tsx   | 83   | Above @ultimate's composer until onboarding has run for the project: one click starts it. */                          |
| extensions\onboarding\ui.tsx       | 2    | Onboarding for other extensions' browser code: the first-run status, starting onboarding, and extension switches. */  |
| extensions\onboarding\web.tsx      | 294  |                                                                                                                       |

## extensions\parallel

| 文件                          | 行数 | 摘要                                                                                                                     |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\parallel\client.ts | 140  |                                                                                                                          |
| extensions\parallel\output.ts | 27   |                                                                                                                          |
| extensions\parallel\README.md | 11   | Search the public web and fetch clean page content with parallel.ai through `web_search` and `web_fetch`. It needs `s... |
| extensions\parallel\server.ts | 333  |                                                                                                                          |
| extensions\parallel\web.tsx   | 392  |                                                                                                                          |

## extensions\pause

| 文件                       | 行数 | 摘要                                                                                                                     |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\pause\api.ts    | 8    | Pause: whether the user paused this Ultimate, for timers that start work outside the task scheduler. */                  |
| extensions\pause\lasted.ts | 7    | `2h 14m`, `5m`, `40s`: how long a pause lasted. Browser-safe. */                                                         |
| extensions\pause\parked.ts | 18   | Which conversations a pause parked, from the live task graph. Browser-safe. */                                           |
| extensions\pause\README.md | 23   | Pause the whole Ultimate host and continue it with Play. This is a soft pause: running work (a bash call, a model res... |
| extensions\pause\refs.ts   | 75   | Pause in the browser: whether this Ultimate is paused, what still runs, and Pause and Play. Browser-safe. */             |
| extensions\pause\server.ts | 485  |                                                                                                                          |
| extensions\pause\web.tsx   | 455  |                                                                                                                          |

## extensions\phase

| 文件                         | 行数 | 摘要                                                                                                                     |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\phase\README.md   | 4    | Working-phase labels, classified by Jev after each tool round. It needs `classify`, which needs `TYPESAFE_API_KEY` in... |
| extensions\phase\refs.ts     | 5    | Phases in the browser: what each working conversation is doing now, as a short label. Browser-safe. */                   |
| extensions\phase\server.ts   | 196  |                                                                                                                          |
| extensions\phase\state.ts    | 98   |                                                                                                                          |
| extensions\phase\subtree.tsx | 23   | The ownership edges of a conversation summary: a subagent is an owned child of the conversation that started it. */      |
| extensions\phase\types.ts    | 17   | The run's first input submission. */                                                                                     |
| extensions\phase\ui.tsx      | 36   | Phase's components for other extensions: a conversation's live phase and its label. */                                   |
| extensions\phase\web.tsx     | 17   | A working conversation's phase for the sidebar: its label, its word, and whether it only waits on subagents. */          |

## extensions\plan

| 文件                         | 行数 | 摘要                                                                                                      |
| ---------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| extensions\plan\progress.tsx | 19   | Done and canceled tasks are finished. */                                                                  |
| extensions\plan\README.md    | 6    | Keep epics and tasks in a durable conversation ledger, with open work visible in the prompt.              |
| extensions\plan\refs.ts      | 40   |                                                                                                           |
| extensions\plan\server.ts    | 311  |                                                                                                           |
| extensions\plan\ui.tsx       | 95   | The plan's components for other extensions: the task chip of a conversation that works on a plan task. */ |
| extensions\plan\web.tsx      | 793  |                                                                                                           |

## extensions\prompt

| 文件                        | 行数 | 摘要                                                                                                                     |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\prompt\api.ts    | 2    | Prompt: Ultimate's system prompt, with coding guidelines, project context, skills and reload layers. Core tier, no se... |
| extensions\prompt\README.md | 19   | Ultimate's system prompt: coding guidelines, project context, skills, and the source reload layers.                      |
| extensions\prompt\refs.ts   | 18   | Prompt in the browser: the note on an input that says what changed since the conversation's last run. Browser-safe. */   |
| extensions\prompt\server.ts | 366  |                                                                                                                          |
| extensions\prompt\web.tsx   | 67   | How many landings the divider names before "+N more". */                                                                 |

## extensions\questions

| 文件                              | 行数 | 摘要                                                                                                                  |
| --------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| extensions\questions\card.tsx     | 619  |                                                                                                                       |
| extensions\questions\open.tsx     | 29   | The fields of a message the answer card reads. */                                                                     |
| extensions\questions\question.tsx | 371  | A check that pops in when it mounts: the moment a choice lands. */                                                    |
| extensions\questions\README.md    | 63   | Answer cards for @ultimate's questions to the user. One thing asks: a reply-expected message to the user that carries |
| extensions\questions\refs.ts      | 24   |                                                                                                                       |
| extensions\questions\server.ts    | 104  |                                                                                                                       |
| extensions\questions\state.tsx    | 83   |                                                                                                                       |
| extensions\questions\ui.tsx       | 2    | Questions for other extensions' browser code: which messages wait on the user. */                                     |
| extensions\questions\web.tsx      | 18   | Retired cards have no interaction; hide them instead of exposing their raw JSON.                                      |

## extensions

| 文件                 | 行数 | 摘要                                                                                                                |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| extensions\README.md | 816  | Almost everything in Ultimate is an extension: tools, prompt sections, tool renderers, the status line, panels, and |

## extensions\recall

| 文件                        | 行数 | 摘要                                                                                                                     |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\recall\README.md | 10   | Recall brings a project memory back to @ultimate when a message calls for it, deep in a long context where the memory... |
| extensions\recall\refs.ts   | 11   | Recall in the browser: which input is being checked. Browser-safe. */                                                    |
| extensions\recall\server.ts | 213  |                                                                                                                          |
| extensions\recall\types.ts  | 11   | The kind of the entry that carries recalled memories, placed right after the input they apply to. */                     |
| extensions\recall\web.tsx   | 102  |                                                                                                                          |

## extensions\review

| 文件                            | 行数 | 摘要                                                                                                                     |
| ------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\review\card.tsx      | 80   |                                                                                                                          |
| extensions\review\comment.tsx   | 137  | The lines a comment covers, as a quiet mono label: `src/a.ts:3-5 · new`. */                                              |
| extensions\review\comments.ts   | 164  | Review comments: their limits, their check, and the Markdown the model reads. Pure and browser-safe. */                  |
| extensions\review\diff.ts       | 268  | Local Git diffs for review: a spec's two sides, its patch split per file with counts and status, capped in size. */      |
| extensions\review\drafts.ts     | 41   | Draft review comments in durable UI state: kept across reloads and shared by every tab, per spec (`draftsKey`). */       |
| extensions\review\footer.tsx    | 98   |                                                                                                                          |
| extensions\review\lines.ts      | 53   | The text of a parsed diff's lines by number, on either side: what a comment quotes. Pure and browser-safe. */            |
| extensions\review\link.tsx      | 76   | The spec on screen, in durable UI state: it survives reloads and follows every tab, as the surface does. */              |
| extensions\review\parts.tsx     | 46   | The surface's frame: its header with `controls`, the body, the status line. */                                           |
| extensions\review\README.md     | 44   | The Review surface: the project's local Git diffs, its files on the left and their changes on the right, rendered wit... |
| extensions\review\recipient.tsx | 98   |                                                                                                                          |
| extensions\review\refs.ts       | 79   | Review in the browser: the local diff of a spec, and the specs worth choosing from. Browser-safe. */                     |
| extensions\review\selector.tsx  | 131  |                                                                                                                          |
| extensions\review\server.ts     | 209  |                                                                                                                          |
| extensions\review\sha256.ts     | 57   |                                                                                                                          |
| extensions\review\surface.tsx   | 633  |                                                                                                                          |
| extensions\review\types.ts      | 12   | Review comments as they travel: from the surface's drafts to the `review.comments` input. Browser-safe. */               |
| extensions\review\ui.tsx        | 5    | Review for other extensions' browser code: open the Review surface at a spec, and the actions behind it. */              |
| extensions\review\web.tsx       | 40   | The diff viewer and its highlighter load with the surface, not with the app.                                             |

## extensions\secrets

| 文件                         | 行数 | 摘要                                                                                                      |
| ---------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| extensions\secrets\api.ts    | 10   | Secrets: user-global secrets behind metadata-only actions; read values with lib/secrets.ts. Core tier. */ |
| extensions\secrets\README.md | 12   | Manage user-global secrets through metadata-only server actions, shared by every Ultimate project.        |
| extensions\secrets\refs.ts   | 25   |                                                                                                           |
| extensions\secrets\server.ts | 64   |                                                                                                           |
| extensions\secrets\store.ts  | 26   | oxlint-disable-next-line no-restricted-imports -- secret writes use the shared cross-process file lock    |
| extensions\secrets\web.tsx   | 410  |                                                                                                           |

## extensions\self

| 文件                      | 行数 | 摘要                                                                                                                     |
| ------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\self\README.md | 10   | Ultimate's awareness of its own code: the replay-safe `restart` tool requests a type-checked core swap from the super... |
| extensions\self\server.ts | 131  | Core, always on; the handle resolves the current provider at each call.                                                  |
| extensions\self\web.tsx   | 356  |                                                                                                                          |

## extensions\setup

| 文件                       | 行数 | 摘要                                                                                                               |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| extensions\setup\README.md | 31   | What isn't set up on this machine, and what that costs: one status-line item, `⚠ N setup issues`, shown only while |
| extensions\setup\refs.ts   | 18   | Setup in the browser: what isn't set up on this machine and what that costs. Browser-safe. */                      |
| extensions\setup\server.ts | 409  |                                                                                                                    |
| extensions\setup\web.tsx   | 129  |                                                                                                                    |

## extensions\side-chat

| 文件                           | 行数 | 摘要                                                                                                                     |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\side-chat\logic.ts  | 74   | Side chat decisions the web facet makes, pure for tests. Browser-safe. */                                                |
| extensions\side-chat\README.md | 30   | Side chats are temporary, ownerless copies of the standing @ultimate conversation. The user opens one to explore a ta... |
| extensions\side-chat\refs.ts   | 29   | Side chats: temporary copies of @ultimate, their lifecycle actions and passive summaries. Browser-safe. */               |
| extensions\side-chat\server.ts | 391  |                                                                                                                          |
| extensions\side-chat\ui.tsx    | 5    | Side chats for other extensions' browser code: opening one on @ultimate, its index, and which one is in front. */        |
| extensions\side-chat\web.tsx   | 537  |                                                                                                                          |

## extensions\sidebar

| 文件                            | 行数 | 摘要                                                                                                                     |
| ------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\sidebar\api.ts       | 2    | Sidebar: the conversation tree, the standing agents and the title bar's @ultimate button. Core tier, top layer, no se... |
| extensions\sidebar\label.ts     | 11   | The @ultimate button's state word: paused before working, then what waits on you, else idle. Browser-safe. */            |
| extensions\sidebar\landed.tsx   | 130  |                                                                                                                          |
| extensions\sidebar\lander.tsx   | 69   |                                                                                                                          |
| extensions\sidebar\landings.ts  | 27   | A landing note of root `root`. */                                                                                        |
| extensions\sidebar\listed.ts    | 14   |                                                                                                                          |
| extensions\sidebar\README.md    | 103  | The Agent surface's sidebar and, on phones, the title bar's @ultimate button: talk to @ultimate, see each root's tree... |
| extensions\sidebar\root.tsx     | 419  |                                                                                                                          |
| extensions\sidebar\rows.tsx     | 596  |                                                                                                                          |
| extensions\sidebar\section.tsx  | 65   |                                                                                                                          |
| extensions\sidebar\sidebar.tsx  | 636  |                                                                                                                          |
| extensions\sidebar\state.tsx    | 5    | The sidebar's durable UI state, under the keys it had as part of conversations (`ext.conversations.<key>`). */           |
| extensions\sidebar\ui.tsx       | 14   | The sidebar's points for other extensions' browser code. */                                                              |
| extensions\sidebar\ultimate.tsx | 107  |                                                                                                                          |
| extensions\sidebar\web.tsx      | 12   | Phones only, where the sidebar with @ultimate's row is hidden; last in the title bar's left side.                        |
| extensions\sidebar\work.ts      | 27   | An in-flight branch's work so far, as its row shows it: commits on its worktree branch, and uncommitted edits. */        |

## extensions\sounds

| 文件                        | 行数 | 摘要                                                                                                                  |
| --------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| extensions\sounds\cues.ts   | 52   | What is due to sound: `key` names the event, so it sounds once. */                                                    |
| extensions\sounds\README.md | 14   | Short, soft notification sounds when @ultimate talks to you: a question (needs input), a                              |
| extensions\sounds\tones.ts  | 56   | A note as [start in seconds, frequency in Hz, length in seconds]. */                                                  |
| extensions\sounds\ui.tsx    | 3    | Sounds for other extensions' browser code: synthesized bell notes, outside the notification cues and their switch. */ |
| extensions\sounds\web.tsx   | 121  |                                                                                                                       |

## extensions\splash

| 文件                           | 行数 | 摘要                                                                                                                |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------- |
| extensions\splash\electric.tsx | 782  | Adapted from React Bits' ElectricLogo (https://reactbits.dev/animations/electric-logo, MIT), without its pointer    |
| extensions\splash\README.md    | 41   | Ultimate opens with its name: the ULTIMATE wordmark draws itself over the whole window while the app loads, and the |
| extensions\splash\web.tsx      | 415  | The core's readiness deadline: not ready by then, the app opens anyway and the notice names what is missing. */     |

## extensions\status-line

| 文件                              | 行数 | 摘要                                                                                                                     |
| --------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\status-line\context.ts | 14   | A conversation's own spend: every model and tool bucket of its `pi.usage`, added up. */                                  |
| extensions\status-line\rates.ts   | 32   | Aggregate snapshots preserve signed partial corrections; only displayed rates clamp. */                                  |
| extensions\status-line\README.md  | 4    | The line under the composer (`composer.status`) shows the conversation's cwd/workspace and git branch, `↑input ↓outpu... |
| extensions\status-line\refs.ts    | 11   | The status line in the browser: token rates and spend across every conversation of this host. Browser-safe. */           |
| extensions\status-line\server.ts  | 117  |                                                                                                                          |
| extensions\status-line\turns.ts   | 33   | Whether an entry is an input that starts a turn: a user message, but not a compaction's summary. */                      |
| extensions\status-line\web.tsx    | 364  |                                                                                                                          |

## extensions\status

| 文件                        | 行数 | 摘要                                                                                                                     |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\status\README.md | 46   | One compact, read-only summary of this Ultimate for dashboards that poll several instances: the clone's commit, faile... |
| extensions\status\refs.ts   | 39   | Status: one compact read-only summary of this Ultimate, for dashboards that poll it. Browser-safe. */                    |
| extensions\status\server.ts | 93   | Status: one compact read-only summary of this Ultimate, each field from the extension that owns it. */                   |

## extensions\subagents

| 文件                                  | 行数 | 摘要                                                                                                                     |
| ------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\subagents\api.ts           | 79   |                                                                                                                          |
| extensions\subagents\children.ts      | 83   |                                                                                                                          |
| extensions\subagents\definitions.tsx  | 620  |                                                                                                                          |
| extensions\subagents\fields.tsx       | 424  |                                                                                                                          |
| extensions\subagents\landing.ts       | 13   |                                                                                                                          |
| extensions\subagents\message-types.ts | 8    |                                                                                                                          |
| extensions\subagents\messages.tsx     | 175  |                                                                                                                          |
| extensions\subagents\parts.tsx        | 39   |                                                                                                                          |
| extensions\subagents\README.md        | 58   | Delegate bounded work with `subagent`: `start {agent, task, background?, fork?}`, `message {id, text, steer?}` (steer... |
| extensions\subagents\refs.ts          | 108  |                                                                                                                          |
| extensions\subagents\server.ts        | 1212 |                                                                                                                          |
| extensions\subagents\ui.tsx           | 25   |                                                                                                                          |
| extensions\subagents\web.tsx          | 338  |                                                                                                                          |

## extensions\system

| 文件                             | 行数 | 摘要                                                                                                                     |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\system\feed.ts        | 75   |                                                                                                                          |
| extensions\system\hierarchy.tsx  | 199  | The lanes as a tree: rows indented under the lane that started them, a dotted overlay linking each spawning call to      |
| extensions\system\lanes.tsx      | 349  |                                                                                                                          |
| extensions\system\layout.ts      | 215  |                                                                                                                          |
| extensions\system\navigation.tsx | 36   | How long a view must stay before it counts: passing through a surface on the way to another is no navigation. */         |
| extensions\system\README.md      | 23   | One stream of everything Ultimate records: durable events (`host.eventLog`) and the call trace (`host.trace`: service... |
| extensions\system\refs.ts        | 123  |                                                                                                                          |
| extensions\system\server.ts      | 539  |                                                                                                                          |
| extensions\system\stream.tsx     | 277  | The stream's source chips: each a filter of the `stream` action. */                                                      |
| extensions\system\tree.tsx       | 94   |                                                                                                                          |
| extensions\system\web.tsx        | 240  |                                                                                                                          |

## extensions\tailscale

| 文件                           | 行数 | 摘要                                                                                                                     |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\tailscale\api.ts    | 13   |                                                                                                                          |
| extensions\tailscale\README.md | 34   | Expose Ultimate over Tailscale HTTPS, admitting only explicitly allowed Tailscale logins. This built-in is off by def... |
| extensions\tailscale\refs.ts   | 26   |                                                                                                                          |
| extensions\tailscale\server.ts | 332  | oxlint-disable-next-line no-restricted-imports -- tailscale ownership uses the shared process lock and liveness check    |
| extensions\tailscale\web.tsx   | 348  |                                                                                                                          |

## extensions\tasks

| 文件                       | 行数 | 摘要                                                                                                                     |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\tasks\README.md | 3    | The live durable task graph in the right panel's Tasks tab: every conversation with live work, its tasks as a tree by... |
| extensions\tasks\refs.ts   | 9    | Tasks in the browser: when the durable tasks of the task tree first ran, and running parked ones again. Browser-safe. */ |
| extensions\tasks\server.ts | 30   | A parked task crashed the process five times in a row; only the user decides to risk a sixth.                            |
| extensions\tasks\web.tsx   | 395  |                                                                                                                          |

## extensions\theme

| 文件                       | 行数 | 摘要                                                                                                                    |
| -------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| extensions\theme\api.ts    | 2    | Theme: the palette command that toggles the light and dark theme. Core tier, no service. */                             |
| extensions\theme\README.md | 2    | The "Toggle light and dark theme" command in the palette. The theme is a preference of each browser: the shell keeps it |
| extensions\theme\web.tsx   | 11   |                                                                                                                         |

## extensions\todos

| 文件                       | 行数 | 摘要                                                                                                                 |
| -------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| extensions\todos\panel.tsx | 334  |                                                                                                                      |
| extensions\todos\README.md | 30   | The project's short list of open loops, each owned by the user or @ultimate. No priorities, due dates, tags or       |
| extensions\todos\refs.ts   | 19   | To-dos in the browser: the project's short list of open loops, each owned by the user or @ultimate. Browser-safe. */ |
| extensions\todos\server.ts | 186  |                                                                                                                      |
| extensions\todos\web.tsx   | 15   | @ultimate's changed-list reminder is model context, not something to read in the transcript.                         |

## extensions\update

| 文件                        | 行数 | 摘要                                                                                                                     |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\update\api.ts    | 10   | Update: whether the clone Ultimate runs from is behind origin, for other extensions to report. */                        |
| extensions\update\clone.ts  | 147  | The Ultimate clone against origin: what it lacks, what that touches, and fetching it at most hourly. */                  |
| extensions\update\item.ts   | 18   |                                                                                                                          |
| extensions\update\README.md | 40   | Keeps the Ultimate clone the host runs from (`host.ultimateRoot`, the `<self>` block's "Ultimate (running host)") cur... |
| extensions\update\refs.ts   | 93   | Update in the browser: whether the Ultimate clone is behind origin, and updating it. Browser-safe. */                    |
| extensions\update\server.ts | 385  |                                                                                                                          |
| extensions\update\web.tsx   | 479  |                                                                                                                          |

## extensions\voice-live\agents

| 文件                                  | 行数 | 摘要 |
| ------------------------------------- | ---- | ---- |
| extensions\voice-live\agents\voice.md | 19   | ---  |

## extensions\voice-live

| 文件                             | 行数 | 摘要                                                                                                  |
| -------------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| extensions\voice-live\brief.ts   | 140  |                                                                                                       |
| extensions\voice-live\live.tsx   | 365  |                                                                                                       |
| extensions\voice-live\README.md  | 69   | Live voice pairs GPT-Live's audio with a fast Luna agent that decides what to pass to @ultimate.      |
| extensions\voice-live\refs.ts    | 63   | Live voice actions and the standing Voice conversation. Browser-safe. */                              |
| extensions\voice-live\relay.ts   | 95   | Pure transcript joiner; the caller supplies the clock and ticks. All finished input goes to Voice. */ |
| extensions\voice-live\server.ts  | 696  |                                                                                                       |
| extensions\voice-live\session.ts | 197  | Browser WebRTC lifecycle, independent of React and the shell. Never holds an API key. */              |
| extensions\voice-live\web.tsx    | 1391 |                                                                                                       |

## extensions\voice

| 文件                       | 行数 | 摘要                                                                                                                 |
| -------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| extensions\voice\README.md | 17   | Voice input: a mic button beside Send records speech and puts its transcript into the draft at the cursor, unsent.   |
| extensions\voice\refs.ts   | 11   | Voice input in the browser: whether an OpenAI API key can transcribe, and the transcription action. Browser-safe. */ |
| extensions\voice\server.ts | 103  | The largest recording taken, in bytes before base64: what fits the 12 MB action request. */                          |
| extensions\voice\web.tsx   | 262  |                                                                                                                      |

## extensions\watchdog

| 文件                          | 行数 | 摘要                                                                                                                     |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| extensions\watchdog\api.ts    | 11   | Watchdog: the failed runs it reported, newest first, for other extensions to summarize. */                               |
| extensions\watchdog\idle.ts   | 99   |                                                                                                                          |
| extensions\watchdog\README.md | 5    | Reports failed runs to their subagent owner or @ultimate, and reminds @ultimate about open branches idle for more tha... |
| extensions\watchdog\refs.ts   | 9    | Watchdog failure cards: the failed conversation, error, last step and retry outcome. */                                  |
| extensions\watchdog\server.ts | 418  |                                                                                                                          |
| extensions\watchdog\web.tsx   | 41   |                                                                                                                          |

## extensions\workspaces

| 文件                                | 行数 | 摘要                                                                                                          |
| ----------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| extensions\workspaces\api.ts        | 46   |                                                                                                               |
| extensions\workspaces\data.tsx      | 34   |                                                                                                               |
| extensions\workspaces\lander.ts     | 1239 |                                                                                                               |
| extensions\workspaces\landing.tsx   | 256  |                                                                                                               |
| extensions\workspaces\log.tsx       | 538  |                                                                                                               |
| extensions\workspaces\panel.tsx     | 259  |                                                                                                               |
| extensions\workspaces\paths.ts      | 17   |                                                                                                               |
| extensions\workspaces\README.md     | 188  | An isolated conversation gets its own Git checkout. Coordinator branches started by @ultimate are isolated by |
| extensions\workspaces\refs.ts       | 72   |                                                                                                               |
| extensions\workspaces\server.ts     | 342  |                                                                                                               |
| extensions\workspaces\setup.ts      | 40   |                                                                                                               |
| extensions\workspaces\steps.tsx     | 14   | A running check's line gives way to its result, which follows it. */                                          |
| extensions\workspaces\types.ts      | 144  |                                                                                                               |
| extensions\workspaces\ui.tsx        | 19   |                                                                                                               |
| extensions\workspaces\web.tsx       | 120  | The lander's note in the root: the landing's card, from the note's own data, with the state it froze. */      |
| extensions\workspaces\workspaces.ts | 1057 |                                                                                                               |

## lib

| 文件                         | 行数 | 摘要                                                                                                                  |
| ---------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| lib\acting-as.ts             | 14   | Temporary copies act for their long-lived main. Read by kind to keep core extensions independent of side chats. */    |
| lib\actions.ts               | 36   | Server action handlers checked against their refs in `refs.ts`, so the browser's types and the server can't drift. */ |
| lib\agents.ts                | 586  | Agent definitions: parsing, discovery across the `agents/` folders, and the agent change a definition makes. */       |
| lib\ago.ts                   | 19   |                                                                                                                       |
| lib\api-files.ts             | 76   | An extension folder as discovery reports it (`host.extensions()`). */                                                 |
| lib\chapters.ts              | 158  | A project home's chapters: databases side by side, one active at a time. The first chapter is the home itself         |
| lib\cloud.ts                 | 84   | The user's cloud settings: the backup Worker's URL, its token and this machine's name. */                             |
| lib\compaction.ts            | 32   | Whether conversation `id` has a compaction that has not settled yet. */                                               |
| lib\compare.ts               | 4    | DiffsHub's view of `base...sha` for a `github.com/<owner>/<repo>` key: GitHub's compare path on diffshub.com. */      |
| lib\context-usage.ts         | 71   | What a response's prompt took: the context it was sent with. */                                                       |
| lib\database-files.ts        | 20   | A project home's database files, shared by cloud backups, `pnpm reset` and `pnpm restore`.                            |
| lib\entries.ts               | 16   | Pi inputs and harness-marked typed inputs count; user-role writes are context, not requests. */                       |
| lib\exec.ts                  | 4    | Run a program without a shell: resolves `{ stdout, stderr }`, rejects with them attached to execFile's error. */      |
| lib\fast-forward.ts          | 121  |                                                                                                                       |
| lib\git.ts                   | 36   | Where and how long a git command runs; defaults: 30 seconds, 1 MiB of output. `timeout: 0` waits indefinitely. */     |
| lib\json-file.ts             | 84   | A JSON file's value, `fallback` when the file is missing; other read and parse errors throw. */                       |
| lib\process-group.ts         | 335  | The program cannot start until its pid is recorded; a parent that dies before go gives EOF instead. */                |
| lib\project-identity.ts      | 36   | `github.com/<owner>/<repo>`, lowercased, for a GitHub SSH or HTTPS remote URL; undefined for any other. */            |
| lib\rate-limit.ts            | 11   |                                                                                                                       |
| lib\remote.ts                | 168  |                                                                                                                       |
| lib\secrets.ts               | 62   | Read-only access to the user's secret store, `~/.ultimate/secrets.json`; the secrets extension owns writes.           |
| lib\settings.ts              | 15   | This machine's settings file, `~/.ultimate/settings.json`. */                                                         |
| lib\shell.ts                 | 128  |                                                                                                                       |
| lib\title.ts                 | 22   | The identity note every conversation starts with; it names the conversation, not its task. */                         |
| lib\windows-process-group.ts | 357  |                                                                                                                       |

## lint

| 文件             | 行数 | 摘要 |
| ---------------- | ---- | ---- |
| lint\ultimate.ts | 602  |      |

## scripts

| 文件                     | 行数 | 摘要                                                                                                                  |
| ------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------- |
| scripts\deps.ts          | 117  | The dependency graph between built-in extensions: prints it and fails on a cycle or on a core-tier extension that     |
| scripts\reset.ts         | 215  | Start a project's Ultimate from a fresh state: its conversation state moves into a backup folder, nothing is deleted. |
| scripts\restore.ts       | 321  | Install a project's cloud backup as its state on this machine: the current state moves into a backup folder first.    |
| scripts\setup-machine.ts | 357  | Installs Ultimate as a service: on Linux a systemd user unit with linger, so it starts at boot without a login; on    |

## server

| 文件                          | 行数 | 摘要                                                                                                                     |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| server\actions.ts             | 40   | The browser that asked, for a call from the UI; agents' calls have none. */                                              |
| server\api.ts                 | 666  |                                                                                                                          |
| server\build.ts               | 82   |                                                                                                                          |
| server\discovery.ts           | 79   |                                                                                                                          |
| server\events.ts              | 344  | Durable events: the log is one ownerless conversation that never runs, and an event is a typed entry in it, so entry     |
| server\extension-apis.ts      | 130  | Tarjan's strongly connected components with more than one member: each sorted, sorted by first member. */                |
| server\extension-settings.ts  | 55   |                                                                                                                          |
| server\extensions.ts          | 806  |                                                                                                                          |
| server\harness.ts             | 295  |                                                                                                                          |
| server\http.ts                | 107  | Pi coupling (@earendil-works/pi-coding-agent@1.5.0 src/core/http-dispatcher.ts — copied, not exported; prevents early... |
| server\lock.ts                | 119  |                                                                                                                          |
| server\main.ts                | 316  |                                                                                                                          |
| server\metadata.ts            | 17   | Published shell metadata: explicit naming plus input naming and activity maintained by conversations. */                 |
| server\models.ts              | 39   |                                                                                                                          |
| server\project-setup.ts       | 80   |                                                                                                                          |
| server\project.ts             | 120  |                                                                                                                          |
| server\request-security.ts    | 130  |                                                                                                                          |
| server\services.ts            | 10   |                                                                                                                          |
| server\skills.ts              | 66   | A loaded skill with where it came from, and the paths of same-named skills it overrides in earlier scopes. */            |
| server\supervisor-protocol.ts | 57   |                                                                                                                          |
| server\system.ts              | 203  |                                                                                                                          |
| server\tool-arguments.ts      | 237  |                                                                                                                          |
| server\trace.ts               | 510  | The call trace: who called what, for how long, whether it failed, and the work it belongs to. Tool executions,           |
| server\ui-state.ts            | 11   |                                                                                                                          |
| server\view-window.ts         | 40   | Non-head entries a conversation stream starts with; older ones are paged in through `/history`. */                       |
| server\vite-extensions.ts     | 145  |                                                                                                                          |
| server\vite-logger.ts         | 22   |                                                                                                                          |
| server\watch-roots.ts         | 40   | Watch missing roots through their nearest existing parent, without scanning siblings. */                                 |

## shared

| 文件                    | 行数 | 摘要                                                                                                                  |
| ----------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| shared\events.ts        | 75   | Ids of the work an event happened in, from the call trace: a reactor's run continues `traceId` under `parentCall`. */ |
| shared\extension-api.ts | 75   |                                                                                                                       |
| shared\protocol.ts      | 209  |                                                                                                                       |

## skills\ego-browser

| 文件                        | 行数 | 摘要 |
| --------------------------- | ---- | ---- |
| skills\ego-browser\SKILL.md | 8    | ---  |

## skills\how-ultimate-works

| 文件                               | 行数 | 摘要 |
| ---------------------------------- | ---- | ---- |
| skills\how-ultimate-works\SKILL.md | 68   | ---  |

## skills\integrate-ultimate

| 文件                               | 行数 | 摘要 |
| ---------------------------------- | ---- | ---- |
| skills\integrate-ultimate\SKILL.md | 138  | ---  |

## skills\ui-preview-round

| 文件                             | 行数 | 摘要 |
| -------------------------------- | ---- | ---- |
| skills\ui-preview-round\SKILL.md | 26   | ---  |

## skills\verify-ui

| 文件                      | 行数 | 摘要 |
| ------------------------- | ---- | ---- |
| skills\verify-ui\SKILL.md | 38   | ---  |

## skills\write-extension

| 文件                            | 行数 | 摘要 |
| ------------------------------- | ---- | ---- |
| skills\write-extension\SKILL.md | 40   | ---  |

## skills\wsl-gate

| 文件                     | 行数 | 摘要 |
| ------------------------ | ---- | ---- |
| skills\wsl-gate\SKILL.md | 72   | ---  |

## web\src\app

| 文件                                | 行数 | 摘要                                                                                                                 |
| ----------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| web\src\app\App.tsx                 | 179  |                                                                                                                      |
| web\src\app\boundary.tsx            | 255  | A compact card naming the extension that failed. `inline` fits a status line or toolbar. */                          |
| web\src\app\card.tsx                | 14   | The transcript's card: a bordered section with the brand accent on its left edge; `className` adds to it. */         |
| web\src\app\compact.ts              | 260  | A transcript row: an entry, or only some content blocks of an assistant message. */                                  |
| web\src\app\composer.tsx            | 425  |                                                                                                                      |
| web\src\app\fold.tsx                | 69   | Where a card's expand state lives: `ultimate.fold.<conversation>.<card>`, the card an entry id or a tool call id. */ |
| web\src\app\follow.ts               | 19   | Where the view was last placed, and where it is now. */                                                              |
| web\src\app\fork.ts                 | 19   |                                                                                                                      |
| web\src\app\header.tsx              | 157  |                                                                                                                      |
| web\src\app\keyboard.ts             | 77   |                                                                                                                      |
| web\src\app\layout.ts               | 3    | The reading column of the transcript and composer; `dock` fits them into a narrow side region. */                    |
| web\src\app\message-actions.tsx     | 94   |                                                                                                                      |
| web\src\app\model.ts                | 91   | Tool results by call id, and the ids of calls some assistant entry made. */                                          |
| web\src\app\palette.tsx             | 80   |                                                                                                                      |
| web\src\app\primitives.tsx          | 480  | The building blocks of surfaces, exported from `@/sdk`. Each is a thin wrapper over what the shell already has.      |
| web\src\app\queued.ts               | 101  |                                                                                                                      |
| web\src\app\surface.ts              | 10   | The id of the surface that is rendering; the host provides it. */                                                    |
| web\src\app\titlebar.tsx            | 376  |                                                                                                                      |
| web\src\app\tool-call.tsx           | 52   |                                                                                                                      |
| web\src\app\transcript-skeleton.tsx | 48   | Placeholder turns: a user message, then a reply's lines around its tool row, widths varied to read like text. */     |
| web\src\app\transcript.tsx          | 1345 |                                                                                                                      |
| web\src\app\user-turn.tsx           | 107  | The text blocks of a user message, joined. */                                                                        |

## web\src\components\ai

| 文件                                   | 行数 | 摘要                                                                                              |
| -------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| web\src\components\ai\ansi-output.tsx  | 15   | Keep this control filter aligned with the pi-durable sanitizeOutput patch.                        |
| web\src\components\ai\code-block.tsx   | 150  | Adapted from vercel/ai-elements packages/elements/src/code-block.tsx (Apache-2.0, see LICENSE).   |
| web\src\components\ai\conversation.tsx | 72   | Adapted from vercel/ai-elements packages/elements/src/conversation.tsx (Apache-2.0, see LICENSE). |
| web\src\components\ai\mentions.ts      | 57   |                                                                                                   |
| web\src\components\ai\message.tsx      | 99   | Adapted from vercel/ai-elements packages/elements/src/message.tsx (Apache-2.0, see LICENSE).      |
| web\src\components\ai\prompt-input.tsx | 79   | Adapted from vercel/ai-elements packages/elements/src/prompt-input.tsx (Apache-2.0, see LICENSE). |
| web\src\components\ai\reasoning.tsx    | 56   | Adapted from vercel/ai-elements packages/elements/src/reasoning.tsx (Apache-2.0, see LICENSE).    |
| web\src\components\ai\shimmer.tsx      | 33   | Adapted from vercel/ai-elements packages/elements/src/shimmer.tsx (Apache-2.0, see LICENSE).      |
| web\src\components\ai\tool.tsx         | 202  | Adapted from vercel/ai-elements packages/elements/src/tool.tsx (Apache-2.0, see LICENSE).         |

## web\src\components

| 文件                               | 行数 | 摘要 |
| ---------------------------------- | ---- | ---- |
| web\src\components\image-paste.tsx | 114  |      |
| web\src\components\json-tree.tsx   | 92   |      |

## web\src\components\ui

| 文件                                    | 行数 | 摘要                                                                                                             |
| --------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| web\src\components\ui\button.tsx        | 57   |                                                                                                                  |
| web\src\components\ui\checkbox.tsx      | 22   | A checkbox in the brand colour; inside a `<label>`, the whole row toggles it. */                                 |
| web\src\components\ui\collapsible.tsx   | 90   | Radix's Collapsible measures every content on mount (a forced style read and layout each) to animate its height, |
| web\src\components\ui\command.tsx       | 136  |                                                                                                                  |
| web\src\components\ui\dialog.tsx        | 93   |                                                                                                                  |
| web\src\components\ui\dropdown-menu.tsx | 107  |                                                                                                                  |
| web\src\components\ui\kbd.tsx           | 25   |                                                                                                                  |
| web\src\components\ui\popover.tsx       | 32   |                                                                                                                  |
| web\src\components\ui\rows.tsx          | 34   | Label/value rows with aligned values, as the Info panel shows them. */                                           |
| web\src\components\ui\skeleton.tsx      | 16   | shadcn/ui skeleton. Changes: instead of each pulsing, one band of light sweeps across every block on screen; its |
| web\src\components\ui\switch.tsx        | 34   | An on/off switch. While `busy` it ignores presses but keeps focus, which `disabled` would drop. */               |
| web\src\components\ui\tooltip.tsx       | 46   |                                                                                                                  |

## web\src

| 文件                  | 行数 | 摘要                                                                                                           |
| --------------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| web\src\extensions.ts | 73   | Discovers and hot-reloads the web facets of extensions/*. The registry (sdk/registry.ts) does the bookkeeping. |
| web\src\index.css     | 357  |                                                                                                                |

## web\src\lib

| 文件                 | 行数 | 摘要                                                                                   |
| -------------------- | ---- | -------------------------------------------------------------------------------------- |
| web\src\lib\utils.ts | 2    | Where `pnpm dlx shadcn@latest add` components import `cn` from (`components.json`). */ |

## web\src

| 文件             | 行数 | 摘要                                                                                                                     |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| web\src\main.tsx | 14   | oxlint-disable-next-line typescript/no-floating-promises -- setLoaders settles loaders and records each facet's error... |

## web\src\sdk

| 文件                               | 行数 | 摘要                                                                                                                     |
| ---------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| web\src\sdk\actions.ts             | 205  |                                                                                                                          |
| web\src\sdk\api.ts                 | 152  |                                                                                                                          |
| web\src\sdk\client.ts              | 140  |                                                                                                                          |
| web\src\sdk\conversation-scope.tsx | 33   | The entries loaded by the nearest transcript or composer; a new scope resets inherited history. */                       |
| web\src\sdk\events.ts              | 33   | Pi coupling (@earendil-works/pi-coding-agent@1.5.0 src/core/event-bus.ts — adapted: Pi's bus uses node:events; use br... |
| web\src\sdk\format.ts              | 68   | Pi coupling (@earendil-works/pi-coding-agent@1.5.0 src/modes/interactive/components/footer.ts — copied formatTokens h... |
| web\src\sdk\hooks.ts               | 537  |                                                                                                                          |
| web\src\sdk\index.ts               | 168  |                                                                                                                          |
| web\src\sdk\keys.ts                | 41   | Shortcuts: `mod+shift+k`, sequences separated by spaces (`mod+k m`). `mod` is ⌘ on macOS and Ctrl elsewhere. */          |
| web\src\sdk\registry.ts            | 608  |                                                                                                                          |
| web\src\sdk\resume.ts              | 121  |                                                                                                                          |
| web\src\sdk\store.ts               | 422  |                                                                                                                          |
| web\src\sdk\test-hook.ts           | 189  | `window.ultimate` on pages the browser tool drives: send input and wait on Ultimate's state instead of on time.          |
| web\src\sdk\types.ts               | 299  | Named places in the shell that extensions fill with components. */                                                       |
| web\src\sdk\ui-state.ts            | 160  |                                                                                                                          |
| web\src\sdk\viewport.ts            | 33   |                                                                                                                          |

## web\src

| 文件                    | 行数 | 摘要 |
| ----------------------- | ---- | ---- |
| web\src\web-facets.d.ts | 3    |      |
