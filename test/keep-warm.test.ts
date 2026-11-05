import { expect, it } from 'vitest'
import { due, failing, IDLE_STOP, LEAD, TTL } from '../extensions/keep-warm/due.ts'
import * as keepWarm from '../extensions/keep-warm/server.ts'

const now = Date.parse('2026-10-24T12:00:00Z')
const minutes = (count: number) => count * 60_000

it('pings in the last minutes of the cache hour while the user was here recently', () => {
  expect(due({ now, lastRequest: now - LEAD, inputAt: now - minutes(70) })).toBe(true)
  expect(due({ now, lastRequest: now - minutes(59), inputAt: now - minutes(59) })).toBe(true)
})

it('waits while the cache is fresh and never pings a cold one', () => {
  expect(due({ now, lastRequest: now - minutes(30), inputAt: now - minutes(30) })).toBe(false)
  expect(due({ now, lastRequest: now - TTL, inputAt: now - minutes(61) })).toBe(false)
})

it('stops once the user has been away 8 hours, and without any input', () => {
  expect(due({ now, lastRequest: now - LEAD, inputAt: now - IDLE_STOP })).toBe(false)
  expect(due({ now, lastRequest: now - LEAD })).toBe(false)
  expect(due({ now, inputAt: now })).toBe(false)
})

it('does not retry after a failed ping until a newer request', () => {
  const lastRequest = now - LEAD
  const inputAt = now - minutes(70)
  expect(due({ now, lastRequest, inputAt, failedAfter: lastRequest + 1 })).toBe(false)
  expect(due({ now, lastRequest, inputAt, failedAfter: lastRequest - 1 })).toBe(true)
})

it('clears a failed ping once a cached @ultimate answer follows it', () => {
  const failedAt = now - minutes(300)
  expect(failing(failedAt, now - minutes(355))).toBe(true)
  expect(failing(failedAt, undefined)).toBe(true)
  expect(failing(failedAt, now - minutes(10))).toBe(false)
  expect(failing(undefined, now)).toBe(false)
})

it('counts only answers that read or wrote the current model’s cache', () => {
  const answer = (change: Record<string, unknown>) =>
    ({
      role: 'assistant',
      provider: 'claude-code',
      model: 'claude-opus-5-5',
      stopReason: 'stop',
      usage: { cacheRead: 500_000, cacheWrite: 2_000 },
      ...change,
    }) as unknown as Parameters<typeof keepWarm.cached>[0]
  expect(keepWarm.cached(answer({}), 'claude-opus-5-5')).toBe(true)
  expect(keepWarm.cached(answer({ stopReason: 'error' }), 'claude-opus-5-5')).toBe(false)
  expect(keepWarm.cached(answer({ model: 'claude-fable-5-1' }), 'claude-opus-5-5')).toBe(false)
  expect(keepWarm.cached(answer({ provider: 'openai-codex' }), 'claude-opus-5-5')).toBe(false)
  expect(
    keepWarm.cached(answer({ usage: { cacheRead: 0, cacheWrite: 0 } }), 'claude-opus-5-5'),
  ).toBe(false)
})

it('sends only while not paused and within the hour, checked right before the request', () => {
  expect(keepWarm.open(false, now - LEAD, now)).toBe(true)
  expect(keepWarm.open(true, now - LEAD, now)).toBe(false)
  expect(keepWarm.open(undefined, now - LEAD, now)).toBe(true)
  expect(keepWarm.open(false, now - TTL, now)).toBe(false)
})

it('leaves the switch to the user', () => {
  expect(keepWarm.userActions).toEqual(['set'])
})
