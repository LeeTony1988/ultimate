import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ToolExecutionApi } from '@earendil-works/pi-durable'
import { afterEach, expect, it, vi } from 'vitest'
import codingTools, { shellWorkingDirectory } from '../extensions/coding-tools/server.ts'
import { shell } from '../lib/shell.ts'
import { context } from '../server/harness.ts'
import type { ExtensionHost } from '../server/extensions.ts'
import { removeTemp, temp } from './helpers.ts'

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

it('refuses a cwd that is not an absolute existing directory', async () => {
  const directory = await temp('ultimate-shell-cwd-')
  try {
    const file = join(directory, 'file.txt')
    await writeFile(file, 'x')
    const inner = join(directory, 'inner')
    await mkdir(inner)
    expect(await shellWorkingDirectory(undefined)).toBeUndefined()
    expect(await shellWorkingDirectory(directory)).toBe(directory)
    await expect(shellWorkingDirectory('relative/dir')).rejects.toThrow(
      'cwd must be an absolute path, got "relative/dir"',
    )
    await expect(shellWorkingDirectory(join(directory, 'missing'))).rejects.toThrow(
      'cwd is not a directory',
    )
    await expect(shellWorkingDirectory(file)).rejects.toThrow('cwd is not a directory')
  } finally {
    await removeTemp(directory)
  }
})

it('runs a call in the cwd it was given, and in the default one without', async () => {
  const directory = await temp('ultimate-shell-cwd-')
  try {
    const tool = codingTools({
      emit: vi.fn<ExtensionHost['emit']>() as ExtensionHost['emit'],
    }).tools!.find((candidate) => candidate.name === shell.name)!
    const cwds: string[] = []
    const api = {
      conversationId: 7,
      taskId: 'task-cwd',
      callId: 'call',
      env: {
        exec: async (_command: string, options: { cwd: string }) => {
          cwds.push(options.cwd)
          return { ok: true, value: { exitCode: 0, spillPath: undefined } }
        },
      },
      output: () => {},
      outputWindow: undefined,
      retainedOutput: () => ({ text: '', truncated: false }),
      diagnostic: () => {},
      snapshot: async () => ({ calls: {} }),
      watchDoc: async () => ({ value: { calls: {} }, start: () => {}, stop: async () => {} }),
      commit: async (change: (tx: never) => unknown) => change(undefined as never),
    } as unknown as ToolExecutionApi
    await tool.execute({ command: 'pwd' }, api, context)
    await tool.execute({ command: 'pwd', cwd: directory }, api, context)
    expect(cwds[1]).toBe(directory)
    expect(cwds[0]).not.toBe(directory)
    // A bad cwd is refused before anything runs, as an ordinary tool error.
    await expect(tool.execute({ command: 'pwd', cwd: 'nope' }, api, context)).rejects.toThrow(
      'cwd must be an absolute path',
    )
    expect(cwds).toHaveLength(2)
  } finally {
    await removeTemp(directory)
  }
})
