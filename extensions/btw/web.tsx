import { MessagesSquareIcon, PlusIcon, SquareArrowOutUpRightIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn, defineWebExtension, useConversation, useDocOf, useUiState, useUltimate } from '@/sdk'
import { ComposerModeKey, composerModeOf } from '../../lib/composer-mode.ts'
import { SideChatsDoc, useSideChatFront } from '../side-chat/ui.tsx'
import { StandingDoc } from '../subagents/ui.tsx'
import { ActiveState, addSite, siteOf, sitesOf, SitesState, DEFAULT_SITES } from './logic.ts'
import type { BtwSite } from './refs.ts'

const input =
  'h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 font-mono text-[11px] outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

/**
 * Opens a site in the user's real browser, in one named window per site. The browser keeps the name, so pressing a
 * tab again focuses that site instead of adding another window. `noopener` cannot be used in the feature string:
 * Chrome treats a named target with `noopener` as `_blank` and returns null, which would pile up windows; severing
 * `opener` afterwards gives the same isolation and keeps the name reusable.
 */
function openSite(site: BtwSite) {
  const opened = window.open(site.url, `btw-${site.id}`, 'width=460,height=760')
  if (!opened) return
  try {
    opened.opener = null
  } catch {
    // A cross-origin WindowProxy may refuse the write; the window is still a separate named browsing context.
  }
}

/** The launcher card: site tabs, the active site's name and URL, Open, and add/remove. */
function BtwPanel() {
  const [storedSites, setSites] = useUiState<BtwSite[]>(SitesState, [...DEFAULT_SITES])
  const [storedActive, setActive] = useUiState<string>(ActiveState, DEFAULT_SITES[0].id)
  const sites = useMemo(() => sitesOf(storedSites), [storedSites])
  const site = siteOf(sites, storedActive)
  const [adding, setAdding] = useState(false)

  // A removed tab leaves the next one active; a first visit repairs an old or missing id.
  useEffect(() => {
    if (sites.length === 0 || sites.some((item) => item.id === storedActive)) return
    setActive(sites[0].id)
  }, [sites, storedActive, setActive])

  const add = (name: string, url: string) => {
    const next = addSite(sites, { name, url }, `site-${crypto.randomUUID()}`)
    if (!next) return false
    setSites(next)
    setActive(next[next.length - 1].id)
    setAdding(false)
    return true
  }

  const remove = (id: string) => {
    const next = sites.filter((item) => item.id !== id)
    setSites(next)
    if (site?.id === id) setActive(next[0]?.id ?? '')
  }

  return (
    <section
      aria-label="btw web assistants"
      className="pointer-events-auto flex w-[400px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-border/80 bg-popover shadow-lg"
      data-btw-panel
    >
      <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/70 px-2 font-mono text-[11px] text-muted-foreground">
        <MessagesSquareIcon className="size-3.5 shrink-0" />
        <span className="shrink-0 text-foreground">btw</span>
        <span className="truncate text-muted-foreground/70">· web assistants</span>
        <span className="ml-auto shrink-0 text-[10.5px]">opens in a new window</span>
      </header>

      <div
        aria-label="Web assistants"
        className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1.5"
        role="tablist"
      >
        {sites.map((item) => (
          <button
            aria-selected={item.id === site?.id}
            className={cn(
              'max-w-32 cursor-pointer truncate rounded-md px-2 py-1 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring',
              item.id === site?.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
            key={item.id}
            onClick={() => {
              setActive(item.id)
              openSite(item)
            }}
            role="tab"
            title={`Open ${item.name} in a new window`}
            type="button"
          >
            {item.name}
          </button>
        ))}
        <button
          aria-expanded={adding}
          aria-label="Add a site"
          className="ml-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => setAdding(!adding)}
          title="Add a site"
          type="button"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      {site ? (
        <div className="px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{site.name}</div>
              <div
                className="truncate font-mono text-[11px] text-muted-foreground"
                title={site.url}
              >
                {site.url}
              </div>
            </div>
            <button
              aria-label={`Remove ${site.name}`}
              className="shrink-0 cursor-pointer rounded-sm p-0.5 text-muted-foreground/70 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => remove(site.id)}
              title="Remove this site"
              type="button"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Button onClick={() => openSite(site)} size="sm">
              <SquareArrowOutUpRightIcon />
              Open
            </Button>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              opens in a new window
            </span>
          </div>
        </div>
      ) : (
        <p className="px-3 py-3 font-sans text-[12px] text-muted-foreground">
          No sites yet. Add one with the + button.
        </p>
      )}

      {adding && <AddSite onAdd={add} onCancel={() => setAdding(false)} />}
    </section>
  )
}

/** A name and URL beside the tabs; the name is optional, the URL must be http(s). */
function AddSite({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, url: string) => boolean
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string>()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (!onAdd(name, url)) setError('Enter an http(s) URL')
  }
  return (
    <form className="border-t border-border/60 px-3 py-2" onSubmit={submit}>
      <div className="flex items-center gap-1.5">
        <input
          aria-label="Site name"
          autoComplete="off"
          className={cn(input, 'w-24 shrink-0')}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          value={name}
        />
        <input
          aria-label="Site URL"
          autoComplete="off"
          className={input}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          value={url}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Button size="xs" type="submit">
          Add
        </Button>
        <Button onClick={onCancel} size="xs" type="button" variant="ghost">
          Cancel
        </Button>
        {error && (
          <span className="min-w-0 truncate font-mono text-[10.5px] text-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  )
}

/** Where the panel floats: just above the mode switch over the conversation's prompt. */
function useAnchor(conversationId: number | undefined) {
  const [anchor, setAnchor] = useState<{ right: number; bottom: number }>()
  useEffect(() => {
    let form: HTMLFormElement | null | undefined
    let modes: HTMLElement | null | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    const measure = () => {
      if (!form?.isConnected || !modes?.isConnected) return
      const f = form.getBoundingClientRect()
      const m = modes.getBoundingClientRect()
      setAnchor({ right: innerWidth - f.right, bottom: innerHeight - m.top + 6 })
    }
    const observer = new ResizeObserver(measure)
    const attach = () => {
      const container = document.querySelector('[data-composer-target="conversation"]')
      form = container?.querySelector('form')
      modes = document.querySelector('[data-ui="side-chat-switch"]')
      if (!container?.parentElement || !form || !modes) {
        setAnchor(undefined)
        retry = setTimeout(attach, 250)
        return
      }
      observer.observe(container.parentElement)
      observer.observe(form)
      observer.observe(modes)
      measure()
    }
    attach()
    addEventListener('resize', measure)
    return () => {
      clearTimeout(retry)
      observer.disconnect()
      removeEventListener('resize', measure)
    }
  }, [conversationId])
  return anchor
}

/** Shows the launcher above the composer while the shared composer mode is btw. */
function BtwOverlay() {
  const id = useConversation((conversation) => conversation.id)
  const main = useDocOf(1, StandingDoc)?.ultimate
  const { surface } = useUltimate()
  const [storedMode] = useUiState<string>(ComposerModeKey, 'normal')
  const [front] = useSideChatFront()
  const sides = useDocOf(main, SideChatsDoc)?.sides
  const sideInFront = sides?.some((side) => side.id === front && side.ended === undefined)
  const anchor = useAnchor(id)
  // btw adds a panel and leaves the composer alone: Enter still sends to @ultimate, unlike side chat.
  if (
    surface !== 'agent' ||
    id === undefined ||
    id !== main ||
    sideInFront ||
    composerModeOf(storedMode) !== 'btw' ||
    !anchor
  )
    return null
  return (
    <div
      className="pointer-events-none fixed z-30 flex max-w-[calc(100vw-1.5rem)] flex-col items-end"
      style={anchor}
    >
      <BtwPanel />
    </div>
  )
}

export default defineWebExtension({ slots: { 'conversation.overlay': BtwOverlay } })
