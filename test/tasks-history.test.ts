import type { TaskGraphNode } from '@earendil-works/pi-durable'
import { describe, expect, it } from 'vitest'
import {
  collectRunTasks,
  criticalPath,
  foldedByDefault,
  isRun,
  mergeLive,
  mergeRunLive,
  orderFrames,
  outcomeOf,
  runsInDays,
  taskSettings,
} from '../extensions/tasks/history.ts'
import type { RunSummary, RunTask } from '../extensions/tasks/history.ts'
import {
  attributeChildren,
  collectUnitTasks,
  reconstructRuns,
  summarizeUnit,
  unitOutcome,
} from '../extensions/tasks/runs.ts'
import type { GenerationFact, SubmissionFact } from '../extensions/tasks/runs.ts'

const task = (value: Partial<RunTask> & Pick<RunTask, 'id'>): RunTask => ({
  conversationId: 1,
  kind: 'pi.tool',
  background: false,
  abortRequested: false,
  status: 'terminal',
  outcome: 'completed',
  ...value,
})

const run = (value: Partial<RunTask> & Pick<RunTask, 'id'>): RunTask =>
  task({ kind: 'pi.generation', status: 'terminal', outcome: 'completed', ...value })

const node = (value: { id: number } & Record<string, unknown>): TaskGraphNode =>
  ({
    kind: 'pi.tool',
    conversationId: 1,
    background: false,
    abortRequested: false,
    state: { status: 'running', phase: 'call' },
    conversations: [],
    ...value,
  }) as unknown as TaskGraphNode

const gen = (value: Partial<GenerationFact> & Pick<GenerationFact, 'id'>): GenerationFact => ({
  conversationId: 1,
  status: 'terminal',
  outcome: 'completed',
  ...value,
})

const sub = (value: Partial<SubmissionFact> & Pick<SubmissionFact, 'id'>): SubmissionFact => ({
  type: 'input',
  status: 'done',
  ...value,
})

describe('run grouping', () => {
  it('takes top-level generations only', () => {
    expect(isRun({ kind: 'pi.generation' })).toBe(true)
    expect(isRun({ kind: 'pi.generation', owner: 3 })).toBe(false)
    expect(isRun({ kind: 'pi.tool' })).toBe(false)
  })
})

describe('run reconstruction', () => {
  it('groups one input with two model generations and tools into one run', () => {
    // One input (entry 5) answered at entry 23: the middle round (ending at entry 10) joins the same turn.
    const units = reconstructRuns(
      [gen({ id: 100, resultEntryId: 10 }), gen({ id: 102, resultEntryId: 23 })],
      [sub({ id: 1, entry: 5, answer: 23 })],
    )
    expect(units).toHaveLength(1)
    expect(units[0].generationIds).toEqual([100, 102])
    expect(units[0].submissions).toEqual([1])
    expect(units[0].end).toEqual({ status: 'answered', entryId: 23 })
    // The rounds joined by ordering carry the honest label.
    expect(units[0].uncertainties.map((u) => u.kind)).toContain('continuation')
  })

  it('keeps two consecutive inputs in separate runs, fully proven', () => {
    const units = reconstructRuns(
      [gen({ id: 100, resultEntryId: 10 }), gen({ id: 110, resultEntryId: 20 })],
      [sub({ id: 1, entry: 5, answer: 10 }), sub({ id: 2, entry: 15, answer: 20 })],
    )
    expect(units.map((u) => u.generationIds)).toEqual([[100], [110]])
    expect(units.map((u) => u.submissions)).toEqual([[1], [2]])
    expect(units.map((u) => u.end)).toEqual([
      { status: 'answered', entryId: 10 },
      { status: 'answered', entryId: 20 },
    ])
    expect(units[1].uncertainties).toEqual([])
  })

  it('merges a steer that shares the answer into one run', () => {
    const units = reconstructRuns(
      [gen({ id: 100, resultEntryId: 10 }), gen({ id: 102, resultEntryId: 23 })],
      [sub({ id: 1, entry: 5, answer: 23 }), sub({ id: 2, entry: 12, answer: 23 })],
    )
    expect(units).toHaveLength(1)
    expect(units[0].submissions).toEqual([1, 2])
  })

  it('never merges turns ended by failures, resets or turn_limit', () => {
    const units = reconstructRuns(
      [gen({ id: 100, resultEntryId: 10 }), gen({ id: 110, resultEntryId: 20 })],
      [
        sub({ id: 1, entry: 5, status: 'unanswered', reason: 'turn_limit' }),
        sub({ id: 2, entry: 15, status: 'unanswered', reason: 'turn_limit' }),
      ],
    )
    expect(units.map((u) => u.generationIds)).toEqual([[100], [110]])
    expect(units[0].end).toEqual({ status: 'unanswered', reason: 'turn_limit' })
    expect(units[1].end).toEqual({ status: 'unanswered', reason: 'turn_limit' })
    // Identical settlements cannot prove the boundary: the turns stay separate and the inference is labelled.
    expect(units[1].uncertainties.some((u) => u.kind === 'boundary')).toBe(true)
    // A different settlement proves the split, so no boundary uncertainty is needed.
    const proven = reconstructRuns(
      [gen({ id: 100, resultEntryId: 10 }), gen({ id: 110, resultEntryId: 20 })],
      [
        sub({ id: 1, entry: 5, status: 'unanswered', reason: 'turn_limit' }),
        sub({ id: 2, entry: 15, status: 'unanswered', reason: 'reset' }),
      ],
    )
    expect(proven.map((u) => u.generationIds)).toEqual([[100], [110]])
    expect(proven[1].uncertainties).toEqual([])
  })

  it('reports a turn in flight as running', () => {
    const units = reconstructRuns(
      [gen({ id: 100, status: 'running', outcome: undefined })],
      [sub({ id: 1, entry: 5, status: 'placed' })],
    )
    expect(units[0].end).toEqual({ status: 'running' })
    expect(
      unitOutcome(
        units[0].end === undefined ? [] : [gen({ id: 100, status: 'running', outcome: undefined })],
        units[0].end,
      ),
    ).toBe('running')
    expect(unitOutcome([gen({ id: 100 })], { status: 'unanswered', reason: 'reset' })).toBe(
      'unanswered',
    )
    expect(unitOutcome([gen({ id: 100 })], { status: 'answered', entryId: 1 })).toBe('completed')
  })

  it('collects the union of its rounds’ owner trees', () => {
    const pool = [
      run({ id: 100 }),
      task({ id: 101, owner: 100 }),
      run({ id: 102 }),
      task({ id: 103, owner: 102 }),
      task({ id: 104, owner: 99 }),
    ]
    const { tasks } = collectUnitTasks({ generationIds: [100, 102] }, pool)
    expect(tasks.map((t) => t.id)).toEqual([100, 101, 102, 103])
  })

  it('summarizes the turn outcome, not just the root task', () => {
    const unit = reconstructRuns(
      [gen({ id: 100, resultEntryId: 10 })],
      [sub({ id: 1, entry: 5, status: 'unanswered', reason: 'turn_limit' })],
    )[0]
    const summary = summarizeUnit(
      unit,
      [gen({ id: 100, resultEntryId: 10, startedAt: 5 })],
      'a',
      [],
      false,
    )
    expect(summary).toMatchObject({
      id: 100,
      outcome: 'unanswered',
      generationCount: 1,
      startedAt: 5,
    })
  })
})

describe('child attribution', () => {
  it('exposes anchor attribution as inferred and owner edges as proven', () => {
    const { children, uncertainties } = attributeChildren(
      {
        rootId: 100,
        maxTaskId: Number.MAX_SAFE_INTEGER,
        startedAt: 1000,
        endedAt: 2000,
        ownedTaskIds: new Set([100, 101, 103]),
      },
      [
        { id: 104, startedAt: 1500 },
        { id: 90, startedAt: 1600 },
        { id: 108, startedAt: 1700 },
      ],
      [
        { id: 7, agent: 'worker', ownerTaskId: 104 },
        { id: 8, agent: 'scout', ownerTaskId: 90 },
        { id: 9, agent: 'reviewer', ownerTaskId: 103 },
      ],
      new Map([[7, 101]]),
    )
    expect(children).toHaveLength(3)
    // Anchor inside the id window: inferred, with the interleave caveat spelled out.
    expect(children[0]).toMatchObject({
      conversationId: 7,
      association: 'anchor',
      confidence: 'inferred',
      anchorTaskId: 104,
      spawnTaskId: 101,
      startedAt: 1500,
    })
    expect(children[0].note).toMatch(/inferred/)
    // Only the spawn time overlaps: ambiguous.
    expect(children[1]).toMatchObject({
      conversationId: 8,
      association: 'overlap',
      confidence: 'ambiguous',
    })
    // An owner edge from a run-owned task is the only proven association.
    expect(children[2]).toMatchObject({
      conversationId: 9,
      association: 'owner',
      confidence: 'proven',
    })
    // Anchor 108 is in the window with no visible child conversation.
    expect(uncertainties.some((u) => u.kind === 'attribution' && u.taskId === 108)).toBe(true)
  })
})

describe('the owner-chain walk', () => {
  it('collects the run and its descendants inside the time window', () => {
    const root = run({ id: 10, startedAt: 1000, endedAt: 2000 })
    const pool = [
      task({ id: 9, owner: 10, startedAt: 1900 }),
      task({ id: 11, owner: 10, startedAt: 1100 }),
      task({ id: 12, owner: 11, startedAt: 1200 }),
      task({ id: 13, owner: 10, startedAt: 2500 }),
      task({ id: 14, owner: 99, startedAt: 1300 }),
    ]
    expect(collectRunTasks(root, pool).tasks.map((item) => item.id)).toEqual([10, 11, 12])
  })

  it('keeps a completing run live until it becomes terminal', () => {
    expect(outcomeOf(run({ id: 10, status: 'completing', outcome: 'completed' }))).toBe('running')
    expect(outcomeOf(run({ id: 10, status: 'terminal', outcome: 'completed' }))).toBe('completed')
  })

  it('keeps a live task with no start inside the run window', () => {
    const root = run({ id: 10, startedAt: 1000 })
    const pool = [
      task({ id: 11, owner: 10, status: 'pending', outcome: undefined, startedAt: undefined }),
    ]
    expect(collectRunTasks(root, pool).tasks.map((item) => item.id)).toEqual([10, 11])
  })

  it('flags a run over the cap', () => {
    const root = run({ id: 1, startedAt: 0 })
    const pool = Array.from({ length: 5 }, (_, index) =>
      task({ id: index + 2, owner: 1, startedAt: 1 }),
    )
    expect(collectRunTasks(root, pool, 3)).toMatchObject({ truncated: true })
  })
})

describe('the days filter', () => {
  it('keeps runs started inside the window, newest first', () => {
    const now = Date.UTC(2026, 10, 6)
    const day = 24 * 60 * 60 * 1000
    const runs: RunSummary[] = [
      {
        id: 1,
        conversationId: 1,
        agent: 'a',
        startedAt: now - 4 * day,
        outcome: 'completed',
        taskCount: 1,
        failedCount: 0,
      },
      {
        id: 2,
        conversationId: 1,
        agent: 'a',
        startedAt: now - 2 * day,
        outcome: 'completed',
        taskCount: 1,
        failedCount: 0,
      },
      {
        id: 3,
        conversationId: 1,
        agent: 'a',
        startedAt: now - 1 * day,
        outcome: 'completed',
        taskCount: 1,
        failedCount: 0,
      },
    ]
    expect(runsInDays(runs, 3, now).map((item) => item.id)).toEqual([3, 2])
  })
})

describe('frame ordering', () => {
  it('sorts by the earliest task start, then by conversation', () => {
    expect(
      orderFrames([
        { conversationId: 9, earliest: 300 },
        { conversationId: 4, earliest: 100 },
        { conversationId: 2, earliest: 300 },
      ]).map((frame) => frame.conversationId),
    ).toEqual([4, 2, 9])
  })
})

describe('live over stored', () => {
  it('takes the live state but keeps the stored record and adds new live children', () => {
    const stored = [
      run({ id: 10, startedAt: 1000, endedAt: 1500 }),
      task({ id: 11, owner: 10, startedAt: 1100, endedAt: 1200, facts: { tool: 'read' } }),
    ]
    const live = [
      node({
        id: 11,
        owner: 10,
        state: { status: 'waiting', phase: 'call', on: [12], policy: 'allSettled' },
      }),
      node({ id: 12, owner: 11 }),
      node({ id: 13, owner: 99 }),
    ]
    const merged = mergeLive(stored, live, 10, { '12': 1250 })
    expect(merged.map((item) => item.id)).toEqual([10, 11, 12])
    expect(merged[1]).toMatchObject({
      status: 'waiting',
      startedAt: 1100,
      endedAt: 1200,
      facts: { tool: 'read' },
    })
    expect(merged[2].startedAt).toBe(1250)
  })

  it('merges live nodes across all round roots of the run', () => {
    const stored = [run({ id: 10 }), run({ id: 20 }), task({ id: 21, owner: 20 })]
    const live = [
      node({ id: 11, owner: 10 }),
      node({ id: 22, owner: 21 }),
      node({ id: 30, owner: 99 }),
    ]
    const merged = mergeRunLive(stored, live, [10, 20])
    expect(merged.map((item) => item.id)).toEqual([10, 11, 20, 21, 22])
  })
})

describe('folding finished subtrees', () => {
  it('folds a finished subtree with at least two descendants', () => {
    const tasks = [
      run({ id: 1, startedAt: 0, status: 'running', outcome: undefined }),
      task({ id: 2, owner: 1 }),
      task({ id: 3, owner: 2 }),
      task({ id: 4, owner: 2 }),
    ]
    expect([...foldedByDefault(tasks)]).toEqual([1, 2])
  })
})

describe('critical path', () => {
  it('follows the longest duration chain', () => {
    const tasks = [
      run({ id: 1, startedAt: 0, endedAt: 100 }),
      task({ id: 2, owner: 1, startedAt: 0, endedAt: 900 }),
      task({ id: 3, owner: 2, startedAt: 0, endedAt: 50 }),
    ]
    expect([...criticalPath(tasks, 1000)]).toEqual([1, 2, 3])
  })
})

describe('task settings', () => {
  it('defaults to 3 days, run-level cost and the constellation defaults', () => {
    expect(taskSettings({})).toEqual({
      historyDays: 3,
      costDetail: 'run',
      dag: {
        clusterOverlap: 0.3,
        crossRepulsion: 0,
        visualClustering: 0.72,
        labels: 'hover',
        pulse: true,
      },
    })
  })

  it('reads valid nested settings without an arbitrary upper limit', () => {
    expect(
      taskSettings({
        tasks: {
          historyDays: 365,
          costDetail: 'tool',
          dag: {
            clusterOverlap: 0.55,
            crossRepulsion: 0.4,
            visualClustering: 0.2,
            labels: 'always',
            pulse: false,
          },
        },
      }),
    ).toEqual({
      historyDays: 365,
      costDetail: 'tool',
      dag: {
        clusterOverlap: 0.55,
        crossRepulsion: 0.4,
        visualClustering: 0.2,
        labels: 'always',
        pulse: false,
      },
    })
  })

  it('clamps invalid DAG numbers and falls back for invalid words', () => {
    expect(
      taskSettings({
        tasks: {
          dag: {
            clusterOverlap: 2,
            crossRepulsion: -1,
            visualClustering: 'high',
            labels: 'sometimes',
            pulse: 'yes',
          },
        },
      }).dag,
    ).toEqual({
      clusterOverlap: 0.6,
      crossRepulsion: 0,
      visualClustering: 0.72,
      labels: 'hover',
      pulse: true,
    })
  })
})
