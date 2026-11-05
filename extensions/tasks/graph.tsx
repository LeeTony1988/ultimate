/** The Task DAG surface: the live pi-durable task graph as layered columns, with finished work fading behind it. */
import { ChevronRightIcon, MessageSquareIcon, NetworkIcon, TimerIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ToolStatusIcon } from '@/components/ai/tool'
import {
  api,
  cn,
  Conversation,
  Dock,
  formatAgo,
  formatDuration,
  Header,
  StatusLine,
  useDocOf,
  useExtensionUiState,
  useNow,
  useTasks,
  useUltimate,
  useUiState,
} from '@/sdk'
import type { TaskGraph, TaskGraphNode } from '@/sdk'
import {
  useWorkspaceConversations as useConversations,
  useWorkspaceIndex,
} from '../workspaces/ui.tsx'
import { Address, MessagesDoc } from '../messages/ui.tsx'
import { meaning } from './kinds.ts'
import type { Meaning } from './kinds.ts'
import { EndedAction, DescribeAction, StartedAction } from './refs.ts'
import type { TaskEnd, TaskFacts } from './refs.ts'
import { build, status, useOnce } from './shared.tsx'
import { BAND_HEADER, layout } from './layout.ts'

type Finished = { task: TaskGraphNode; at: number; outcome?: TaskEnd['outcome'] }

/** The last 30 tasks that left the live graph, kept for 30 s. Their outcome is read from the durable record. */
function useFinished(graph: TaskGraph | undefined) {
  const [finished, setFinished] = useState<Finished[]>([])
  const previous = useRef<Map<number, TaskGraphNode>>(new Map())
  const asked = useRef(new Set<number>())
  useEffect(() => {
    const next = new Map(Object.values(graph?.tasks ?? {}).map((task) => [task.id, task]))
    const gone = [...previous.current.values()].filter((task) => !next.has(task.id))
    previous.current = next
    if (!gone.length) return
    setFinished((current) =>
      [
        ...current,
        ...gone.map((task) => ({
          task,
          at: Date.now(),
          ...(task.state.status === 'completing' ? { outcome: task.state.outcome } : {}),
        })),
      ].slice(-30),
    )
  }, [graph])
  useEffect(() => {
    const missing = finished
      .filter((item) => item.outcome === undefined && !asked.current.has(item.task.id))
      .map((item) => item.task.id)
    if (!missing.length) return
    for (const id of missing) asked.current.add(id)
    void api.action(EndedAction, { ids: missing }).then(
      (result) => {
        setFinished((current) =>
          current.map((item) => {
            const end = result[item.task.id]
            return end && item.outcome === undefined
              ? { ...item, outcome: end.outcome, at: end.endedAt ?? item.at }
              : item
          }),
        )
      },
      () => {},
    )
  }, [finished])
  useEffect(() => {
    const timer = setInterval(
      () => setFinished((current) => current.filter((item) => Date.now() - item.at < 30_000)),
      1000,
    )
    return () => clearInterval(timer)
  }, [])
  return finished
}

function tone(outcome: TaskEnd['outcome'] | undefined) {
  if (outcome === 'failed' || outcome === 'faulted' || outcome === 'orphaned') return 'text-error'
  if (outcome === 'aborted') return 'text-warning'
  if (outcome === 'completed') return 'text-success'
  return 'text-muted-foreground/70'
}

function outcomeName(outcome: TaskEnd['outcome'] | undefined) {
  switch (outcome) {
    case 'completed':
      return 'done'
    case 'failed':
    case 'faulted':
    case 'orphaned':
      return 'failed'
    case 'aborted':
      return 'aborted'
    default:
      return 'finished'
  }
}

function rawTitle(task: TaskGraphNode) {
  return [
    `${task.kind} #${task.id}`,
    'phase' in task.state ? `phase ${task.state.phase}` : undefined,
    task.state.status,
    task.state.status === 'waiting'
      ? `waiting on ${task.state.on.map((id) => `#${id}`).join(' ')}`
      : undefined,
    task.background ? 'background' : undefined,
    `owned by #${task.owner ?? task.conversationId}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function Who({ who }: { who: Meaning['who'] }) {
  if (who === undefined) return null
  return (
    <span className="min-w-0 max-w-[88px] truncate font-sans text-[11px] text-foreground/85">
      <Address id={who} />
    </span>
  )
}

function Node({
  task,
  named,
  started,
  now,
  x,
  y,
  folded,
  collapsed,
  onFold,
  onOpen,
}: {
  task: TaskGraphNode
  named: Meaning | undefined
  started: number | undefined
  now: number
  x: number
  y: number
  folded: number
  collapsed: boolean
  onFold?: () => void
  onOpen: () => void
}) {
  const info = status(task)
  const waiting = task.state.status === 'waiting'
  const running = task.state.status === 'running' && !task.blocked
  return (
    <div
      className={cn(
        'group absolute flex h-[38px] w-[192px] items-center gap-1.5 overflow-hidden rounded-md border px-2 font-mono text-[11px] transition-colors',
        running
          ? 'border-brand/45 bg-brand/5'
          : task.blocked
            ? 'border-warning/50 bg-warning/5'
            : waiting
              ? 'border-border/80 bg-card/45'
              : 'border-border/70 bg-card/35',
      )}
      style={{ left: x, top: y }}
      title={rawTitle(task)}
    >
      <ToolStatusIcon className="size-3" state={info.icon} />
      <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={onOpen} type="button">
        <span className="flex min-w-0 items-center gap-1 overflow-hidden text-foreground/90">
          <span className="shrink-0 truncate">{named?.text ?? task.kind}</span>
          <Who who={named?.who} />
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground/65">
          <span className={cn('truncate', info.tone)}>
            {waiting
              ? `waiting · ${task.state.phase}`
              : task.state.status === 'running'
                ? `running · ${task.state.phase}`
                : task.state.status === 'pending'
                  ? `pending · ${task.state.phase}`
                  : task.state.status === 'sleeping'
                    ? `sleeping · ${task.state.phase}`
                    : info.text}
          </span>
          {named?.detail && !waiting && <span className="truncate">· {named.detail}</span>}
        </span>
      </button>
      {started !== undefined && (
        <span
          className={cn(
            'shrink-0 text-[9.5px] tabular-nums',
            now - started >= 10 * 60_000 ? 'text-warning' : 'text-muted-foreground/60',
          )}
          title={`Running since ${new Date(started).toLocaleString()}`}
        >
          {formatDuration(now - started)}
        </span>
      )}
      {folded > 0 && (
        <button
          aria-label={`${collapsed ? 'Show' : 'Hide'} ${folded} tasks below`}
          className="flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm p-0.5 text-[9.5px] text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onFold?.()
          }}
          title={`${folded} below · ${collapsed ? 'show' : 'hide'}`}
          type="button"
        >
          <ChevronRightIcon
            className={cn('size-2.5 transition-transform', !collapsed && 'rotate-90')}
          />
          {folded}
        </button>
      )}
    </div>
  )
}

function FinishedCard({
  item,
  named,
  now,
}: {
  item: Finished
  named: Meaning | undefined
  now: number
}) {
  const state: 'done' | 'error' | 'interrupted' =
    item.outcome === 'failed' || item.outcome === 'faulted' || item.outcome === 'orphaned'
      ? 'error'
      : item.outcome === 'aborted'
        ? 'interrupted'
        : 'done'
  return (
    <div
      className="flex h-[38px] w-[192px] items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-card/20 px-2 font-mono text-[11px] opacity-60"
      data-finished-task={item.task.id}
      title={`${item.task.kind} #${item.task.id} · ${outcomeName(item.outcome)}`}
    >
      <ToolStatusIcon className="size-3" state={state} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1 text-foreground/75">
          <span className="truncate">{named?.text ?? item.task.kind}</span>
          <Who who={named?.who} />
        </span>
        <span className={cn('flex items-center gap-1 text-[10px]', tone(item.outcome))}>
          <span>{outcomeName(item.outcome)}</span>
          <span className="text-muted-foreground/55">
            · {formatAgo(item.at, now, { ago: true })}
          </span>
        </span>
      </span>
    </div>
  )
}

function TaskGraphSurface() {
  const graph = useTasks()
  const conversations = useConversations()
  const [concluded] = useUiState<number[]>('ext.conversations.concluded', [])
  const { tasks, summaries } = build(graph, conversations, concluded)
  const [showBackground, setShowBackground] = useExtensionUiState<boolean>('dag.background', false)
  const [foldedIds, setFoldedIds] = useExtensionUiState<string[]>('dag.folded', [])
  const log = useDocOf(1, MessagesDoc)
  const { queue } = useWorkspaceIndex()
  const ids = tasks.map((task) => task.id)
  const started = useOnce(StartedAction, ids)
  const facts = useOnce<TaskFacts>(DescribeAction, ids)
  const finished = useFinished(graph)
  const now = useNow(1000, tasks.length > 0 || finished.length > 0)
  const { switchConversation } = useUltimate()
  const states = new Map(log?.messages.map((message) => [message.id, message.state]))
  const landing = (fact: TaskFacts | undefined) => {
    const item = queue.find((entry) => entry.source === fact?.source && entry.state === 'landing')
    return item ? { ...fact, conversation: item.conversationId } : fact
  }
  const meanings = new Map(
    tasks.map((task) => {
      const fact = task.kind === 'workspaces.lander' ? landing(facts[task.id]) : facts[task.id]
      return [task.id, meaning(task, fact, fact?.message && states.get(fact.message.id))]
    }),
  )
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const folded = new Set(foldedIds.map(Number))
  const hidden = new Set<number>()
  for (const task of tasks) {
    let owner = task.owner
    while (owner !== undefined) {
      if (hidden.has(owner) || folded.has(owner)) {
        hidden.add(task.id)
        break
      }
      owner = byId.get(owner)?.owner
    }
  }
  const descendants = new Map<number, number>()
  const count = (id: number, seen = new Set<number>()): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    if (descendants.has(id)) return descendants.get(id)!
    let total = 0
    for (const task of tasks) {
      if (task.owner !== id) continue
      total += 1 + count(task.id, new Set(seen))
    }
    descendants.set(id, total)
    return total
  }
  for (const task of tasks) count(task.id)
  const visible = tasks.filter(
    (task) => !hidden.has(task.id) && (showBackground || !task.background),
  )
  const drawing = layout(visible, started)
  const background = tasks.filter((task) => task.background)
  const busy = visible.filter((task) => task.state.status === 'running' && !task.blocked).length
  const shownFinished = finished.filter((item) => now - item.at < 30_000).toReversed()
  const finishedMeanings = new Map(
    shownFinished.map((item) => {
      const fact =
        item.task.kind === 'workspaces.lander' ? landing(facts[item.task.id]) : facts[item.task.id]
      return [item.task.id, meaning(item.task, fact, fact?.message && states.get(fact.message.id))]
    }),
  )
  const toggleFold = (id: number) => {
    const key = String(id)
    setFoldedIds(
      foldedIds.includes(key) ? foldedIds.filter((value) => value !== key) : [...foldedIds, key],
    )
  }
  return (
    <>
      <Header>
        <span className="flex shrink-0 items-center gap-2 text-[13px] font-medium">
          <NetworkIcon className="size-4 text-muted-foreground" />
          Task DAG
        </span>
        <span className="ml-2 shrink-0 font-mono text-[10.5px] text-muted-foreground">
          {visible.length} live{busy > 0 && ` · ${busy} running`}
          {visible.length < tasks.length && ` · ${tasks.length - visible.length} hidden`}
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground/65">
          <span className="flex items-center gap-1">
            <span className="h-px w-4 bg-muted-foreground/45" /> owns
          </span>
          <span className="flex items-center gap-1">
            <span className="h-px w-4 border-t border-dashed border-brand/60" /> runs before
          </span>
        </span>
      </Header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 font-mono text-[10.5px] text-muted-foreground">
            <span className="section-label">Execution</span>
            {background.length > 0 && (
              <button
                aria-pressed={showBackground}
                className={cn(
                  'h-6 cursor-pointer rounded-md px-2 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  showBackground ? 'bg-accent text-foreground' : 'hover:text-foreground',
                )}
                onClick={() => setShowBackground(!showBackground)}
                type="button"
              >
                {showBackground ? 'Hide' : 'Show'} background ({background.length})
              </button>
            )}
            <span className="ml-auto text-muted-foreground/60">
              {drawing.columns} columns · {visible.length} in view
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto" data-task-dag-surface>
            <div className="mx-auto px-4 py-3" style={{ width: Math.max(drawing.width + 32, 720) }}>
              {tasks.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-2 font-mono text-[11.5px] text-muted-foreground/70">
                  <NetworkIcon className="size-5 text-muted-foreground/50" />
                  idle · no live tasks
                  <span className="text-[10px] text-muted-foreground/50">
                    a task appears here the moment it runs
                  </span>
                </div>
              ) : visible.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-2 font-mono text-[11.5px] text-muted-foreground/70">
                  <NetworkIcon className="size-5 text-muted-foreground/50" />
                  {tasks.length} background {tasks.length === 1 ? 'task' : 'tasks'} hidden
                  <button
                    className="cursor-pointer rounded-md border border-border/70 px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setShowBackground(true)}
                    type="button"
                  >
                    Show background
                  </button>
                </div>
              ) : (
                <div className="relative" style={{ width: drawing.width, height: drawing.height }}>
                  {drawing.bands.map((band) => {
                    const summary = summaries.get(band.conversation)
                    return (
                      <div
                        className="absolute flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground"
                        key={band.conversation}
                        style={{ top: band.y, height: BAND_HEADER }}
                      >
                        <MessageSquareIcon className="size-3 shrink-0 text-muted-foreground/60" />
                        <span className="max-w-[280px] truncate font-sans text-[11px] text-foreground/75">
                          {band.conversation === 1
                            ? 'Project'
                            : summary?.title || summary?.label || 'Untitled conversation'}
                        </span>
                        <span className="text-muted-foreground/55">#{band.conversation}</span>
                      </div>
                    )
                  })}
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-visible"
                    height={drawing.height}
                    width={drawing.width}
                  >
                    <defs>
                      <marker
                        id="dag-arrow-owner"
                        markerHeight="6"
                        markerWidth="6"
                        orient="auto"
                        refX="5"
                        refY="3"
                      >
                        <path className="fill-muted-foreground/40" d="M0,0 L6,3 L0,6 z" />
                      </marker>
                      <marker
                        id="dag-arrow-wait"
                        markerHeight="6"
                        markerWidth="6"
                        orient="auto"
                        refX="5"
                        refY="3"
                      >
                        <path className="fill-brand/60" d="M0,0 L6,3 L0,6 z" />
                      </marker>
                    </defs>
                    {drawing.edges.map((edge) => {
                      const from = drawing.nodes.find((node) => node.task.id === edge.from)
                      const to = drawing.nodes.find((node) => node.task.id === edge.to)
                      if (!from || !to) return null
                      const x1 = from.x + 192
                      const y1 = from.y + 19
                      const x2 = to.x - 3
                      const y2 = to.y + 19
                      return (
                        <path
                          className={cn(
                            edge.kind === 'wait' ? 'stroke-brand/55' : 'stroke-muted-foreground/35',
                          )}
                          d={`M${x1} ${y1} C${x1 + 36} ${y1}, ${x2 - 36} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          key={`${edge.from}:${edge.to}`}
                          markerEnd={
                            edge.kind === 'wait' ? 'url(#dag-arrow-wait)' : 'url(#dag-arrow-owner)'
                          }
                          strokeDasharray={edge.kind === 'wait' ? '3 4' : undefined}
                        />
                      )
                    })}
                  </svg>
                  {drawing.nodes.map((node) => (
                    <Node
                      collapsed={folded.has(node.task.id)}
                      folded={descendants.get(node.task.id) ?? 0}
                      key={node.task.id}
                      named={meanings.get(node.task.id)}
                      now={now}
                      onFold={() => toggleFold(node.task.id)}
                      onOpen={() => switchConversation(node.task.conversationId)}
                      started={started[node.task.id]}
                      task={node.task}
                      x={node.x}
                      y={node.y}
                    />
                  ))}
                </div>
              )}
              {shownFinished.length > 0 && (
                <section className="mt-6 border-t border-border/60 pt-3" data-finished>
                  <h3 className="flex items-center gap-1.5 section-label">
                    <TimerIcon className="size-3" />
                    Finished
                    <span className="text-muted-foreground/60">{shownFinished.length}</span>
                    <span className="ml-auto font-normal text-[10px] text-muted-foreground/50">
                      last 30 seconds
                    </span>
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {shownFinished.map((item) => (
                      <FinishedCard
                        item={item}
                        key={item.task.id}
                        named={finishedMeanings.get(item.task.id)}
                        now={now}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>
        <Dock>
          <Conversation variant="dock" />
        </Dock>
      </div>
      <StatusLine />
    </>
  )
}

export { TaskGraphSurface }
