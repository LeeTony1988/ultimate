import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../server/actions.ts'
import { actions } from '../extensions/tasks/server.ts'

type Row = Record<string, unknown>

/** One top-level generation round: a model round, ending on its assistant entry. */
function gen(
  id: number,
  conversationId: number,
  resultEntryId: number,
  startedAt: number,
  endedAt: number,
): Row {
  return {
    id,
    conversationId,
    kind: 'pi.generation',
    version: 1,
    input: {},
    background: false,
    abortRequested: false,
    startedAt,
    endedAt,
    state: {
      status: 'terminal',
      outcome: { status: 'completed', result: { entryId: resultEntryId } },
    },
  }
}

/** One tool task owned by a round. */
function tool(
  id: number,
  owner: number,
  input: Row,
  startedAt: number,
  endedAt: number,
  result: Row = {},
  conversationId = 2,
): Row {
  return {
    id,
    conversationId,
    kind: 'pi.tool',
    version: 1,
    input,
    owner,
    background: false,
    abortRequested: false,
    startedAt,
    endedAt,
    state: { status: 'terminal', outcome: { status: 'completed', result } },
  }
}

const assistant = (usage?: { totalTokens?: number; cost?: { total: number } }) => ({
  kind: 'pi.assistant',
  model: [{ role: 'assistant', provider: 'example', model: 'model', ...(usage ? { usage } : {}) }],
})

/** A read-only transaction over durable receipts; `doc` fails if a query tries to create a document. */
function fixture(
  input: {
    records?: Row[]
    entries?: Map<number, unknown>
    submissions?: Row[]
    conversations?: Row[] // { id, agent, ownerTaskId? }
  } = {},
) {
  const records = [...(input.records ?? [])]
  const entries = input.entries ?? new Map<number, unknown>()
  const submissions = input.submissions ?? []
  const conversations = input.conversations ?? [{ id: 2, agent: 'worker' }]
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
            (cursor === undefined || (record.id as number) < cursor.id),
        )
        .toSorted((a, b) => (b.id as number) - (a.id as number))
      const page = items.slice(0, limit)
      return {
        items: page,
        ...(items.length > limit ? { next: { id: page.at(-1)!.id as number } } : {}),
      }
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
    async scanConversations() {
      return {
        items: conversations.map((item) => ({
          id: item.id,
          ...(item.ownerTaskId === undefined
            ? {}
            : { owner: { conversationId: 2, taskId: item.ownerTaskId } }),
        })),
      }
    },
    async doc() {
      throw new Error('read action opened a mutable document')
    },
  }
  const host = {
    harness: () => ({ commit: async (fn: (value: typeof tx) => unknown) => fn(tx) }),
    conversations: () => conversations.map((item) => ({ id: item.id, label: item.agent })),
    want: () => undefined,
    async scanSubmissions(query: { conversationId?: number }) {
      return { items: submissions.filter((item) => item.conversationId === query.conversationId) }
    },
  }
  return {
    ctx: { host, signal: new AbortController().signal } as unknown as ActionContext,
    records,
    submissions,
  }
}

const now = Date.now()

describe('run reconstruction through the actions', () => {
  it('groups one input with two model generations and tools into one run', async () => {
    const { ctx } = fixture({
      records: [
        gen(10, 2, 21, now - 3000, now - 2000),
        tool(11, 10, { kind: 'model', assistant: 20, callId: 'c' }, now - 2900, now - 2800, {
          entryId: 22,
        }),
        gen(12, 2, 23, now - 1900, now - 1800),
      ],
      entries: new Map<number, unknown>([
        [
          20,
          {
            kind: 'pi.assistant',
            model: [
              {
                role: 'assistant',
                content: [{ type: 'toolCall', id: 'c', name: 'test', arguments: { command: 'x' } }],
              },
            ],
          },
        ],
        [21, assistant()],
        [
          22,
          {
            kind: 'pi.tool-result',
            model: [{ role: 'toolResult', content: [{ type: 'text', text: 'ok' }] }],
          },
        ],
        [23, assistant()],
      ]),
      submissions: [
        { id: 1, conversationId: 2, type: 'input', status: 'done', entry: 5, answer: 23 },
      ],
    })
    const history = await actions.history({ conversationIds: [2], days: 3 }, ctx)
    expect(history.runs.map((run) => run.id)).toEqual([10])
    expect(history.runs[0]).toMatchObject({ generationCount: 2, taskCount: 3, toolCount: 1 })
    const detail = await actions.run({ id: 10 }, ctx)
    expect(detail.generationIds).toEqual([10, 12])
    expect(detail.submissions).toEqual([1])
    expect(detail.end).toEqual({ status: 'answered', entryId: 23 })
    expect(detail.tasks.map((task) => task.id)).toEqual([10, 11, 12])
    expect(detail.tasks.find((task) => task.id === 11)?.tool).toBe('test')
    // Rounds joined by ordering carry the honest label.
    expect(detail.uncertainties.map((u) => u.kind)).toContain('continuation')
    // Any round of the run resolves to it, and the response reports the root.
    const viaRound = await actions.run({ id: 12 }, ctx)
    expect(viaRound.run.id).toBe(10)
  })

  it('keeps two consecutive inputs in separate runs', async () => {
    const { ctx } = fixture({
      records: [gen(10, 2, 21, now - 3000, now - 2900), gen(12, 2, 23, now - 2000, now - 1900)],
      submissions: [
        { id: 1, conversationId: 2, type: 'input', status: 'done', entry: 5, answer: 21 },
        { id: 2, conversationId: 2, type: 'input', status: 'done', entry: 22, answer: 23 },
      ],
    })
    const history = await actions.history({ conversationIds: [2], days: 3 }, ctx)
    expect(history.runs.map((run) => run.id)).toEqual([12, 10])
    const first = await actions.run({ id: 10 }, ctx)
    expect(first.submissions).toEqual([1])
    expect(first.end).toEqual({ status: 'answered', entryId: 21 })
    expect(first.uncertainties).toEqual([])
    const second = await actions.run({ id: 12 }, ctx)
    expect(second.submissions).toEqual([2])
    expect(second.end).toEqual({ status: 'answered', entryId: 23 })
    expect(second.uncertainties).toEqual([])
  })

  it('merges a steer that shares its answer into the run', async () => {
    const { ctx } = fixture({
      records: [gen(10, 2, 21, now - 3000, now - 2900), gen(12, 2, 23, now - 2000, now - 1900)],
      submissions: [
        { id: 1, conversationId: 2, type: 'input', status: 'done', entry: 5, answer: 23 },
        { id: 2, conversationId: 2, type: 'input', status: 'done', entry: 22, answer: 23 },
      ],
    })
    const detail = await actions.run({ id: 10 }, ctx)
    expect(detail.generationIds).toEqual([10, 12])
    expect(detail.submissions).toEqual([1, 2])
    expect(detail.end).toEqual({ status: 'answered', entryId: 23 })
  })

  it('never merges turns ended by failures, resets or turn_limit', async () => {
    const { ctx } = fixture({
      records: [gen(10, 2, 21, now - 3000, now - 2900), gen(12, 2, 23, now - 2000, now - 1900)],
      submissions: [
        {
          id: 1,
          conversationId: 2,
          type: 'input',
          status: 'unanswered',
          entry: 5,
          reason: 'turn_limit',
        },
        {
          id: 2,
          conversationId: 2,
          type: 'input',
          status: 'unanswered',
          entry: 22,
          reason: 'turn_limit',
        },
      ],
    })
    const history = await actions.history({ conversationIds: [2], days: 3 }, ctx)
    expect(history.runs.map((run) => run.id)).toEqual([12, 10])
    const second = await actions.run({ id: 12 }, ctx)
    expect(second.end).toEqual({ status: 'unanswered', reason: 'turn_limit' })
    // Identical settlements cannot prove the boundary: the turns stay separate and say so.
    const boundary = second.uncertainties.filter((u) => u.kind === 'boundary')
    expect(boundary.length).toBeGreaterThan(0)
    expect(boundary[0].note).toMatch(/cannot be proven/)
    const first = await actions.run({ id: 10 }, ctx)
    expect(first.end).toEqual({ status: 'unanswered', reason: 'turn_limit' })
    // A reset after a turn_limit settles differently, which proves the split.
    const proven = fixture({
      records: [gen(10, 2, 21, now - 3000, now - 2900), gen(12, 2, 23, now - 2000, now - 1900)],
      submissions: [
        {
          id: 1,
          conversationId: 2,
          type: 'input',
          status: 'unanswered',
          entry: 5,
          reason: 'turn_limit',
        },
        {
          id: 2,
          conversationId: 2,
          type: 'input',
          status: 'unanswered',
          entry: 22,
          reason: 'reset',
        },
      ],
    })
    const reset = await actions.run({ id: 12 }, proven.ctx)
    expect(reset.end).toEqual({ status: 'unanswered', reason: 'reset' })
    expect(reset.uncertainties.filter((u) => u.kind === 'boundary')).toEqual([])
  })

  it('exposes child anchor attribution with its confidence and only the run’s turns', async () => {
    const { ctx } = fixture({
      records: [
        gen(10, 2, 21, now - 3000, now - 1000),
        tool(11, 10, { kind: 'model', assistant: 20, callId: 'c' }, now - 2900, now - 2800, {
          entryId: 22,
        }),
        // A run-owned task naming the child conversation (a spawn call).
        {
          id: 13,
          conversationId: 2,
          kind: 'subagent.spawn',
          version: 1,
          input: { conversationId: 7 },
          owner: 10,
          background: false,
          abortRequested: false,
          startedAt: now - 2700,
          endedAt: now - 2600,
          state: { status: 'terminal', outcome: { status: 'completed', result: {} } },
        },
        // Spawns: conversation-owned anchors, never owned by the generation.
        {
          id: 14,
          conversationId: 2,
          kind: 'ultimate.subagent-anchor',
          version: 1,
          input: null,
          background: true,
          abortRequested: false,
          startedAt: now - 2500,
          endedAt: now - 2500,
          state: { status: 'terminal', outcome: { status: 'completed', result: null } },
        },
        {
          id: 15,
          conversationId: 2,
          kind: 'ultimate.subagent-anchor',
          version: 1,
          input: null,
          background: true,
          abortRequested: false,
          startedAt: now - 2400,
          endedAt: now - 2400,
          state: { status: 'terminal', outcome: { status: 'completed', result: null } },
        },
        // Child #7 turns: one inside the run window, one unrelated and later.
        gen(20, 7, 31, now - 2400, now - 2200),
        gen(22, 7, 32, now - 500, now - 400),
        // Child #8: owned by run task #11, so its turns are attributable and its tasks join the run.
        gen(30, 8, 41, now - 2300, now - 2200),
        tool(31, 30, { kind: 'model', assistant: 20, callId: 'c' }, now - 2290, now - 2280, {}, 8),
      ],
      conversations: [
        { id: 2, agent: 'worker' },
        { id: 7, agent: 'scout', ownerTaskId: 14 },
        { id: 8, agent: 'reviewer', ownerTaskId: 11 },
      ],
      submissions: [
        { id: 1, conversationId: 2, type: 'input', status: 'done', entry: 5, answer: 21 },
      ],
    })
    const detail = await actions.run({ id: 10 }, ctx)
    expect(detail.children.map((child) => child.conversationId)).toEqual([7, 8])
    // The anchor link is inferred — background spawns can interleave — and says so.
    expect(detail.children[0]).toMatchObject({
      association: 'anchor',
      confidence: 'inferred',
      anchorTaskId: 14,
      spawnTaskId: 13,
    })
    expect(detail.children[0].note).toMatch(/inferred/)
    // Only the turn inside the run window; the unrelated later turn is never merged.
    expect(detail.children[0].generationIds).toEqual([20])
    // An owner edge from a run-owned task is proven, and its child tasks join the run.
    expect(detail.children[1]).toMatchObject({ association: 'owner', confidence: 'proven' })
    expect(detail.tasks.map((task) => task.id)).toEqual(expect.arrayContaining([30, 31]))
    // Anchor #15 sits in the window with no visible child conversation: exposed, not guessed.
    expect(detail.uncertainties.some((u) => u.kind === 'attribution' && u.taskId === 15)).toBe(true)
    expect(detail.run.childCount).toBe(2)
  })
})

describe('task history actions', () => {
  it('reports a tool-result error even when the tool task itself completed', async () => {
    const { ctx } = fixture({
      records: [
        gen(10, 2, 21, now - 1000, now - 100),
        tool(11, 10, { kind: 'model', assistant: 20, callId: 'c' }, now - 800, now - 200, {
          entryId: 22,
        }),
      ],
      entries: new Map<number, unknown>([
        [
          20,
          {
            kind: 'pi.assistant',
            model: [
              {
                role: 'assistant',
                content: [
                  { type: 'toolCall', id: 'c', name: 'test', arguments: { command: 'fail' } },
                ],
              },
            ],
          },
        ],
        [21, assistant({ totalTokens: 12, cost: { total: 0.1 } })],
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
      ]),
      submissions: [
        { id: 1, conversationId: 2, type: 'input', status: 'done', entry: 5, answer: 21 },
      ],
    })
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
    const { ctx, records } = fixture({
      records: [gen(10, 2, 21, now - 1000, now - 100)],
      submissions: [
        { id: 1, conversationId: 2, type: 'input', status: 'done', entry: 5, answer: 21 },
      ],
    })
    for (let index = 0; index < 5000; index++)
      records.push(tool(100 + index, 10, {}, now - 900, now - 200))
    const history = await actions.history({ conversationIds: [2], days: 3, limit: 1 }, ctx)
    expect(history.runs[0]).toMatchObject({ id: 10, taskCount: 5000, truncated: true })
  })

  it('refuses to write project settings before the project setup is trusted', async () => {
    const host = { projectSetup: async () => ({ decision: false }), projectRoot: 'unused' }
    const ctx = { host, signal: new AbortController().signal } as unknown as ActionContext
    await expect(actions.settings({ historyDays: 5 }, ctx)).rejects.toThrow('local setup')
  })

  it('pages by start time rather than assuming task IDs are start times', async () => {
    const { ctx } = fixture({
      records: [
        gen(10, 2, 21, now - 1000, now - 900),
        gen(30, 2, 31, now - 3000, now - 2900),
        gen(40, 2, 41, now - 2000, now - 1900),
      ],
      submissions: [
        { id: 1, conversationId: 2, type: 'input', status: 'done', entry: 5, answer: 21 },
        { id: 2, conversationId: 2, type: 'input', status: 'done', entry: 25, answer: 31 },
        { id: 3, conversationId: 2, type: 'input', status: 'done', entry: 45, answer: 41 },
      ],
    })
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

  it('answers every query without opening a mutable document', async () => {
    const { ctx } = fixture({
      records: [
        gen(10, 2, 21, now - 1000, now - 100),
        tool(11, 10, { kind: 'model', assistant: 20, callId: 'c' }, now - 900, now - 200, {
          entryId: 22,
        }),
      ],
      submissions: [
        { id: 1, conversationId: 2, type: 'input', status: 'done', entry: 5, answer: 21 },
      ],
    })
    // The fixture's `doc` throws: any query that opened a document fails these calls.
    const history = await actions.history({ conversationIds: [2], days: 3 }, ctx)
    expect(history.runs.map((run) => run.id)).toEqual([10])
    const detail = await actions.run({ id: 10 }, ctx)
    expect(detail.submissions).toEqual([1])
    const listed = await actions.conversations({}, ctx)
    expect(listed.find((item) => item.id === 2)).toMatchObject({ runs: 1 })
    expect(await actions.started({ ids: [10, 11] }, ctx)).toHaveProperty('10')
    expect(await actions.describe({ ids: [11] }, ctx)).toHaveProperty('11')
    expect(await actions.ended({ ids: [10, 11] }, ctx)).toHaveProperty('10')
  })
})
