import { spawn } from 'node:child_process'
import { fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux'
import { Metadata } from '../../server/metadata.ts'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { JsonValue } from '@earendil-works/chord'
import type { ConversationId } from '@earendil-works/pi-durable'
import { Messages } from '../../extensions/messages/api.ts'
import { launchHandshake, Automations } from '../../extensions/automations/server.ts'
import { Done, Exited } from '../../extensions/automations/refs.ts'
import type { Automation, AutomationListItem } from '../../extensions/automations/types.ts'
import { context } from '../../server/harness.ts'
import { shell } from '../../lib/shell.ts'
import { eventHost, fauxServer, temp, until } from '../helpers.ts'

let server: Awaited<ReturnType<typeof fauxServer>> | undefined
afterEach(async () => {
  const app = server
  server = undefined
  await app?.close()
})

async function fixture(localSetup = true) {
  const root = await temp('ultimate-automations-')
  const userHome = join(root, 'user')
  const home = join(root, 'project-state')
  const definitions = join(userHome, '.ultimate/agents')
  await mkdir(definitions, { recursive: true })
  for (const name of ['watcher', 'ultimate'])
    await writeFile(
      join(definitions, `${name}.md`),
      `---\nname: ${name}\ndescription: Automation test\nmodel: faux/faux-1\ntools: []\n${name === 'ultimate' ? 'resident: true\n' : ''}---\nKeep answers short.\n`,
    )
  const options = { ultimateRoot: resolve('.'), projectRoot: root, userHome, home, localSetup }
  server = await fauxServer(options)
  return {
    root,
    userHome,
    home,
    options,
    app: server,
    folder: (id: string) => join(userHome, '.ultimate/automations', basename(home), id),
  }
}
async function create(app: NonNullable<typeof server>) {
  const caller = await app.harness.createConversation({ ownership: { kind: 'ownerless' } }, context)
  return (await app.extensions.invoke(
    'automations',
    'create',
    { name: 'Watch', ask: 'Watch this script' },
    new AbortController().signal,
    caller.id,
  )) as Automation
}
async function writeRun(folder: string, script: string) {
  await mkdir(join(folder, 'state'), { recursive: true })
  await writeFile(join(folder, 'run'), scriptRun(script))
  await chmod(join(folder, 'run'), 0o700)
}
/**
 * A `run` script the product can start on either platform. It goes through `shell.script`, as the supervisor does, so
 * the shebang must name an interpreter both hosts have: Node. A `#!/bin/sh` script would exercise a path the product
 * only reaches on POSIX, and on Windows needs a Bash that accepts a script path.
 *
 * The body gets `state` (the automation's state directory) and `log` (a line to stdout) as globals, plus Node's own API;
 * `AUTOMATION_STATE` is still exported for the cases that assert the variable reaches the script.
 */
function scriptRun(body: string) {
  return `#!/usr/bin/env node
const { appendFileSync, existsSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const state = process.env.AUTOMATION_STATE
const log = (line) => console.log(line)
${body}
`
}
function call(app: NonNullable<typeof server>, action: string, id: string) {
  return app.extensions.invoke('automations', action, { id }, new AbortController().signal)
}

it('starts a prompt run from script FIRE with its payload', async () => {
  const { app, folder } = await fixture()
  app.host.faux!.setResponses(Array.from({ length: 4 }, () => fauxAssistantMessage('Complete')))
  const caller = await app.harness.createConversation({ ownership: { kind: 'ownerless' } }, context)
  const a = (await app.extensions.invoke(
    'automations',
    'create',
    {
      name: 'Summary',
      ask: 'Watch',
      prompt: 'Summarize',
    },
    new AbortController().signal,
    caller.id,
  )) as Automation
  expect(a.subscribers).toEqual([])
  await app.extensions.invoke(
    'automations',
    'subscribe',
    { id: a.id, to: `#${caller.id}` },
    new AbortController().signal,
  )
  await writeRun(folder(a.id), "log('FIRE hello')")
  await call(app, 'resume', a.id)
  const record = async () => (await app.harness.snapshot(Automations, context))!.automations[a.id]
  await until(async () => !!(await record()).runs[0]?.finishedAt)
  const run = (await record()).runs[0]
  expect(run.status).toBe('done')
  const child = (await app.harness.conversation(run.conversationId!, context))!
  const entries = (await child.context(context)).entries.filter(
    (e) => e.conversationId === child.id,
  )
  const first = entries.find((e) => e.kind === 'pi.user')!.model![0]
  expect(first.content).toContain('Summarize')
  expect(first.content).toContain('Fired: hello')
  expect((await app.harness.snapshot(Metadata, child.id, context))?.label).toBe('automation')
  const fired = async () =>
    (await (await app.harness.conversation(caller.id, context))!.context(context)).entries.filter(
      (e) => e.conversationId === caller.id && e.kind === 'automations.fired',
    )
  await until(async () => (await fired()).length === 1)
  expect((await fired())[0].data).toEqual({ id: a.id, name: 'Summary', text: 'hello' })
  expect(await record()).toMatchObject({ fires: 1, enabled: false, script: { state: 'done' } })
})

it('delivers FIRE once, investigates exits only in the owning agent, recovers, and escalates through Messages', async () => {
  const { root, userHome, home, options, app: initial } = await fixture()
  let app = initial
  const caller = await app.harness.createConversation({ ownership: { kind: 'ownerless' } }, context)
  const invoke = (action: string, args: JsonValue = null) =>
    app.extensions.invoke('automations', action, args, new AbortController().signal, caller.id)
  const get = async (id: string) =>
    (await app.harness.snapshot(Automations, context))!.automations[id]
  const entries = async (id: number, kind: string) => {
    const conversation = (await app.harness.conversation(id as ConversationId, context))!
    return (await conversation.context(context)).entries.filter(
      (e) => e.conversationId === id && e.kind === kind,
    )
  }
  const script = async (id: string, text: string) => {
    const dir = join(userHome, '.ultimate/automations', basename(home), id)
    await mkdir(join(dir, 'state'), { recursive: true })
    await writeFile(join(dir, 'run'), scriptRun(text))
    await chmod(join(dir, 'run'), 0o700)
  }
  const first = (await invoke('create', {
    ask: 'Wake me when this finishes',
    name: 'CI',
  })) as Automation
  expect(first).toMatchObject({
    id: 'A1',
    subscribers: [caller.id],
    script: { state: 'writing', once: true },
  })
  await script(first.id, "setTimeout(() => log('FIRE done'), 2000)")
  await invoke('resume', { id: first.id })
  await until(
    async () =>
      (await get(first.id)).script!.state === 'done' &&
      (await entries(caller.id, 'automations.fired')).length === 1,
  )
  expect((await entries(caller.id, 'automations.fired'))[0].data).toMatchObject({
    id: first.id,
    name: 'CI',
    text: 'done',
  })
  expect(await get(first.id)).toMatchObject({ enabled: false, fires: 1 })

  const second = (await invoke('create', {
    ask: 'Watch a failing process',
    name: 'Failure',
  })) as Automation
  await script(second.id, "console.error('broken'); process.exit(3)")
  await invoke('resume', { id: second.id })
  await until(
    async () => (await entries(second.script!.conversationId, 'automations.failed')).length === 1,
  )
  expect(await get(second.id)).toMatchObject({ script: { state: 'investigating', exitCode: 3 } })
  expect(await entries(caller.id, 'automations.failed')).toHaveLength(0)
  expect(
    JSON.stringify(await entries(second.script!.conversationId, 'automations.failed')),
  ).toContain('code 3')
  expect(await invoke('log', { id: second.id })).toEqual({ text: 'broken' })
  // Recovery itself never wakes subscribers; only the eventual FIRE does.
  await script(second.id, "log('FIRE recovered')")
  await invoke('resume', { id: second.id })
  await until(
    async () =>
      (await get(second.id)).script!.state === 'done' &&
      (await entries(caller.id, 'automations.fired')).length === 2,
  )
  expect(await entries(caller.id, 'automations.escalated')).toHaveLength(0)

  const third = (await invoke('create', { name: 'Watch', ask: 'This cannot work' })) as Automation
  await invoke('escalate', { id: third.id, reason: 'No access to the remote system' })
  await until(async () => (await entries(caller.id, 'automations.escalated')).length === 1)
  expect(await get(third.id)).toMatchObject({ enabled: false, script: { state: 'failed' } })
  const messages = (await app.harness.snapshot(Messages, 1 as ConversationId, context))!.messages
  expect(
    messages.filter(
      (m) =>
        m.from === third.script!.conversationId &&
        m.text.includes('No access to the remote system'),
    ),
  ).toHaveLength(1)
  await invoke('delete', { id: third.id })
  expect((await app.harness.snapshot(Automations, context))!.automations[third.id]).toBeUndefined()
  expect(
    await app.harness.conversation(third.script!.conversationId as ConversationId, context),
  ).toBeDefined()

  const recurring = (await invoke('create', {
    name: 'Watch',
    ask: 'Keep watching',
    once: false,
  })) as Automation
  await script(recurring.id, "log('FIRE tick'); process.exit(0)")
  await invoke('resume', { id: recurring.id })
  await until(
    async () =>
      (await entries(recurring.script!.conversationId, 'automations.failed')).length === 1,
  )
  expect(await get(recurring.id)).toMatchObject({
    fires: 1,
    script: { state: 'investigating', exitCode: 0 },
  })

  const restart = (await invoke('create', {
    name: 'Watch',
    ask: 'Survive a server reopen',
  })) as Automation
  await script(restart.id, "log('stopping'); setInterval(() => {}, 1000)")
  const beforeRestart = (await invoke('resume', { id: restart.id })) as Automation
  const afterRestart = (await invoke('run', { id: restart.id })) as Automation
  expect(afterRestart.script!.pid).not.toBe(beforeRestart.script!.pid)
  await invoke('pause', { id: restart.id })
  await until(async () => !!(await get(restart.id)).script!.exitedAt)
  expect(await get(restart.id)).toMatchObject({ enabled: false, script: { state: 'stopped' } })
  expect(await entries(restart.script!.conversationId, 'automations.failed')).toHaveLength(0)
  // A changed ask stops the running script and sends the watcher back to writing, as at creation.
  await invoke('resume', { id: restart.id })
  const watching = (await get(restart.id)).script!.pid!
  const rewritten = (await invoke('update', {
    id: restart.id,
    ask: 'Survive a server reopen, then fire',
  })) as Automation
  expect(rewritten.script).toMatchObject({
    state: 'writing',
    ask: 'Survive a server reopen, then fire',
  })
  await until(() => {
    try {
      process.kill(watching, 0)
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true
      throw error
    }
  })
  await until(
    async () => (await entries(restart.script!.conversationId, 'automations.writing')).length === 2,
  )
  expect((await get(restart.id)).script!.state).toBe('writing')
  await script(
    restart.id,
    "if (existsSync(join(state, 'ready'))) log('FIRE resumed'); else { writeFileSync(join(state, 'ready'), ''); log('ready-for-reopen'); setInterval(() => {}, 1000) }",
  )
  await invoke('resume', { id: restart.id })
  await until(async () =>
    ((await invoke('log', { id: restart.id })) as { text: string }).text.includes(
      'ready-for-reopen',
    ),
  )
  await app.close()
  server = undefined
  app = await fauxServer(options)
  server = app
  await until(
    async () =>
      (await get(restart.id)).script!.state === 'done' &&
      (await entries(caller.id, 'automations.fired')).length === 4,
  )
  expect(
    (await entries(caller.id, 'automations.fired')).map((e) => (e.data as { text: string }).text),
  ).toEqual(['done', 'recovered', 'tick', 'resumed'])

  const disabled = (await invoke('create', {
    name: 'Watch',
    ask: 'Stop with the optional extension',
  })) as Automation
  await script(disabled.id, 'setInterval(() => {}, 1000)')
  const running = (await invoke('resume', { id: disabled.id })) as Automation
  await mkdir(join(root, '.ultimate'), { recursive: true })
  await writeFile(
    join(root, '.ultimate/settings.json'),
    JSON.stringify({ extensions: { disable: ['automations'] } }),
  )
  await until(() => app.extensions.info().some((e) => e.name === 'automations' && !e.enabled))
  await until(() => {
    try {
      process.kill(running.script!.pid!, 0)
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true
      throw error
    }
  })
})

it('stops a recurring script that prints DONE and exits 0 without waking anyone; start resumes it with its state', async () => {
  const { app, folder } = await fixture()
  const sub = (await app.extensions.invoke(
    'automations',
    'create',
    { name: 'Watch', ask: 'Poll until merged', once: false },
    new AbortController().signal,
    (await app.harness.createConversation({ ownership: { kind: 'ownerless' } }, context)).id,
  )) as Automation
  const get = async () => (await app.harness.snapshot(Automations, context))!.automations[sub.id]
  const inputs = async (id: number) =>
    (
      await (await app.harness.conversation(id as ConversationId, context))!.context(context)
    ).entries
      .filter((e) => e.conversationId === id && e.kind.startsWith('automations.'))
      .map((e) => e.kind)
  const done = () => eventHost(() => app.harness, 'test').eventLog.recent({ events: [Done] })
  // Each run counts itself in its state folder, fires the count and stops itself.
  await writeRun(
    folder(sub.id),
    "const n = Number(existsSync(join(state, 'n')) ? require('node:fs').readFileSync(join(state, 'n'), 'utf8').trim() : 0) + 1; writeFileSync(join(state, 'n'), String(n)); log('FIRE ' + n); log('DONE all merged')",
  )
  await call(app, 'resume', sub.id)
  await until(async () => !!(await get()).script!.exitedAt)
  expect(await get()).toMatchObject({
    enabled: false,
    fires: 1,
    script: { state: 'stopped', exitCode: 0 },
  })
  expect((await get()).script!.error).toBeUndefined()
  expect((await done()).map((e) => e.data)).toEqual([{ id: sub.id, text: 'all merged' }])
  await call(app, 'resume', sub.id)
  await until(async () => (await get()).fires === 2 && (await get()).script!.state === 'stopped')
  expect(await readFile(join(folder(sub.id), 'state/n'), 'utf8')).toBe('2')
  await until(async () => (await inputs(sub.subscribers[0])).length === 2)
  expect(await inputs(sub.subscribers[0])).toEqual(['automations.fired', 'automations.fired'])
  // The owning agent got only its writing brief: no failure input.
  expect(await inputs(sub.script!.conversationId)).toEqual(['automations.writing'])

  // DONE followed by a non-zero exit stays a failure.
  await writeRun(folder(sub.id), "log('DONE'); process.exit(2)")
  await call(app, 'resume', sub.id)
  await until(async () => (await get()).script!.state === 'investigating')
  expect(await get()).toMatchObject({ enabled: true, script: { exitCode: 2 } })
  await until(async () => (await inputs(sub.script!.conversationId)).includes('automations.failed'))
  expect(await done()).toHaveLength(2)

  // A one-shot cannot DONE: exiting without a FIRE still fails, so its subscribers are not left waiting.
  const once = await create(app)
  await writeRun(folder(once.id), "log('DONE')")
  await call(app, 'resume', once.id)
  await until(
    async () =>
      (await app.harness.snapshot(Automations, context))!.automations[once.id].script!.state ===
      'investigating',
  )
  expect(await done()).toHaveLength(2)
})

it('keeps listing and supervising scripts after a reload bumps the ledger version', async () => {
  const { app, folder } = await fixture()
  const sub = await create(app)
  const get = async () =>
    (
      (await app.extensions.invoke(
        'automations',
        'list',
        null,
        new AbortController().signal,
      )) as AutomationListItem[]
    ).find((a) => a.id === sub.id)!
  await writeRun(folder(sub.id), 'setInterval(() => {}, 1000)')
  const before = (await call(app, 'resume', sub.id)) as Automation
  // ultimateRoot is an isolated source copy; never mutate the working checkout here.
  const file = join(app.host.ultimateRoot, 'extensions/automations/server.ts')
  const source = await readFile(file, 'utf8')
  const loaded = () => app.extensions.info().find((e) => e.name === 'automations')!.server!.loadedAt
  const previous = loaded()
  await writeFile(file, source.replace('  version: 2,\n  scope: ', '  version: 3,\n  scope: '))
  app.vite.watcher.emit('change', file)
  await until(() => loaded() !== previous)
  // A reload restarts running scripts on the new code, as a core swap does.
  await until(async () => {
    const now = await get()
    return now.alive && now.script!.pid !== before.script!.pid
  })
  // The new token migrates the ledger to version 3 on its next write; the supervisor must use it too.
  await call(app, 'pause', sub.id)
  await until(async () => !!(await get()).script!.exitedAt)
  expect(await get()).toMatchObject({ enabled: false, script: { state: 'stopped' } })
  await writeRun(folder(sub.id), "log('FIRE after')")
  await call(app, 'resume', sub.id)
  await until(async () => (await get()).fires === 1)
})

/** A recurring project automation committed in `root`'s `.ultimate/automations/<slug>/`. */
async function committed(root: string, slug: string, script: string) {
  const dir = join(root, '.ultimate/automations', slug)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'automation.json'),
    JSON.stringify({ name: 'Ship PRs', ask: 'Poll ship/* PRs', once: false }),
  )
  await writeFile(join(dir, 'run'), script.startsWith('#!') ? script : scriptRun(script))
  await chmod(join(dir, 'run'), 0o700)
}
/** Project records only: dream can independently register its built-in event automation. */
async function list(app: NonNullable<typeof server>) {
  const automations = (await app.extensions.invoke(
    'automations',
    'list',
    null,
    new AbortController().signal,
  )) as Automation[]
  return automations.filter((a) => a.scope === 'project')
}

it('discovers a committed project automation by slug only in a chosen project, and starts, stops and DONEs it there', async () => {
  // Not chosen as local: the committed folder is ignored and cannot be addressed.
  const untrusted = await fixture(false)
  await committed(untrusted.root, 'prs', "log('FIRE never')")
  expect(await list(untrusted.app)).toEqual([])
  await expect(call(untrusted.app, 'resume', 'prs')).rejects.toThrow('Unknown automation: prs')
  await untrusted.app.close()
  server = undefined

  const { root, app, folder } = await fixture()
  // It runs in the project checkout and keeps state in the machine-local folder.
  await committed(
    root,
    'prs',
    "writeFileSync(join(state, 'cwd'), process.cwd()); writeFileSync(join(state, 'n'), '1'); log('FIRE 1'); setInterval(() => {}, 1000)",
  )
  const [found] = await list(app)
  expect(found).toMatchObject({
    id: 'prs',
    scope: 'project',
    name: 'Ship PRs',
    enabled: false,
    subscribers: [],
    script: { once: false, state: 'stopped' },
  })
  // Discovery never starts it; its agent conversation exists, idle.
  expect(found.script?.pid).toBeUndefined()
  expect(
    await app.harness.conversation(found.script?.conversationId as ConversationId, context),
  ).toBeDefined()
  expect((await list(app)).map((s) => s.script!.conversationId)).toEqual([
    found.script?.conversationId,
  ])

  const get = async () => (await app.harness.snapshot(Automations, context))!.automations.prs
  const started = (await call(app, 'resume', 'prs')) as Automation
  expect(started).toMatchObject({ enabled: true, script: { state: 'running' } })
  await until(async () => (await get()).fires === 1)
  expect(await readFile(join(folder('prs'), 'state/cwd'), 'utf8')).toBe(root)
  expect(await readFile(join(folder('prs'), 'output.log'), 'utf8')).toContain('FIRE 1')
  await expect(readFile(join(root, '.ultimate/automations/prs/output.log'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
  await call(app, 'pause', 'prs')
  await until(async () => !!(await get()).script!.exitedAt)
  expect(await get()).toMatchObject({ enabled: false, script: { state: 'stopped' } })
  await expect(readFile(join(folder('prs'), 'pid'))).rejects.toMatchObject({ code: 'ENOENT' })

  // An edited run is picked up on the next start, with its state kept; DONE then exit 0 stops it cleanly.
  await committed(
    root,
    'prs',
    "const n = Number(require('node:fs').readFileSync(join(state, 'n'), 'utf8').trim()) + 1; writeFileSync(join(state, 'n'), String(n)); log('FIRE ' + n); log('DONE nothing left')",
  )
  await call(app, 'resume', 'prs')
  await until(async () => (await get()).fires === 2 && (await get()).script!.state === 'stopped')
  expect(await get()).toMatchObject({ enabled: false, script: { exitCode: 0 } })
  expect((await get()).script!.error).toBeUndefined()
  const done = await eventHost(() => app.harness, 'test').eventLog.recent({ events: [Done] })
  expect(done.map((e) => e.data)).toEqual([{ id: 'prs', text: 'nothing left' }])

  // A removed folder forgets the record.
  await rm(join(root, '.ultimate/automations/prs'), { recursive: true })
  expect(await list(app)).toEqual([])
})

it('creates a project automation in the checkout with a committed manifest', async () => {
  const { root, app } = await fixture()
  const caller = await app.harness.createConversation({ ownership: { kind: 'ownerless' } }, context)
  // A create that fails before it has an agent leaves the slug free for the retry.
  await expect(
    app.extensions.invoke(
      'automations',
      'create',
      { ask: 'Poll ship PRs', name: 'Ship PRs', scope: 'project' },
      new AbortController().signal,
      999_999,
    ),
  ).rejects.toThrow('Unknown caller #999999')
  const sub = (await app.extensions.invoke(
    'automations',
    'create',
    {
      ask: 'Poll ship PRs',
      name: 'Ship PRs',
      once: false,
      scope: 'project',
      secrets: ['GH_TOKEN'],
    },
    new AbortController().signal,
    caller.id,
  )) as Automation
  expect(sub).toMatchObject({
    id: 'ship-prs',
    scope: 'project',
    subscribers: [caller.id],
    script: { state: 'writing' },
  })
  expect(
    JSON.parse(
      await readFile(join(root, '.ultimate/automations/ship-prs/automation.json'), 'utf8'),
    ),
  ).toEqual({ name: 'Ship PRs', ask: 'Poll ship PRs', once: false, secrets: ['GH_TOKEN'] })
  // Discovery keeps the created record and its agent.
  const listed = await list(app)
  expect(listed).toMatchObject([
    { id: 'ship-prs', script: { conversationId: sub.script!.conversationId, state: 'writing' } },
  ])
  await expect(
    app.extensions.invoke(
      'automations',
      'create',
      { ask: 'Again', name: 'Ship PRs', scope: 'project' },
      new AbortController().signal,
      caller.id,
    ),
  ).rejects.toThrow('Automation ship-prs already exists')
  // The identical create (as a replay would send it) cannot reset a record that has been used either.
  await expect(
    app.extensions.invoke(
      'automations',
      'create',
      {
        ask: 'Poll ship PRs',
        name: 'Ship PRs',
        once: false,
        scope: 'project',
        secrets: ['GH_TOKEN'],
      },
      new AbortController().signal,
      caller.id,
    ),
  ).rejects.toThrow('Automation ship-prs already exists')
  expect((await list(app))[0]).toMatchObject({
    subscribers: [caller.id],
    script: { state: 'writing' },
  })

  await app.extensions.invoke(
    'automations',
    'update',
    {
      id: sub.id,
      name: 'Updated',
      ask: 'Watch merged PRs',
      once: true,
      secrets: [],
      prompt: 'Summarize',
    },
    new AbortController().signal,
  )
  expect(
    JSON.parse(
      await readFile(join(root, '.ultimate/automations/ship-prs/automation.json'), 'utf8'),
    ),
  ).toEqual({
    name: 'Updated',
    ask: 'Watch merged PRs',
    once: true,
  })
  expect((await list(app)).find((a) => a.id === sub.id)).toMatchObject({
    name: 'Updated',
    prompt: 'Summarize',
    script: { ask: 'Watch merged PRs', once: true },
  })

  // A discovered, unused record with the same manifest is adopted with its agent; inherited object keys are no slugs.
  await committed(root, 'ship-prs-2', 'process.exit(0)')
  const discovered = (await list(app)).find((s) => s.id === 'ship-prs-2')!
  const adopted = (await app.extensions.invoke(
    'automations',
    'create',
    {
      ask: 'Poll ship/* PRs',
      name: 'Ship PRs',
      once: false,
      scope: 'project',
      slug: 'ship-prs-2',
    },
    new AbortController().signal,
    caller.id,
  )) as Automation
  expect(adopted).toMatchObject({
    subscribers: [caller.id],
    script: { conversationId: discovered.script?.conversationId },
  })
  await expect(
    app.extensions.invoke(
      'automations',
      'create',
      { name: 'Watch', ask: 'x', scope: 'project', slug: 'constructor' },
      new AbortController().signal,
      caller.id,
    ),
  ).rejects.toThrow('not be an object key')
})

// A POSIX signal and process group: `trap` a TERM, `exec` into a long-lived process, then `process.kill(-pid)`. Windows
// has no process groups or TERM, so the case cannot run there; the rest of the file is cross-platform through
// `shell.script`.
it.skipIf(process.platform === 'win32')(
  'waits for a SIGTERM-ignoring script to die before stop returns and removes its pid file',
  async () => {
    const { app, folder } = await fixture()
    const sub = await create(app)
    await writeRun(folder(sub.id), "trap '' TERM; echo ready; exec sleep 60")
    const running = (await call(app, 'resume', sub.id)) as Automation
    await until(async () =>
      ((await call(app, 'log', sub.id)) as { text: string }).text.includes('ready'),
    )
    expect(Number(await readFile(join(folder(sub.id), 'pid'), 'utf8'))).toBe(running.script!.pid)
    await call(app, 'pause', sub.id)
    expect(() => process.kill(-running.script!.pid!, 0)).toThrow(
      expect.objectContaining({ code: 'ESRCH' }),
    )
    await expect(readFile(join(folder(sub.id), 'pid'))).rejects.toMatchObject({ code: 'ENOENT' })
  },
)

// A fired one-shot that keeps running is stopped through its POSIX process group (`process.kill(-pid)`, `trap`ped TERM);
// Windows has no process groups, so the case is gated rather than rewritten. The one-shot-stays-done rule it asserts is
// also covered by the exit-metadata and reopen cases, which run on both hosts.
it.each(['pause', 'delete'])(
  'awaits %s of a fired one-shot during its termination grace period',
  async (action) => {
    const { app, folder } = await fixture()
    const sub = await create(app)
    // Ignores the orderly stop and keeps running, so the grace period before a forced kill is what ends it.
    await writeRun(
      folder(sub.id),
      "process.on('SIGTERM', () => {}); log('FIRE done'); setInterval(() => {}, 1000)",
    )
    await call(app, 'resume', sub.id)
    await until(
      async () =>
        (await app.harness.snapshot(Automations, context))!.automations[sub.id].script!.state ===
        'done',
    )
    const pid = Number(await readFile(join(folder(sub.id), 'pid'), 'utf8'))
    expect((await app.harness.snapshot(Automations, context))!.automations[sub.id]).toMatchObject({
      enabled: false,
      script: { state: 'done', pid },
    })
    const running = () => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    expect(running()).toBe(true)
    await call(app, action, sub.id)
    expect(running()).toBe(false)
    await expect(readFile(join(folder(sub.id), 'pid'))).rejects.toMatchObject({ code: 'ENOENT' })
    const saved = (await app.harness.snapshot(Automations, context))!.automations[sub.id]
    // A fired one-shot stays done: pausing its lingering process is not a stop.
    const stopped = expect.objectContaining({
      enabled: false,
      script: expect.objectContaining({ state: 'done', exitedAt: expect.any(Number) }),
    })
    expect(saved).toEqual(action === 'delete' ? undefined : stopped)
    expect(saved?.script?.pid).toBeUndefined()
  },
)

// The handshake is a shell command (`read -r _ || exit 1; exec "$0" "$@"`), and the case asserts POSIX process-group
// behaviour (`process.kill(-pid)`) and `$$`. Windows has neither, so it is gated rather than rewritten: the handshake
// itself is exercised there by every other case through `spawnGroup`.
it.skipIf(process.platform === 'win32').each([false, true])(
  'launch handshake go=%s: EOF aborts; exec keeps the pid and gives the script empty stdin',
  async (go) => {
    const root = await temp('ultimate-automation-handshake-')
    // A shell fixture on purpose: this case tests the handshake itself (`read -r _ || exit 1; exec "$0" "$@"`), which is
    // a POSIX shell command, and asserts `$$` and the process group. It does not go through the product's resolver.
    await mkdir(join(root, 'state'), { recursive: true })
    await writeFile(
      join(root, 'run'),
      '#!/bin/sh\necho "$$"; if read -r value; then echo unexpected-input; else echo eof; fi\n',
    )
    await chmod(join(root, 'run'), 0o700)
    const child = spawn('/bin/sh', ['-c', launchHandshake, join(root, 'run')], {
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output += chunk
    })
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (done, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => done({ code, signal }))
      },
    )
    child.stdin.end(go ? '\n' : undefined)
    expect(await exited).toEqual({ code: go ? 0 : 1, signal: null })
    expect(output).toBe(go ? `${child.pid}\neof\n` : '')
    expect(() => process.kill(-child.pid!, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
  },
)

it('records the exit metadata and event for a successful done one-shot without a failure', async () => {
  const { app, folder } = await fixture()
  const sub = await create(app)
  // Fires DONE and then exits 0 by itself, so the exit metadata is its own and no watchdog stopped it.
  await writeRun(folder(sub.id), "log('FIRE done'); process.exitCode = 0")
  await call(app, 'resume', sub.id)
  await until(
    async () =>
      !!(await app.harness.snapshot(Automations, context))!.automations[sub.id].script!.exitedAt,
  )
  const saved = (await app.harness.snapshot(Automations, context))!.automations[sub.id]
  expect(saved).toMatchObject({ enabled: false, fires: 1, script: { state: 'done', exitCode: 0 } })
  expect(saved.script?.pid).toBeUndefined()
  const events = await eventHost(() => app.harness, 'test').eventLog.recent({ events: [Exited] })
  expect(events.filter((event) => event.data.id === sub.id).map((event) => event.data)).toEqual([
    { id: sub.id, code: 0 },
  ])
  const agent = (await app.harness.conversation(
    sub.script!.conversationId as ConversationId,
    context,
  ))!
  expect(
    (await agent.context(context)).entries.filter((entry) => entry.kind === 'automations.failed'),
  ).toHaveLength(0)
})

it('sweeps a crashed process pid file even when no automation record exists', async () => {
  const { app, folder, options } = await fixture()
  await app.close()
  server = undefined
  // A detached process this test owns, in the host's shell so both platforms have one: it must outlive the sweep.
  const { program, args } = shell.argv('node -e "setInterval(() => {}, 1000)"')
  const child = spawn(program, args, { detached: true, stdio: 'ignore' })
  const exited = new Promise<void>((done) => child.once('close', () => done()))
  // The sweep reads a pid file, which the product writes on both hosts; the temporary Node process stands in for the
  // crashed one. The expectation is per platform: POSIX proves the group is gone, Windows has no process groups.
  const alive = () => {
    try {
      process.kill(child.pid!, 0)
      return true
    } catch {
      return false
    }
  }
  try {
    await mkdir(folder('A999'), { recursive: true })
    await writeFile(join(folder('A999'), 'pid'), `${child.pid}\n`)
    server = await fauxServer(options)
    await exited
    expect(alive()).toBe(false)
    await expect(readFile(join(folder('A999'), 'pid'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    if (alive()) child.kill('SIGKILL')
    await exited
  }
})

it('commits a one-shot as done before termination and never starts it again on reopen', async () => {
  const { app, folder, options } = await fixture()
  const sub = await create(app)
  await writeRun(
    folder(sub.id),
    "appendFileSync(join(state, 'starts'), 'started\\n'); log('FIRE done'); setInterval(() => {}, 1000)",
  )
  await call(app, 'resume', sub.id)
  await until(
    async () =>
      (await app.harness.snapshot(Automations, context))!.automations[sub.id].script!.state ===
      'done',
  )
  expect((await app.harness.snapshot(Automations, context))!.automations[sub.id]).toMatchObject({
    enabled: false,
    fires: 1,
  })
  await app.close()
  server = undefined
  server = await fauxServer(options)
  expect((await server.harness.snapshot(Automations, context))!.automations[sub.id]).toMatchObject({
    enabled: false,
    fires: 1,
    script: { state: 'done' },
  })
  expect(await readFile(join(folder(sub.id), 'state/starts'), 'utf8')).toBe('started\n')
  await expect(readFile(join(folder(sub.id), 'pid'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('closes during a pending start without spawning a process after cleanup', async () => {
  const { app, folder } = await fixture()
  const sub = await create(app)
  await writeRun(
    folder(sub.id),
    "writeFileSync(join(state, 'started'), String(process.pid)); setInterval(() => {}, 1000)",
  )
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  let held = false
  const original = app.harness.snapshot.bind(app.harness) as (
    ...args: unknown[]
  ) => Promise<unknown>
  // Snapshot is overloaded; preserve its API while holding this specific launch before its async file work.
  const snapshot = vi.spyOn(app.harness, 'snapshot').mockImplementation((async (
    ...args: unknown[]
  ) => {
    const result = await original(...args)
    if (
      !held &&
      (args[0] as typeof Automations).definition.kind === Automations.definition.kind &&
      (result as { automations: Record<string, Automation> })?.automations[sub.id]?.script
        ?.state === 'running'
    ) {
      held = true
      entered.resolve()
      await resume.promise
    }
    return result
  }) as typeof app.harness.snapshot)
  try {
    const starting = call(app, 'resume', sub.id).then(
      () => '',
      (error: unknown) => String(error),
    )
    await entered.promise
    // Release invokes the same supervisor close callback synchronously, before full host shutdown awaits it.
    const releasing = app.extensions.released()
    const closing = app.close()
    resume.resolve()
    expect(await starting).toContain('supervisor is closing')
    await releasing
    await closing
    server = undefined
    await expect(readFile(join(folder(sub.id), 'pid'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(folder(sub.id), 'state/started'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  } finally {
    resume.resolve()
    snapshot.mockRestore()
  }
})
