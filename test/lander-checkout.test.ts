import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { rematerializeLf } from '../extensions/workspaces/lander.ts'
import { git } from '../lib/git.ts'
import { temp } from './helpers.ts'

/** A checkout made before `.gitattributes`: Git stores LF in the index but writes CRLF in the working tree. */
async function checkoutBeforeAttributes() {
  const path = join(await temp('ultimate-lander-lf-'), 'project')
  await mkdir(path)
  await git(path, 'init', '-b', 'main')
  await git(path, 'config', 'user.email', 'test@example.com')
  await git(path, 'config', 'user.name', 'Test')
  await git(path, 'config', 'core.autocrlf', 'true')
  await writeFile(join(path, 'base.txt'), 'base\r\n')
  await git(path, 'add', '.')
  await git(path, 'commit', '-m', 'base')
  await writeFile(join(path, '.gitattributes'), '* text=auto eol=lf\n')
  await git(path, 'add', '.gitattributes')
  await git(path, 'commit', '-m', 'attributes')
  return path
}

it('re-materializes tracked CRLF files from the index when attributes require LF', async () => {
  const path = await checkoutBeforeAttributes()
  expect(await git(path, 'status', '--porcelain')).toBe('')
  expect(await git(path, 'ls-files', '--eol')).toMatch(/^i\/lf\s+w\/crlf\s+attr\/.*\beol=lf\b/m)
  await rematerializeLf(path)
  expect(await readFile(join(path, 'base.txt'), 'utf8')).toBe('base\n')
  expect(await git(path, 'status', '--porcelain')).toBe('')
})

it('leaves a worktree with uncommitted changes alone', async () => {
  const path = await checkoutBeforeAttributes()
  await writeFile(join(path, 'base.txt'), 'dirty\r\n')
  await rematerializeLf(path)
  expect(await readFile(join(path, 'base.txt'), 'utf8')).toBe('dirty\r\n')
  expect(await git(path, 'status', '--porcelain')).not.toBe('')
})
