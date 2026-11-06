import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../server/actions.ts'
import { actions } from '../extensions/tasks/server.ts'

/** A read-only transaction over a few durable receipts; `doc` fails if a query tries to create a document. */
function fixture() {
  const now = Date.now()
  const records = [
    {
      id: 10,
      conversationId: 2,
      kind: 'pi.generation',
      version: 1,
      input: {},
      background: false,
      abortRequested: false,
      startedAt: now - 1000,
      endedAt: now - 100,
      state: { status: 'terminal', outcome: { status: 'completed', result: { entryId: 21 } } },
    },
    {
      id: 11,
      conversationId: 2,
      kind: 'pi.tool',
      version: 1,
      input: { kind: 'model', assistant: 20, callId: 'c' },
      owner: 10,
      background: false,
      abortRequested: false,
      startedAt: now - 800,
      endedAt: now - 200,
      state: { status: 'terminal', outcome: { status: 'completed', result: { entryId: 22 } } },
    },
    {
      id: 30,
      conversationId: 2,
      kind: 'pi.generation',
      version: 1,
      input: {},
      background: false,
      abortRequested: false,
      startedAt: now - 3000,
      endedAt: now - 2000,
      state: { status: 'terminal', outcome: { status: 'completed', result: {} } },
    },
    {
      id: 40,
      conversationId: 2,
      kind: 'pi.generation',
      version: 1,
      input: {},
      background: false,
      abortRequested: false,
      startedAt: now - 2000,
      endedAt: now - 1000,
      state: { status: 'terminal', outcome: { status: 'completed', result: {} } },
    },
  ]
  const entries = new Map<number, unknown>([
    [
      20,
      {
        kind: 'pi.assistant',
        model: [
          {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'c', name: 'test', arguments: { command: 'fail' } }],
          },
        ],
      },
    ],
    [
      21,
      {
        kind: 'pi.assistant',
        model: [
          {
            role: 'assistant',
            provider: 'example',
            model: 'model',
            usage: { totalTokens: 12, cost: { total: 0.1 } },
          },
        ],
      },
    ],
    [
      22,
      {
        kind: 'pi.tool-result',
        model: [
          {
            role: 'toolResult',
            isError: true,
            content: [{ type: 'text', text: 'command failed\nmore detail' }],
          },
        ],
      },
    ],
  ])
  const tx = {
    async scanTasks(
      query: { conversationId?: number; kind?: string },
      limit: number,
      cursor?: { id: number },
    ) {
      const items = records
        .filter(
          (record) =>
            (query.kind === undefined || record.kind === query.kind) &&
            (query.conversationId === undefined ||
              record.conversationId === query.conversationId) &&
            (cursor === undefined || record.id < cursor.id),
        )
        .toSorted((a, b) => b.id - a.id)
      const page = items.slice(0, limit)
      return { items: page, ...(items.length > limit ? { next: { id: page.at(-1)!.id } } : {}) }
    },
    async task(id: number) {
      return records.find((record) => record.id === id)
    },
    async entry(tokenOrId: { kind: string } | number, id?: number) {
      const entry = entries.get(typeof tokenOrId === 'number' ? tokenOrId : id!) as
        | { kind?: string }
        | undefined
      return typeof tokenOrId === 'number' || entry?.kind === tokenOrId.kind ? entry : undefined
    },
    async doc() {
      throw new Error('read action opened a mutable document')
    },
  }
  const host = {
    harness: () => ({ commit: async (fn: (value: typeof tx) => unknown) => fn(tx) }),
    conversations: () => [{ id: 2, label: 'worker' }],
    want: () => undefined,
  }
  return {
    ctx: { host, signal: new AbortController().signal } as unknown as ActionContext,
    records,
  }
}

describe('task history actions', () => {
  it('reports a tool-result error even when the tool task itself completed', async () => {
    const { ctx } = fixture()
    const detail = await actions.run({ id: 10, costDetail: 'tool' }, ctx)
    expect(detail.run).toMatchObject({
      taskCount: 2,
      failedCount: 1,
      tokens: 12,
      cost: 0.1,
      model: 'example/model',
    })
    expect(detail.tasks.find((task) => task.id === 11)).toMatchObject({
      tool: 'test',
      toolError: true,
      error: 'command failed',
    })
    const history = await actions.history({ conversationIds: [2], days: 3, limit: 20 }, ctx)
    expect(history.runs.find((run) => run.id === 10)?.failedCount).toBe(1)
  })

  it('marks a history summary as partial when its run exceeds the task cap', async () => {
    const { ctx, records } = fixture()
    const prototype = records.find((record) => record.id === 11)!
    for (let index = 0; index < 5000; index++) records.push({ ...prototype, id: 100 + index })
    const history = await actions.history({ conversationIds: [2], days: 3, limit: 1 }, ctx)
    expect(history.runs[0]).toMatchObject({ id: 10, taskCount: 5000, truncated: true })
  })

  it('refuses to write project settings before the project setup is trusted', async () => {
    const host = { projectSetup: async () => ({ decision: false }), projectRoot: 'unused' }
    const ctx = { host, signal: new AbortController().signal } as unknown as ActionContext
    await expect(actions.settings({ historyDays: 5 }, ctx)).rejects.toThrow('local setup')
  })

  it('pages by start time rather than assuming task IDs are start times', async () => {
    const { ctx } = fixture()
    const first = await actions.history({ conversationIds: [2], days: 3, limit: 1 }, ctx)
    expect(first.runs.map((run) => run.id)).toEqual([10])
    const second = await actions.history(
      { conversationIds: [2], days: 3, limit: 1, before: Number(first.cursor) },
      ctx,
    )
    expect(second.runs.map((run) => run.id)).toEqual([40])
    const third = await actions.history(
      { conversationIds: [2], days: 3, limit: 1, before: Number(second.cursor) },
      ctx,
    )
    expect(third.runs.map((run) => run.id)).toEqual([30])
    expect(third.cursor).toBeUndefined()
  })
})
