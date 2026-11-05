import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { defineExtension } from '@earendil-works/pi-durable'
import { implementAction } from '../../lib/actions.ts'
import type { ExtensionAction } from '../../server/actions.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import type { ProjectInfo } from '../../server/project.ts'
import { ListAction, OpenAction } from './refs.ts'
import type { Project } from './refs.ts'

/** The switcher's order and shape: newest-opened first, the current one marked, and no home or pid on the wire. */
export function projectRows(projects: ProjectInfo[]): Project[] {
  return projects
    .flatMap((project) =>
      project.root
        ? [
            {
              root: project.root,
              name: project.name,
              current: project.current,
              ...(project.running ? { running: { url: project.running.url } } : {}),
              ...(project.openedAt === undefined ? {} : { openedAt: project.openedAt }),
              conversationCount: project.conversations.length,
            },
          ]
        : [],
    )
    .toSorted((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0) || a.name.localeCompare(b.name))
}

/** The variables a start must not inherit from the host that asks for it. */
const INHERITED = [
  'ULTIMATE_HOME',
  'ULTIMATE_USER_HOME',
  'ULTIMATE_PORT',
  'ULTIMATE_PROJECT',
  'ULTIMATE_SUPERVISED',
  'ULTIMATE_GENERATION',
  'ULTIMATE_PUBLIC_URL',
  'ULTIMATE_PREVIOUS_BUILD',
  'ULTIMATE_INSTANCE_OWNER',
  'ULTIMATE_MODEL',
  'ULTIMATE_PREVIEW_BRANCH',
]

/**
 * A fresh launcher environment: the target's home and user home, never the asking host's identity or port. A core
 * inherits its own `ULTIMATE_HOME`, so starting another project without this would race the current project's home.
 */
export function spawnEnv(
  parent: NodeJS.ProcessEnv,
  home: string,
  userHome: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...parent }
  for (const name of INHERITED) delete env[name]
  env.ULTIMATE_HOME = home
  env.ULTIMATE_USER_HOME = userHome
  env.ULTIMATE_NO_OPEN = '1'
  return env
}

export const START_TIMEOUT = 30_000

interface StartOptions {
  ultimateRoot: string
  userHome: string
  signal?: AbortSignal
  /** The registry, as `host.projects()` reads it: only a live pid with a bound port counts as running. */
  projects: () => Promise<ProjectInfo[]>
}

/** Whether a freshly started host answers its API yet; its proxy listens before its core is ready. */
async function answers(url: string, signal?: AbortSignal) {
  try {
    const response = await fetch(`${url}/api/models`, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(1000)])
        : AbortSignal.timeout(1000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Start `project` with this checkout's launcher and wait, boundedly, until its supervisor owns the home's lock and its
 * API answers. The supervisor advertises the port it actually bound in `ultimate.lock`; no port is chosen here, so a
 * running 4747 moves the new host to the next free one. The child is detached and outlives this request.
 */
export async function startProject(
  project: { root: string; home: string },
  { ultimateRoot, userHome, signal, projects }: StartOptions,
): Promise<{ url: string }> {
  const child = spawn(
    process.execPath,
    [join(ultimateRoot, 'bin/ultimate.ts'), project.root, '--no-open'],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: spawnEnv(process.env, project.home, userHome),
    },
  )
  child.unref()
  const pid = child.pid
  if (pid === undefined) throw new Error(`Could not start ${project.root}`)
  const state = async () => (await projects()).find((item) => item.home === project.home)?.running
  const deadline = Date.now() + START_TIMEOUT
  let exited = false
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    const running = await state()
    // Only our own pid: the lock names the requested port before the proxy has moved off an occupied one.
    if (running?.pid === pid && (await answers(running.url, signal))) return { url: running.url }
    if (child.exitCode !== null || child.signalCode !== null) {
      exited = true
      break
    }
    await pause(250)
  }
  // Our child may have lost the home's lock to another host that is already serving it; that is success.
  const running = await state()
  if (running && (exited || running.pid !== pid)) return { url: running.url }
  throw new Error(
    `${project.root} ${exited ? 'exited while starting' : `did not start within ${START_TIMEOUT / 1000} s`}. Run \`ultimate ${project.root}\` in a terminal to see why.`,
  )
}

/** One in-flight start per home: a double click or a second tab joins the start already running. */
const starting = new Map<string, Promise<{ url: string }>>()

type Start = (
  project: { root: string; home: string },
  options: StartOptions,
) => Promise<{ url: string }>

/**
 * The URL `root` serves, starting its host when it is not running. The current project is never started: its origin is
 * the one asking. `root` must name a registered project; anything else is refused before a process is spawned.
 */
export async function openProject(
  host: Pick<ExtensionHost, 'projects' | 'system' | 'ultimateRoot' | 'userHome'>,
  root: unknown,
  start: Start = startProject,
  signal?: AbortSignal,
): Promise<{ url: string }> {
  if (typeof root !== 'string' || !root) throw new Error('open needs a project root')
  const project = (await host.projects()).find((item) => item.root === root)
  if (!project?.root) throw new Error(`Unknown project: ${root}`)
  if (project.current) return { url: host.system().process.url }
  if (project.running) return { url: project.running.url }
  const pending = starting.get(project.home)
  if (pending) return pending
  const started = start(
    { root: project.root, home: project.home },
    {
      ultimateRoot: host.ultimateRoot,
      userHome: host.userHome,
      signal,
      projects: () => host.projects(),
    },
  ).finally(() => starting.delete(project.home))
  starting.set(project.home, started)
  return started
}

export const userActions = ['open']

export const actions: Record<string, ExtensionAction> = {
  list: implementAction(ListAction, async (_args, { host }) => projectRows(await host.projects())),
  open: implementAction(OpenAction, async (args, { host, signal }) => {
    const input = args as { root?: unknown } | null
    return openProject(host, input?.root, startProject, signal)
  }),
}

export default defineExtension({ name: 'projects' })
