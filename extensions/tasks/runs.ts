/**
 * Run reconstruction, server-side: the pure model that turns the durable record — submissions, generation rounds and
 * their owner trees — into Runs. A Run is one input submission through its answer: every model round and tool task in
 * between, the steers that share the answer, and the child-agent conversations the turn spawned.
 *
 * Proof and inference, kept apart:
 * - A shared `answer` entry settles which submissions are one turn (proof).
 * - Generation rounds carry no submission reference (generation input is `{}`; `handOver` leaves no durable edge), so
 *   rounds join a turn only by entry-id ordering and the single-active-run lifecycle — always labelled `continuation`.
 * - An unanswered steer and a separate turn ended by reset/turn_limit leave identical records; they are kept separate
 *   with a `boundary` uncertainty, never merged. A round span never proves a placement is not a steer.
 *
 * Pure and storage-free so the actions and the tests share it.
 */
import { collectRunTasks, RUN_TASK_CAP, runTotals } from './history.ts'
import type {
  RunChild,
  RunEnd,
  RunOutcome,
  RunSummary,
  RunTask,
  RunUncertainty,
  TaskEnd,
  TaskStatus,
} from './refs.ts'

/** One durable input/continue submission as the reconstruction reads it; writes are not turns. */
export type SubmissionFact = {
  id: number
  type: 'input' | 'continue' | 'write'
  status: 'queued' | 'placed' | 'done' | 'unanswered'
  /** The transcript entry the submission placed, when it has one. */
  entry?: number
  /** The answer entry it settled with; the steers of one run share it. */
  answer?: number
  /** Why it ended unanswered. */
  reason?: string
}

/** One top-level generation round as the reconstruction reads it. */
export type GenerationFact = {
  id: number
  conversationId: number
  startedAt?: number
  endedAt?: number
  status: TaskStatus
  /** The round's task outcome, once terminal. */
  outcome?: TaskEnd['outcome']
  /** The round's last assistant entry (`outcome.result.entryId`): its end marker in entry space. */
  resultEntryId?: number
}

/** One reconstructed Run: an input submission through its answer. */
export type RunUnit = {
  /** The root generation round; `-submissionId` when no round is visible for the turn. */
  rootId: number
  generationIds: number[]
  /** The turn's input submissions: its inputs and the steers that share the answer. */
  submissions: number[]
  end: RunEnd
  /** What ordering alone brackets; see the module comment. */
  uncertainties: RunUncertainty[]
}

/** A `ultimate.subagent-anchor` task: one per spawn, conversation-owned and not owned by any generation. */
export type AnchorFact = { id: number; startedAt?: number }

/** A conversation and the task its `owner.taskId` names, for child attribution. */
export type ConversationFact = { id: number; agent: string; ownerTaskId?: number }

/** The run's window and owned tasks, for child attribution. `maxTaskId` is the run's task-id window end: the next
 * run's root minus one, or unbounded for the conversation's latest run. */
export type ChildWindow = {
  rootId: number
  maxTaskId: number
  startedAt?: number
  endedAt?: number
  /** Task ids whose owner chain reaches a round root: the run's own tasks, rounds included. */
  ownedTaskIds: ReadonlySet<number>
}

const settlement = (s: SubmissionFact): string =>
  s.status === 'done'
    ? `answer:${s.answer}`
    : s.status === 'unanswered'
      ? `unanswered:${s.reason ?? ''}`
      : 'open'

/** An unplaced input that never reached the transcript is not a turn (`stale` is the inbox dropping it). */
const stale = (s: SubmissionFact) =>
  s.entry === undefined && s.status === 'unanswered' && s.reason === 'stale'

/**
 * Reconstruct the runs of ONE conversation from its rounds and submissions. Every round lands in a run; submissions
 * without placements join by their claim (proof) or the nearest turn (labelled inference), never silently.
 */
export function reconstructRuns(
  generations: readonly GenerationFact[],
  submissions: readonly SubmissionFact[],
): RunUnit[] {
  const gens = generations.toSorted((a, b) => a.id - b.id)
  const turns = submissions.filter((s) => s.type !== 'write' && s.status !== 'queued' && !stale(s))
  const placeable = turns.filter((s) => s.entry !== undefined)
  const unplaceable = turns.filter((s) => s.entry === undefined)
  const claimed = new Set(turns.filter((s) => s.status === 'done').map((s) => s.answer))

  // Round gaps in entry space: a gap runs from the previous round's end entry to its own marker (the round's last
  // assistant entry). A round without a result entry has no marker and sits inside its neighbour's gap by ordering.
  type Gap = { gens: GenerationFact[]; marker?: GenerationFact; placements: SubmissionFact[] }
  const gaps: Gap[] = []
  let current: Gap = { gens: [], placements: [] }
  for (const g of gens) {
    current.gens.push(g)
    if (g.resultEntryId !== undefined) {
      current.marker = g
      gaps.push(current)
      current = { gens: [], placements: [] }
    }
  }
  gaps.push(current)
  const gapOfEntry = (entry: number): number => {
    for (let k = 0; k < gaps.length; k++)
      if (gaps[k].marker === undefined || entry <= gaps[k].marker!.resultEntryId!) return k
    return gaps.length - 1
  }
  for (const s of placeable) gaps[gapOfEntry(s.entry!)].placements.push(s)

  // Walk the gaps into segments. Splits happen only where settlement proves one (a shared answer joins; a different
  // settlement separates) or — where records are identical — conservatively, with the ambiguity spelled out.
  type Seg = { gaps: number[]; placements: SubmissionFact[]; uncertainties: RunUncertainty[] }
  const segs: Seg[] = []
  let open: Seg | undefined
  for (let k = 0; k < gaps.length; k++) {
    const gap = gaps[k]
    let split = false
    let note: string | undefined
    if (open === undefined) {
      // The first gap opens the first turn.
    } else if (
      k > 0 &&
      gaps[k - 1].marker !== undefined &&
      claimed.has(gaps[k - 1].marker!.resultEntryId)
    ) {
      // Proof: the previous gap ends on an answer its inputs claimed, so the turn ended there.
      split = true
    } else if (gap.placements.length === 0) {
      open.gaps.push(k) // ordering brackets these rounds into the open turn
      continue
    } else {
      const kinds = new Set(gap.placements.map(settlement))
      const openKinds = new Set(open.placements.map(settlement))
      const kind = [...kinds][0]
      if (kinds.size > 1) {
        split = true
        note =
          'one round gap holds inputs with different settlements; ordering cannot attribute them to one turn, so a turn starts here'
      } else if (kind.startsWith('answer:') && openKinds.has(kind)) {
        open.placements.push(...gap.placements) // proof: the steer shares the turn's answer
        open.gaps.push(k)
        continue
      } else if (kind.startsWith('answer:')) {
        split = true
        if (openKinds.size === 0)
          note =
            'a settled input lands on rounds that carry no input of their own; only ordering brackets the boundary, so a turn starts here'
      } else if (kind.startsWith('unanswered:')) {
        split = true
        if (openKinds.has(kind))
          note =
            'an unanswered steer of the previous turn and a separate turn ended by reset/turn_limit leave the same records; the boundary cannot be proven, so the turns are kept separate'
      } else {
        // A placed, unsettled input: admission places it into the active run, but a settled open turn contradicts that.
        const openActive =
          open.placements.some((s) => s.status === 'placed') ||
          open.gaps.some((g) => gaps[g].gens.some((gen) => gen.status !== 'terminal'))
        if (openActive) {
          open.placements.push(...gap.placements)
          open.gaps.push(k)
          continue
        }
        split = true
        note =
          'a placed input lands after a settled turn; only ordering and the snapshot bracket the boundary, so a turn starts here'
      }
    }
    if (split && open) {
      segs.push(open)
      open = undefined
    }
    open = {
      gaps: [k],
      placements: [...gap.placements],
      uncertainties: note === undefined ? [] : [{ kind: 'boundary', note }],
    }
  }
  if (open) segs.push(open)

  type Draft = { gens: GenerationFact[]; subs: SubmissionFact[]; uncertainties: RunUncertainty[] }
  const drafts: Draft[] = []
  for (const seg of segs) {
    const list = seg.gaps.flatMap((k) => gaps[k].gens)
    if (list.length === 0 && seg.placements.length === 0) continue
    drafts.push({ gens: list, subs: [...seg.placements], uncertainties: seg.uncertainties })
  }
  // Inputs without placements: joined by their claim (proof) or attached to the nearest turn (labelled inference).
  for (const s of unplaceable) {
    let target: Draft | undefined
    let inference = true
    if (s.status === 'done' && s.answer !== undefined) {
      target = drafts.find((d) => d.gens.some((g) => g.resultEntryId === s.answer))
      inference = false // the shared answer is proof
    } else if (s.status === 'placed') {
      target =
        drafts.toReversed().find((d) => d.gens.some((g) => g.status !== 'terminal')) ??
        drafts.at(-1)
    } else target = drafts.at(-1)
    if (target === undefined) {
      drafts.push({
        gens: [],
        subs: [s],
        uncertainties: [
          {
            kind: 'boundary',
            note: 'an input without a placement entry and without visible rounds stands alone: no ordering brackets it into any turn',
          },
        ],
      })
      continue
    }
    target.subs.push(s)
    if (inference)
      target.uncertainties.push({
        kind: 'boundary',
        note:
          s.status === 'placed'
            ? 'a placed input without a placement entry attaches to the running turn by lifecycle only'
            : 'an input without a placement entry attaches to the nearest turn; ordering cannot prove which turn it belongs to',
      })
  }

  const endOf = (
    list: GenerationFact[],
    subs: SubmissionFact[],
    uncertainties: RunUncertainty[],
  ): RunEnd => {
    const live = list.some((g) => g.status !== 'terminal')
    const done = subs.filter((s) => s.status === 'done')
    const unanswered = subs.filter((s) => s.status === 'unanswered')
    if (done.length > 0) {
      const entryId = done[0].answer!
      if (live)
        uncertainties.push({
          kind: 'settlement',
          note: 'the inputs are settled but the rounds are still running: the settlement is newer than the task snapshot',
        })
      if (!list.some((g) => g.resultEntryId === entryId))
        uncertainties.push({
          kind: 'settlement',
          note: 'the claimed answer is not among these rounds’ last entries: the snapshot may predate the settlement',
        })
      return { status: 'answered', entryId }
    }
    if (unanswered.length > 0) {
      const reasons = [...new Set(unanswered.map((s) => s.reason ?? 'unknown'))]
      if (reasons.length > 1)
        uncertainties.push({
          kind: 'settlement',
          note: `the turn’s inputs settled with different reasons (${reasons.join(', ')}); the run reports the first`,
        })
      if (live)
        uncertainties.push({
          kind: 'settlement',
          note: 'the inputs are settled but the rounds are still running: the settlement is newer than the task snapshot',
        })
      return { status: 'unanswered', reason: reasons[0] }
    }
    if (subs.some((s) => s.status === 'placed') || live) return { status: 'running' }
    uncertainties.push({
      kind: 'settlement',
      note: 'no settled submission is visible for these rounds; the turn is reported as it stands',
    })
    return { status: 'unknown', note: 'no settled submission is visible for these rounds' }
  }

  const units: RunUnit[] = []
  for (const draft of drafts) {
    const generationIds = draft.gens.map((g) => g.id)
    const subs = draft.subs.toSorted((a, b) => a.id - b.id)
    const uncertainties = [...draft.uncertainties]
    if (generationIds.length > 1)
      uncertainties.push({
        kind: 'continuation',
        note: 'these rounds join one turn by entry-id ordering and the single-active-run lifecycle only: generations carry no submission reference, so the chain is inferred',
      })
    units.push({
      rootId: generationIds[0] ?? -subs[0].id,
      generationIds,
      submissions: subs.map((s) => s.id),
      end: endOf(draft.gens, subs, uncertainties),
      uncertainties,
    })
  }
  return units
}

/** The outcome badge of a run: the turn's end, or the task truth when no settlement is visible. */
export function unitOutcome(gens: readonly GenerationFact[], end: RunEnd): RunOutcome {
  if (end.status === 'running' || gens.some((g) => g.status !== 'terminal')) return 'running'
  const bad = gens.find((g) => g.outcome !== undefined && g.outcome !== 'completed')
  if (end.status === 'unanswered') return bad?.outcome ?? 'unanswered'
  if (end.status === 'answered') return 'completed'
  return bad?.outcome ?? 'completed'
}

/**
 * The tasks of a reconstructed run: the union of its rounds' owner trees among `pool`. The run itself is always kept;
 * newest-first pools are fine. At most `cap`, flagged when cut.
 */
export function collectUnitTasks(
  unit: Pick<RunUnit, 'generationIds'>,
  pool: readonly RunTask[],
  cap = RUN_TASK_CAP,
): { tasks: RunTask[]; truncated: boolean } {
  const kept = new Map<number, RunTask>()
  let truncated = false
  for (const rootId of unit.generationIds) {
    const root = pool.find((task) => task.id === rootId)
    if (!root) continue
    const found = collectRunTasks(root, pool, cap)
    truncated = truncated || found.truncated
    for (const task of found.tasks) kept.set(task.id, task)
  }
  const tasks = [...kept.values()].toSorted((a, b) => a.id - b.id)
  return { tasks: tasks.slice(0, cap), truncated: truncated || tasks.length > cap }
}

/** The round whose owner tree roots `task`; a round roots itself. */
export function generationOfTask(
  task: Pick<RunTask, 'id' | 'owner'>,
  byId: ReadonlyMap<number, Pick<RunTask, 'id' | 'owner'>>,
  roundRootIds: ReadonlySet<number>,
): number | undefined {
  const seen = new Set<number>()
  let current: Pick<RunTask, 'id' | 'owner'> | undefined = task
  while (current) {
    if (roundRootIds.has(current.id)) return current.id
    if (current.owner == null || seen.has(current.id)) return undefined
    seen.add(current.id)
    current = byId.get(current.owner)
  }
  return undefined
}

/**
 * Attribute child-agent conversations to the run. An anchor inside the run's task-id window is INFERRED, never proof:
 * the anchor is conversation-owned background work and a background spawn can interleave. An owner edge from a
 * run-owned task is the only `proven` association. Anchors with no visible child conversation come back as
 * `attribution` uncertainties.
 */
export function attributeChildren(
  window: ChildWindow,
  anchors: readonly AnchorFact[],
  conversations: readonly ConversationFact[],
  spawnNames: ReadonlyMap<number, number>,
): { children: RunChild[]; uncertainties: RunUncertainty[] } {
  const anchorById = new Map(anchors.map((a) => [a.id, a]))
  const children: RunChild[] = []
  const uncertainties: RunUncertainty[] = []
  const claimed = new Set<number>()
  for (const conversation of conversations) {
    const owner = conversation.ownerTaskId
    const anchor = owner === undefined ? undefined : anchorById.get(owner)
    const named = spawnNames.get(conversation.id)
    const inIdWindow = owner !== undefined && owner >= window.rootId && owner <= window.maxTaskId
    const inTime =
      anchor?.startedAt !== undefined &&
      window.startedAt !== undefined &&
      anchor.startedAt >= window.startedAt &&
      anchor.startedAt <= (window.endedAt ?? Number.POSITIVE_INFINITY)
    const proven = owner !== undefined && window.ownedTaskIds.has(owner)
    const base = {
      conversationId: conversation.id,
      agent: conversation.agent,
      ...(owner === undefined ? {} : { anchorTaskId: owner }),
      ...(named === undefined ? {} : { spawnTaskId: named }),
      ...(anchor?.startedAt === undefined ? {} : { startedAt: anchor.startedAt }),
    }
    if (proven) {
      children.push({
        ...base,
        association: 'owner',
        confidence: 'proven',
        note: `conversation #${conversation.id} is owned by run task #${owner}, whose owner chain reaches the run`,
      })
      if (owner !== undefined) claimed.add(owner)
      continue
    }
    if (inIdWindow || named !== undefined || inTime) {
      const association = inIdWindow ? 'anchor' : named !== undefined ? 'tool' : 'overlap'
      const confidence = inIdWindow || named !== undefined ? 'inferred' : 'ambiguous'
      const parts = [
        inIdWindow
          ? `anchor #${owner} falls in this run’s task-id window, but the anchor is conversation-owned background work (subagents/server.ts:1106–1109), not owned by the generation: a background spawn can interleave, so the turn attribution is inferred`
          : '',
        named !== undefined ? `run task #${named} names this conversation` : '',
        !inIdWindow && inTime ? 'only the spawn time overlaps the run window' : '',
      ].filter(Boolean)
      children.push({ ...base, association, confidence, note: parts.join('; ') })
      if (owner !== undefined) claimed.add(owner)
    }
  }
  for (const anchor of anchors) {
    if (claimed.has(anchor.id)) continue
    if (anchor.id >= window.rootId && anchor.id <= window.maxTaskId)
      uncertainties.push({
        kind: 'attribution',
        note: `anchor #${anchor.id} lies in this run’s task-id window but no visible conversation names it as owner`,
        taskId: anchor.id,
      })
  }
  return { children, uncertainties }
}

/** The summary strip of one reconstructed run; `childCount` is set where children were resolved. */
export function summarizeUnit(
  unit: RunUnit,
  rounds: readonly GenerationFact[],
  agent: string,
  tasks: readonly RunTask[],
  truncated: boolean,
  model?: string,
  childCount?: number,
): RunSummary {
  const own = rounds.filter((round) => unit.generationIds.includes(round.id))
  const totals = runTotals(tasks)
  const starts = own.map((round) => round.startedAt).filter((at): at is number => at !== undefined)
  const ends = tasks.map((task) => task.endedAt)
  const endedAt =
    ends.length > 0 && ends.every((at) => at !== undefined) ? Math.max(...ends) : undefined
  return {
    id: unit.rootId,
    conversationId: own[0]?.conversationId ?? tasks[0]?.conversationId ?? 0,
    agent,
    ...(model === undefined ? {} : { model }),
    startedAt: starts.length > 0 ? Math.min(...starts) : 0,
    ...(endedAt === undefined ? {} : { endedAt }),
    outcome: unitOutcome(own, unit.end),
    taskCount: tasks.length,
    failedCount: totals.failedCount,
    toolCount: tasks.filter((task) => task.kind === 'pi.tool').length,
    generationCount: unit.generationIds.length,
    ...(childCount === undefined ? {} : { childCount }),
    ...(totals.tokens === undefined ? {} : { tokens: totals.tokens }),
    ...(totals.cost === undefined ? {} : { cost: totals.cost }),
    ...(truncated ? { truncated: true } : {}),
  }
}
