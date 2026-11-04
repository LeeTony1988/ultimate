import { lstat, mkdir, readdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { expect, it } from 'vitest'
import {
  changedPaths,
  FastForwardError,
  fastForward,
  git,
  isolatable,
  noCommit,
  noRepository,
  uncommittedPaths,
} from '../lib/git.ts'
import { readJson, updateJson, writeJson } from '../lib/json-file.ts'
import { readSettings, updateSettings } from '../lib/settings.ts'
import { shortTitle } from '../lib/title.ts'
import { temp } from './helpers.ts'

/** A repository on `main` with `files`, a `side` branch that changes them, and `main` checked out again. */
async function branches(files: Record<string, string>, side: Record<string, string>) {
  const dir = await temp('ultimate-git-')
  const repo = join(dir, 'repo')
  await mkdir(repo)
  await git(repo, 'init', '-q', '-b', 'main')
  await git(repo, 'config', 'user.email', 'test@example.com')
  await git(repo, 'config', 'user.name', 'Test')
  // Bytes as written, so the assertions below compare what the test wrote.
  await git(repo, 'config', 'core.autocrlf', 'false')
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(repo, path)), { recursive: true })
    await writeFile(join(repo, path), content)
  }
  await git(repo, 'add', '.')
  await git(repo, 'commit', '-qm', 'base')
  await git(repo, 'switch', '-q', '-c', 'side')
  for (const [path, content] of Object.entries(side)) {
    await mkdir(dirname(join(repo, path)), { recursive: true })
    await writeFile(join(repo, path), content)
  }
  await git(repo, 'add', '.')
  await git(repo, 'commit', '-qm', 'side', '--allow-empty')
  await git(repo, 'switch', '-q', 'main')
  return {
    repo,
    base: await git(repo, 'rev-parse', 'HEAD'),
    tip: await git(repo, 'rev-parse', 'side'),
  }
}

it('lists the uncommitted paths of a checkout verbatim, with both sides of a rename', async () => {
  const { repo } = await branches({ 'old name.txt': 'a', b: 'b' }, {})
  await git(repo, 'mv', 'old name.txt', 'new name.txt')
  await writeFile(join(repo, 'ünï cödé.txt'), 'x')
  await writeFile(join(repo, 'staged.txt'), 'y')
  await git(repo, 'add', 'staged.txt')
  expect((await uncommittedPaths(repo)).toSorted()).toEqual([
    'new name.txt',
    'old name.txt',
    'staged.txt',
    'ünï cödé.txt',
  ])
  expect((await changedPaths(repo, 'HEAD', 'HEAD')).length).toBe(0)
})

it('fast-forwards a clean checkout and refuses uncommitted work in a path the landing changes', async () => {
  const { repo, tip } = await branches({ 'a.txt': 'base\n' }, { 'a.txt': 'landed\n' })
  await fastForward(repo, 'HEAD', tip)
  expect(await git(repo, 'rev-parse', 'HEAD')).toBe(tip)
  // A staged copy of the landing's own content: Git would fast-forward it cleanly, hiding the work in the commit.
  const again = await branches({ 'a.txt': 'base\n', 'b.txt': 'base\n' }, { 'a.txt': 'landed\n' })
  await writeFile(join(again.repo, 'a.txt'), 'landed\n')
  await git(again.repo, 'add', 'a.txt')
  const refused = await fastForward(again.repo, 'HEAD', again.tip).catch((error: unknown) => error)
  expect(refused).toBeInstanceOf(FastForwardError)
  expect((refused as FastForwardError).overlap).toEqual(['a.txt'])
  expect(await git(again.repo, 'rev-parse', 'HEAD')).toBe(again.base)
  expect(await readFile(join(again.repo, 'a.txt'), 'utf8')).toBe('landed\n')
  // Uncommitted work elsewhere does not block the landing, and is reported as left alone.
  const elsewhere = await branches(
    { 'a.txt': 'base\n', 'b.txt': 'base\n' },
    { 'a.txt': 'landed\n' },
  )
  await writeFile(join(elsewhere.repo, 'b.txt'), 'draft\n')
  expect(await fastForward(elsewhere.repo, 'HEAD', elsewhere.tip)).toEqual({ absorbed: [] })
  expect(await readFile(join(elsewhere.repo, 'b.txt'), 'utf8')).toBe('draft\n')
  expect(await readFile(join(elsewhere.repo, 'a.txt'), 'utf8')).toBe('landed\n')
  // Called from a subdirectory, both listings are repository-relative, so the same path matches.
  const nested = await branches({ 'dir/a.txt': 'base\n' }, { 'dir/a.txt': 'landed\n' })
  await writeFile(join(nested.repo, 'dir/a.txt'), 'mine\n')
  const fromSubdirectory = await fastForward(join(nested.repo, 'dir'), 'HEAD', nested.tip).catch(
    (error: unknown) => error,
  )
  expect((fromSubdirectory as FastForwardError).overlap).toEqual(['dir/a.txt'])
})

it('titles a long Markdown prompt by its first meaningful line, cut short', () => {
  const prompt = `## Goal\nDesign a redesign of @ultimate's conversation view (the "chat" mode of the transcript) so it reads as one conversation.\n\n${'More detail. '.repeat(500)}`
  const title = shortTitle(prompt)
  expect(title).toBe('Design a redesign of @ultimate\'s conversation view (the "ch…')
  expect(title.length).toBeLessThanOrEqual(60)
  expect(shortTitle('**Task:** find the callers')).toBe('Task: find the callers')
  expect(shortTitle('fork task')).toBe('fork task')
})

it('skips a leading conversation identity line when titling a child', () => {
  expect(shortTitle('You are conversation #4654.\nReview the sidebar changes.')).toBe(
    'Review the sidebar changes.',
  )
  expect(shortTitle('You are conversation #4654.')).toBe('')
})

it('reads a missing JSON file as the fallback and rejects unreadable JSON', async () => {
  const dir = await temp('ultimate-lib-')
  expect(await readJson(join(dir, 'missing.json'), { ports: {} })).toEqual({ ports: {} })
  await writeFile(join(dir, 'broken.json'), '{')
  await expect(readJson(join(dir, 'broken.json'), {})).rejects.toThrow(SyntaxError)
})

it('writes two-space JSON with a trailing newline into new folders and leaves no temporary file', async () => {
  const dir = await temp('ultimate-lib-')
  const path = join(dir, 'nested/settings.json')
  await writeJson(path, { a: 1 })
  await writeJson(path, { b: [true] })
  expect(await readFile(path, 'utf8')).toBe('{\n  "b": [\n    true\n  ]\n}\n')
  expect(await readdir(join(dir, 'nested'))).toEqual(['settings.json'])
})

it('writes through a symlinked file to its target and keeps the link', async () => {
  const dir = await temp('ultimate-lib-')
  await mkdir(join(dir, 'repo'))
  await writeFile(join(dir, 'repo/settings.json'), '{}\n')
  // Windows creates a file symlink only with Developer Mode or elevation; POSIX always can. A host that refuses it
  // cannot exercise this path at all, so the case reports what it could not run instead of failing on the privilege.
  try {
    await symlink('repo/settings.json', join(dir, 'settings.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
    return
  }
  await writeJson(join(dir, 'settings.json'), { a: 1 })
  expect((await lstat(join(dir, 'settings.json'))).isSymbolicLink()).toBe(true)
  expect(await readlink(join(dir, 'settings.json'))).toBe('repo/settings.json')
  expect(await readFile(join(dir, 'repo/settings.json'), 'utf8')).toBe('{\n  "a": 1\n}\n')
  expect(await readdir(join(dir, 'repo'))).toEqual(['settings.json'])
})

const readCounter = (file: string) => readJson<{ count: number }>(file, { count: 0 })

it('serialises concurrent updates of one file, and a failed update does not block later ones', async () => {
  const dir = await temp('ultimate-lib-')
  const path = join(dir, 'counter.json')
  const increment = () =>
    updateJson(path, readCounter, (value) => {
      value.count++
    })
  const failing = updateJson(path, readCounter, () => {
    throw new Error('refused')
  })
  await Promise.all([
    ...Array.from({ length: 10 }, increment),
    expect(failing).rejects.toThrow('refused'),
    ...Array.from({ length: 10 }, increment),
  ])
  expect(await readCounter(path)).toEqual({ count: 20 })
})

it('keeps other settings keys and refuses a settings file that is not an object', async () => {
  const dir = await temp('ultimate-lib-')
  const path = join(dir, 'settings.json')
  expect(await readSettings(path)).toEqual({})
  await writeJson(path, { keep: 'me' })
  await updateSettings(path, (value) => {
    value.added = true
  })
  expect(await readSettings(path)).toEqual({ keep: 'me', added: true })
  await writeFile(path, '[]')
  await expect(readSettings(path)).rejects.toThrow('Settings must be a JSON object')
  await expect(updateSettings(path, () => {})).rejects.toThrow('Settings must be a JSON object')
})

it('trims git output, reports a failed command with its stderr and explains why a folder is not isolatable', async () => {
  const dir = await temp('ultimate-lib-')
  await expect(git(dir, 'rev-parse', '--show-toplevel')).rejects.toThrow(
    /Command failed: git rev-parse --show-toplevel\n.*not a git repository/,
  )
  expect(await isolatable(dir)).toEqual({ reason: noRepository })
  const repo = join(dir, 'repo')
  await mkdir(repo)
  await git(repo, 'init', '-q', '-b', 'main')
  expect(await isolatable(repo)).toEqual({ reason: noCommit })
  expect(await git({ cwd: repo, timeout: 0 }, 'symbolic-ref', '--short', 'HEAD')).toBe('main')
})
