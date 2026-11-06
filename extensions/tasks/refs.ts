/** Tasks in the browser: when the durable tasks of the task tree first ran, running parked ones again, and DAG history. Browser-safe. */
import { actionRef } from '../../shared/extension-api.ts'

/** `{ ids }` → `{ [taskId]: startedAt }`: when each task first ran, in milliseconds; unstarted or gone ones are left out. */
export const StartedAction = actionRef<{ ids: number[] }, Record<string, number>>(
  'tasks',
  'started',
)

/**
 * What a task's input says about it, for naming it in plain words: who a message goes to, which automation, which
 * conversation a chore is for. Fixed for the task's life, so asked once per task. Each field is optional: a kind
 * fills the ones it has.
 */
export type TaskFacts = {
  /** A `board.delivery`'s message; in its `reply` phase the answer goes back to `from`. */
  message?: {
    id: number
    from: number | 'user' | 'remote'
    to: number | 'user' | 'remote'
    reply: boolean
    note: boolean
    /** Its first line, shortened. */
    gist: string
  }
  /** The conversation the task works for or waits on, when it is not the one that owns it. */
  conversation?: number
  /** An automation's name. */
  automation?: string
  /** A tool call's tool name. */
  tool?: string
  /** A lander's source checkout. */
  source?: string
}

/** `{ ids }` → `{ [taskId]: facts }`; gone tasks are left out. */
export const DescribeAction = actionRef<{ ids: number[] }, Record<string, TaskFacts>>(
  'tasks',
  'describe',
)

/** The durable end of a task that has left the live graph: its outcome and end time. */
export type TaskEnd = {
  outcome: 'completed' | 'failed' | 'aborted' | 'orphaned' | 'faulted'
  endedAt?: number
}

/** `{ ids }` → `{ [taskId]: end }`; tasks still live, or unknown, are left out. */
export const EndedAction = actionRef<{ ids: number[] }, Record<string, TaskEnd>>('tasks', 'ended')

/** How a run's turn or one of its tasks ended; `running` is any not-yet-terminal state. */
export type RunOutcome =
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'orphaned'
  | 'faulted'
  /** The turn ended without an answer (turn_limit, reset, failed): its answer is unclaimed. */
  | 'unanswered'

export type TaskStatus = 'pending' | 'running' | 'waiting' | 'sleeping' | 'completing' | 'terminal'

/** How the run's turn ended, from the durable submissions that settle it. */
export type RunEnd =
  /** Rounds are live or its inputs are placed but unsettled. */
  | { status: 'running' }
  /** The answer entry the run's submissions share. */
  | { status: 'answered'; entryId: number }
  /** The turn ended without an answer: turn_limit, reset, failed, ... */
  | { status: 'unanswered'; reason: string }
  /** No settled submission is visible for the run; only ordering brackets it. */
  | { status: 'unknown'; note: string }

/** What the reconstruction could not prove about a run; a run with none is fully proven. */
export type RunUncertainty = {
  kind: 'boundary' | 'continuation' | 'attribution' | 'settlement' | 'window'
  note: string
  taskId?: number
  conversationId?: number
}

/** A child-agent conversation related to the run, and what (little) proves the link. */
export type RunChild = {
  conversationId: number
  agent: string
  /** The `ultimate.subagent-anchor` task in the run's conversation whose `owner.taskId` names this child. */
  anchorTaskId?: number
  /** A run-owned task whose input names the child (a subagent tool call), when one exists. */
  spawnTaskId?: number
  association: 'owner' | 'tool' | 'anchor' | 'overlap'
  /** `proven` only for an owner edge from a run-owned task; anchors and timing are never proof. */
  confidence: 'proven' | 'inferred' | 'ambiguous'
  /** When the child was spawned: the anchor's or naming task's start. */
  startedAt?: number
  /** The child's last turn end inside the run window, when one was found. */
  endedAt?: number
  /** The child's turns inside the run window only — never unrelated later turns. */
  generationIds?: number[]
  /** The evidence and why it is (not) proof; shown as-is. */
  note: string
}

/** Token and cost totals, when the durable record reports them. */
export type UsageTotals = { tokens?: number; cost?: number }

/** One durable task as the history surface reads it: no checkpoint, no result body, only what it draws. */
export type RunTask = {
  id: number
  conversationId: number
  kind: string
  owner?: number
  /** The generation round whose owner tree roots this task; the round's own id for a round. */
  generationId?: number
  background: boolean
  abortRequested: boolean
  status: TaskStatus
  /** A missing or un-migratable task definition prevents this live task running. */
  blocked?: string
  phase?: string
  /** The tasks a `waiting` task is parked on. */
  on?: number[]
  policy?: string
  /** When a `sleeping` task wakes. */
  until?: number
  outcome?: RunOutcome
  /** A tool can complete normally while its result reports an error. */
  toolError?: boolean
  /** The first line of a failure outcome's error. */
  error?: string
  /** An abort or orphan reason. */
  reason?: string
  startedAt?: number
  endedAt?: number
  /** A `pi.tool`'s tool name, when its input names one. */
  tool?: string
  /** First line of the tool arguments, for the expanded node card. */
  detail?: string
  /** How many times a restart cut the task off. */
  restarts?: number
  /** What the input says about the task, for naming it in plain words. */
  facts?: TaskFacts
  /** Token and cost totals of this task alone, when `costDetail` is `tool`. */
  usage?: UsageTotals
}

/** One run row and its summary strip. */
export type RunSummary = {
  id: number
  conversationId: number
  agent: string
  startedAt: number
  endedAt?: number
  outcome: RunOutcome
  taskCount: number
  failedCount: number
  /** Counts and totals cover only the first 5000 tasks when true. */
  truncated?: boolean
  /** The model configured for the run's conversation, when one is set. */
  model?: string
  /** Tool calls among the run's tasks. */
  toolCount?: number
  /** Model rounds (generation tasks) in the reconstructed run. */
  generationCount?: number
  /** Child-agent conversations related to the run; set on `tasks/run`. */
  childCount?: number
  tokens?: number
  cost?: number
}

/** One conversation in the left rail. */
export type RunConversation = {
  id: number
  agent: string
  runs: number
  lastAt: number
  /** The newest run inside the visible window, so its frame can open before its run page loads. */
  lastRunId?: number
  lastRunAt?: number
}

export type RunDetail = {
  run: RunSummary
  tasks: RunTask[]
  /** The run has more tasks than the 5000 the action returns. */
  truncated: boolean
  /** Every generation round of the run, ascending; the first is the root (= `run.id`). Each is an owner-tree
   * root: pass all of them to `mergeRunLive`, never `run.id` alone. */
  generationIds: number[]
  /** The input submissions of the run (its inputs and steers), ascending. */
  submissions: number[]
  /** How the turn ended, from the durable submissions. */
  end: RunEnd
  /** Child-agent conversations related to this run only, with what proves the link. */
  children: RunChild[]
  /** Everything the reconstruction could not prove; empty means the run is fully proven. */
  uncertainties: RunUncertainty[]
}

/** `tasks.historyDays` and `tasks.costDetail` from a project settings object, with the design's defaults. */
export type TaskSettings = { historyDays: number; costDetail: 'run' | 'tool' }

/** `{ days? }` → every conversation with a run, its agent name, run count and last activity, for the left rail. */
export const ConversationsAction = actionRef<{ days?: number } | null, RunConversation[]>(
  'tasks',
  'conversations',
)

/** `{ conversationIds, days?, before?, limit? }` → one newest-first page of run summaries. */
export const HistoryAction = actionRef<
  { conversationIds: number[]; days?: number; before?: number; limit?: number },
  { runs: RunSummary[]; cursor?: string }
>('tasks', 'history')

/** `{ id, costDetail? }` → one run's tasks (at most 5000) and its summary. `id` is any generation round of the run. */
export const RunAction = actionRef<{ id: number; costDetail?: 'run' | 'tool' }, RunDetail>(
  'tasks',
  'run',
)

/** `{ historyDays?, costDetail? }` → the effective `tasks` settings after a project-settings write. */
export const SettingsAction = actionRef<
  { historyDays?: number; costDetail?: 'run' | 'tool' },
  TaskSettings
>('tasks', 'settings')
