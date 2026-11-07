import { join } from 'node:path'
import type { JsonValue } from '@earendil-works/chord'
import { BACKGROUND_CONTEXT as context, withAbortSignal } from '@earendil-works/chord/context'
import { AssistantEntry } from '@earendil-works/pi-durable'
import type { ConversationId, EntryId, TaskId, TaskRecord, Tx } from '@earendil-works/pi-durable'
import { implementAction } from '../../lib/actions.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { updateSettings } from '../../lib/settings.ts'
import { AutomationsApi } from '../automations/api.ts'
import type { Message } from '../messages/api.ts'
import { DEFAULT_TASK_SETTINGS, isRun, RUN_TASK_CAP, taskSettings } from './history.ts'
import type {
  RunConversation,
  RunDetail,
  RunSummary,
  RunTask,
  TaskSettings,
  UsageTotals,
} from './history.ts'
import {
  attributeChildren,
  collectUnitTasks,
  generationOfTask,
  reconstructRuns,
  summarizeUnit,
} from './runs.ts'
import type {
  AnchorFact,
  ConversationFact,
  GenerationFact,
  RunUnit,
  SubmissionFact,
} from './runs.ts'
import {
  ConversationsAction,
  DescribeAction,
  EndedAction,
  HistoryAction,
  RunAction,
  SettingsAction,
  StartedAction,
} from './refs.ts'
import type { RunChild, TaskEnd, TaskFacts } from './refs.ts'

type Input = Record<string, unknown> | null | undefined
type AnyTask = TaskRecord<JsonValue, JsonValue, JsonValue>
/** The message's opening words, lines joined: a first line alone is often only "The user's go:". */
const gist = (text: string) => {
  const words = text.replace(/\s+/g, ' ').trim()
  return words.length > 100 ? `${words.slice(0, 99)}…` : words
}

/** The conversation a task's input names, under whichever field its kind uses. */
const conversationOf = (input: Input) => {
  for (const key of ['conversationId', 'conversation', 'target', 'id', 'to'])
    if (typeof input?.[key] === 'number') return input[key]
  return undefined
}

/** What one task's input says about it; see `TaskFacts`. */
async function facts(host: ExtensionHost, tx: Tx, kind: string, input: Input): Promise<TaskFacts> {
  switch (kind) {
    case 'board.delivery': {
      // In its `reply` phase it carries the recipient's answer back to this message's sender.
      const m = input?.message as Message
      return {
        message: {
          id: m.id,
          from: m.from,
          to: m.to,
          reply: m.reply,
          note: input?.note === true,
          gist: gist(m.text),
        },
      }
    }
    case 'pi.tool': {
      const call = input?.call as { name?: string } | undefined
      if (call?.name) return { tool: call.name }
      const entry = await tx.entry(AssistantEntry, input?.assistant as EntryId)
      const message = entry?.model?.[0]
      const part =
        message?.role === 'assistant'
          ? message.content.find((item) => item.type === 'toolCall' && item.id === input?.callId)
          : undefined
      return part?.type === 'toolCall' ? { tool: part.name } : {}
    }
    case 'ultimate.automation-scheduler': {
      const a = await host.want(AutomationsApi)?.read(tx, input?.id as string)
      return a ? { automation: a.name } : {}
    }
    case 'ultimate.automation-run':
      return { automation: (input!.automation as { name: string }).name }
    case 'ultimate.automation-delivery':
      return { automation: (input!.sub as { name: string }).name }
    // Which submission it lands changes as it works the queue; the panel reads that from the live queue.
    case 'workspaces.lander':
      return { source: input?.source as string }
    default: {
      const conversation = conversationOf(input)
      return conversation === undefined ? {} : { conversation }
    }
  }
}

/** The first line of a tool call's arguments, cut to what one card can show. */
const argsLine = (value: unknown) => {
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value ?? {})
  } catch {
    text = ''
  }
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}

/** A `pi.tool` task's tool name and argument preview, reading the assistant entry once per model round. */
async function toolFacts(
  tx: Tx,
  input: Input,
  assistants: Map<number, Map<string, { name: string; detail: string }>>,
): Promise<{ tool?: string; detail?: string }> {
  const nested = input?.call as { name?: string; arguments?: unknown } | undefined
  if (nested?.name) return { tool: nested.name, detail: argsLine(nested.arguments) }
  const assistant = input?.assistant
  if (typeof assistant !== 'number') return {}
  let calls = assistants.get(assistant)
  if (!calls) {
    calls = new Map()
    const entry = await tx.entry(AssistantEntry, assistant as EntryId)
    const message = entry?.model?.[0]
    if (message?.role === 'assistant')
      for (const part of message.content)
        if (part.type === 'toolCall')
          calls.set(part.id, { name: part.name, detail: argsLine(part.arguments) })
    assistants.set(assistant, calls)
  }
  return calls.get(String(input?.callId)) ?? {}
}

/** Add a result entry's reported usage and tool error, without confusing task settlement with tool success. */
async function resultOf(tx: Tx, record: AnyTask, task: RunTask): Promise<UsageTotals | undefined> {
  if (record.state.status !== 'terminal' && record.state.status !== 'completing') return undefined
  const result = record.state.outcome.result as { entryId?: unknown } | undefined
  if (typeof result?.entryId !== 'number') return undefined
  const message = (await tx.entry(result.entryId as EntryId))?.model?.[0]
  if (!message) return undefined
  if (message.role === 'toolResult' && message.isError) {
    task.toolError = true
    const text = message.content.find((part) => part.type === 'text')
    if (!task.error && text?.type === 'text') task.error = text.text.split('\n')[0]
  }
  if (message.role !== 'toolResult' && message.role !== 'assistant') return undefined
  const usage = message.usage
  if (!usage) return undefined
  const totals: UsageTotals = {}
  if (typeof usage.totalTokens === 'number') totals.tokens = usage.totalTokens
  if (typeof usage.cost?.total === 'number') totals.cost = usage.cost.total
  return totals.tokens === undefined && totals.cost === undefined ? undefined : totals
}

/** A durable record narrowed to what the history surface draws; checkpoints and result bodies stay here. */
function taskOf(record: AnyTask): RunTask {
  const state = record.state
  const checkpoint =
    'checkpoint' in state &&
    state.checkpoint &&
    typeof state.checkpoint === 'object' &&
    !Array.isArray(state.checkpoint)
      ? state.checkpoint
      : undefined
  const phase = typeof checkpoint?.phase === 'string' ? checkpoint.phase : undefined
  const base: RunTask = {
    id: record.id,
    conversationId: record.conversationId,
    kind: record.kind,
    ...(record.owner === undefined ? {} : { owner: record.owner }),
    background: record.background,
    abortRequested: record.abortRequested,
    status: state.status,
    ...(record.startedAt === undefined ? {} : { startedAt: record.startedAt }),
    ...(record.endedAt === undefined ? {} : { endedAt: record.endedAt }),
    ...(record.restarts === undefined ? {} : { restarts: record.restarts }),
  }
  if (state.status === 'waiting') return { ...base, phase, on: [...state.on], policy: state.policy }
  if (state.status === 'sleeping') return { ...base, phase, until: state.until }
  if (state.status === 'completing' || state.status === 'terminal') {
    const outcome = state.outcome
    return {
      ...base,
      outcome: outcome.status,
      ...('error' in outcome && outcome.error?.message
        ? { error: outcome.error.message.split('\n')[0] }
        : {}),
      ...('reason' in outcome && outcome.reason ? { reason: outcome.reason } : {}),
    }
  }
  return { ...base, phase }
}

/** A durable record as the reconstruction reads it: its round's end marker is the result's assistant entry. */
function factOf(record: AnyTask): GenerationFact {
  const task = taskOf(record)
  const state = record.state
  const result =
    state.status === 'terminal' || state.status === 'completing'
      ? (state.outcome.result as { entryId?: unknown } | undefined)
      : undefined
  return {
    id: task.id,
    conversationId: task.conversationId,
    status: task.status,
    ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
    ...(task.endedAt === undefined ? {} : { endedAt: task.endedAt }),
    ...(state.status === 'terminal' ? { outcome: state.outcome.status } : {}),
    ...(typeof result?.entryId === 'number' ? { resultEntryId: result.entryId } : {}),
  }
}

/**
 * A conversation's tasks, newest first until `stopId`; scanning stops at the first older id because a child is always
 * created after its owner. 1000 per page keeps the transaction short.
 */
async function scanConversation(
  tx: Tx,
  conversationId: number,
  stopId: number,
  signal: AbortSignal,
): Promise<RunTask[]> {
  const out: RunTask[] = []
  let cursor: Parameters<Tx['scanTasks']>[2]
  while (true) {
    signal.throwIfAborted()
    const result = await tx.scanTasks(
      { conversationId: conversationId as ConversationId, order: 'descending' },
      1000,
      cursor,
    )
    for (const record of result.items) {
      if (record.id < stopId) return out
      out.push(taskOf(record))
    }
    if (!result.next) break
    cursor = result.next
  }
  return out
}

/** The top-level generation rounds of one conversation (or all), ascending; `isRun` keeps conversation-owned ones. */
async function scanGenerationFacts(
  tx: Tx,
  conversationId: number | undefined,
  signal: AbortSignal,
): Promise<GenerationFact[]> {
  const out: GenerationFact[] = []
  let cursor: Parameters<Tx['scanTasks']>[2]
  while (true) {
    signal.throwIfAborted()
    const result = await tx.scanTasks(
      {
        ...(conversationId === undefined
          ? {}
          : { conversationId: conversationId as ConversationId }),
        kind: 'pi.generation',
        order: 'descending',
      },
      1000,
      cursor,
    )
    for (const record of result.items) {
      const task = taskOf(record)
      if (isRun(task)) out.push(factOf(record))
    }
    if (!result.next) break
    cursor = result.next
  }
  return out.toSorted((a, b) => a.id - b.id)
}

/** The `ultimate.subagent-anchor` tasks of a conversation: one per spawn, never owned by a generation. */
async function scanAnchors(
  tx: Tx,
  conversationId: number,
  signal: AbortSignal,
): Promise<AnchorFact[]> {
  const out: AnchorFact[] = []
  let cursor: Parameters<Tx['scanTasks']>[2]
  while (true) {
    signal.throwIfAborted()
    const result = await tx.scanTasks(
      {
        conversationId: conversationId as ConversationId,
        kind: 'ultimate.subagent-anchor',
        order: 'descending',
      },
      500,
      cursor,
    )
    for (const record of result.items) {
      const task = taskOf(record)
      out.push({
        id: task.id,
        ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
      })
    }
    if (!result.next) break
    cursor = result.next
  }
  return out
}

/** Every conversation's task owner, for child attribution. */
async function scanConversationFacts(tx: Tx, signal: AbortSignal): Promise<ConversationFact[]> {
  const out: ConversationFact[] = []
  let cursor: Parameters<Tx['scanConversations']>[2]
  while (true) {
    signal.throwIfAborted()
    const page = await tx.scanConversations({}, 500, cursor)
    for (const record of page.items)
      out.push({
        id: record.id,
        agent: '', // named by the caller from the host's conversation summaries
        ...(record.owner === undefined ? {} : { ownerTaskId: record.owner.taskId }),
      })
    if (!page.next) break
    cursor = page.next
  }
  return out
}

/**
 * The durable submissions of `conversationIds`, read OUTSIDE `harness.commit()`: a storage scan must not nest in a
 * commit transaction. Read after the task snapshot (settlements commit with a run's terminal state, so a later read
 * contradicts the snapshot less often); what still contradicts surfaces as a `settlement` uncertainty.
 */
async function submissionFacts(
  host: ExtensionHost,
  conversationIds: Iterable<number>,
  signal: AbortSignal,
): Promise<Map<number, SubmissionFact[]>> {
  const out = new Map<number, SubmissionFact[]>()
  for (const conversationId of conversationIds) {
    const list: SubmissionFact[] = []
    let cursor: Parameters<ExtensionHost['scanSubmissions']>[2]
    while (true) {
      signal.throwIfAborted()
      const page = await host.scanSubmissions(
        { conversationId: conversationId as ConversationId },
        500,
        cursor,
        context,
      )
      for (const record of page.items)
        list.push({
          id: record.id,
          type: record.type,
          status: record.status,
          ...(record.entry === undefined ? {} : { entry: record.entry }),
          ...('answer' in record && record.answer !== undefined ? { answer: record.answer } : {}),
          ...('reason' in record && record.reason !== undefined ? { reason: record.reason } : {}),
        })
      if (!page.next) break
      cursor = page.next
    }
    out.set(conversationId, list)
  }
  return out
}

/** The name already published to the shell, without creating a metadata document in a read-only action. */
function agentOf(host: ExtensionHost, conversationId: number): string {
  const summary = host.conversations().find((item) => item.id === conversationId)
  if (summary?.label === 'agent') return summary.title?.replace(/^@/, '') ?? 'agent'
  return summary?.label ?? summary?.title?.replace(/^@/, '') ?? 'agent'
}

/** The model recorded in the run's assistant entry, not the conversation's possibly changed current model. */
async function modelOf(tx: Tx, run: RunTask): Promise<string | undefined> {
  const task = await tx.task(run.id as TaskId)
  if (!task) return undefined
  if (task.state.status === 'terminal' || task.state.status === 'completing') {
    const result = task.state.outcome.result as { entryId?: unknown } | undefined
    if (typeof result?.entryId !== 'number') return undefined
    const message = (await tx.entry(AssistantEntry, result.entryId as EntryId))?.model?.[0]
    return message?.role === 'assistant' ? `${message.provider}/${message.model}` : undefined
  }
  const checkpoint = task.state.checkpoint
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) return undefined
  const model = checkpoint.model
  if (!model || typeof model !== 'object' || Array.isArray(model)) return undefined
  return typeof model.provider === 'string' && typeof model.modelId === 'string'
    ? `${model.provider}/${model.modelId}`
    : undefined
}

/** Enrich a run's tasks with usage and stamp each with the round that roots it; the summary needs both. */
async function enrich(
  tx: Tx,
  unit: RunUnit,
  tasks: RunTask[],
  pool: RunTask[],
  signal: AbortSignal,
): Promise<void> {
  const byId = new Map(pool.map((task) => [task.id, task]))
  for (const task of tasks) byId.set(task.id, task)
  const rounds = new Set(unit.generationIds)
  for (const task of tasks) {
    signal.throwIfAborted()
    const generationId = generationOfTask(task, byId, rounds)
    if (generationId !== undefined) task.generationId = generationId
    const record = await tx.task(task.id as TaskId)
    const found = record ? await resultOf(tx, record, task) : undefined
    if (found) task.usage = found
  }
}

export default { name: 'tasks' }

/** Only the person at the browser may persist project display settings. */
export const userActions = ['settings']

export const actions = {
  /** When each of `ids` first ran, in wall-clock milliseconds; tasks not yet started or gone are left out. */
  started: implementAction(StartedAction, async (args, { host }) => {
    const ids = (args as { ids?: unknown } | null)?.ids
    if (!Array.isArray(ids) || !ids.every((id) => Number.isSafeInteger(id)))
      throw new Error('Expected task ids')
    return host.harness().commit(async (tx) => {
      const started: Record<string, number> = {}
      for (const id of ids as number[]) {
        const at = (await tx.task(id as TaskId))?.startedAt
        if (at !== undefined) started[id] = at
      }
      return started
    }, context)
  }),
  /** What the input of each of `ids` says about it, to name it in plain words; gone tasks are left out. */
  describe: implementAction(DescribeAction, async (args, { host }) => {
    const ids = (args as { ids?: unknown } | null)?.ids
    if (!Array.isArray(ids) || !ids.every((id) => Number.isSafeInteger(id)))
      throw new Error('Expected task ids')
    return host.harness().commit(async (tx) => {
      const described: Record<string, TaskFacts> = {}
      for (const id of ids as number[]) {
        const task = await tx.task(id as TaskId)
        if (task) described[id] = await facts(host, tx, task.kind, task.input as Input)
      }
      return described
    }, context)
  }),
  /** The durable outcome of tasks that left the live graph; live or unknown tasks are left out. */
  ended: implementAction(EndedAction, async (args, { host }) => {
    const ids = (args as { ids?: unknown } | null)?.ids
    if (!Array.isArray(ids) || !ids.every((id) => Number.isSafeInteger(id)))
      throw new Error('Expected task ids')
    return host.harness().commit(async (tx) => {
      const ended: Record<string, TaskEnd> = {}
      for (const id of ids as number[]) {
        const task = await tx.task(id as TaskId)
        if (task?.state.status !== 'terminal') continue
        ended[id] = {
          outcome: task.state.outcome.status,
          ...(task.endedAt === undefined ? {} : { endedAt: task.endedAt }),
        }
      }
      return ended
    }, context)
  }),
  /** Every conversation with a run, its agent name, run count and last activity; the current one even with no run. */
  conversations: implementAction(
    ConversationsAction,
    async (args, { host, conversationId: current, signal }) => {
      const input = (args ?? {}) as { days?: unknown }
      const days =
        typeof input.days === 'number' && Number.isSafeInteger(input.days) && input.days >= 1
          ? input.days
          : DEFAULT_TASK_SETTINGS.historyDays
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      const roundsByConversation = await host.harness().commit(
        async (tx) => {
          const grouped = new Map<number, GenerationFact[]>()
          for (const round of await scanGenerationFacts(tx, undefined, signal)) {
            const list = grouped.get(round.conversationId) ?? []
            list.push(round)
            grouped.set(round.conversationId, list)
          }
          return grouped
        },
        withAbortSignal(signal, context),
      )
      // Submissions are read outside the commit; see `submissionFacts`.
      const submissions = await submissionFacts(host, roundsByConversation.keys(), signal)
      const byConversation = new Map<
        number,
        { runs: number; lastAt: number; lastRunId?: number; lastRunAt?: number }
      >()
      for (const [conversationId, rounds] of roundsByConversation) {
        const units = reconstructRuns(rounds, submissions.get(conversationId) ?? [])
        const known = byConversation.get(conversationId) ?? { runs: 0, lastAt: 0 }
        known.runs = units.length
        for (const unit of units) {
          const own = rounds.filter((round) => unit.generationIds.includes(round.id))
          const ends = own.map((round) => round.endedAt)
          const at =
            ends.length > 0 && ends.every((value) => value !== undefined)
              ? Math.max(...ends)
              : (own.find((round) => round.startedAt !== undefined)?.startedAt ?? 0)
          if (at >= known.lastAt) known.lastAt = at
          const startedAt = own.find((round) => round.startedAt !== undefined)?.startedAt
          // Task IDs order creation, so compare start times when finding the newest started run.
          if (
            startedAt !== undefined &&
            startedAt >= cutoff &&
            (known.lastRunAt === undefined ||
              startedAt > known.lastRunAt ||
              (startedAt === known.lastRunAt && unit.rootId > (known.lastRunId ?? 0)))
          ) {
            known.lastRunId = unit.rootId
            known.lastRunAt = startedAt
          }
        }
        byConversation.set(conversationId, known)
      }
      if (current !== undefined && !byConversation.has(current))
        byConversation.set(current, { runs: 0, lastAt: 0 })
      // The sidebar's active conversations stay listed even before their first run, so the current one is checkable.
      for (const summary of host.conversations())
        if (!byConversation.has(summary.id))
          byConversation.set(summary.id, {
            runs: 0,
            lastAt: summary.answerAt ?? summary.inputAt ?? 0,
          })
      const list: RunConversation[] = []
      for (const [id, value] of byConversation)
        list.push({
          id,
          agent: agentOf(host, id),
          runs: value.runs,
          lastAt: value.lastAt,
          ...(value.lastRunId === undefined ? {} : { lastRunId: value.lastRunId }),
          ...(value.lastRunAt === undefined ? {} : { lastRunAt: value.lastRunAt }),
        })
      return list.toSorted((a, b) => b.lastAt - a.lastAt || a.id - b.id)
    },
  ),
  /** One newest-first page of reconstructed runs in the selected conversations, inside the visible days window. */
  history: implementAction(HistoryAction, async (args, { host, signal }) => {
    const input = (args ?? {}) as {
      conversationIds?: unknown
      days?: unknown
      before?: unknown
      limit?: unknown
    }
    if (
      !Array.isArray(input.conversationIds) ||
      !input.conversationIds.every((id) => Number.isSafeInteger(id))
    )
      throw new Error('Expected conversation ids')
    const selected = new Set(input.conversationIds as number[])
    const limit =
      typeof input.limit === 'number' && Number.isInteger(input.limit) && input.limit >= 1
        ? Math.min(input.limit, 100)
        : 20
    const days =
      typeof input.days === 'number' && Number.isSafeInteger(input.days) && input.days >= 1
        ? input.days
        : DEFAULT_TASK_SETTINGS.historyDays
    const before =
      typeof input.before === 'number' && Number.isSafeInteger(input.before)
        ? input.before
        : undefined
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    // Phase 1: the task/entry snapshot, then the submissions outside the commit, then pure reconstruction.
    const snapshot = await host.harness().commit(
      async (tx) => {
        const boundary = before === undefined ? undefined : await tx.task(before as TaskId)
        if (before !== undefined && (!boundary || boundary.startedAt === undefined))
          throw new Error('Invalid history cursor')
        const generations = new Map<number, GenerationFact[]>()
        for (const conversationId of selected)
          generations.set(conversationId, await scanGenerationFacts(tx, conversationId, signal))
        return { boundary, generations }
      },
      withAbortSignal(signal, context),
    )
    const submissions = await submissionFacts(host, selected, signal)
    type Row = {
      conversationId: number
      unit: RunUnit
      rounds: GenerationFact[]
      startedAt: number
    }
    const matched: Row[] = []
    for (const [conversationId, rounds] of snapshot.generations) {
      for (const unit of reconstructRuns(rounds, submissions.get(conversationId) ?? [])) {
        const startedAt = rounds.find((round) => round.id === unit.rootId)?.startedAt
        if (startedAt === undefined || startedAt < cutoff) continue
        const boundary = snapshot.boundary
        if (boundary && boundary.startedAt !== undefined) {
          const older =
            startedAt < boundary.startedAt ||
            (startedAt === boundary.startedAt && unit.rootId < boundary.id)
          if (!older) continue
        }
        matched.push({ conversationId, unit, rounds, startedAt })
      }
    }
    matched.sort((a, b) => b.startedAt - a.startedAt || b.unit.rootId - a.unit.rootId)
    const page = matched.slice(0, limit)
    const more = matched.length > limit
    // Phase 2: pools and summaries for the page's runs.
    return host.harness().commit(
      async (tx) => {
        const pools = new Map<number, RunTask[]>()
        for (const row of page) {
          if (pools.has(row.conversationId)) continue
          const roots = page
            .filter((item) => item.conversationId === row.conversationId)
            .map((item) => item.unit.rootId)
            .filter((id) => id > 0)
          pools.set(
            row.conversationId,
            await scanConversation(
              tx,
              row.conversationId,
              roots.length > 0 ? Math.min(...roots) : 0,
              signal,
            ),
          )
        }
        const runs: RunSummary[] = []
        for (const row of page) {
          const pool = pools.get(row.conversationId)!
          const { tasks, truncated } = collectUnitTasks(row.unit, pool)
          await enrich(tx, row.unit, tasks, pool, signal)
          const root = pool.find((task) => task.id === row.unit.rootId)
          runs.push(
            summarizeUnit(
              row.unit,
              row.rounds,
              agentOf(host, row.conversationId),
              tasks,
              truncated,
              root ? await modelOf(tx, root) : undefined,
            ),
          )
        }
        return {
          runs,
          ...(more && page.length ? { cursor: String(page.at(-1)!.unit.rootId) } : {}),
        }
      },
      withAbortSignal(signal, context),
    )
  }),
  /** One run's rounds and tasks, its submissions, how the turn ended, and the children attributable to it. */
  run: implementAction(RunAction, async (args, { host, signal }) => {
    const input = (args ?? {}) as { id?: unknown; costDetail?: unknown }
    if (typeof input.id !== 'number' || !Number.isSafeInteger(input.id) || input.id <= 0)
      throw new Error('Expected a run id')
    const id = input.id
    const costDetail = input.costDetail === 'tool' ? 'tool' : 'run'
    const snapshot = await host.harness().commit(
      async (tx) => {
        const record = await tx.task(id as TaskId)
        if (!record) throw new Error(`No run #${id}`)
        const target = taskOf(record)
        if (target.kind !== 'pi.generation' || target.owner !== undefined)
          throw new Error(`Task #${id} is not a generation round`)
        const conversationId = record.conversationId as number
        const rounds = await scanGenerationFacts(tx, conversationId, signal)
        const oldest = Math.min(...rounds.map((round) => round.id), id)
        const pool = await scanConversation(tx, conversationId, oldest, signal)
        return {
          conversationId,
          rounds,
          pool,
          anchors: await scanAnchors(tx, conversationId, signal),
          conversations: await scanConversationFacts(tx, signal),
        }
      },
      withAbortSignal(signal, context),
    )
    // Submissions are read outside the commit; see `submissionFacts`.
    const submissions = await submissionFacts(host, [snapshot.conversationId], signal)
    const units = reconstructRuns(snapshot.rounds, submissions.get(snapshot.conversationId) ?? [])
    const index = units.findIndex((item) => item.generationIds.includes(id))
    if (index < 0) throw new Error(`Task #${id} is not part of a reconstructed run`)
    const unit = units[index]
    // The turn's task-id window runs to the next run's root: spawns made during the turn land inside it.
    const nextRoot = units[index + 1]?.rootId
    return host.harness().commit(
      async (tx) => {
        const { tasks, truncated } = collectUnitTasks(unit, snapshot.pool, RUN_TASK_CAP)
        let cut = truncated
        const assistants = new Map<number, Map<string, { name: string; detail: string }>>()
        const usages = new Map<number, UsageTotals | undefined>()
        const spawnNames = new Map<number, number>()
        for (const task of tasks) {
          signal.throwIfAborted()
          const source = await tx.task(task.id as TaskId)
          if (!source) continue
          if (task.kind === 'pi.tool') {
            const found = await toolFacts(tx, source.input as Input, assistants)
            const fact = await facts(host, tx, task.kind, source.input as Input)
            if (found.detail) task.detail = found.detail
            if (fact.tool) {
              task.tool = fact.tool
              task.facts = { tool: fact.tool, ...(found.detail ? { detail: found.detail } : {}) }
            }
          } else if (task.kind !== 'ultimate.automation-scheduler') {
            // The scheduler's name is in an automation document; opening it would make this read action create it.
            const fact = await facts(host, tx, task.kind, source.input as Input)
            if (Object.keys(fact).length) task.facts = fact
          }
          const named = task.facts?.conversation
          if (named !== undefined && !spawnNames.has(named)) spawnNames.set(named, task.id)
          const usage = await resultOf(tx, source, task)
          usages.set(task.id, usage)
          if (costDetail === 'tool' && usage) task.usage = usage
        }
        // Run totals need every task's usage even when only per-tool detail was asked for.
        for (const task of tasks) if (!task.usage) task.usage = usages.get(task.id)
        await enrich(tx, unit, tasks, snapshot.pool, signal)
        const own = snapshot.rounds.filter((round) => unit.generationIds.includes(round.id))
        const starts = own
          .map((round) => round.startedAt)
          .filter((at): at is number => at !== undefined)
        const runStartedAt = starts.length > 0 ? Math.min(...starts) : undefined
        const runEndedAt = Math.max(
          0,
          ...tasks.map((task) => task.endedAt ?? 0),
          ...own.map((round) => round.endedAt ?? 0),
        )
        const windowEnd = runEndedAt > 0 ? runEndedAt : undefined
        // Children: anchors and owner edges first, then their turns inside the run window — never later ones.
        const { children: attributed, uncertainties } = attributeChildren(
          {
            rootId: unit.rootId,
            maxTaskId: nextRoot === undefined ? Number.MAX_SAFE_INTEGER : nextRoot - 1,
            ...(runStartedAt === undefined ? {} : { startedAt: runStartedAt }),
            ...(windowEnd === undefined ? {} : { endedAt: windowEnd }),
            ownedTaskIds: new Set(tasks.map((task) => task.id)),
          },
          snapshot.anchors,
          snapshot.conversations.map((fact) => ({ ...fact, agent: agentOf(host, fact.id) })),
          spawnNames,
        )
        const children: RunChild[] = []
        let budget = RUN_TASK_CAP - tasks.length
        for (const child of attributed) {
          const spawn = child.anchorTaskId ?? child.spawnTaskId ?? unit.rootId
          const turns = (await scanGenerationFacts(tx, child.conversationId, signal)).filter(
            (round) =>
              round.id >= spawn &&
              (round.startedAt === undefined ||
                runStartedAt === undefined ||
                round.startedAt >= runStartedAt) &&
              (round.startedAt === undefined ||
                windowEnd === undefined ||
                round.startedAt <= windowEnd),
          )
          const turnEnds = turns.map((round) => round.endedAt ?? 0)
          children.push({
            ...child,
            ...(child.startedAt === undefined && turns[0]?.startedAt !== undefined
              ? { startedAt: turns[0].startedAt }
              : {}),
            ...(turns.length === 0
              ? {}
              : {
                  generationIds: turns.map((round) => round.id),
                  ...(child.endedAt === undefined &&
                  Math.max(0, ...turns.map((r) => r.endedAt ?? 0)) > 0
                    ? { endedAt: Math.max(...turnEnds) }
                    : {}),
                }),
          })
          // Only an owner edge from a run-owned task makes child tasks attributable; anchors never do.
          if (child.confidence === 'proven' && turns.length > 0 && budget > 0) {
            const childPool = await scanConversation(
              tx,
              child.conversationId,
              Math.min(...turns.map((round) => round.id)),
              signal,
            )
            const found = collectUnitTasks(
              { generationIds: turns.map((round) => round.id) },
              childPool,
              budget,
            )
            const byId = new Map(childPool.map((task) => [task.id, task]))
            const roots = new Set(turns.map((round) => round.id))
            for (const task of found.tasks) {
              const generationId = generationOfTask(task, byId, roots)
              tasks.push({
                ...task,
                ...(generationId === undefined ? {} : { generationId }),
                conversationId: child.conversationId,
              })
            }
            budget -= found.tasks.length
            if (found.truncated) cut = true
          }
        }
        const root = snapshot.pool.find((task) => task.id === unit.rootId)
        const summary = summarizeUnit(
          unit,
          snapshot.rounds,
          agentOf(host, snapshot.conversationId),
          tasks,
          cut,
          root ? await modelOf(tx, root) : undefined,
          children.length,
        )
        if (costDetail === 'run') for (const task of tasks) delete task.usage
        return {
          run: summary,
          tasks,
          truncated: cut,
          generationIds: unit.generationIds,
          submissions: unit.submissions,
          end: unit.end,
          children,
          uncertainties: [...unit.uncertainties, ...uncertainties],
        } satisfies RunDetail
      },
      withAbortSignal(signal, context),
    )
  }),
  /** `{ historyDays?, costDetail?, dag? }`: write the project's `tasks` settings; history itself is never touched. */
  settings: implementAction(SettingsAction, async (args, { host }) => {
    const input = (args ?? {}) as { historyDays?: unknown; costDetail?: unknown; dag?: unknown }
    const patch: Partial<Pick<TaskSettings, 'historyDays' | 'costDetail'>> = {}
    const dag: Partial<TaskSettings['dag']> = {}
    let dagChanged = false
    if (input.historyDays !== undefined) {
      if (
        typeof input.historyDays !== 'number' ||
        !Number.isSafeInteger(input.historyDays) ||
        input.historyDays < 1
      )
        throw new Error('historyDays must be a positive integer')
      patch.historyDays = input.historyDays
    }
    if (input.costDetail !== undefined) {
      if (input.costDetail !== 'run' && input.costDetail !== 'tool')
        throw new Error('costDetail must be "run" or "tool"')
      patch.costDetail = input.costDetail
    }
    if (input.dag !== undefined) {
      if (!input.dag || typeof input.dag !== 'object' || Array.isArray(input.dag))
        throw new Error('dag must be an object')
      const value = input.dag as Record<string, unknown>
      const number = (
        key: 'clusterOverlap' | 'crossRepulsion' | 'visualClustering',
        low: number,
        high: number,
      ) => {
        const found = value[key]
        if (found === undefined) return
        if (typeof found !== 'number' || !Number.isFinite(found) || found < low || found > high)
          throw new Error(`${key} must be a number from ${low} to ${high}`)
        dag[key] = found
        dagChanged = true
      }
      number('clusterOverlap', 0, 0.6)
      number('crossRepulsion', 0, 1)
      number('visualClustering', 0, 1)
      if (value.labels !== undefined) {
        if (value.labels !== 'hover' && value.labels !== 'always' && value.labels !== 'off')
          throw new Error('labels must be "hover", "always" or "off"')
        dag.labels = value.labels
        dagChanged = true
      }
      if (value.pulse !== undefined) {
        if (typeof value.pulse !== 'boolean') throw new Error('pulse must be a boolean')
        dag.pulse = value.pulse
        dagChanged = true
      }
    }
    if (Object.keys(patch).length === 0 && !dagChanged)
      return taskSettings(await host.projectSettings())
    const path = join(host.projectRoot, '.ultimate/settings.json')
    if ((await host.projectSetup()).decision !== true)
      throw new Error("Choose this project's local setup before changing task history settings")
    const current = taskSettings(await host.projectSettings())
    await updateSettings(path, (value) => {
      const previous =
        value.tasks && typeof value.tasks === 'object' && !Array.isArray(value.tasks)
          ? (value.tasks as Record<string, JsonValue>)
          : {}
      value.tasks = {
        ...previous,
        ...patch,
        ...(dagChanged ? { dag: { ...current.dag, ...dag } } : {}),
      }
    })
    return taskSettings(await host.projectSettings())
  }),
}
