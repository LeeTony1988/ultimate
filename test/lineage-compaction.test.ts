import { fauxAssistantMessage, fauxToolCall, fauxText } from '@earendil-works/pi-ai/providers/faux'
import { expect, it } from 'vitest'
import type { Notice } from '../shared/protocol.ts'
import { context } from '../server/harness.ts'
import { fixture, textOf } from './lineage-fixture.ts'
import type { Server } from './lineage-fixture.ts'

/** Enough older context that a compaction has a summary to write. */
async function backlog(server: Server) {
  await server.harness.commit(async (tx) => {
    for (let n = 0; n < 8; n++)
      await tx.appendEntry(server.root.id, {
        kind: 'pi.user',
        model: [{ role: 'user', content: `Part ${n} ${'word '.repeat(4000)}`, timestamp: n }],
      })
  }, context)
}

it.concurrent('keeps a summary whose answer also made a stray tool call', async () => {
  const { server, condenseAnswers, condensed } = await fixture()
  condenseAnswers.push(
    fauxAssistantMessage([fauxText('SUMMARY WITH A STRAY CALL'), fauxToolCall('todo', {})], {
      stopReason: 'toolUse',
    }),
  )
  await backlog(server)
  const settled = await server.harness.waitForTask(
    await server.root.compact(undefined, context),
    context,
  )
  expect(settled.state.outcome.status).toBe('completed')
  const { entries, messages } = await server.root.context(context)
  expect(condensed).toHaveLength(1)
  expect(entries[0].kind).toBe('pi.compaction')
  expect(textOf(messages[0]?.content)).toContain('SUMMARY WITH A STRAY CALL')
})

it.concurrent('retries once without tools when a tool-only answer has no text', async () => {
  const { server, condenseAnswers, condensed } = await fixture()
  condenseAnswers.push(
    fauxAssistantMessage([fauxToolCall('todo', {})], { stopReason: 'toolUse' }),
    fauxAssistantMessage('SUMMARY AFTER RETRY'),
  )
  await backlog(server)
  const settled = await server.harness.waitForTask(
    await server.root.compact(undefined, context),
    context,
  )
  expect(settled.state.outcome.status).toBe('completed')
  expect(condensed).toHaveLength(2)
  expect(condensed[0]).not.toContain('Do not call any tool')
  expect(condensed[1]).toContain('Do not call any tool: answer with the summary text only.')
  expect(textOf((await server.root.context(context)).messages[0]?.content)).toContain(
    'SUMMARY AFTER RETRY',
  )
})

it.concurrent('reports the stop reason once when both answers are tool-only', async () => {
  const { server, condenseAnswers, condensed } = await fixture()
  condenseAnswers.push(
    fauxAssistantMessage([fauxToolCall('todo', {})], { stopReason: 'toolUse' }),
    fauxAssistantMessage([fauxToolCall('todo', {})], { stopReason: 'toolUse' }),
  )
  const notices: string[] = []
  server.events.listeners.add((name, data) => {
    if (name === 'notice') notices.push((data as Notice).message)
  })
  await backlog(server)
  const settled = await server.harness.waitForTask(
    await server.root.compact(undefined, context),
    context,
  )
  // The failed hook is reported once, then Pi's own fallback summary completes the compaction.
  expect(settled.state.outcome.status).toBe('completed')
  expect(notices).toEqual([
    expect.stringMatching(
      /^extension error: task #\d+ \(pi\.compaction\) in #1, extension lineage\. Error: The model stopped: toolUse$/,
    ),
  ])
  // One retry, then no loop: exactly two summary requests.
  expect(condensed).toHaveLength(2)
})
