import { expect, it, vi } from 'vitest'
import type { Models } from '@earendil-works/pi-ai'
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import {
  askSummaryModel,
  SUMMARY_TOKENS,
  SUMMARY_RETRY_TOKENS,
} from '../extensions/conversations/summary.ts'
import type { ResponseReceipt } from '../extensions/conversations/summary.ts'
import { fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux'

const luna = { provider: 'openai-codex', id: 'gpt-6-luna', thinking: 'medium' } as const

/** A `streamSimple` that answers in order from `answers`, as Pi does. */
function mocked(answers: { text: string; stopReason: string; input?: number }[]) {
  const stream = vi.fn<Models['streamSimple']>(() => {
    const events = new AssistantMessageEventStream()
    const next = answers.shift()!
    const message = fauxAssistantMessage(next.text, { stopReason: next.stopReason as never })
    message.usage.input = next.input ?? 10
    events.push({ type: 'done', reason: 'stop', message })
    events.end()
    return events
  })
  return { getModel: () => ({ provider: luna.provider, id: luna.id }), streamSimple: stream }
}

it('spends little thinking on a summary request and retries once when the answer stops short', async () => {
  const models = mocked([
    { text: '', stopReason: 'length' },
    { text: '{"activity":"Done."}', stopReason: 'stop', input: 20 },
  ])
  const receipt = { model: luna }
  const response = await askSummaryModel(
    models as unknown as Models,
    'system',
    'input',
    new AbortController().signal,
    receipt,
  )
  expect(response).toMatchObject({ text: '{"activity":"Done."}', stopReason: 'stop' })
  expect(models.streamSimple).toHaveBeenCalledTimes(2)
  // The first ask reserves a small ceiling for thinking; the retry has room to finish.
  expect(models.streamSimple.mock.calls[0][2]).toMatchObject({
    maxTokens: SUMMARY_TOKENS,
    reasoning: 'medium',
    thinkingBudgets: { medium: 1024 },
  })
  expect(models.streamSimple.mock.calls[1][2]).toMatchObject({ maxTokens: SUMMARY_RETRY_TOKENS })
  // Both asks were paid for, and the kept receipt carries both.
  expect(response.usage?.input).toBe(30)
  expect(models.streamSimple.mock.calls[0][2]?.maxTokens).toBe(SUMMARY_TOKENS)
})

it('does not ask twice for a provider error, and saves what each ask received', async () => {
  const saved: ResponseReceipt[] = []
  const failed = mocked([{ text: '', stopReason: 'error' }])
  const response = await askSummaryModel(
    failed as unknown as Models,
    'system',
    'input',
    new AbortController().signal,
    { model: luna, save: async (answer) => (saved.push(answer), answer) },
  )
  expect(response.stopReason).toBe('error')
  expect(failed.streamSimple).toHaveBeenCalledTimes(1)
  expect(saved).toHaveLength(1)
  // The kept answer is saved once, carrying both asks' usage: a resumed task replays it instead of asking again.
  const cut = mocked([
    { text: '{"activity":"Hal', stopReason: 'length' },
    { text: '{"activity":"Done."}', stopReason: 'stop', input: 20 },
  ])
  saved.length = 0
  const retried = await askSummaryModel(
    cut as unknown as Models,
    'system',
    'input',
    new AbortController().signal,
    { model: luna, save: async (answer) => (saved.push(answer), answer) },
  )
  expect(retried.text).toBe('{"activity":"Done."}')
  expect(saved).toHaveLength(1)
  expect(saved[0].text).toBe('{"activity":"Done."}')
  expect(saved[0].usage?.input).toBe(30)
})

it('reuses a saved response without asking again', async () => {
  const models = mocked([])
  const response = await askSummaryModel(
    models as unknown as Models,
    'system',
    'input',
    new AbortController().signal,
    {
      model: luna,
      response: { provider: luna.provider, model: luna.id, text: 'saved', stopReason: 'stop' },
    },
  )
  expect(response.text).toBe('saved')
  expect(models.streamSimple).not.toHaveBeenCalled()
})
