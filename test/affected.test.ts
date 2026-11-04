import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { moduleGraph, report, selection } from '../scripts/affected.ts'
import { removeTemp, temp } from './helpers.ts'

const roots: string[] = []

/** A repository holding `files` (path → source), plus a unit and an e2e test so a selection has something to find. */
async function repo(files: Record<string, string>) {
  const root = await temp('affected-')
  roots.push(root)
  for (const [path, source] of Object.entries({
    'test/leaf.test.ts': "import { leaf } from '../extensions/leaf/server.ts'\n",
    'test/alone.test.ts': "import { helper } from '../lib/helper.ts'\n",
    'test/e2e/flow.test.ts': "import { view } from '../../extensions/leaf/web.tsx'\n",
    'extensions/leaf/server.ts': "import { helper } from '../../lib/helper.ts'\n",
    'extensions/leaf/web.tsx': 'export const view = 1\n',
    'lib/helper.ts': 'export const helper = 1\n',
    'README.md': '# readme\n',
    ...files,
  })) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), source)
  }
  return { root, graph: moduleGraph(root) }
}

const digests = (result: ReturnType<typeof selection>) => ({
  everything: result.everything,
  unit: result.unit,
  e2e: result.e2e,
})
const lines = (result: ReturnType<typeof selection>, totals = { unit: 2, e2e: 1 }) =>
  report(result, totals).join('\n')

it('runs everything when the change is empty, because nothing says what it cannot touch', async () => {
  const { graph } = await repo({})
  expect(digests(selection([], graph))).toEqual({ everything: true, unit: [], e2e: [] })
})

it('runs everything for the core, the harness and the toolchain', async () => {
  const { graph } = await repo({})
  for (const path of [
    'server/main.ts',
    'shared/protocol.ts',
    'bin/ultimate.ts',
    'test/helpers.ts',
    'test/setup.ts',
    'test/sweep-temp.ts',
    'test/e2e/vitest.config.ts',
    'scripts/deps.ts',
    'lint/ultimate.ts',
    'package.json',
    'pnpm-lock.yaml',
    'vite.config.ts',
    'tsconfig.web.json',
  ])
    expect({ path, ...digests(selection([path], graph)) }).toEqual({
      path,
      everything: true,
      unit: [],
      e2e: [],
    })
})

it('runs nothing for a document-only change', async () => {
  const { graph } = await repo({})
  expect(digests(selection(['README.md', 'docs/running.md'], graph))).toEqual({
    everything: false,
    unit: [],
    e2e: [],
  })
  expect(lines(selection(['README.md'], graph))).toContain('only documents: no test reads them')
})

it('runs a changed test file itself, and only what reaches a changed source', async () => {
  const { graph } = await repo({})
  expect(digests(selection(['test/alone.test.ts'], graph))).toEqual({
    everything: false,
    unit: ['test/alone.test.ts'],
    e2e: [],
  })
  // `leaf/server.ts` imports `lib/helper.ts`; the reverse is not true, so each selects a different set.
  expect(digests(selection(['extensions/leaf/server.ts'], graph))).toEqual({
    everything: false,
    unit: ['test/leaf.test.ts'],
    e2e: [],
  })
  expect(digests(selection(['lib/helper.ts'], graph))).toEqual({
    everything: false,
    unit: ['test/alone.test.ts', 'test/leaf.test.ts'],
    e2e: [],
  })
})

it('follows a re-export, a dynamic import and the @/ alias into web/src', async () => {
  const { graph } = await repo({
    'test/leaf.test.ts':
      "import { leaf } from '../extensions/leaf/server.ts'\nimport { panel } from '../extensions/leaf/panel.ts'\n",
    'extensions/leaf/server.ts':
      "export * from '../../lib/helper.ts'\nexport const lazy = () => import('../../lib/ignored.ts')\n",
    'extensions/leaf/panel.ts':
      "import { client } from '@/sdk/client'\nexport const panel = client\n",
    'lib/ignored.ts': 'export const ignored = 1\n',
    'web/src/sdk/client.ts': 'export const client = 1\n',
  })
  expect(selection(['lib/helper.ts'], graph).unit).toContain('test/leaf.test.ts')
  expect(selection(['lib/ignored.ts'], graph).unit).toContain('test/leaf.test.ts')
  expect(selection(['web/src/sdk/client.ts'], graph).unit).toContain('test/leaf.test.ts')
  expect(selection(['web/src/sdk/client.ts'], graph).unit).not.toContain('test/alone.test.ts')
  // The e2e test imports the `.tsx`, which no Node test reaches: it is that test's own input.
  expect(digests(selection(['extensions/leaf/web.tsx'], graph))).toEqual({
    everything: false,
    unit: [],
    e2e: ['test/e2e/flow.test.ts'],
  })
})

it('sends a browser-only change to the e2e tests that open a real browser', async () => {
  const { graph } = await repo({
    // A second browser test, which the selector must find from its own source rather than from a list.
    'test/e2e/gallery.test.ts': "import { chromium } from 'playwright-core'\nchromium.launch()\n",
    'test/e2e/flow.test.ts': "import { view } from '../../extensions/leaf/web.tsx'\n",
  })
  expect(graph.browser).toEqual(['test/e2e/gallery.test.ts'])
  // No Node test imports a `.tsx`, so nothing but a browser test can see a browser-only change.
  expect(digests(selection(['extensions/orphan/web.tsx'], graph))).toEqual({
    everything: false,
    unit: [],
    e2e: ['test/e2e/gallery.test.ts'],
  })
})

it('reaches a file a test reads by a literal path, and not one it merely names', async () => {
  const { graph } = await repo({
    'test/alone.test.ts':
      "import { readFileSync } from 'node:fs'\nreadFileSync('agents/worker.md')\n",
    'test/leaf.test.ts': "comment({ file: 'agents/notes.md' })\n",
    'agents/worker.md': '# worker\n',
    'agents/notes.md': '# notes\n',
  })
  expect(selection(['agents/worker.md'], graph).unit).toEqual(['test/alone.test.ts'])
  // The second test passes the same kind of path as data, which says nothing about what it reads.
  expect(selection(['agents/notes.md'], graph).unit).toEqual([])
})

it('runs everything when a source cannot be parsed, since its imports are unknown', async () => {
  const { graph } = await repo({ 'lib/broken.ts': 'export const = \n' })
  expect(graph.failures).toHaveLength(1)
  expect(digests(selection(['lib/helper.ts'], graph))).toEqual({
    everything: true,
    unit: [],
    e2e: [],
  })
})

it('says which changed paths no test reaches instead of claiming they are tested', async () => {
  const { graph } = await repo({ 'extensions/orphan/api.ts': 'export const api = 1\n' })
  const result = selection(['extensions/orphan/api.ts'], graph)
  expect(result.reason).toBe(
    '0 of 1 changed paths are reached by a test; extensions/orphan/api.ts: no test reaches it',
  )
  expect(lines(result)).toContain('extensions/orphan/api.ts → no test')
  expect(lines(result)).toContain('Unit: none')
})

afterAll(async () => {
  for (const root of roots.splice(0)) await removeTemp(root)
})
