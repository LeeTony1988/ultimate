/** Who a message is from and to: resolving addresses, naming senders, and a subagent's parent. */
import type { Context } from '@earendil-works/chord'
import { defineDoc, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import type { ConversationId } from '@earendil-works/pi-durable'
import type { ExtensionHost } from '../../server/extensions.ts'
import { Standing, Subagents, SubagentsApi } from '../subagents/api.ts'
import type { Remote } from './refs.ts'

/**
 * Who started a branch through `branch`, so its later final answers reach that conversation. `yielded` is the newest
 * generation observed, so a replayed hook creates no second observer.
 */
export const Started = defineDoc<{ by?: number; yielded?: number }>({
  kind: 'board.started',
  checkpointWhen: () => false,
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  initial: () => ({}),
})
/** The conversation that started branch `id`, which hears its final answers; undefined for anything else. */
export async function starterOf(host: ExtensionHost, id: number | 'user', ctx: Context) {
  if (typeof id !== 'number') return undefined
  return (await host.harness().snapshot(Started, id as ConversationId, ctx))?.by
}
/** The conversation that started `id` as a subagent, which is the only one it may message. */
export async function parentOf(host: ExtensionHost, id: number, ctx: Context) {
  const owner = (await host.harness().commit((tx) => tx.conversation(id as ConversationId), ctx))
    ?.owner?.conversationId
  if (owner === undefined) return undefined
  return (await host.harness().snapshot(Subagents, owner, ctx))?.agents[String(id)]
    ? owner
    : undefined
}
export async function senderName(host: ExtensionHost, id: number | 'user', ctx: Context) {
  if (id === 'user') return 'user'
  if (typeof id !== 'number') return 'another Ultimate'
  const index = await host.harness().snapshot(Standing, ROOT_CONVERSATION_ID, ctx)
  const name = Object.keys(index ?? {}).find((candidate) => index?.[candidate] === id)
  return `#${id}${name ? ` (@${name})` : ''}`
}
export async function resolve(
  host: ExtensionHost,
  to: string,
  from: number | 'user',
  ctx: Context,
) {
  if (to === 'user') return to
  let id: number | undefined
  if (to.startsWith('@')) {
    const service = host.need(SubagentsApi)
    const valid = await service.residents(ctx)
    if (!valid.some((item) => `@${item.name}` === to))
      throw new Error(
        `Unknown address ${to}. Valid standing agents: ${valid.map((item) => `@${item.name}`).join(', ') || '(none)'}`,
      )
    id = await service.standing(to.slice(1), ctx)
  } else if (/^#?\d+$/.test(to)) id = Number(to.replace('#', ''))
  if (id === undefined) throw new Error(`No recipient for ${to}`)
  if (id === from) throw new Error('You cannot message yourself')
  await host.harness().commit(async (tx) => {
    if (!(await tx.conversation(id as ConversationId)))
      throw new Error(`Unknown conversation #${id}`)
    const roots = host.doc('lineage.roots')
    const tally = host.doc('lineage.tally')
    if (roots && tally) {
      const index = (await tx.doc(roots, ROOT_CONVERSATION_ID)) as {
        roots?: number[]
      }
      const state = (await tx.doc(tally, id as ConversationId)) as {
        since?: number
        converting?: unknown
      }
      if (index.roots?.includes(id) && (state.since !== undefined || state.converting))
        throw new Error(`#${id} is a tally and takes no inputs; use note instead`)
    }
  }, ctx)
  return id
}
/** How another project's Ultimate is named, as data.tsx names it in the browser. */
export const remoteLabel = (remote: Pick<Remote, 'project' | 'machine'>) =>
  `@ultimate@${remote.project} on ${remote.machine}`
