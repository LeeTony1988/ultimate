// fast-test-reason: child_process inspection is mocked; no subprocesses are started.
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { groupAlive } from '../lib/process-group.ts'

const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.restoreAllMocks()
  syncBuiltinESMExports()
})

it('recognizes Darwin zombies beside unrelated unknown states without hiding a target permission failure', () => {
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  const denied = Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw denied
  })
  const inspect = vi.spyOn(childProcess, 'execFileSync')
  syncBuiltinESMExports()
  for (const state of ['?', '?E']) {
    inspect.mockReturnValue(`  999 ${state}\n   42 Z\n`)
    expect(groupAlive(42)).toBe(false)

    inspect.mockReturnValue(`  999 Z\n   42 ${state}\n`)
    expect(() => groupAlive(42)).toThrow(denied)
  }
})
