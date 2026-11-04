import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { exec } from '../../lib/exec.ts'
import { spawn } from '../../lib/spawn.ts'

/**
 * The parent of `pid`. `ps` is POSIX; Windows has no such program and asks WMI instead, where every process reports the
 * id of the one that created it. Both read the same fact: the helper starts the child, so the child's parent is the
 * helper, and the helper's parent is this process.
 */
const parentOf = async (pid: number) =>
  process.platform === 'win32'
    ? Number(
        execFileSync(
          join(
            process.env.SystemRoot ?? 'C:\\Windows',
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe',
          ),
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `$process = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; [Console]::Out.Write("$($process.ParentProcessId)")`,
          ],
          { encoding: 'utf8', windowsHide: true },
        ).trim(),
      )
    : Number((await exec('ps', ['-o', 'ppid=', '-p', String(pid)])).stdout.trim())

/**
 * Every case runs Node, the runtime already hosting the suite, and passes its code as one argument of an array: these
 * are the execFile and spawn boundaries, which take a program and arguments and involve no shell at all. A shell would
 * add its own quoting and exit-code rules to what is being measured.
 */
const node = (code: string) => [process.execPath, ['-e', code]] as const

it('starts processes from the helper, not from this process', async () => {
  const child = spawn(
    ...node(
      'process.stdin.once("data", (line) => { console.log(`got ${line}`.trim()); process.exit(3) })',
    ),
  )
  let stdout = ''
  child.stdout.setEncoding('utf8').on('data', (text: string) => (stdout += text))
  try {
    await new Promise((resolve) => child.once('spawn', resolve))
    // This process forked the helper, which started the child: this → helper → child, never this → child.
    const helper = await parentOf(child.pid!)
    expect(helper).not.toBe(process.pid)
    expect(await parentOf(helper)).toBe(process.pid)
    // Input reaches the child through the helper, and its own exit code comes back unchanged.
    const closed = new Promise<number | null>((resolve) => child.once('close', resolve))
    child.stdin.end('hello\n')
    expect(await closed).toBe(3)
    expect(stdout).toBe('got hello\n')
  } finally {
    child.kill()
  }
})

it('rejects like execFile: exit code, output and a timeout that kills', async () => {
  await expect(
    exec(...node("console.log('out'); console.error('err'); process.exit(2)")),
  ).rejects.toMatchObject({ code: 2, stdout: 'out\n', stderr: 'err\n' })
  await expect(exec('ultimate-no-such-program')).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(exec(...node('setTimeout(() => {}, 5000)'), { timeout: 50 })).rejects.toMatchObject({
    killed: true,
  })
  // An argument with a space arrives whole: nothing splits it.
  expect(await exec(process.execPath, ['-e', 'console.log(process.argv[1])', 'a b'])).toEqual({
    stdout: 'a b\n',
    stderr: '',
  })
})
