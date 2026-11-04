| activity | The right panel's Activity tab: what happened in the project, newest first, from the durable event log. |
| agent | The built-in Agent surface: the conversation in a centred column, with the sidebar and the right panel beside it. |
| automations | Durable schedules, domain events, context thresholds and supervised scripts, with actions that start prompt runs or wake subscribed conversations. |
| browser | Prefer ego-browser (ego-lite) for browsing and browser-based testing. |
| classify | Classify provides typed judgments from TypeSafe's Jev System One model to other server facets. |
| claude-code | Claude Code is an experimental provider that uses the external CLI login, with a setup panel and no in-app OAuth flow. |
| cloud | Cloud Encrypted project backups in the user's cloud, inert until configured. |
| codemode | Run an async JavaScript function body in a fresh QuickJS/WASM sandbox. |
| coding-tools | Commits made through the shell tool (`bash`, or `powershell` on Windows) carry an `Ultimate-Conversation: <id>` trailer via process-local Git config hooks; c... |
| context | What the model saw before a conversation's first input: a quiet header above it names the agent, its model and the estimated token budget, and opens to the a... |
| conversations | What each conversation is about: titles, summaries, features and reply summaries, the overview the sidebar reads, and concluding and resuming conversations. |
| debug | A read-only `debug` tool for finding out why something did or did not happen in the running Ultimate, and for following one chain of work across extensions. |
| documents | Show the shown conversation's extension documents in the right panel, each through its extension's renderer or as JSON. |
| dream | Dream: a working session in which Ultimate processes what it learned, like people do while they sleep. |
| fast | Fast mode runs the OpenAI models named in `fastModels` on the priority service tier, about twice the output speed. |
| goal | Hands-off goals: put @ultimate on a goal and go away; it decides what it would otherwise ask you, records each decision with its reason, and leaves a report. |
| health | Tracks whether each model provider works on this machine, from every real response, and reports a failing one to the `setup` status-line item. |
| info | What this Ultimate runs on, in the right panel's Info tab: the shown conversation's workspace (its checkout, the lander queue and every checkout counted, fro... |
| instance | Run an on-demand second Ultimate to test core changes before restarting the shared host, or, in another project, to check that project's `.ultimate/` extensi... |
| keep-warm | Keeps @ultimate's Claude prompt cache warm while you are away for a while, so your next message reads the whole conversation from the cache instead of writin... |
| lineage | A project is a forest of conversation trees. |
| messages | Messages Durable messages between conversations, standing agents and the user. |
| models | Model, thinking, and login, as Pi does them: a model button and a thinking-level button in the composer toolbar, a searchable model picker grouped by provide... |
| notices | Notices as small toasts centred under the header, so they never cover the sidebar or an open right panel: what the server reports with `notice` events (a fai... |
| onboarding | Inline setup choices, the first-run prerequisites, and the Extensions panel that turns extensions on and off live. |
| parallel | Search the public web and fetch clean page content with parallel.ai through `web_search` and `web_fetch`. |
| pause | Pause the whole Ultimate host and continue it with Play. |
| phase | Phase Working-phase labels, classified by Jev after each tool round. |
| plan | Keep epics and tasks in a durable conversation ledger, with open work visible in the prompt. |
| prompt | Ultimate's system prompt: coding guidelines, project context, skills, and the source reload layers. |
| questions | Questions Answer cards for @ultimate's questions to the user. |
| recall | Recall Recall brings a project memory back to @ultimate when a message calls for it, deep in a long context where the memory index from its start has faded. |
| review | The Review surface: the project's local Git diffs, its files on the left and their changes on the right, rendered with `@pierre/diffs` in Ultimate's fonts an... |
| secrets | Manage user-global secrets through metadata-only server actions, shared by every Ultimate project. |
| self | Ultimate's awareness of its own code: the replay-safe `restart` tool requests a type-checked core swap from the supervisor (`pnpm start`). |
| setup | What isn't set up on this machine, and what that costs: one status-line item, `⚠ N setup issues`, shown only while something warns. |
| side-chat | Side chats are temporary, ownerless copies of the standing @ultimate conversation. |
| sidebar | The Agent surface's sidebar and, on phones, the title bar's @ultimate button: talk to @ultimate, see each root's tree with what is in flight and what landed,... |
| sounds | Sounds Short, soft notification sounds when @ultimate talks to you: a question (needs input), a finished answer, or a failed run. |
| splash | Ultimate opens with its name: the ULTIMATE wordmark draws itself over the whole window while the app loads, and the app comes up once the page is ready. |
| status | One compact, read-only summary of this Ultimate for dashboards that poll several instances: the clone's commit, failed runs, provider health, open questions ... |
| status-line | The line under the composer (`composer.status`) shows the conversation's cwd/workspace and git branch, `↑input ↓output R cacheRead W cacheWrite`, cache hit r... |
| subagents | Delegate bounded work with `subagent`: `start {agent, task, background?, fork?}`, `message {id, text, steer?}` (steers a busy child unless `steer: false` que... |
| system | One stream of everything Ultimate records: durable events (`host.eventLog`) and the call trace (`host.trace`: service, action, reactor, tool and model calls)... |
| tailscale | Expose Ultimate over Tailscale HTTPS, admitting only explicitly allowed Tailscale logins. |
| tasks | The live durable task graph in the right panel's Tasks tab: every conversation with live work, its tasks as a tree by owner (generation → tool calls → the co... |
| theme | The "Toggle light and dark theme" command in the palette. |
| todos | To-dos The project's short list of open loops, each owned by the user or @ultimate. |
| update | Update Keeps the Ultimate clone the host runs from (`host.ultimateRoot`, the `<self>` block's "Ultimate (running host)") current with its `origin`, by fast-... |
| voice | Voice input: a mic button beside Send records speech and puts its transcript into the draft at the cursor, unsent. |
| voice-live | Live voice pairs GPT-Live's audio with a fast Luna agent that decides what to pass to @ultimate. |
| watchdog | Reports failed runs to their subagent owner or @ultimate, and reminds @ultimate about open branches idle for more than 30 minutes (two hours while the branch... |
| workspaces | Workspaces An isolated conversation gets its own Git checkout. |
