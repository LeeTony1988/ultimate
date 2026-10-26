import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { git, isolatable, noCommit, noRepository } from '../lib/git.ts'
import { readJson, updateJson, writeJson } from '../lib/json-file.ts'
import { readSettings, updateSettings } from '../lib/settings.ts'
import { shortTitle } from '../lib/title.ts'
import { temp } from './helpers.ts'

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
