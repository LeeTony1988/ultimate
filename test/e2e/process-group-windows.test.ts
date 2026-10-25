import { spawn } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { runGroup, spawnGroup, stopGroup, sweepPidFiles } from '../../lib/process-group.ts'
import { shell } from '../../lib/shell.ts'
import { removeTemp, temp, until } from '../helpers.ts'

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const terminate = async (child: ReturnType<typeof spawn>) => {
  if (!child.pid || !alive(child.pid)) return
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
  child.kill('SIGKILL')
  await closed
}
const sleeper = 'setInterval(() => {}, 60000)'
const targetWithChild = (path: string) =>
  `process.stdin.on('data',()=>process.exit(0));process.stdin.resume();const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e',${JSON.stringify(sleeper)}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(path)},String(child.pid));process.stdout.write('ready\\n');setInterval(()=>{},60000)`
const ready = () => {
  let text = ''
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return {
    promise,
    onOutput: (chunk: string) => {
      text += chunk
      if (text.includes('ready')) resolve()
    },
  }
}

let directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.map(removeTemp))
  directories = []
})
const directory = async () => {
  const path = await temp('ultimate-process-group-windows-')
  directories.push(path)
  return path
}

it.skipIf(process.platform !== 'win32')(
  'records the runner before launch and drains descendants after the command exits',
  async () => {
    const root = await directory()
    const pidFile = join(root, 'runner.pid')
    const recordedFile = join(root, 'recorded.json')
    const childFile = join(root, 'child.pid')
    const code = [
      "const fs=require('node:fs')",
      "const {spawn}=require('node:child_process')",
      `const child=spawn(process.execPath,['-e',${JSON.stringify(sleeper)}],{stdio:'ignore'})`,
      `fs.writeFileSync(${JSON.stringify(childFile)},String(child.pid))`,
      `fs.writeFileSync(${JSON.stringify(recordedFile)},JSON.stringify({pid:fs.readFileSync(${JSON.stringify(pidFile)},'utf8').trim(),start:fs.readFileSync(${JSON.stringify(`${pidFile}.start`)},'utf8').trim()}))`,
      "process.stdout.write('complete\\n')",
      'process.exit(7)',
    ].join(';')
    let output = ''
    const exitCode = await runGroup(process.execPath, ['-e', code], {
      cwd: root,
      pidFile,
      onOutput: (chunk) => (output += chunk),
    })
    const recorded = JSON.parse(await readFile(recordedFile, 'utf8')) as {
      pid: string
      start: string
    }
    const childPid = Number(await readFile(childFile, 'utf8'))
    expect(exitCode).toBe(7)
    expect(output).toBe('complete\n')
    expect(recorded).toMatchObject({
      pid: expect.stringMatching(/^\d+$/),
      start: expect.stringMatching(/^\d+$/),
    })
    expect(alive(childPid)).toBe(false)
    expect(await readdir(root)).not.toContain('runner.pid')
  },
)

it.skipIf(process.platform !== 'win32')(
  'runs the selected host shell and a Windows shebang automation through the owned runner',
  async () => {
    const root = await directory()
    const script = join(root, 'run')
    await writeFile(script, '#!/usr/bin/env pwsh\nWrite-Output automation\nexit 6\n')
    const pidFile = join(root, 'automation.pid')
    const automation = shell.script(script)
    let automationOutput = ''
    const automationCode = await runGroup(automation.program, automation.args, {
      cwd: root,
      pidFile,
      onOutput: (chunk) => (automationOutput += chunk),
    })
    expect({ automation, automationCode, automationOutput }).toEqual({
      automation,
      automationCode: 6,
      automationOutput: 'automation\r\n',
    })

    const command = shell.argv("Write-Output 'lander shell'; exit 9")
    let shellOutput = ''
    expect(
      await runGroup(command.program, command.args, {
        cwd: root,
        pidFile: join(root, 'lander.pid'),
        onOutput: (chunk) => (shellOutput += chunk),
      }),
    ).toBe(9)
    expect(shellOutput).toContain('lander shell')

    let spawnFailure = ''
    expect(
      await runGroup(join(root, 'missing.exe'), [], {
        cwd: root,
        pidFile: join(root, 'failed.pid'),
        onOutput: (chunk) => (spawnFailure += chunk),
      }),
    ).toBe(1)
    expect(spawnFailure.length).toBeGreaterThan(0)
    expect(await readdir(root)).not.toContain('failed.pid')
  },
)

it.skipIf(process.platform !== 'win32')(
  'aborts one concurrent runner without killing another runner or an unrelated process',
  async () => {
    const root = await directory()
    const firstController = new AbortController()
    const secondController = new AbortController()
    const firstReady = ready()
    const secondReady = ready()
    const firstFile = join(root, 'first-child.pid')
    const secondFile = join(root, 'second-child.pid')
    const first = runGroup(process.execPath, ['-e', targetWithChild(firstFile)], {
      cwd: root,
      pidFile: join(root, 'first.pid'),
      signal: firstController.signal,
      onOutput: firstReady.onOutput,
    })
    const second = runGroup(process.execPath, ['-e', targetWithChild(secondFile)], {
      cwd: root,
      pidFile: join(root, 'second.pid'),
      signal: secondController.signal,
      onOutput: secondReady.onOutput,
    })
    const unrelated = spawn(process.execPath, ['-e', sleeper], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    unrelated.unref()
    try {
      await Promise.all([firstReady.promise, secondReady.promise])
      const firstChild = Number(await readFile(firstFile, 'utf8'))
      const secondChild = Number(await readFile(secondFile, 'utf8'))
      firstController.abort()
      expect(await first).toBe(143)
      expect(alive(firstChild)).toBe(false)
      expect(alive(secondChild)).toBe(true)
      expect(alive(unrelated.pid!)).toBe(true)
      secondController.abort()
      expect(await second).toBe(143)
      expect(alive(secondChild)).toBe(false)
    } finally {
      firstController.abort()
      secondController.abort()
      await Promise.allSettled([first, second])
      await terminate(unrelated)
    }
  },
)

it.skipIf(process.platform !== 'win32')(
  'force-kills an owned job when the orderly stop channel does not drain',
  async () => {
    const root = await directory()
    const childFile = join(root, 'child.pid')
    const pidFile = join(root, 'run.pid')
    const group = spawnGroup(process.execPath, ['-e', targetWithChild(childFile)], {
      cwd: root,
      pidFile,
    })
    let output = ''
    group.child.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk))
    await until(() => output.includes('ready'))
    const descendant = Number(await readFile(childFile, 'utf8'))
    group.child.stdin.cork()
    await stopGroup(group.child.pid!, { pidFile, leader: group, grace: 50 })
    await until(() => !alive(descendant))
    expect(await readdir(root)).not.toContain('run.pid')
  },
)

it.skipIf(process.platform !== 'win32')(
  'stops a verified pid-file owner when the in-memory group handle is unavailable',
  async () => {
    const root = await directory()
    const childFile = join(root, 'child.pid')
    const pidFile = join(root, 'run.pid')
    const group = spawnGroup(process.execPath, ['-e', targetWithChild(childFile)], {
      cwd: root,
      pidFile,
    })
    let output = ''
    group.child.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk))
    await until(() => output.includes('ready'))
    const descendant = Number(await readFile(childFile, 'utf8'))
    await stopGroup(group.child.pid!, { pidFile })
    await group.closed
    expect(alive(descendant)).toBe(false)
    expect(await readdir(root)).not.toContain('run.pid')
  },
)

it.skipIf(process.platform !== 'win32')(
  'refuses a stale pid identity and sweeps a runner whose owner pipe closed',
  async () => {
    const root = await directory()
    const stranger = spawn(process.execPath, ['-e', sleeper], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    stranger.unref()
    const staleFile = join(root, 'stale.pid')
    await writeFile(staleFile, `${stranger.pid}\n`)
    await writeFile(`${staleFile}.start`, 'not-this-process\n')
    try {
      await stopGroup(stranger.pid!, { pidFile: staleFile })
      expect(alive(stranger.pid!)).toBe(true)
      expect(await readdir(root)).toEqual([])

      const childFile = join(root, 'orphan.pid')
      const pidFile = join(root, 'owned.pid')
      const group = spawnGroup(process.execPath, ['-e', targetWithChild(childFile)], {
        cwd: root,
        pidFile,
      })
      let output = ''
      group.child.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk))
      await until(() => output.includes('ready'))
      const descendant = Number(await readFile(childFile, 'utf8'))
      group.child.stdin.end()
      await sweepPidFiles(root)
      await group.closed
      expect(await group.ended).toBe(true)
      expect(alive(descendant)).toBe(false)
      expect(await readdir(root)).not.toContain('owned.pid')
      expect(alive(stranger.pid!)).toBe(true)
    } finally {
      await terminate(stranger)
    }
  },
)
