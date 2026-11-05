import type { ServerEvents } from '../../shared/protocol.ts'
import type { EventSourceLike } from '../../web/src/sdk/store.ts'

let streams = 0
export class FakeSource extends EventTarget implements EventSourceLike {
  readyState = 0
  closed = false
  readonly url: string
  /** The id of the stream the server opened, as its `stream` event told the store. */
  id?: string
  constructor(url: string) {
    super()
    this.url = url
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
  /** The server answered: a new stream (also after a drop), which sends its id first. */
  open() {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
    this.id = `stream-${++streams}`
    this.send('stream', { id: this.id })
  }
  /** A dropped connection the browser retries (`closed: false`), or one the server refused. */
  drop(closed = false) {
    this.readyState = closed ? 2 : 0
    this.dispatchEvent(new Event('error'))
  }
  /** An event of the stream, or with `sub` one of its subscriptions, which carries the id on its first data line. */
  send<K extends keyof ServerEvents>(name: K, data: ServerEvents[K], sub?: number) {
    const json = JSON.stringify(data)
    this.dispatchEvent(
      new MessageEvent(name, { data: sub === undefined ? json : `${sub}\n${json}` }),
    )
  }
}

/** A subscription the store opened, as the server keeps it. */
export interface FakeSubscription {
  stream: string
  sub: number
  conversation?: number
  docs: string[]
  view: boolean
  /** Closed by the store, or with its stream. */
  readonly closed: boolean
  send<K extends 'view' | 'ops' | 'doc' | 'docOps'>(name: K, data: ServerEvents[K]): void
}

/**
 * The server's side of `POST`/`DELETE /api/events/<stream>/<sub>` for a fake `fetch`: `handle` answers those requests
 * and returns undefined for any other, `refuse` makes it answer a conversation's subscriptions with a status.
 */
export function fakeSubscriptions(sources: FakeSource[]) {
  const subscriptions: FakeSubscription[] = []
  const deleted = new Set<string>()
  const refusals = new Map<number | undefined, number>()
  return {
    subscriptions,
    /** The newest open subscription of a conversation (undefined: the server's root). */
    of: (conversation?: number) =>
      subscriptions.findLast((item) => !item.closed && item.conversation === conversation),
    refuse(conversation: number | undefined, status: number | undefined) {
      if (status === undefined) refusals.delete(conversation)
      else refusals.set(conversation, status)
    },
    handle(path: string, init?: RequestInit) {
      const match = /^\/api\/events\/([^/]+)\/(\d+)$/.exec(path)
      if (!match) return undefined
      const [, stream, id] = match
      const sub = Number(id)
      if (init?.method === 'DELETE') {
        deleted.add(`${stream}/${sub}`)
        return Response.json({ ok: true })
      }
      const spec = JSON.parse(init?.body as string) as Pick<
        FakeSubscription,
        'conversation' | 'docs' | 'view'
      >
      const status = refusals.get(spec.conversation)
      if (status) return Response.json({ error: 'Refused' }, { status })
      const source = sources.find((item) => item.id === stream)!
      subscriptions.push({
        stream,
        sub,
        ...spec,
        get closed() {
          return deleted.has(`${stream}/${sub}`) || source.closed || source.id !== stream
        },
        send: (name, data) => source.send(name, data, sub),
      })
      return Response.json({ ok: true })
    },
  }
}
