import { expect, it } from 'vitest'
import * as update from '../extensions/update/server.ts'

const { landingInstalls } = update

it('lets agents update the clone; only asking @ultimate to merge is the user’s alone', () => {
  expect(update.userActions).toEqual(['merge'])
})

/** A git whose `diff` lists `files` and whose checkout holds the landed commit when `landedHere`. */
const git =
  (files: string[], landedHere = true) =>
  async (...args: string[]) => {
    if (args[0] === 'merge-base') {
      if (!landedHere) throw new Error('git merge-base failed: not an ancestor')
      return ''
    }
    expect(args).toEqual(['diff', '--name-only', 'b1', 's2'])
    return files.join('\n')
  }

const landing = { base: 'b1', sha: 's2' }

it('installs after a landing that changes the lockfile or a patch', async () => {
  expect(await landingInstalls(git(['extensions/a.ts', 'pnpm-lock.yaml']), landing)).toBe(true)
  expect(
    await landingInstalls(git(['patches/@earendil-works__pi-durable@1.5.0.patch']), landing),
  ).toBe(true)
})

it('does not install after a landing that leaves packages alone', async () => {
  expect(await landingInstalls(git(['extensions/a.ts', 'docs/pnpm-lock.yaml.md']), landing)).toBe(
    false,
  )
})

it('does not install when the landing went into another checkout', async () => {
  expect(await landingInstalls(git(['pnpm-lock.yaml'], false), landing)).toBe(false)
})
