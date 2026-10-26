import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { linkDirectory, moduleURL, temp } from './helpers.ts'

it('links directory fixtures without requiring a file symlink', async () => {
  const root = await temp('ultimate-directory-link-')
  const target = join(root, 'target')
  await mkdir(target)
  await writeFile(join(target, 'dependency'), 'linked')
  await linkDirectory(target, join(root, 'link'))
  expect(await readdir(join(root, 'link'))).toEqual(['dependency'])
  await expect(linkDirectory(join(target, 'dependency'), join(root, 'file-link'))).rejects.toThrow(
    'Not a directory',
  )
})

it('writes fixture imports as file URLs on every platform', () => {
  const specifier = moduleURL('shared/events.ts')
  expect(specifier).toMatch(/^file:\/\//)
  expect(specifier).not.toContain('\\')
})
