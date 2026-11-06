import type { TaskGraphNode } from '@earendil-works/pi-durable'
import { describe, expect, it } from 'vitest'
import {
  collectRunTasks,
  criticalPath,
  foldedByDefault,
  isRun,
  mergeLive,
  orderFrames,
  outcomeOf,
  runsInDays,
  taskSettings,
} from '../extensions/tasks/history.ts'
import type { RunSummary, RunTask } from '../extensions/tasks/history.ts'

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

describe('run grouping', () => {
  it('takes top-level generations only', () => {
    expect(isRun({ kind: 'pi.generation' })).toBe(true)
    expect(isRun({ kind: 'pi.generation', owner: 3 })).toBe(false)
    expect(isRun({ kind: 'pi.tool' })).toBe(false)
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
  it('defaults to 3 days and run-level cost', () => {
    expect(taskSettings({})).toEqual({ historyDays: 3, costDetail: 'run' })
  })

  it('reads valid nested settings without an arbitrary upper limit', () => {
    expect(taskSettings({ tasks: { historyDays: 365, costDetail: 'tool' } })).toEqual({
      historyDays: 365,
      costDetail: 'tool',
    })
  })
})
