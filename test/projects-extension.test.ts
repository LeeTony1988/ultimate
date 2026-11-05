import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { actions, openProject, projectRows, spawnEnv } from '../extensions/projects/server.ts'
import type { ActionContext } from '../server/actions.ts'
import type { ExtensionHost } from '../server/extensions.ts'
import type { ProjectInfo } from '../server/project.ts'
import { projects, writeProject } from '../server/project.ts'
import { temp } from './helpers.ts'

const project = (name: string, overrides: Partial<ProjectInfo> = {}): ProjectInfo => ({
  root: `/work/${name}`,
  name,
  home: `/Users/lee/.ultimate/projects/${name}-12345678`,
  openedAt: 1,
  current: false,
  conversations: [],
  ...overrides,
})

const host = (items: ProjectInfo[]) =>
  ({
    ultimateRoot: '/ultimate',
    userHome: '/Users/lee',
    system: () => ({ process: { url: 'http://127.0.0.1:4747' } }),
    projects: async () => items,
  }) as unknown as Pick<ExtensionHost, 'projects' | 'system' | 'ultimateRoot' | 'userHome'>

it('shapes the registry newest-opened first, marks current, and keeps home and pid off the wire', () => {
  const rows = projectRows([
    project('old', {
      openedAt: 10,
      running: { pid: 42, url: 'http://127.0.0.1:4748' },
      conversations: [{ id: 1 }, { id: 2 }],
    }),
    project('current', { openedAt: 30, current: true }),
    project('middle', { openedAt: 20, conversations: [{ id: 3 }] }),
    // An unknown home has no root: it cannot be opened or identified, so the switcher leaves it out.
    {
      home: '/Users/lee/.ultimate/projects/orphan-99999999',
      name: 'orphan',
      current: false,
      conversations: [],
    },
  ])
  expect(rows).toEqual([
    {
      root: '/work/current',
      name: 'current',
      current: true,
      openedAt: 30,
      conversationCount: 0,
    },
    { root: '/work/middle', name: 'middle', current: false, openedAt: 20, conversationCount: 1 },
    {
      root: '/work/old',
      name: 'old',
      current: false,
      openedAt: 10,
      conversationCount: 2,
      running: { url: 'http://127.0.0.1:4748' },
    },
  ])
  expect(rows[2].running).toEqual({ url: 'http://127.0.0.1:4748' })
  for (const row of rows) {
    expect(Object.keys(row)).not.toContain('home')
    expect(Object.keys(row)).not.toContain('pid')
  }
  expect(JSON.stringify(rows)).not.toContain('.ultimate/projects')
})

it('lists a dead lock as stopped and a live pid as running, newest first', async () => {
  const userHome = await temp('ultimate-projects-extension-')
  const homes = join(userHome, '.ultimate/projects')
  const dead = join(homes, 'dead-11111111')
  const live = join(homes, 'live-22222222')
  for (const [home, name] of [
    [dead, 'dead'],
    [live, 'live'],
  ] as const) {
    await mkdir(home, { recursive: true })
    await writeProject(home, `/work/${name}`)
  }
  await writeFile(
    join(dead, 'ultimate.lock'),
    JSON.stringify({ pid: 2147483647, port: 4747, project: '/work/dead' }),
  )
  await writeFile(
    join(live, 'ultimate.lock'),
    JSON.stringify({ pid: process.pid, port: 4748, project: '/work/live' }),
  )
  const rows = projectRows(await projects(userHome, live))
  expect(rows.find((row) => row.name === 'dead')).toMatchObject({ current: false })
  expect(rows.find((row) => row.name === 'dead')?.running).toBeUndefined()
  expect(rows.find((row) => row.name === 'live')).toMatchObject({
    current: true,
    running: { url: 'http://127.0.0.1:4748' },
  })
  // The home path is not part of any row, only the root the switcher needs.
  expect(JSON.stringify(rows)).not.toContain(userHome)
})

it('gives a started project its own home, not the asking host identity or port', () => {
  expect(
    spawnEnv(
      {
        PATH: '/bin',
        ULTIMATE_HOME: '/current-home',
        ULTIMATE_USER_HOME: '/current-user',
        ULTIMATE_PORT: '4747',
        ULTIMATE_PROJECT: '/current',
        ULTIMATE_SUPERVISED: '1',
        ULTIMATE_MODEL: 'openai/fast',
        KEEP: 'yes',
      },
      '/target-home',
      '/Users/lee',
    ),
  ).toEqual({
    PATH: '/bin',
    KEEP: 'yes',
    ULTIMATE_HOME: '/target-home',
    ULTIMATE_USER_HOME: '/Users/lee',
    ULTIMATE_NO_OPEN: '1',
  })
})

it('opens the current and a running project in place and refuses anything unknown', async () => {
  const h = host([
    project('current', { current: true }),
    project('other', { running: { pid: 1, url: 'http://127.0.0.1:4748' } }),
  ])
  const started: string[] = []
  const start = async () => {
    started.push('spawned')
    return { url: 'http://127.0.0.1:1' }
  }
  expect(await openProject(h, '/work/current', start)).toEqual({
    url: 'http://127.0.0.1:4747',
  })
  expect(await openProject(h, '/work/other', start)).toEqual({
    url: 'http://127.0.0.1:4748',
  })
  expect(started).toEqual([])
  await expect(openProject(h, '/work/nope', start)).rejects.toThrow('Unknown project: /work/nope')
  await expect(openProject(h, undefined, start)).rejects.toThrow('open needs a project root')
})

it('starts a stopped project once for concurrent openers', async () => {
  const h = host([project('stopped')])
  let calls = 0
  let release!: (value: { url: string }) => void
  const gate = new Promise<{ url: string }>((resolve) => (release = resolve))
  const start = async () => {
    calls += 1
    return gate
  }
  const first = openProject(h, '/work/stopped', start)
  const second = openProject(h, '/work/stopped', start)
  release({ url: 'http://127.0.0.1:4750' })
  expect(await Promise.all([first, second])).toEqual([
    { url: 'http://127.0.0.1:4750' },
    { url: 'http://127.0.0.1:4750' },
  ])
  expect(calls).toBe(1)
})

it('wires the open action to the same rules', async () => {
  const h = host([project('current', { current: true })])
  const ctx = { host: h, signal: new AbortController().signal } as unknown as ActionContext
  expect(await actions.open({ root: '/work/current' }, ctx)).toEqual({
    url: 'http://127.0.0.1:4747',
  })
  await expect(actions.open({ root: '/work/nope' }, ctx)).rejects.toThrow('Unknown project')
})
