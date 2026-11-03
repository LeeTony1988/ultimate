import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { fauxServer, removeTemp, temp, until } from './helpers.ts'

const homes: string[] = []
afterAll(async () => {
  for (const home of homes.splice(0)) await removeTemp(home)
})

it('generates the classes of a project extension folder created while the host runs', async () => {
  const home = await temp()
  homes.push(home)
  const projectRoot = join(home, 'project')
  await mkdir(join(projectRoot, '.ultimate'), { recursive: true })
  const server = await fauxServer({
    ultimateRoot: resolve('.'),
    projectRoot,
    userHome: home,
    home: join(home, 'state'),
  })
  try {
    const css = async () => (await fetch(`${server.url}/src/index.css`)).text()
    expect(await css()).not.toContain('37deg')
    const dir = join(projectRoot, '.ultimate/extensions/scratch')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'web.tsx'),
      'export const Chevron = () => <span className="rotate-[37deg]" />\n',
    )
    await until(async () => (await css()).includes('37deg'))
  } finally {
    await server.close()
  }
})
