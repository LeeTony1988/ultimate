import { LoaderCircleIcon, MoonIcon } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, errorMessage, useConversations, useDialog, useDocOf, useUltimate } from '@/sdk'
import { ConversationRef } from '../conversations/ui.tsx'
import { StandingDoc, talkToUltimate } from '../subagents/ui.tsx'
import { DreamDoc, StartAction } from './refs.ts'
import { passLabels } from './moon.tsx'
import { busyElsewhere, PASSES } from './types.ts'
import type { PassName } from './types.ts'

/** The dialog id the "Dream…" command, the Memory surface's button and the status-line hint open. */
export const dreamDialog = 'dream.start'

const passWhat: Record<PassName, string> = {
  memory: 'what is outdated, duplicated or never written down',
  failures: 'what broke often, and why',
  tools: 'which tools fail, crawl or go unused',
  corrections: 'what you told me twice, and what I wish I could do',
  codify: 'memories that should become how I work',
  project: 'what I keep doing by hand here, and what to build for it',
}

/** What pressing Dream does, what keeps it from starting now, and the button that starts it. */
export function DreamDialog() {
  const [open, setOpen] = useDialog(dreamDialog)
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {/* One column that may shrink: an implicit `auto` grid column would grow to a long blocker title's width. */}
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto p-0 sm:max-w-[30rem]"
        data-dream-dialog
      >
        {open && <Body onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** What keeps a dream from starting, live: conversations at work besides @ultimate, or a session still open. */
type Preflight = { busy: { id: number; title: string }[]; active?: number }

function usePreflight(): Preflight | undefined {
  const conversations = useConversations()
  const standing = useDocOf(1, StandingDoc)
  const sessions = useDocOf(1, DreamDoc)
  if (standing === undefined || sessions === undefined) return undefined
  const active = sessions?.sessions.find((item) => item.endedAt === undefined)?.id
  return {
    busy: busyElsewhere(conversations, standing?.ultimate),
    ...(active === undefined ? {} : { active }),
  }
}

function Body({ onClose }: { onClose: () => void }) {
  const state = usePreflight()
  const actions = useUltimate()
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string>()
  const start = async () => {
    setStarting(true)
    setFailure(undefined)
    try {
      await api.action(StartAction, null)
      onClose()
      await talkToUltimate(actions)
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setStarting(false)
    }
  }
  const blocked = !!state && (state.busy.length > 0 || state.active !== undefined)
  return (
    <>
      <div className="space-y-4 px-6 pt-6 pb-5">
        <div className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MoonIcon className="size-4 text-brand" />
            Dream
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
            People make sense of the day while they sleep: what mattered settles, what didn't fades.
            A dream is that for me. I read back over our conversations, memory, failures and tools,
            and wake up with a journal of what I learned and a few changes I'd like to make.
          </DialogDescription>
        </div>
        <section className="space-y-1.5">
          <h3 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            Six passes
          </h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px] leading-5">
            {PASSES.map((pass) => (
              <Fragment key={pass}>
                <dt className="text-foreground">{passLabels[pass]}</dt>
                <dd className="text-muted-foreground">{passWhat[pass]}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          First I write a handoff while I still remember everything; the dream reads it first. The
          journal lands in @ultimate's conversation, and we go through its proposals together. Each
          one you approve becomes an ordinary branch that is reviewed and lands as usual.{' '}
          <span className="text-foreground">Nothing changes code or memory by itself.</span>
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[12px]">
          <dt className="text-muted-foreground">Takes</dt>
          <dd>about 30–60 minutes</dd>
          <dt className="text-muted-foreground">Costs</dt>
          <dd>real model tokens, roughly 1–3M</dd>
          <dt className="text-muted-foreground">Runs in</dt>
          <dd>
            this database{' '}
            <span className="text-muted-foreground">
              — starting a fresh chapter comes later, by your hand
            </span>
          </dd>
        </dl>
      </div>
      <footer className="space-y-3 border-t border-border/60 bg-muted/30 px-6 py-4">
        {state && <Blockers state={state} />}
        {failure && <p className="text-[12px] text-error">{failure}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose} size="sm" variant="ghost">
            {blocked ? 'Close' : 'Not now'}
          </Button>
          <Button
            data-dream-start
            disabled={!state || blocked || starting}
            onClick={() => void start()}
            size="sm"
          >
            {(!state || starting) && <LoaderCircleIcon className="motion-safe:animate-spin" />}
            Start dreaming
          </Button>
        </div>
      </footer>
    </>
  )
}

/** Why a dream cannot start now: an open session, or conversations still at work. */
function Blockers({ state }: { state: Preflight }) {
  const actions = useUltimate()
  const go = (id: number) => {
    actions.close(dreamDialog)
    actions.switchConversation(id)
    actions.showSurface('agent')
  }
  if (state.active !== undefined)
    return (
      <p className="text-[12px] leading-relaxed text-muted-foreground" data-dream-blocked="active">
        <span className="text-foreground">Dream session {state.active} is still open.</span> Settle
        or end it from its card in @ultimate's conversation before dreaming again.
      </p>
    )
  if (!state.busy.length) return null
  return (
    <div className="space-y-1.5" data-dream-blocked="busy">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        <span className="text-foreground">Wait for these to finish first</span> — a dream reads
        finished work, not work in progress.
      </p>
      <ul className="space-y-0.5 font-mono text-[11px]">
        {state.busy.map((item) => (
          <li key={item.id}>
            <button
              className="flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 -mx-1 hover:bg-accent"
              onClick={() => go(item.id)}
              type="button"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-brand motion-safe:animate-pulse-dot" />
              <ConversationRef id={item.id} title={item.title} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
