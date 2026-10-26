import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { createModels } from '@earendil-works/pi-ai/models'
import {
  configure,
  createRegistry,
  Harness,
  MemoryStorage,
  ROOT_CONVERSATION_ID,
} from '@earendil-works/pi-durable'
import type { JsonValue } from '@earendil-works/chord'
import type { Tx } from '@earendil-works/pi-durable'
import { expect, it } from 'vitest'
import type { ActionContext } from '../server/actions.ts'
import type { ExtensionHost } from '../server/extensions.ts'
import { Standing } from '../extensions/subagents/api.ts'
import dream, {
  actions,
  decide,
  fileJournal,
  journalText,
  landed,
  reportPass,
  Sessions,
  startDreamIn,
  startSession,
  toolStats,
} from '../extensions/dream/server.ts'
import { busyElsewhere } from '../extensions/dream/types.ts'
import { temp, until } from './helpers.ts'

/** A transaction over plain documents, keyed by kind and conversation. */
function fakeTx() {
  const docs = new Map<string, object>()
  return {
    doc: async (
      { definition: def }: { definition: { kind: string; initial: () => object } },
      id: number,
    ) => {
      const key = `${def.kind}:${id}`
      if (!docs.has(key)) docs.set(key, def.initial())
      return docs.get(key)
    },
  } as unknown as Tx
}
const session = async (tx: Tx, id = 1) =>
  (await tx.doc(Sessions, 1 as never)).sessions.find((item) => item.id === id)!

const journal = {
  session: 1,
  learned: ['I learned to read the trace.', 'I keep editing stale text.', "I'd like a diff tool."],
  text: '## Memory\nNothing stale.',
  proposals: [
    {
      id: 'fast-default',
      pass: 'codify',
      title: 'Default fast for Sol',
      size: 'S',
      retire: 'sol-runs-fast',
    },
    { id: 'drop-stale', pass: 'memory', title: 'Delete memory demo', risk: 'none' },
  ],
}

it('lets one session run at a time, with every pass waiting', async () => {
  const tx = fakeTx()
  expect(await startSession(tx, 10)).toBe(1)
  expect((await session(tx)).passes).toEqual({
    memory: { status: 'waiting' },
    failures: { status: 'waiting' },
    tools: { status: 'waiting' },
    corrections: { status: 'waiting' },
    codify: { status: 'waiting' },
  })
  await expect(startSession(tx, 11)).rejects.toThrow('Dream session 1 is still open')
})

it('names the first pass reporter the dreamer and refuses unknown passes', async () => {
  const tx = fakeTx()
  await startSession(tx, 1)
  await reportPass(tx, { session: 1, pass: 'tools', status: 'running' }, 40)
  await reportPass(tx, { session: 1, pass: 'tools', status: 'done', note: '12 unused' }, 41)
  const found = await session(tx)
  expect(found.dreamer).toBe(40)
  expect(found.passes.tools).toEqual({ status: 'done', note: '12 unused' })
  await expect(reportPass(tx, { session: 1, pass: 'dreams', status: 'done' }, 40)).rejects.toThrow(
    'pass must be one of',
  )
  await expect(reportPass(tx, { session: 2, pass: 'tools', status: 'done' }, 40)).rejects.toThrow(
    'No dream session 2',
  )
})

it('files the journal once, validating its three lines and proposal ids', async () => {
  const tx = fakeTx()
  await startSession(tx, 1)
  await expect(fileJournal(tx, { ...journal, learned: ['one'] }, 2)).rejects.toThrow('3 lines')
  await expect(
    fileJournal(tx, { ...journal, proposals: [journal.proposals[0], journal.proposals[0]] }, 2),
  ).rejects.toThrow('unique slug')
  const { found, filed } = await fileJournal(tx, journal, 2)
  expect(filed).toBe(true)
  expect(found.proposals.map((item) => [item.id, item.status, item.retire])).toEqual([
    ['fast-default', 'open', 'sol-runs-fast'],
    ['drop-stale', 'open', undefined],
  ])
  // A second filing (a retried action) keeps the first.
  expect((await fileJournal(tx, { ...journal, text: 'other' }, 3)).filed).toBe(false)
  expect((await session(tx)).journal?.text).toBe(journal.text)
  expect(journalText(await session(tx))).toContain(
    '- fast-default [codify] (S): Default fast for Sol — retires memory sol-runs-fast once landed',
  )
})

it('follows approved proposals to landing and ends the session when all are settled', async () => {
  const tx = fakeTx()
  await startSession(tx, 1)
  await fileJournal(tx, journal, 2)
  await expect(
    decide(tx, { session: 1, proposal: 'fast-default', status: 'approved' }, 3),
  ).rejects.toThrow('branch must be a positive integer')
  await decide(tx, { session: 1, proposal: 'fast-default', status: 'approved', branch: 77 }, 3)
  await decide(tx, { session: 1, proposal: 'drop-stale', status: 'applied' }, 4)
  expect((await session(tx)).endedAt).toBeUndefined()
  await landed(tx, 99, 'abc', 5)
  expect((await session(tx)).proposals[0].status).toBe('approved')
  await landed(tx, 77, 'def', 6)
  const found = await session(tx)
  expect(found.proposals[0]).toMatchObject({ status: 'landed', sha: 'def' })
  expect(found.endedAt).toBe(6)
  await expect(reportPass(tx, { session: 1, pass: 'tools', status: 'done' }, 1)).rejects.toThrow(
    'has ended',
  )
  expect(await startSession(tx, 7)).toBe(2)
})

it('records a branch landed outside the lander with its sha and settles the session', async () => {
  const tx = fakeTx()
  await startSession(tx, 1)
  await fileJournal(tx, journal, 2)
  await expect(
    decide(tx, { session: 1, proposal: 'fast-default', status: 'landed', sha: 'abcdef1' }, 3),
  ).rejects.toThrow('is not approved with a branch')
  await decide(tx, { session: 1, proposal: 'fast-default', status: 'approved', branch: 77 }, 3)
  await expect(
    decide(tx, { session: 1, proposal: 'fast-default', status: 'landed' }, 4),
  ).rejects.toThrow('sha must be 7 to 40 hex characters')
  await expect(
    decide(tx, { session: 1, proposal: 'fast-default', status: 'landed', sha: 'abc' }, 4),
  ).rejects.toThrow('sha must be 7 to 40 hex characters')
  await decide(tx, { session: 1, proposal: 'drop-stale', status: 'applied' }, 4)
  expect((await session(tx)).endedAt).toBeUndefined()
  const { proposal } = await decide(
    tx,
    { session: 1, proposal: 'fast-default', status: 'landed', sha: 'abcdef1234567890' },
    5,
  )
  expect(proposal).toMatchObject({ status: 'landed', sha: 'abcdef1234567890', branch: 77 })
  const found = await session(tx)
  expect(found.proposals[0]).toMatchObject({
    status: 'landed',
    sha: 'abcdef1234567890',
    branch: 77,
  })
  expect(found.endedAt).toBe(5)
})

it('returns a journal with no proposals again after its session ended', async () => {
  const tx = fakeTx()
  await startSession(tx, 1)
  await fileJournal(tx, { ...journal, proposals: [] }, 2)
  expect((await session(tx)).endedAt).toBe(2)
  expect((await fileJournal(tx, { ...journal, proposals: [] }, 3)).filed).toBe(false)
})

it('delivers the start and the journal to @ultimate once, through a real harness', async () => {
  const storage = new MemoryStorage()
  const registry = createRegistry()
  const harness = await Harness.open(storage, { models: createModels(), registry }, context)
  await harness.root(context)
  const ultimate = await harness.commit(async (tx) => {
    const created = await tx.createConversation({ ownership: { kind: 'ownerless' } })
    await configure(tx, created.id, {})
    ;(await tx.doc(Standing, ROOT_CONVERSATION_ID)).ultimate = created.id
    return created.id
  }, context)
  const host = {
    harness: () => harness,
    conversations: () => [],
    need: () => ({ standing: async () => ultimate }),
    react: () => {},
    implement: () => {},
    onOpen: () => {},
    resource: (_key: string, create: () => unknown) => create(),
  } as unknown as ExtensionHost
  registry.install(dream(host))
  const call = { host } as ActionContext
  // A granted automation starts the session at once; the user's Dream button asks for a handoff first.
  expect(
    await harness.commit(
      (tx) => startDreamIn(host, tx, { automation: 'A1', name: 'Dream', at: 1 }, ultimate),
      context,
    ),
  ).toEqual({ session: 1 })
  const filing = JSON.parse(JSON.stringify(journal)) as JsonValue
  expect(await actions.journal(filing, call)).toEqual({ session: 1, proposals: 2 })
  expect(await actions.journal(filing, call)).toEqual({ session: 1, proposals: 2 })
  // The input starts a run that cannot finish without a model, so the write is admitted but waits in the inbox.
  const submitted = () =>
    harness.commit(
      async (tx) =>
        (
          await Promise.all(
            ['dream.started:1', 'dream.journal:1'].map((id) =>
              tx.submissionByRequest(ultimate, id),
            ),
          )
        ).map((submission) => submission?.type),
      context,
    )
  await until(async () => !(await submitted()).includes(undefined))
  expect(await submitted()).toEqual(['input', 'write'])
  const deliveries = await harness.commit(
    (tx) => tx.scanTasks({ kind: 'dream.deliver' }, 10),
    context,
  )
  expect(deliveries.items).toHaveLength(2)
  await harness.close(context)
})

it('counts top-level conversations at work besides @ultimate', () => {
  expect(
    busyElsewhere(
      [
        { id: 5, busy: true, title: '@ultimate' },
        { id: 8, busy: true, title: 'Fix it' },
        { id: 9, busy: true, parentConversationId: 8 },
        { id: 10, busy: false, title: 'Idle' },
      ],
      5,
    ),
  ).toEqual([{ id: 8, title: 'Fix it' }])
})

it('reads tool numbers from the trace, with unused tools and frequent errors', async () => {
  const file = join(await temp(), 'trace.sqlite')
  const db = new DatabaseSync(file)
  db.exec(
    'CREATE TABLE calls (id TEXT, at REAL, ms REAL, kind TEXT, name TEXT, ok INTEGER, error TEXT)',
  )
  const insert = db.prepare('INSERT INTO calls VALUES (?, ?, ?, ?, ?, ?, ?)')
  insert.run('1', 100, 10, 'tool', 'edit', 1, null)
  insert.run('2', 200, 30, 'tool', 'edit', 0, 'Could not find the exact text')
  insert.run('3', 300, 5, 'tool', 'read', 1, null)
  insert.run('4', 50, 5, 'action', 'dream/stats', 1, null)
  db.close()
  expect(toolStats(file, ['edit', 'read', 'notify'])).toEqual({
    since: 100,
    calls: 3,
    tools: [
      { name: 'edit', calls: 2, failed: 1, avgMs: 20 },
      { name: 'read', calls: 1, failed: 0, avgMs: 5 },
    ],
    unused: ['notify'],
    errors: [{ name: 'edit', error: 'Could not find the exact text', count: 1 }],
  })
  expect(toolStats(join(await temp(), 'none.sqlite'), ['read']).unused).toEqual(['read'])
})
