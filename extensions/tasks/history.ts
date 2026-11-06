/**
 * Task DAG history: the pure model behind the history surface. A Run is one input submission through its answer: every
 * generation round (`pi.generation`) and the owner tree it spawned, reconstructed server-side in `runs.ts`.
 * Browser-safe: no storage, no React, so the server, the surface and the tests share it.
 */
import type { TaskGraphNode } from '@earendil-works/pi-durable'
import type { RunOutcome, RunSummary, RunTask, TaskSettings } from './refs.ts'

export type {
  RunConversation,
  RunDetail,
  RunOutcome,
  RunSummary,
  RunTask,
  TaskFacts,
  TaskSettings,
  TaskStatus,
  UsageTotals,
} from './refs.ts'

export const TASK_PAGE = 20
export const RUN_TASK_CAP = 5000

/** The design's defaults, used when project settings leave `tasks` unset or invalid. */
export const DEFAULT_TASK_SETTINGS: TaskSettings = { historyDays: 3, costDetail: 'run' }

/** A run is a top-level `pi.generation`: the kind and no owner (§3 of the design). */
export function isRun(task: { kind: string; owner?: number }): boolean {
  return task.kind === 'pi.generation' && task.owner == null
}

/** The outcome a status shows: the settled outcome, or `running` while anything is left to do. */
export function outcomeOf(task: Pick<RunTask, 'status' | 'outcome' | 'toolError'>): RunOutcome {
  if (task.status === 'terminal') return task.toolError ? 'failed' : (task.outcome ?? 'completed')
  return 'running'
}

/** Whether `task` failed in any of the ways the warning colour marks. */
export function failed(task: Pick<RunTask, 'status' | 'outcome' | 'toolError'>): boolean {
  const outcome = outcomeOf(task)
  return (
    outcome === 'failed' || outcome === 'faulted' || outcome === 'orphaned' || outcome === 'aborted'
  )
}

/** The owner chain from `task` reaches `runId`; a task's own id counts. */
export function ownedBy(
  task: Pick<RunTask, 'id' | 'owner'>,
  runId: number,
  byId: ReadonlyMap<number, Pick<RunTask, 'id' | 'owner'>>,
): boolean {
  const seen = new Set<number>()
  let current: Pick<RunTask, 'id' | 'owner'> | undefined = task
  while (current) {
    if (current.id === runId) return true
    if (current.owner == null || seen.has(current.id)) return false
    seen.add(current.id)
    current = byId.get(current.owner)
  }
  return false
}

/**
 * The tasks of `run` among `pool`: its conversation's records in the run's time window, then the owner-chain walk.
 * The run itself is always kept. Newest-first pools are fine; the result is by id.
 */
export function collectRunTasks(
  run: RunTask,
  pool: readonly RunTask[],
  cap = RUN_TASK_CAP,
): { tasks: RunTask[]; truncated: boolean } {
  const byId = new Map(pool.map((task) => [task.id, task]))
  byId.set(run.id, run)
  const end = run.endedAt ?? Number.POSITIVE_INFINITY
  const kept = pool.filter((task) => {
    if (task.id < run.id) return false
    if (task.startedAt !== undefined && task.startedAt > end) return false
    return ownedBy(task, run.id, byId)
  })
  if (!kept.some((task) => task.id === run.id)) kept.push(run)
  kept.sort((a, b) => a.id - b.id)
  return { tasks: kept.slice(0, cap), truncated: kept.length > cap }
}

/** How many direct and indirect children each task has. */
export function descendantsOf(tasks: readonly RunTask[]): Map<number, number> {
  const children = new Map<number, number[]>()
  for (const task of tasks) {
    if (task.owner === undefined) continue
    const list = children.get(task.owner) ?? []
    list.push(task.id)
    children.set(task.owner, list)
  }
  const counts = new Map<number, number>()
  const count = (id: number, seen: Set<number>): number => {
    if (counts.has(id)) return counts.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    let total = 0
    for (const child of children.get(id) ?? []) total += 1 + count(child, seen)
    counts.set(id, total)
    return total
  }
  for (const task of tasks) count(task.id, new Set())
  return counts
}

/**
 * The finished subtrees a fresh history view folds: every task whose descendants number at least two and have all
 * settled. The task itself may still be live (its finished tools are a fold); a live descendant keeps its subtree open.
 */
export function foldedByDefault(tasks: readonly RunTask[]): Set<number> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const counts = descendantsOf(tasks)
  const children = new Map<number, number[]>()
  for (const task of tasks) {
    if (task.owner === undefined) continue
    children.set(task.owner, [...(children.get(task.owner) ?? []), task.id])
  }
  const allFinished = (id: number, seen: Set<number>): boolean => {
    if (seen.has(id)) return false
    seen.add(id)
    const direct = children.get(id) ?? []
    return direct.every((child) => {
      const task = byId.get(child)
      return task !== undefined && outcomeOf(task) !== 'running' && allFinished(child, seen)
    })
  }
  const folded = new Set<number>()
  for (const task of tasks) {
    if (
      (children.get(task.id) ?? []).length > 0 &&
      counts.get(task.id)! >= 2 &&
      allFinished(task.id, new Set())
    )
      folded.add(task.id)
  }
  return folded
}

/** The ids of the tasks hidden because an ancestor is folded (or itself hidden). */
export function hiddenByFolding(
  tasks: readonly RunTask[],
  folded: ReadonlySet<number>,
): Set<number> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const hidden = new Set<number>()
  for (const task of tasks) {
    let owner = task.owner
    while (owner !== undefined) {
      if (folded.has(owner) || hidden.has(owner)) {
        hidden.add(task.id)
        break
      }
      owner = byId.get(owner)?.owner
    }
  }
  return hidden
}

/** Runs whose start is within the last `days`, newest first. `now` is wall-clock milliseconds. */
export function runsInDays(
  runs: readonly RunSummary[],
  days: number,
  now = Date.now(),
): RunSummary[] {
  const cutoff = now - days * 24 * 60 * 60 * 1000
  return runs.filter((run) => run.startedAt >= cutoff).toSorted((a, b) => b.startedAt - a.startedAt)
}

/** Frames from top to bottom by the earliest start among their tasks, then by conversation id. */
export function orderFrames<T extends { conversationId: number; earliest: number }>(
  frames: T[],
): T[] {
  return frames.toSorted((a, b) => a.earliest - b.earliest || a.conversationId - b.conversationId)
}

/** Number of failed tasks in a run, and its token/cost totals; undefined when no task reported one. */
export function runTotals(tasks: readonly RunTask[]): {
  failedCount: number
  tokens?: number
  cost?: number
} {
  let failedCount = 0
  let tokens: number | undefined
  let cost: number | undefined
  for (const task of tasks) {
    const outcome = outcomeOf(task)
    if (outcome === 'failed' || outcome === 'faulted' || outcome === 'orphaned') failedCount++
    if (task.usage?.tokens !== undefined) tokens = (tokens ?? 0) + task.usage.tokens
    if (task.usage?.cost !== undefined) cost = (cost ?? 0) + task.usage.cost
  }
  return { failedCount, tokens, cost }
}

/** A summary from a run task and its tasks; the agent name comes from the conversation. */
export function summarizeRun(
  run: RunTask,
  agent: string,
  tasks: readonly RunTask[],
  model?: string,
): RunSummary {
  const totals = runTotals(tasks)
  return {
    id: run.id,
    conversationId: run.conversationId,
    agent,
    ...(model === undefined ? {} : { model }),
    startedAt: run.startedAt ?? 0,
    ...(run.endedAt === undefined ? {} : { endedAt: run.endedAt }),
    outcome: outcomeOf(run),
    taskCount: tasks.length,
    failedCount: totals.failedCount,
    toolCount: tasks.filter((task) => task.kind === 'pi.tool').length,
    ...(totals.tokens === undefined ? {} : { tokens: totals.tokens }),
    ...(totals.cost === undefined ? {} : { cost: totals.cost }),
  }
}

/** A live graph node as a history task; `startedAt` comes from the `started` action because the graph carries no time. */
export function taskOfLive(node: TaskGraphNode, startedAt?: number): RunTask {
  const state = node.state
  const base: RunTask = {
    id: node.id,
    conversationId: node.conversationId,
    kind: node.kind,
    ...(node.owner === undefined ? {} : { owner: node.owner }),
    background: node.background,
    abortRequested: node.abortRequested,
    status: state.status,
    ...(node.blocked === undefined ? {} : { blocked: node.blocked }),
    ...(startedAt === undefined ? {} : { startedAt }),
  }
  if (state.status === 'waiting')
    return { ...base, phase: state.phase, on: [...state.on], policy: state.policy }
  if (state.status === 'sleeping') return { ...base, phase: state.phase, until: state.until }
  if (state.status === 'completing') return { ...base, outcome: state.outcome }
  return { ...base, phase: state.phase }
}

/**
 * Live nodes over the stored records: a task present in both takes the live state but keeps what only the record has
 * (its start/end, facts, usage); a live task absent from the records is added when its owner chain reaches the run.
 * The returned list is the full run, by id.
 */
export function mergeLive(
  stored: readonly RunTask[],
  live: readonly TaskGraphNode[],
  runId: number,
  started: Readonly<Record<string, number>> = {},
): RunTask[] {
  const byId = new Map<number, RunTask>(stored.map((task) => [task.id, task]))
  const liveById = new Map<number, TaskGraphNode>(live.map((node) => [Number(node.id), node]))
  for (const node of live)
    if (!byId.has(Number(node.id)))
      byId.set(Number(node.id), taskOfLive(node, started[Number(node.id)]))
  const merged = stored.map((task) => {
    const node = liveById.get(task.id)
    if (!node) return task
    return {
      ...task,
      ...taskOfLive(node, task.startedAt),
      blocked: node.blocked,
      facts: task.facts,
      usage: task.usage,
    }
  })
  const known = new Set(merged.map((task) => task.id))
  for (const node of live) {
    if (known.has(Number(node.id))) continue
    const task = byId.get(Number(node.id))!
    if (!ownedBy(task, runId, byId)) continue
    merged.push(task)
    known.add(task.id)
  }
  return merged.toSorted((a, b) => a.id - b.id)
}

/**
 * The full run over its stored records and the live graph. A run spans several round roots (every generation is its
 * own owner-tree root), so the merge takes all of them (`RunDetail.generationIds`), never just one run id.
 */
export function mergeRunLive(
  stored: readonly RunTask[],
  live: readonly TaskGraphNode[],
  roundRootIds: readonly number[],
  started: Readonly<Record<string, number>> = {},
): RunTask[] {
  let merged: RunTask[] = [...stored]
  for (const rootId of roundRootIds) merged = mergeLive(merged, live, rootId, started)
  return merged.toSorted((a, b) => a.id - b.id)
}

/** Longest dependency chain by task duration, for the Structure tab's critical-path highlight. */
export function criticalPath(tasks: readonly RunTask[], now = Date.now()): Set<number> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const next = new Map<number, number[]>()
  for (const task of tasks) {
    if (task.owner !== undefined && byId.has(task.owner))
      next.set(task.owner, [...(next.get(task.owner) ?? []), task.id])
    if (task.status === 'waiting')
      for (const blocker of task.on ?? [])
        if (byId.has(blocker)) next.set(blocker, [...(next.get(blocker) ?? []), task.id])
  }
  const weight = (task: RunTask) => Math.max(0, (task.endedAt ?? now) - (task.startedAt ?? now))
  const memo = new Map<number, { total: number; path: number[] }>()
  const visiting = new Set<number>()
  const walk = (id: number): { total: number; path: number[] } => {
    if (memo.has(id)) return memo.get(id)!
    if (visiting.has(id)) return { total: 0, path: [id] }
    visiting.add(id)
    let best = { total: weight(byId.get(id)!), path: [id] }
    for (const child of next.get(id) ?? []) {
      const tail = walk(child)
      const total = weight(byId.get(id)!) + tail.total
      if (total > best.total) best = { total, path: [id, ...tail.path] }
    }
    visiting.delete(id)
    memo.set(id, best)
    return best
  }
  let best = { total: 0, path: [] as number[] }
  for (const task of tasks) {
    const found = walk(task.id)
    if (found.total > best.total) best = found
  }
  return new Set(best.path)
}

/** `tasks.historyDays` and `tasks.costDetail` from a project settings object, with the design's defaults. */
export function taskSettings(value: unknown): TaskSettings {
  const settings =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const tasks =
    settings.tasks && typeof settings.tasks === 'object' && !Array.isArray(settings.tasks)
      ? (settings.tasks as Record<string, unknown>)
      : {}
  const days = tasks.historyDays
  const historyDays =
    typeof days === 'number' && Number.isSafeInteger(days) && days >= 1
      ? days
      : DEFAULT_TASK_SETTINGS.historyDays
  const costDetail = tasks.costDetail === 'tool' ? 'tool' : 'run'
  return { historyDays, costDetail }
}
