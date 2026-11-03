import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { fauxServer, linkDirectory, removeTemp, temp, until } from './helpers.ts'

const homes: string[] = []
afterAll(async () => {
  for (const home of homes.splice(0)) await removeTemp(home)
})

async function target(home: string, folder: string, answer: string) {
  const dir = join(home, folder, 'linked')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'server.ts'),
    `export const actions = { which: () => ${JSON.stringify(answer)} }
export default { name: 'linked' }
`,
  )
  return dir
}

it('loads a linked extension from its new target after the link is repointed and the old target deleted', async () => {
  const home = await temp()
  homes.push(home)
  const projectRoot = join(home, 'project')
  await mkdir(projectRoot)
  const link = join(home, '.ultimate/extensions/linked')
  await mkdir(join(home, '.ultimate/extensions'), { recursive: true })
  // A junction on Windows: it needs no symlink privilege and resolves through realpath like any other link.
  await linkDirectory(await target(home, 'a', 'A'), link)
  const server = await fauxServer({
    ultimateRoot: resolve('.'),
    projectRoot,
    userHome: home,
    home: join(home, 'state'),
  })
  try {
    const which = () => server.extensions.action('linked', 'which')?.({}, {} as never)
    expect(await which()).toBe('A')
    const loadedAt = server.extensions.info().find((entry) => entry.name === 'linked')
      ?.server?.loadedAt
    const b = await target(home, 'b', 'B')
    // Unlink the link itself: a recursive removal walks into the watched target, which Windows refuses while busy.
    await unlink(link)
    await linkDirectory(b, link)
    await rm(join(home, 'a'), { recursive: true })
    // Saving a file reloads the extension, as an edit does on the live host.
    await writeFile(join(b, 'server.ts'), (await readFile(join(b, 'server.ts'), 'utf8')) + '\n')
    const record = () => server.extensions.info().find((entry) => entry.name === 'linked')
    await until(() => !!record()?.server?.error || record()?.server?.loadedAt !== loadedAt)
    expect(record()?.server?.error).toBeUndefined()
    expect(await which()).toBe('B')
  } finally {
    await server.close()
  }
})
