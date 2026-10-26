import type { ToolExecutionApi } from '@earendil-works/pi-durable'
import { afterEach, expect, it, vi } from 'vitest'
import codingTools from '../extensions/coding-tools/server.ts'
import { shell } from '../lib/shell.ts'
import { context } from '../server/harness.ts'
import type { ExtensionHost } from '../server/extensions.ts'

afterEach(() => vi.unstubAllEnvs())

it('uses a 600-second default tripwire and leaves explicit timeouts unchanged', async () => {
  vi.stubEnv('ULTIMATE_BASH_TIMEOUT', undefined)
  const tool = shell.create()
  const execute = vi
    .fn<typeof tool.execute>()
    .mockRejectedValue(new Error('Command timed out after 600 seconds'))
  const wrapper = codingTools({
    emit: vi.fn<ExtensionHost['emit']>() as ExtensionHost['emit'],
  }).wraps!.find((wrap) => 'tool' in wrap && wrap.tool === shell.name)!
  if (!('tool' in wrapper)) throw new Error(`Missing ${shell.name} wrapper`)
  const call = wrapper.wrap({ ...tool, execute })
  const api = {} as ToolExecutionApi
  await expect(call.execute({ command: 'wait' }, api, context)).rejects.toThrow(
    `Tripwire: ${shell.name} ran past the 600 s default limit`,
  )
  expect(execute.mock.calls[0][0]).toEqual({ command: 'wait', timeout: 600 })
  await expect(call.execute({ command: 'wait', timeout: 1200 }, api, context)).rejects.toThrow(
    'Command timed out after 600 seconds',
  )
  expect(execute.mock.calls[1][0]).toEqual({ command: 'wait', timeout: 1200 })
  vi.stubEnv('ULTIMATE_BASH_TIMEOUT', '42')
  await expect(call.execute({ command: 'wait' }, api, context)).rejects.toThrow(
    'the 42 s default limit',
  )
  expect(execute.mock.calls[2][0]).toEqual({ command: 'wait', timeout: 42 })
})
