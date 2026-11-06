import { join } from 'node:path'
import type { JsonValue } from '@earendil-works/chord'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { AssistantEntry } from '@earendil-works/pi-durable'
import type { ConversationId, EntryId, TaskId, TaskRecord, Tx } from '@earendil-works/pi-durable'
import { implementAction } from '../../lib/actions.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { updateSettings } from '../../lib/settings.ts'
import { AutomationsApi } from '../automations/api.ts'
import type { Message } from '../messages/api.ts'
import {
  collectRunTasks,
  DEFAULT_TASK_SETTINGS,
  isRun,
  RUN_TASK_CAP,
  summarizeRun,
  taskSettings,
} from './history.ts'
import type {
  RunConversation,
  RunDetail,
  RunSummary,
  RunTask,
  TaskSettings,
  UsageTotals,
} from './history.ts'
import {
  ConversationsAction,
  DescribeAction,
  EndedAction,
  HistoryAction,
  RunAction,
  SettingsAction,
  StartedAction,
} from './refs.ts'
import type { TaskEnd, TaskFacts } from './refs.ts'

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

/**
 * A conversation's tasks, newest first until `stopId`; scanning stops at the first older id because a child is always
 * created after its owner. 1000 per page keeps the transaction short.
 */
async function scanConversation(tx: Tx, conversationId: number, stopId = 0): Promise<RunTask[]> {
  const out: RunTask[] = []
  let cursor: Parameters<Tx['scanTasks']>[2]
  while (true) {
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

/** All top-level generations; the stored scan orders by id, not by the time a task first ran. */
async function scanGenerations(tx: Tx): Promise<RunTask[]> {
  const out: RunTask[] = []
  let cursor: Parameters<Tx['scanTasks']>[2]
  while (true) {
    const result = await tx.scanTasks({ kind: 'pi.generation', order: 'descending' }, 1000, cursor)
    for (const record of result.items) {
      const task = taskOf(record)
      if (isRun(task)) out.push(task)
    }
    if (!result.next) break
    cursor = result.next
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

/** The summary of one run, enriched with its tasks and their usage. */
async function summaryOf(
  tx: Tx,
  host: ExtensionHost,
  run: RunTask,
  pool: RunTask[],
): Promise<RunSummary> {
  const { tasks, truncated } = collectRunTasks(run, pool)
  for (const task of tasks) {
    const record = await tx.task(task.id as TaskId)
    const found = record ? await resultOf(tx, record, task) : undefined
    if (found) task.usage = found
  }
  return {
    ...summarizeRun(run, agentOf(host, run.conversationId), tasks, await modelOf(tx, run)),
    ...(truncated ? { truncated: true } : {}),
  }
}

export default { name: 'tasks' }

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
    async (args, { host, conversationId: current }) => {
      const input = (args ?? {}) as { days?: unknown }
      const days =
        typeof input.days === 'number' && Number.isSafeInteger(input.days) && input.days >= 1
          ? input.days
          : DEFAULT_TASK_SETTINGS.historyDays
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      return host.harness().commit(async (tx) => {
        const runs = await scanGenerations(tx)
        const byConversation = new Map<
          number,
          { runs: number; lastAt: number; lastRunId?: number; lastRunAt?: number }
        >()
        for (const run of runs) {
          const at = run.endedAt ?? run.startedAt ?? 0
          const known = byConversation.get(run.conversationId)
          if (!known) byConversation.set(run.conversationId, { runs: 1, lastAt: at })
          else {
            known.runs++
            if (at >= known.lastAt) known.lastAt = at
          }
          const entry = byConversation.get(run.conversationId)!
          // Task IDs order creation, so compare start times when finding the newest started run.
          if (
            run.startedAt !== undefined &&
            run.startedAt >= cutoff &&
            (entry.lastRunAt === undefined ||
              run.startedAt > entry.lastRunAt ||
              (run.startedAt === entry.lastRunAt && run.id > (entry.lastRunId ?? 0)))
          ) {
            entry.lastRunId = run.id
            entry.lastRunAt = run.startedAt
          }
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
      }, context)
    },
  ),
  /** One newest-first page of runs in the selected conversations, inside the visible days window. */
  history: implementAction(HistoryAction, async (args, { host }) => {
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
    return host.harness().commit(async (tx) => {
      const boundary = before === undefined ? undefined : await tx.task(before as TaskId)
      if (before !== undefined && (!boundary || boundary.startedAt === undefined))
        throw new Error('Invalid history cursor')
      const runs = await scanGenerations(tx)
      const matched = runs
        .filter((run) => {
          if (
            !selected.has(run.conversationId) ||
            run.startedAt === undefined ||
            run.startedAt < cutoff
          )
            return false
          if (!boundary || boundary.startedAt === undefined) return true
          return (
            run.startedAt < boundary.startedAt ||
            (run.startedAt === boundary.startedAt && run.id < boundary.id)
          )
        })
        .toSorted((a, b) => b.startedAt! - a.startedAt! || b.id - a.id)
      const page = matched.slice(0, limit)
      const more = matched.length > limit
      // One conversation scan per conversation in the page, then the owner-chain walk for each run.
      const pools = new Map<number, RunTask[]>()
      for (const run of page) {
        if (pools.has(run.conversationId)) continue
        const oldest = Math.min(
          ...page
            .filter((item) => item.conversationId === run.conversationId)
            .map((item) => item.id),
        )
        pools.set(run.conversationId, await scanConversation(tx, run.conversationId, oldest))
      }
      const summaries: RunSummary[] = []
      for (const run of page)
        summaries.push(await summaryOf(tx, host, run, pools.get(run.conversationId)!))
      return {
        runs: summaries,
        ...(more && page.length ? { cursor: String(page.at(-1)!.id) } : {}),
      }
    }, context)
  }),
  /** One run's tasks: scanned across its time window, then kept by the owner chain; at most 5000, flagged if cut. */
  run: implementAction(RunAction, async (args, { host }) => {
    const input = (args ?? {}) as { id?: unknown; costDetail?: unknown }
    if (typeof input.id !== 'number' || !Number.isSafeInteger(input.id))
      throw new Error('Expected a run id')
    const id = input.id
    const costDetail = input.costDetail === 'tool' ? 'tool' : 'run'
    return host.harness().commit(async (tx) => {
      const record = await tx.task(id as TaskId)
      if (!record) throw new Error(`No run #${id}`)
      const run = taskOf(record)
      if (!isRun(run)) throw new Error(`Task #${id} is not a top-level generation`)
      const pool = await scanConversation(tx, run.conversationId, run.id)
      const { tasks, truncated } = collectRunTasks(run, pool, RUN_TASK_CAP)
      const assistants = new Map<number, Map<string, { name: string; detail: string }>>()
      const usages = new Map<number, UsageTotals | undefined>()
      for (const task of tasks) {
        const source = await tx.task(task.id as TaskId)
        if (!source) continue
        if (task.kind === 'pi.tool') {
          const found = await toolFacts(tx, source.input as Input, assistants)
          const fact = await facts(host, tx, task.kind, source.input as Input)
          if (found.detail) task.detail = found.detail
          if (fact.tool) {
            task.tool = fact.tool
            task.facts = { tool: fact.tool }
          }
        } else if (task.kind !== 'ultimate.automation-scheduler') {
          // The scheduler's name is in an automation document; opening it would make this read action create it.
          const fact = await facts(host, tx, task.kind, source.input as Input)
          if (Object.keys(fact).length) task.facts = fact
        }
        const usage = await resultOf(tx, source, task)
        usages.set(task.id, usage)
        if (costDetail === 'tool' && usage) task.usage = usage
      }
      // Run totals need every task's usage even when only per-tool detail was asked for.
      for (const task of tasks) if (!task.usage) task.usage = usages.get(task.id)
      const summary = {
        ...summarizeRun(run, agentOf(host, run.conversationId), tasks, await modelOf(tx, run)),
        ...(truncated ? { truncated: true } : {}),
      }
      if (costDetail === 'run') for (const task of tasks) delete task.usage
      return { run: summary, tasks, truncated } satisfies RunDetail
    }, context)
  }),
  /** `{ historyDays?, costDetail? }`: write the project's `tasks` settings; history itself is never touched. */
  settings: implementAction(SettingsAction, async (args, { host }) => {
    const input = (args ?? {}) as { historyDays?: unknown; costDetail?: unknown }
    const patch: Partial<TaskSettings> = {}
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
    if (Object.keys(patch).length === 0) return taskSettings(await host.projectSettings())
    const path = join(host.projectRoot, '.ultimate/settings.json')
    if ((await host.projectSetup()).decision !== true)
      throw new Error("Choose this project's local setup before changing task history settings")
    await updateSettings(path, (value) => {
      const previous =
        value.tasks && typeof value.tasks === 'object' && !Array.isArray(value.tasks)
          ? (value.tasks as Record<string, JsonValue>)
          : {}
      value.tasks = { ...previous, ...patch }
    })
    return taskSettings(await host.projectSettings())
  }),
}
