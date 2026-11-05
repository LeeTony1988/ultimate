/**
 * Projects in the browser: the registry rows the title bar's project switcher lists, and the action that opens or
 * starts one. Browser-safe.
 */
import { actionRef } from '../../shared/extension-api.ts'

/** One registered project as the switcher shows it; its home and pid stay on the server. */
export type Project = {
  /** Absolute project root; the switcher's tooltip and the handle `open` takes. */
  root: string
  name: string
  /** The project this browser is in. */
  current: boolean
  /** The live supervisor's URL, only while its pid is alive. */
  running?: { url: string }
  /** When a host last wrote this home's project.json, for newest-first order. */
  openedAt?: number
  /** Root conversations the project's index lists; child conversations are not counted. */
  conversationCount: number
}

/** No arguments → every registered project, newest-opened first. */
export const ListAction = actionRef<null, Project[]>('projects', 'list')
/** `{ root }` → the URL of that project's live host, starting it first when it is not running. */
export const OpenAction = actionRef<{ root: string }, { url: string }>('projects', 'open')
