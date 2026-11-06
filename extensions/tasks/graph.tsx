/**
 * The Task DAG surface: a run's durable task history, with a multi-conversation frame per agent.
 * Structure is the default tab (layered columns inside each frame); Timeline is the second (bars over wall time).
 */
import { ChevronRightIcon, MessageSquareIcon, NetworkIcon, SettingsIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ToolStatusIcon } from '@/components/ai/tool'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  api,
  cn,
  Conversation,
  Dock,
  formatAgo,
  formatDuration,
  formatTime,
  formatTokens,
  Header,
  plural,
  StatusLine,
  useAction,
  useExtensionUiState,
  useNow,
  useSystem,
  useTasks,
  useUltimate,
} from '@/sdk'
import type { TaskGraphNode } from '@/sdk'
import { Address } from '../messages/ui.tsx'
import { meaning } from './kinds.ts'
import type { Meaning } from './kinds.ts'
import {
  criticalPath,
  descendantsOf,
  failed,
  foldedByDefault,
  hiddenByFolding,
  mergeLive,
  orderFrames,
  outcomeOf,
  runTotals,
  summarizeRun,
  taskSettings,
} from './history.ts'
import type { RunConversation, RunSummary, RunTask, TaskFacts, TaskSettings } from './history.ts'
import { layout } from './layout.ts'
import type { DagEdge } from './layout.ts'
import {
  ConversationsAction,
  DescribeAction,
  HistoryAction,
  RunAction,
  SettingsAction,
  StartedAction,
} from './refs.ts'
import { useOnce } from './shared.tsx'
import { CrossWaits } from './cross-waits.tsx'

const NODE_WIDTH = 192
const NODE_HEIGHT = 38
const POLL_MS = 2000
const NO_RUNS: RunSummary[] = []
type TaskFilter = 'all' | 'failed' | 'slow'

const formatCost = (cost: number) =>
  cost > 0 && cost < 0.001 ? '<$0.001' : `$${cost.toFixed(cost < 1 ? 3 : 2)}`

/** The node's plain state, for its card and its title. */
function stateOf(task: RunTask): {
  text: string
  icon: 'running' | 'pending' | 'done' | 'interrupted'
  tone: string
} {
  if (task.blocked)
    return {
      text: `blocked · ${task.blocked.replaceAll('_', ' ')}`,
      icon: 'interrupted',
      tone: 'text-warning',
    }
  if (task.status === 'waiting')
    return {
      text: `waiting${task.phase ? ` · ${task.phase}` : ''}`,
      icon: 'pending',
      tone: 'text-muted-foreground',
    }
  if (task.status === 'sleeping')
    return {
      text: `sleeping${task.phase ? ` · ${task.phase}` : ''}`,
      icon: 'pending',
      tone: 'text-muted-foreground',
    }
  if (task.status === 'pending') return { text: task.phase ?? 'pending', icon: 'pending', tone: '' }
  if (task.status === 'completing')
    return { text: 'completing', icon: 'pending', tone: 'text-muted-foreground' }
  if (task.status === 'running')
    return {
      text: `running${task.phase ? ` · ${task.phase}` : ''}`,
      icon: 'running',
      tone: 'text-foreground/80',
    }
  const outcome = outcomeOf(task)
  if (outcome === 'completed') return { text: 'done', icon: 'done', tone: 'text-success' }
  if (outcome === 'aborted') return { text: 'aborted', icon: 'interrupted', tone: 'text-warning' }
  return { text: outcome, icon: 'interrupted', tone: 'text-error' }
}

const outcomeTone = (outcome: RunSummary['outcome'] | undefined) => {
  if (outcome === 'completed') return 'bg-success'
  if (outcome === 'running') return 'bg-brand'
  if (outcome === 'aborted') return 'bg-warning'
  return 'bg-error'
}

const outcomeText = (outcome: RunSummary['outcome'] | undefined) => {
  if (outcome === 'completed') return 'done'
  if (outcome === 'running') return 'running'
  if (outcome === 'aborted') return 'aborted'
  if (outcome === undefined) return '—'
  return 'failed'
}

const durationOf = (task: RunTask, now: number) =>
  task.startedAt === undefined
    ? undefined
    : Math.max(
        0,
        (task.endedAt ?? (outcomeOf(task) === 'running' ? now : task.startedAt)) - task.startedAt,
      )

const agentLine = (run: RunSummary | undefined) =>
  run ? `@${run.agent} #${run.conversationId}` : ''

/** A task as the live graph names it; `meaning` takes this shape, and history has no sub-conversations. */
function asNode(task: RunTask): TaskGraphNode {
  const state =
    task.status === 'terminal' || task.status === 'completing'
      ? ({
          status: 'completing',
          outcome: task.outcome ?? 'completed',
        } as unknown as TaskGraphNode['state'])
      : task.status === 'waiting'
        ? ({
            status: 'waiting',
            phase: task.phase ?? '',
            on: task.on ?? [],
            policy: task.policy ?? 'allSettled',
          } as unknown as TaskGraphNode['state'])
        : task.status === 'sleeping'
          ? ({
              status: 'sleeping',
              phase: task.phase ?? '',
              until: task.until ?? 0,
            } as unknown as TaskGraphNode['state'])
          : ({ status: task.status, phase: task.phase ?? '' } as unknown as TaskGraphNode['state'])
  return {
    id: task.id as TaskGraphNode['id'],
    kind: task.kind,
    conversationId: task.conversationId as TaskGraphNode['conversationId'],
    ...(task.owner === undefined ? {} : { owner: task.owner as TaskGraphNode['owner'] }),
    background: task.background,
    abortRequested: task.abortRequested,
    state,
    conversations: [],
  }
}

function meaningOf(task: RunTask): Meaning | undefined {
  return meaning(asNode(task), task.facts)
}

function Who({ who }: { who: Meaning['who'] }) {
  if (who === undefined) return null
  return (
    <span className="min-w-0 max-w-[88px] truncate font-sans text-[11px] text-foreground/85">
      <Address id={who} />
    </span>
  )
}

/** One card in the Structure graph. */
function HistoryNode({
  task,
  named,
  started,
  now,
  x,
  y,
  folded,
  collapsed,
  critical,
  selected,
  onFold,
  onSelect,
  onNavigate,
}: {
  task: RunTask
  named: Meaning | undefined
  started: number | undefined
  now: number
  x: number
  y: number
  folded: number
  collapsed: boolean
  critical: boolean
  selected: boolean
  onFold?: () => void
  onSelect: () => void
  onNavigate: () => void
}) {
  const info = stateOf(task)
  const running = task.status === 'running'
  const settled = task.status === 'terminal'
  return (
    <div
      className={cn(
        'group absolute flex h-[38px] w-[192px] items-center gap-1.5 overflow-hidden rounded-md border px-2 font-mono text-[11px] transition-colors',
        task.blocked
          ? 'border-warning/60 bg-warning/5'
          : running
            ? 'border-brand/45 bg-brand/5'
            : task.status === 'waiting'
              ? 'border-border/80 bg-card/45'
              : failed(task)
                ? 'border-warning/60 bg-warning/5'
                : 'border-border/70 bg-card/35',
        settled && 'opacity-60',
        critical && 'ring-1 ring-brand/55',
        selected && 'ring-1 ring-foreground/50',
      )}
      data-task-id={task.id}
      onClick={onSelect}
      onDoubleClick={onNavigate}
      style={{ left: x, top: y }}
      title={[
        `${task.kind} #${task.id}`,
        task.phase ? `phase ${task.phase}` : undefined,
        task.status,
        task.owner !== undefined ? `owned by #${task.owner}` : undefined,
        task.startedAt !== undefined
          ? `started ${new Date(task.startedAt).toLocaleString()}`
          : undefined,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <ToolStatusIcon className="size-3" state={info.icon} />
      <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={onSelect} type="button">
        <span className="flex min-w-0 items-center gap-1 overflow-hidden text-foreground/90">
          <span className="shrink-0 truncate">{named?.text ?? task.tool ?? task.kind}</span>
          <Who who={named?.who} />
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground/65">
          <span className={cn('truncate', info.tone)}>{info.text}</span>
          {named?.detail && task.status !== 'waiting' && (
            <span className="truncate">· {named.detail}</span>
          )}
        </span>
      </button>
      {started !== undefined && (
        <span
          className={cn(
            'shrink-0 text-[9.5px] tabular-nums',
            outcomeOf(task) === 'running' && now - started >= 10 * 60_000
              ? 'text-warning'
              : 'text-muted-foreground/60',
          )}
          title={`Started ${new Date(started).toLocaleString()}`}
        >
          {formatDuration(
            Math.max(
              0,
              (task.endedAt ?? (outcomeOf(task) === 'running' ? now : started)) - started,
            ),
          )}
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
          {collapsed ? `+${folded}` : folded}
        </button>
      )}
    </div>
  )
}

/** A frame: one conversation's run, titled and boxed even when it is the only one. */
function RunFrame({
  conversationId,
  agent,
  runId,
  tab,
  settings,
  live,
  expanded,
  onFold,
  selectedTask,
  onSelectTask,
  showCritical,
  filter,
  now,
}: {
  conversationId: number
  agent: string
  runId: number | undefined
  tab: 'structure' | 'timeline'
  settings: TaskSettings
  live: readonly TaskGraphNode[]
  expanded: Record<string, boolean>
  onFold: (id: number, collapsed: boolean) => void
  selectedTask: number | undefined
  onSelectTask: (id: number | undefined) => void
  showCritical: boolean
  filter: TaskFilter
  now: number
}) {
  const { switchConversation, showSurface } = useUltimate()
  const { data, error, refetch } = useAction(
    RunAction,
    { id: runId ?? 0, costDetail: settings.costDetail },
    { enabled: runId !== undefined },
  )
  const detail = data
  const running = detail?.run.outcome === 'running'
  const tick = useNow(POLL_MS, running)
  const wasRunning = useRef(false)
  useEffect(() => {
    if (!running) {
      wasRunning.current = false
      return
    }
    if (wasRunning.current) refetch().catch((cause) => console.error(cause))
    wasRunning.current = true
  }, [tick, running, refetch])

  const liveHere = useMemo(
    () => live.filter((node) => node.conversationId === conversationId),
    [live, conversationId],
  )
  const liveIds = liveHere.map((node) => node.id)
  const started = useOnce(StartedAction, liveIds)
  const facts = useOnce<TaskFacts>(DescribeAction, liveIds)
  const merged = useMemo(() => {
    const stored = detail?.tasks ?? []
    const all = mergeLive(stored, liveHere, runId ?? -1, started)
    return all.map((task) => ({
      ...task,
      ...(!task.facts && facts[task.id]
        ? { facts: facts[task.id], tool: facts[task.id].tool }
        : {}),
      ...(task.startedAt === undefined && started[task.id] !== undefined
        ? { startedAt: started[task.id] }
        : {}),
    }))
  }, [detail, liveHere, runId, started, facts])
  const tasks = merged
  const descendants = useMemo(() => descendantsOf(tasks), [tasks])
  const auto = useMemo(() => foldedByDefault(tasks), [tasks])
  const folded = useMemo(() => {
    const set = new Set(auto)
    for (const task of tasks) {
      const key = String(task.id)
      if (!Object.hasOwn(expanded, key)) continue
      if (expanded[key]) set.add(task.id)
      else set.delete(task.id)
    }
    return set
  }, [auto, expanded, tasks])
  const hidden = useMemo(() => hiddenByFolding(tasks, folded), [tasks, folded])
  const filtered = useMemo(() => {
    if (filter === 'all') return tasks
    const byId = new Map(tasks.map((task) => [task.id, task]))
    const keep = new Set<number>()
    for (const task of tasks) {
      if (filter === 'failed' ? !failed(task) : (durationOf(task, now) ?? 0) <= 10_000) continue
      let current: RunTask | undefined = task
      while (current && !keep.has(current.id)) {
        keep.add(current.id)
        current = current.owner === undefined ? undefined : byId.get(current.owner)
      }
    }
    return tasks.filter((task) => keep.has(task.id))
  }, [tasks, filter, now])
  const visible = useMemo(
    () => (filter === 'all' ? filtered.filter((task) => !hidden.has(task.id)) : filtered),
    [filtered, hidden, filter],
  )
  const drawing = useMemo(
    () =>
      layout(
        visible.map((task) => asNode(task)),
        Object.fromEntries(
          visible.flatMap((task) =>
            task.startedAt === undefined ? [] : [[task.id, task.startedAt]],
          ),
        ),
      ),
    [visible],
  )
  const critical = useMemo(
    () => (showCritical && tab === 'structure' ? criticalPath(tasks, now) : new Set<number>()),
    [showCritical, tab, tasks, now],
  )
  const byTask = new Map(tasks.map((task) => [task.id, task]))
  const nodeAt = new Map<number, (typeof drawing.nodes)[number]>(
    drawing.nodes.map((node) => [Number(node.task.id), node]),
  )
  const summary = detail?.run
    ? { ...detail.run, taskCount: tasks.length, failedCount: runTotals(tasks).failedCount }
    : runId === undefined
      ? undefined
      : summarizeRun(taskOfPlaceholder(runId, conversationId), agent, tasks)
  const title = `@${agent} #${conversationId}`
  return (
    <section
      className="relative rounded-lg border border-border/70 bg-card/15"
      data-frame={conversationId}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-border/60 px-3 py-1.5 font-mono text-[10.5px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <MessageSquareIcon className="size-3 shrink-0 text-muted-foreground/60" />
          <span className="truncate font-sans text-[11.5px] text-foreground/85">{title}</span>
        </span>
        {summary ? (
          <>
            <span className={cn('size-1.5 shrink-0 rounded-full', outcomeTone(summary.outcome))} />
            <span className="text-muted-foreground/70">{outcomeText(summary.outcome)}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground/70">
              {summary.truncated ? '≥' : ''}
              {plural(summary.taskCount, 'task')}
            </span>
            {summary.failedCount > 0 && (
              <span className="text-warning">
                {summary.truncated ? '≥' : ''}
                {summary.failedCount} failed
              </span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground/60">
              {summary.startedAt > 0 && <span>{formatTime(summary.startedAt, true)}</span>}
              {summary.startedAt > 0 && (
                <span>
                  {summary.endedAt
                    ? formatDuration(summary.endedAt - summary.startedAt)
                    : 'running'}
                </span>
              )}
            </span>
          </>
        ) : (
          <span className="ml-auto text-muted-foreground/60">
            {runId === undefined ? 'no runs in window' : 'loading…'}
          </span>
        )}
      </div>
      {error && (
        <div
          className="border-b border-warning/30 px-3 py-2 font-mono text-[10.5px] text-warning"
          role="alert"
        >
          Could not load run: {error.message}{' '}
          <button
            className="underline"
            onClick={() => refetch().catch((cause) => console.error(cause))}
            type="button"
          >
            Retry
          </button>
        </div>
      )}
      {detail?.truncated && (
        <div
          className="border-b border-warning/30 px-3 py-2 font-mono text-[10.5px] text-warning"
          role="status"
        >
          Showing the first 5,000 tasks; this run was truncated.
        </div>
      )}
      {tab === 'structure' ? (
        <div className="max-h-[460px] overflow-auto p-3">
          {visible.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center font-mono text-[11px] text-muted-foreground/60">
              {tasks.length > 0
                ? 'no tasks match this filter'
                : runId === undefined
                  ? 'no run in the visible history'
                  : 'loading run…'}
            </div>
          ) : (
            <div
              className="relative"
              style={{
                width: Math.max(drawing.width + 16, 300),
                height: Math.max(drawing.height + 8, 48),
              }}
            >
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-visible"
                height={drawing.height}
                width={drawing.width}
              >
                <defs>
                  <marker
                    id="history-arrow-owner"
                    markerHeight="6"
                    markerWidth="6"
                    orient="auto"
                    refX="5"
                    refY="3"
                  >
                    <path className="fill-muted-foreground/40" d="M0,0 L6,3 L0,6 z" />
                  </marker>
                  <marker
                    id="history-arrow-wait"
                    markerHeight="6"
                    markerWidth="6"
                    orient="auto"
                    refX="5"
                    refY="3"
                  >
                    <path className="fill-brand/60" d="M0,0 L6,3 L0,6 z" />
                  </marker>
                </defs>
                {drawing.edges.map((edge: DagEdge) => {
                  const from = nodeAt.get(edge.to) && nodeAt.get(edge.from)
                  if (!from) return null
                  const a = nodeAt.get(edge.from)!
                  const b = nodeAt.get(edge.to)!
                  const x1 = a.x + NODE_WIDTH
                  const y1 = a.y + NODE_HEIGHT / 2
                  const x2 = b.x - 3
                  const y2 = b.y + NODE_HEIGHT / 2
                  const onPath = critical.has(edge.from) && critical.has(edge.to)
                  return (
                    <path
                      className={cn(
                        edge.kind === 'wait' ? 'stroke-brand/55' : 'stroke-muted-foreground/35',
                        onPath && 'stroke-brand/80',
                      )}
                      d={`M${x1} ${y1} C${x1 + 36} ${y1}, ${x2 - 36} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      key={`${edge.from}:${edge.to}`}
                      markerEnd={
                        edge.kind === 'wait'
                          ? 'url(#history-arrow-wait)'
                          : 'url(#history-arrow-owner)'
                      }
                      strokeDasharray={edge.kind === 'wait' ? '3 4' : undefined}
                      strokeWidth={onPath ? 1.8 : undefined}
                    />
                  )
                })}
              </svg>
              {drawing.nodes.map((node) => {
                const task = byTask.get(node.task.id)
                if (!task) return null
                return (
                  <HistoryNode
                    collapsed={folded.has(task.id)}
                    critical={critical.has(task.id)}
                    folded={descendants.get(task.id) ?? 0}
                    key={task.id}
                    named={meaningOf(task)}
                    now={now}
                    onFold={() => onFold(task.id, !folded.has(task.id))}
                    onSelect={() => onSelectTask(task.id)}
                    onNavigate={() => {
                      switchConversation(task.conversationId)
                      showSurface('agent')
                    }}
                    selected={selectedTask === task.id}
                    started={task.startedAt ?? started[task.id]}
                    task={task}
                    x={node.x}
                    y={node.y}
                  />
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <Timeline
          tasks={filtered}
          run={summary}
          now={now}
          selected={selectedTask}
          onSelect={onSelectTask}
        />
      )}
      {selectedTask !== undefined &&
        (() => {
          const task = tasks.find((item) => item.id === selectedTask)
          return task ? (
            <TaskDetail
              now={now}
              onClose={() => onSelectTask(undefined)}
              run={summary}
              childCount={descendants.get(task.id) ?? 0}
              settings={settings}
              task={task}
            />
          ) : null
        })()}
    </section>
  )
}

/** A placeholder run for a frame whose history summary has not arrived yet; only its id and conversation are shown. */
const taskOfPlaceholder = (id: number, conversationId: number): RunTask => ({
  id,
  conversationId,
  kind: 'pi.generation',
  background: false,
  abortRequested: false,
  status: 'running',
})

/** One lane in a timeline frame: the agent's turns, or the tools it called. */
type Lane = { key: string; label: string; tasks: RunTask[] }

function Timeline({
  tasks,
  run,
  now,
  selected,
  onSelect,
}: {
  tasks: RunTask[]
  run: RunSummary | undefined
  now: number
  selected: number | undefined
  onSelect: (id: number | undefined) => void
}) {
  const [hover, setHover] = useState<{ task: RunTask; x: number; y: number }>()
  const [zoom, setZoom] = useState(1)
  const start = run?.startedAt ?? Math.min(...tasks.map((task) => task.startedAt ?? Infinity))
  const end = Math.max(
    run?.endedAt ?? start,
    ...tasks.map(
      (task) => task.endedAt ?? (outcomeOf(task) === 'running' ? now : (task.startedAt ?? start)),
    ),
  )
  const span = Math.max(1000, end - start)
  const chartWidth = Math.max(640, Math.min(1600, Math.round(span / 1000) * 8)) * zoom
  const gutter = 84
  const width = chartWidth + gutter
  const lanes: Lane[] = []
  const agentName = run?.agent ?? 'agent'
  const agentTasks = tasks.filter(
    (task) => task.kind !== 'pi.tool' && task.kind !== 'pi.compaction',
  )
  const toolTasks = tasks.filter((task) => task.kind === 'pi.tool' || task.kind === 'pi.compaction')
  if (agentTasks.length) lanes.push({ key: 'agent', label: `@${agentName}`, tasks: agentTasks })
  if (toolTasks.length)
    lanes.push({ key: 'tools', label: `tools · #${run?.conversationId ?? ''}`, tasks: toolTasks })
  if (lanes.length === 0) return null
  const top = 24
  const laneGap = 12
  const barGap = 20
  const laneTops: number[] = []
  let height = top
  for (const lane of lanes) {
    laneTops.push(height)
    height += Math.max(1, lane.tasks.length) * barGap + laneGap
  }
  const xOf = (at: number) => gutter + ((at - start) / span) * chartWidth
  const barWidth = (task: RunTask) =>
    Math.max(
      4,
      (((task.endedAt ?? (outcomeOf(task) === 'running' ? now : (task.startedAt ?? start))) -
        (task.startedAt ?? start)) /
        span) *
        chartWidth,
    )
  const bar = (task: RunTask, laneIndex: number, taskIndex: number) => {
    const y = laneTops[laneIndex] + taskIndex * barGap + 2
    const left = Math.max(gutter, xOf(task.startedAt ?? start))
    const w = Math.max(4, Math.min(width - left, barWidth(task)))
    const tone = failed(task)
      ? 'fill-error/70'
      : outcomeOf(task) === 'running'
        ? 'fill-brand/70'
        : 'fill-muted-foreground/40'
    return (
      <g key={task.id}>
        <rect
          className={cn('cursor-pointer', tone, selected === task.id && 'stroke-foreground/70')}
          data-task-id={task.id}
          height={16}
          onMouseEnter={(event) =>
            setHover({
              task,
              x: event.currentTarget.getBoundingClientRect().left + 8,
              y: event.currentTarget.getBoundingClientRect().bottom + 6,
            })
          }
          onMouseLeave={() => setHover(undefined)}
          onClick={() => onSelect(selected === task.id ? undefined : task.id)}
          rx={3}
          width={w}
          x={left}
          y={y}
        />
        {w > 44 && (
          <text
            className="pointer-events-none fill-foreground/75 font-mono text-[9px]"
            x={left + 4}
            y={y + 11}
          >
            {formatDuration((task.endedAt ?? now) - (task.startedAt ?? now))}
          </text>
        )}
      </g>
    )
  }
  const geometry = new Map<number, { x: number; y: number }>()
  for (const [laneIndex, lane] of lanes.entries())
    for (const [taskIndex, task] of lane.tasks.entries()) {
      const y = laneTops[laneIndex] + taskIndex * barGap + 10
      geometry.set(task.id, {
        x: xOf(task.endedAt ?? (outcomeOf(task) === 'running' ? now : (task.startedAt ?? start))),
        y,
      })
    }
  const ticks = 6
  return (
    <div className="relative max-h-[460px] overflow-auto p-3">
      <div className="sticky left-0 flex w-fit items-center gap-1 pb-2 font-mono text-[10px] text-muted-foreground">
        <button
          aria-label="Zoom timeline out"
          className="rounded px-1 hover:bg-accent disabled:opacity-40"
          disabled={zoom === 1}
          onClick={() => setZoom(zoom / 2)}
          type="button"
        >
          −
        </button>
        {zoom}×
        <button
          aria-label="Zoom timeline in"
          className="rounded px-1 hover:bg-accent disabled:opacity-40"
          disabled={zoom === 16}
          onClick={() => setZoom(zoom * 2)}
          type="button"
        >
          +
        </button>
      </div>
      <svg className="block" height={height} width={width + 8}>
        {Array.from({ length: ticks + 1 }, (_, index) => {
          const x = gutter + (index / ticks) * chartWidth
          return (
            <g key={index}>
              <line
                className="stroke-border/40"
                strokeDasharray="2 5"
                x1={x}
                x2={x}
                y1={0}
                y2={height}
              />
              <text className="fill-muted-foreground/60 font-mono text-[9px]" x={x + 2} y={11}>
                {formatDuration((index / ticks) * span)}
              </text>
            </g>
          )
        })}
        {lanes.map((lane, index) => (
          <g key={lane.key}>
            <text
              className="fill-muted-foreground/80 font-mono text-[10px]"
              x={0}
              y={laneTops[index] + 13}
            >
              {lane.label}
            </text>
            {lane.tasks.map((task, taskIndex) => bar(task, index, taskIndex))}
          </g>
        ))}
        {tasks
          .filter((task) => task.status === 'waiting')
          .flatMap((task) => {
            const to = geometry.get(task.id)
            if (!to) return []
            return (task.on ?? []).flatMap((blocker) => {
              const from = geometry.get(blocker)
              if (!from) return []
              return [
                <path
                  className="stroke-brand/60"
                  d={`M${from.x} ${from.y} C${from.x + 24} ${from.y}, ${to.x - 24} ${to.y}, ${to.x} ${to.y}`}
                  fill="none"
                  key={`${blocker}:${task.id}`}
                  strokeDasharray="3 4"
                />,
              ]
            })
          })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none fixed z-50 w-64 rounded-md border border-border/80 bg-popover p-2.5 font-mono text-[10.5px] text-foreground/85 shadow-lg"
          style={{
            left: Math.min(hover.x, window.innerWidth - 280),
            top: Math.min(hover.y, window.innerHeight - 190),
          }}
        >
          <div className="flex items-center gap-1.5 font-sans text-[11.5px]">
            <ToolStatusIcon className="size-3" state={stateOf(hover.task).icon} />
            <span className="truncate">
              {meaningOf(hover.task)?.text ?? hover.task.tool ?? hover.task.kind}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground/75">
            <span>kind</span>
            <span>
              {hover.task.kind} #{hover.task.id}
            </span>
            <span>outcome</span>
            <span className={stateOf(hover.task).tone}>{outcomeText(outcomeOf(hover.task))}</span>
            <span>start</span>
            <span>+{formatDuration((hover.task.startedAt ?? 0) - start)}</span>
            <span>duration</span>
            <span>
              {formatDuration((hover.task.endedAt ?? now) - (hover.task.startedAt ?? now))}
            </span>
            {hover.task.usage?.tokens !== undefined && (
              <>
                <span>tokens</span>
                <span>{formatTokens(hover.task.usage.tokens)}</span>
              </>
            )}
            {hover.task.usage?.cost !== undefined && (
              <>
                <span>cost</span>
                <span>{formatCost(hover.task.usage.cost)}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** The expanded node card: everything §5 asks for, blank where the record has nothing. */
function TaskDetail({
  task,
  run,
  childCount,
  settings,
  now,
  onClose,
}: {
  task: RunTask
  run: RunSummary | undefined
  childCount: number
  settings: TaskSettings
  now: number
  onClose: () => void
}) {
  const info = stateOf(task)
  const named = meaningOf(task)
  const duration = durationOf(task, now)
  const startOffset =
    run && task.startedAt !== undefined ? task.startedAt - run.startedAt : undefined
  const endOffset = run && task.endedAt !== undefined ? task.endedAt - run.startedAt : undefined
  return (
    <div
      className="absolute top-10 right-4 z-30 w-80 rounded-lg border border-border/80 bg-popover p-3 font-mono text-[10.5px] text-foreground/85 shadow-xl"
      data-task-detail
    >
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <ToolStatusIcon className="size-3.5" state={info.icon} />
        <span className="min-w-0 flex-1 truncate font-sans text-[12px]">
          {named?.text ?? task.tool ?? task.kind}
        </span>
        <button
          className="cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground/60">kind</dt>
        <dd>
          {task.kind} #{task.id}
        </dd>
        {task.tool && (
          <>
            <dt className="text-muted-foreground/60">tool</dt>
            <dd className="min-w-0 break-words">
              {task.tool}
              {task.detail ? ` · ${task.detail}` : ''}
            </dd>
          </>
        )}
        {run && (
          <>
            <dt className="text-muted-foreground/60">agent</dt>
            <dd>
              @{run.agent} #{run.conversationId}
            </dd>
            {run.model && (
              <>
                <dt className="text-muted-foreground/60">model</dt>
                <dd className="break-all">{run.model}</dd>
              </>
            )}
          </>
        )}
        <dt className="text-muted-foreground/60">children</dt>
        <dd>{childCount}</dd>
        <dt className="text-muted-foreground/60">status</dt>
        <dd className={info.tone}>{info.text}</dd>
        {task.phase && (
          <>
            <dt className="text-muted-foreground/60">phase</dt>
            <dd>{task.phase}</dd>
          </>
        )}
        {startOffset !== undefined && (
          <>
            <dt className="text-muted-foreground/60">start</dt>
            <dd>+{formatDuration(startOffset)}</dd>
          </>
        )}
        {endOffset !== undefined && (
          <>
            <dt className="text-muted-foreground/60">end</dt>
            <dd>+{formatDuration(endOffset)}</dd>
          </>
        )}
        {duration !== undefined && (
          <>
            <dt className="text-muted-foreground/60">duration</dt>
            <dd>{formatDuration(duration)}</dd>
          </>
        )}
        <dt className="text-muted-foreground/60">outcome</dt>
        <dd className={info.tone}>{outcomeText(outcomeOf(task))}</dd>
        {task.error && (
          <>
            <dt className="text-muted-foreground/60">error</dt>
            <dd className="break-words text-error">{task.error}</dd>
          </>
        )}
        {task.reason && (
          <>
            <dt className="text-muted-foreground/60">reason</dt>
            <dd className="break-words">{task.reason}</dd>
          </>
        )}
        {task.restarts !== undefined && task.restarts > 0 && (
          <>
            <dt className="text-muted-foreground/60">retries</dt>
            <dd>{task.restarts}</dd>
          </>
        )}
        {settings.costDetail === 'tool' && task.usage?.tokens !== undefined && (
          <>
            <dt className="text-muted-foreground/60">tokens</dt>
            <dd>{formatTokens(task.usage.tokens)}</dd>
          </>
        )}
        {settings.costDetail === 'tool' && task.usage?.cost !== undefined && (
          <>
            <dt className="text-muted-foreground/60">cost</dt>
            <dd>{formatCost(task.usage.cost)}</dd>
          </>
        )}
        {settings.costDetail === 'run' && run?.tokens !== undefined && (
          <>
            <dt className="text-muted-foreground/60">recorded tokens</dt>
            <dd>{formatTokens(run.tokens)}</dd>
          </>
        )}
        {settings.costDetail === 'run' && run?.cost !== undefined && (
          <>
            <dt className="text-muted-foreground/60">recorded cost</dt>
            <dd>{formatCost(run.cost)}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

/** The settings popover: history days and cost detail; changes write project settings; no history is deleted. */
function SettingsMenu({ settings }: { settings: TaskSettings }) {
  const [draftDays, setDraftDays] = useState(settings.historyDays)
  const [draftCost, setDraftCost] = useState(settings.costDetail)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setDraftDays(settings.historyDays)
    setDraftCost(settings.costDetail)
  }, [settings.historyDays, settings.costDetail])
  const save = () => {
    if (!Number.isSafeInteger(draftDays) || draftDays < 1) {
      setError('Enter a positive whole number of days.')
      return
    }
    setSaving(true)
    void (async () => {
      try {
        await api.action(SettingsAction, { historyDays: draftDays, costDetail: draftCost })
        setError(undefined)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setSaving(false)
      }
    })().catch((cause) => setError(String(cause)))
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
          title="History settings"
          type="button"
        >
          <SettingsIcon className="size-3.5" />
          {settings.historyDays} days · {settings.costDetail === 'run' ? 'per run' : 'per tool'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 font-mono text-[11px]">
        <div className="section-label pb-2">Task history</div>
        <label className="flex items-center justify-between gap-2 py-1">
          <span className="text-muted-foreground">Keep visible</span>
          <span className="flex items-center gap-1">
            <input
              className="w-14 rounded border border-border/70 bg-background px-1.5 py-0.5 text-right text-foreground outline-none focus:border-brand/60"
              min={1}
              onChange={(event) => setDraftDays(Number(event.target.value))}
              type="number"
              value={draftDays}
            />
            days
          </span>
        </label>
        <label className="flex items-center justify-between gap-2 py-1">
          <span className="text-muted-foreground">Cost detail</span>
          <select
            className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-foreground outline-none focus:border-brand/60"
            onChange={(event) => setDraftCost(event.target.value === 'tool' ? 'tool' : 'run')}
            value={draftCost}
          >
            <option value="run">per run</option>
            <option value="tool">per tool</option>
          </select>
        </label>
        <button
          className="mt-2 rounded-md border border-border/70 px-2 py-1 text-foreground hover:bg-accent disabled:opacity-50"
          disabled={
            saving || (draftDays === settings.historyDays && draftCost === settings.costDetail)
          }
          onClick={save}
          type="button"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {error && (
          <p className="mt-2 text-warning" role="alert">
            {error}
          </p>
        )}
        <p className="mt-2 border-t border-border/60 pt-2 text-[10px] leading-relaxed text-muted-foreground/60">
          This filters what is shown. History is never deleted.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** The left rail: conversations (multi-select) and their runs, newest first. */
function Rail({
  conversations,
  selected,
  toggle,
  all,
  none,
  runs,
  primary,
  onPick,
  cursor,
  onMore,
  now,
}: {
  conversations: RunConversation[]
  selected: readonly number[]
  toggle: (id: number) => void
  all: () => void
  none: () => void
  runs: RunSummary[]
  primary: number | undefined
  onPick: (run: RunSummary) => void
  cursor?: string
  onMore: () => void
  now: number
}) {
  return (
    <aside className="flex w-[250px] shrink-0 flex-col border-r border-border/60 bg-sidebar/40">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 section-label">
        Conversations
        <span className="ml-auto flex items-center gap-1.5 font-normal normal-case tracking-normal">
          <button
            className="cursor-pointer text-muted-foreground/70 hover:text-foreground"
            onClick={all}
            type="button"
          >
            all
          </button>
          <span className="text-muted-foreground/40">/</span>
          <button
            className="cursor-pointer text-muted-foreground/70 hover:text-foreground"
            onClick={none}
            type="button"
          >
            none
          </button>
        </span>
      </div>
      <div className="max-h-[38%] overflow-auto py-1" data-conversation-list>
        {conversations.map((conversation) => (
          <label
            className="flex cursor-pointer items-center gap-2 px-3 py-1 font-mono text-[10.5px] hover:bg-accent/40"
            key={conversation.id}
          >
            <input
              checked={selected.includes(conversation.id)}
              className="size-3 accent-brand"
              onChange={() => toggle(conversation.id)}
              type="checkbox"
            />
            <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-foreground/85">
              @{conversation.agent}{' '}
              <span className="text-muted-foreground/60">#{conversation.id}</span>
            </span>
            <span className="shrink-0 text-muted-foreground/50">{conversation.runs}</span>
            <span className="w-10 shrink-0 text-right text-muted-foreground/50">
              {conversation.lastAt ? formatAgo(conversation.lastAt, now, { ago: true }) : '—'}
            </span>
          </label>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-border/60">
        <div className="flex items-center gap-2 px-3 py-2 section-label">
          Runs
          <span className="ml-auto font-normal tracking-normal text-muted-foreground/50">
            {runs.length}
          </span>
        </div>
        <p className="px-3 pb-2 font-mono text-[10px] text-muted-foreground/60">
          One generation per run; a turn may span runs.
        </p>
        <div className="min-h-0 flex-1 overflow-auto" data-run-list>
          {runs.map((run) => (
            <button
              className={cn(
                'flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left font-mono text-[10.5px] transition-colors',
                primary === run.id
                  ? 'border-brand bg-accent/60 text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-accent/40',
              )}
              key={run.id}
              onClick={() => onPick(run)}
              type="button"
            >
              <span className={cn('size-1.5 shrink-0 rounded-full', outcomeTone(run.outcome))} />
              <span className="w-[58px] shrink-0 tabular-nums text-foreground/80">
                {formatTime(run.startedAt, true)}
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums">
                {run.endedAt ? formatDuration(run.endedAt - run.startedAt) : 'running'}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground/60">@{run.agent}</span>
              {run.failedCount > 0 && (
                <span className="shrink-0 text-warning">
                  {run.truncated ? '≥' : ''}
                  {run.failedCount}✕
                </span>
              )}
            </button>
          ))}
          {runs.length === 0 && (
            <div className="px-3 py-4 text-center font-mono text-[10.5px] text-muted-foreground/60">
              no runs in the visible days
            </div>
          )}
          {cursor && (
            <button
              className="w-full cursor-pointer py-2 text-center font-mono text-[10.5px] text-muted-foreground/70 hover:text-foreground"
              onClick={onMore}
              type="button"
            >
              load 20 more
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

/** The summary strip above the graph: the primary run's counts and spend. */
function RunSummaryBar({ run }: { run: RunSummary | undefined }) {
  if (!run) return null
  const chips: { label: string; value: string }[] = [
    { label: 'tasks', value: `${run.truncated ? '≥' : ''}${run.taskCount}` },
    { label: 'agents', value: '1' },
    { label: 'tool calls', value: `${run.truncated ? '≥' : ''}${run.toolCount ?? 0}` },
  ]
  if (run.tokens !== undefined)
    chips.push({ label: 'recorded tokens', value: formatTokens(run.tokens) })
  if (run.cost !== undefined) chips.push({ label: 'recorded cost', value: formatCost(run.cost) })
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2"
      data-run-summary
    >
      <span className="flex items-center gap-1.5 font-sans text-[12px] text-foreground/85">
        <span className={cn('size-1.5 rounded-full', outcomeTone(run.outcome))} />
        Run #{run.id} · {agentLine(run)}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground/60">
        {formatTime(run.startedAt, true)} ·{' '}
        {run.endedAt ? formatDuration(run.endedAt - run.startedAt) : 'running'}
        {run.failedCount > 0 && (
          <span className="text-warning">
            {' '}
            · {run.truncated ? '≥' : ''}
            {run.failedCount} failed
          </span>
        )}
      </span>
      {chips.map((chip) => (
        <span
          className="flex flex-col rounded border border-border/60 bg-card/30 px-2 py-0.5 font-mono text-[9px] text-muted-foreground/60"
          key={chip.label}
          title={
            chip.label.startsWith('recorded')
              ? 'From retained result entries; retries or nested calls may be missing.'
              : undefined
          }
        >
          <span className="text-[11px] tabular-nums text-foreground/85">{chip.value}</span>
          {chip.label}
        </span>
      ))}
    </div>
  )
}

function TaskGraphSurface() {
  const graph = useTasks()
  const { conversationId } = useUltimate()
  const system = useSystem()
  const settings = taskSettings(system?.project.settings)
  const [tabValue, setTab] = useExtensionUiState<string>('dag.tab', 'structure')
  const tab = tabValue === 'timeline' ? 'timeline' : 'structure'
  const [showCritical, setShowCritical] = useExtensionUiState<boolean>('dag.critical', false)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [selected, setSelected] = useExtensionUiState<number[]>(
    'dag.conversations',
    conversationId ? [conversationId] : [],
  )
  const [pickedRuns, setPickedRuns] = useState<Record<string, RunSummary>>({})
  const [foldState, setFoldState] = useExtensionUiState<Record<string, boolean>>('dag.fold', {})
  const [primaryRun, setPrimaryRun] = useExtensionUiState<number | null>('dag.primaryRun', null)
  const [selectedTask, setSelectedTask] = useState<number>()
  const [more, setMore] = useState<{ key: string; runs: RunSummary[]; cursor?: string }>({
    key: '',
    runs: [],
  })
  const [loadingMore, setLoadingMore] = useState(false)
  const pendingPage = useRef<AbortController | undefined>(undefined)
  const effective = settings
  const previousDays = useRef(effective.historyDays)
  const selectedRuns = useMemo(
    () =>
      Object.values(graph?.tasks ?? {}).filter(
        (task) =>
          task.kind === 'pi.generation' &&
          task.owner === undefined &&
          selected.includes(task.conversationId),
      ),
    [graph, selected],
  )
  const liveSignature = selectedRuns
    .map((task) => `${task.id}:${task.state.status}`)
    .toSorted()
    .join(',')
  const previousSignature = useRef(liveSignature)
  useEffect(() => {
    if (previousDays.current === effective.historyDays) return
    previousDays.current = effective.historyDays
    setPickedRuns({})
    setPrimaryRun(null)
  }, [effective.historyDays, setPickedRuns, setPrimaryRun])
  const now = useNow(1000, true)

  const conversations = useAction(ConversationsAction, { days: effective.historyDays })
  const historyArgs = useMemo(
    () => ({
      conversationIds: [...selected].toSorted((a, b) => a - b),
      days: effective.historyDays,
      limit: 20,
    }),
    [selected, effective.historyDays],
  )
  const history = useAction(HistoryAction, historyArgs, { enabled: selected.length > 0 })
  const pageKey = JSON.stringify([historyArgs, liveSignature])
  useEffect(
    () => () => {
      pendingPage.current?.abort()
      pendingPage.current = undefined
      setLoadingMore(false)
    },
    [pageKey],
  )
  const older = more.key === pageKey ? more.runs : NO_RUNS
  const olderCursor = more.key === pageKey ? more.cursor : undefined
  const runs = useMemo(() => {
    const seen = new Set<number>()
    return [...(history.data?.runs ?? []), ...older].filter((run) => {
      if (seen.has(run.id)) return false
      seen.add(run.id)
      return true
    })
  }, [history.data, older])
  const anyRunning = runs.some((run) => run.outcome === 'running')
  const poll = useNow(POLL_MS, anyRunning)
  const conversationPoll = useNow(5000, anyRunning)
  const wasRunning = useRef(false)
  const refetchHistory = history.refetch
  const refetchConversations = conversations.refetch
  useEffect(() => {
    if (previousSignature.current === liveSignature) return
    previousSignature.current = liveSignature
    // A live run entering, leaving or changing phase invalidates older pages' ordering and outcomes.
    refetchHistory().catch((error) => console.error(error))
    refetchConversations().catch((error) => console.error(error))
  }, [liveSignature, refetchHistory, refetchConversations])
  useEffect(() => {
    if (anyRunning) refetchConversations().catch((error) => console.error(error))
  }, [conversationPoll, anyRunning, refetchConversations])
  useEffect(() => {
    if (!anyRunning) {
      wasRunning.current = false
      return
    }
    if (wasRunning.current) refetchHistory().catch((error) => console.error(error))
    wasRunning.current = true
  }, [poll, anyRunning, refetchHistory])
  useEffect(() => {
    if (primaryRun !== null && runs.some((run) => run.id === primaryRun)) return
    const first = runs[0]
    if (first) setPrimaryRun(first.id)
  }, [primaryRun, runs, setPrimaryRun])

  const conversationList = conversations.data ?? []
  const known = new Map(conversationList.map((conversation) => [conversation.id, conversation]))
  const selectedConversations = selected.filter((id) =>
    conversationList.some((item) => item.id === id),
  )
  const frames = orderFrames(
    selectedConversations.map((id) => {
      const conversation = known.get(id)
      const picked = pickedRuns[String(id)]
      const validPick =
        picked && picked.startedAt >= now - effective.historyDays * 86_400_000 ? picked : undefined
      const latest = runs.find((item) => item.conversationId === id)
      const runId = validPick?.id ?? latest?.id ?? conversation?.lastRunId
      const run = runs.find((item) => item.id === runId) ?? validPick
      return {
        conversationId: id,
        agent: conversation?.agent ?? run?.agent ?? 'agent',
        runId,
        earliest: run?.startedAt ?? conversation?.lastRunAt ?? conversation?.lastAt ?? 0,
      }
    }),
  )
  const primary =
    runs.find((run) => run.id === primaryRun && selected.includes(run.conversationId)) ??
    frames.map((frame) => runs.find((run) => run.id === frame.runId)).find(Boolean)
  const primarySummary = primary
  const pick = (run: RunSummary) => {
    setPrimaryRun(run.id)
    setPickedRuns({ ...pickedRuns, [String(run.conversationId)]: run })
    if (!selected.includes(run.conversationId)) setSelected([...selected, run.conversationId])
  }
  const toggle = (id: number) =>
    setSelected(
      selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id],
    )
  const loadMore = async () => {
    const cursor = older.length ? olderCursor : history.data?.cursor
    if (!cursor || pendingPage.current) return
    const controller = new AbortController()
    pendingPage.current = controller
    setLoadingMore(true)
    try {
      const page = await api.action(
        HistoryAction,
        {
          ...historyArgs,
          before: Number(cursor),
          limit: 20,
        },
        { signal: controller.signal },
      )
      if (!controller.signal.aborted)
        setMore({
          key: pageKey,
          runs: [...older, ...page.runs],
          ...(page.cursor ? { cursor: page.cursor } : {}),
        })
    } catch (error) {
      if (!controller.signal.aborted) console.error(error)
    } finally {
      if (pendingPage.current === controller) {
        pendingPage.current = undefined
        setLoadingMore(false)
      }
    }
  }
  const live = useMemo(() => Object.values(graph?.tasks ?? {}), [graph])
  const framesRoot = useRef<HTMLDivElement>(null)

  return (
    <>
      <Header>
        <span className="flex shrink-0 items-center gap-2 text-[13px] font-medium">
          <NetworkIcon className="size-4 text-muted-foreground" />
          Task DAG
        </span>
        <span className="ml-2 flex shrink-0 items-center rounded-md border border-border/60 bg-card/30 p-0.5 font-mono text-[10.5px]">
          {(['structure', 'timeline'] as const).map((value) => (
            <button
              className={cn(
                'rounded px-2 py-0.5 transition-colors',
                tab === value
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {value === 'structure' ? 'Structure' : 'Timeline'}
            </button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground/65">
          <span className="flex items-center gap-1">
            <span className="h-px w-4 bg-muted-foreground/45" /> owns
          </span>
          <span
            className="flex items-center gap-1"
            title="Only currently retained waits are available; terminal records do not preserve earlier waits."
          >
            <span className="h-px w-4 border-t border-dashed border-brand/60" /> waits
          </span>
          <button
            aria-pressed={showCritical}
            className={cn(
              'hidden h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 transition-colors sm:flex',
              showCritical ? 'bg-accent text-foreground' : 'hover:text-foreground',
            )}
            onClick={() => setShowCritical(!showCritical)}
            title="Highlight the longest chain by summed task durations; overlapping spans count more than once"
            type="button"
          >
            <span
              className={cn('h-0.5 w-4', showCritical ? 'bg-brand' : 'bg-muted-foreground/50')}
            />
            duration chain
          </button>
          <SettingsMenu settings={effective} />
        </span>
      </Header>
      <div className="flex min-h-0 flex-1">
        <Rail
          all={() => setSelected(conversations.data?.map((conversation) => conversation.id) ?? [])}
          conversations={conversationList}
          cursor={loadingMore ? undefined : older.length ? olderCursor : history.data?.cursor}
          none={() => setSelected([])}
          now={now}
          onMore={loadMore}
          onPick={pick}
          primary={primaryRun ?? undefined}
          runs={runs}
          selected={selected}
          toggle={toggle}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <RunSummaryBar run={primarySummary} />
          <div
            className="flex items-center gap-1 border-b border-border/60 px-3 py-1 font-mono text-[10px] text-muted-foreground"
            aria-label="Filter tasks"
          >
            {(
              [
                ['all', 'All'],
                ['failed', 'Failed'],
                ['slow', '>10s'],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={filter === value}
                className={cn(
                  'rounded px-2 py-1 hover:bg-accent',
                  filter === value && 'bg-accent text-foreground',
                )}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3" data-task-dag-surface>
            {frames.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 font-mono text-[11.5px] text-muted-foreground/70">
                <NetworkIcon className="size-5 text-muted-foreground/50" />
                select a conversation to see its runs
              </div>
            ) : (
              <div className="relative" ref={framesRoot}>
                <div className="flex flex-col gap-3" data-frame-list>
                  {frames.map((frame) => (
                    <RunFrame
                      agent={frame.agent}
                      conversationId={frame.conversationId}
                      expanded={foldState}
                      key={`${frame.conversationId}:${frame.runId ?? 'none'}`}
                      live={live}
                      now={now}
                      onFold={(id, collapsed) =>
                        setFoldState({ ...foldState, [String(id)]: collapsed })
                      }
                      onSelectTask={(id) => setSelectedTask(id)}
                      runId={frame.runId}
                      selectedTask={selectedTask}
                      settings={effective}
                      showCritical={showCritical}
                      filter={filter}
                      tab={tab}
                    />
                  ))}
                </div>
                <CrossWaits live={live} root={framesRoot} />
              </div>
            )}
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
