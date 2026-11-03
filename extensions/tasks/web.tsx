import { GitBranchIcon, ListTreeIcon, MessageSquareIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ToolStatusIcon } from '@/components/ai/tool'
import {
  cn,
  defineWebExtension,
  formatDuration,
  provide,
  RunStart,
  useAction,
  useConversation,
  useNow,
  useTasks,
  useUltimate,
  useUiState,
} from '@/sdk'
import type { TaskGraph, TaskGraphNode } from '@/sdk'
import type { WorkspaceConversation as ConversationSummary } from '../workspaces/ui.tsx'
import { useWorkspaceConversations as useConversations } from '../workspaces/ui.tsx'
import { FeatureTag, hiddenConversationIds, useOverview } from '../conversations/ui.tsx'
import { TaskChip, useTaskOf } from '../plan/ui.tsx'
import { StartedAction } from './refs.ts'

interface Tree {
  /** Live tasks by owner task id. */
  children: Map<number, TaskGraphNode[]>
  /** Conversation-owned tasks by conversation id. */
  roots: Map<number, TaskGraphNode[]>
  summaries: Map<number, ConversationSummary>
  /** Tool names of the shown conversation's tool tasks. */
  tools: Map<number, string>
  /** When each task first ran, in wall-clock milliseconds. */
  started: Record<string, number>
  /** Feature tags of top-level conversations. */
  features: Map<number, string>
  now: number
}

function build(
  graph: TaskGraph | undefined,
  conversations: readonly ConversationSummary[],
  concluded: number[],
) {
  const hidden = hiddenConversationIds(conversations, concluded)
  const all = Object.values(graph?.tasks ?? {}).toSorted((a, b) => a.id - b.id)
  const hiddenTasks = new Set(
    all.filter((task) => hidden.has(task.conversationId)).map((task) => task.id),
  )
  let changed = true
  while (changed) {
    changed = false
    // Task ownership can arrive before the child's summary; child runs have no task owner.
    for (const task of all) {
      if (hidden.has(task.conversationId) || (task.owner != null && hiddenTasks.has(task.owner))) {
        if (!hiddenTasks.has(task.id)) {
          hiddenTasks.add(task.id)
          changed = true
        }
        for (const id of task.conversations) {
          if (!hidden.has(id)) {
            hidden.add(id)
            changed = true
          }
        }
      }
    }
    for (const conversation of conversations) {
      if (
        conversation.parentConversationId !== undefined &&
        hidden.has(conversation.parentConversationId) &&
        !hidden.has(conversation.id)
      ) {
        hidden.add(conversation.id)
        changed = true
      }
    }
  }
  const tasks = all
    .filter((task) => !hiddenTasks.has(task.id))
    .map((task) => ({
      ...task,
      conversations: task.conversations.filter((id) => !hidden.has(id)),
    }))
  const children = new Map<number, TaskGraphNode[]>()
  const roots = new Map<number, TaskGraphNode[]>()
  for (const task of tasks) {
    const [map, key] = task.owner == null ? [roots, task.conversationId] : [children, task.owner]
    map.set(key, [...(map.get(key) ?? []), task])
  }
  // Conversations a live task owns appear under that task; the rest are top-level.
  const owned = new Set<number>(tasks.flatMap((task) => task.conversations))
  const top = [...roots.keys()].filter((id) => !owned.has(id)).toSorted((a, b) => a - b)
  return {
    tasks,
    top,
    children,
    roots,
    summaries: new Map(conversations.map((summary) => [summary.id, summary])),
  }
}

function status(task: TaskGraphNode): {
  text: ReactNode
  tone?: string
  icon: 'running' | 'pending' | 'done' | 'interrupted'
} {
  const { state } = task
  if (task.blocked)
    return {
      text: `blocked · ${task.blocked.replaceAll('_', ' ')}`,
      icon: 'interrupted',
      tone: 'text-warning',
    }
  switch (state.status) {
    case 'pending':
      return { text: 'pending', icon: 'pending' }
    case 'running':
      return { text: state.phase, icon: 'running', tone: 'text-foreground/80' }
    case 'waiting':
      return {
        text: (
          <>
            {state.phase} · waiting on{' '}
            <span className="text-foreground/70">{state.on.map((id) => `#${id}`).join(' ')}</span>
            {state.on.length > 1 && (
              <span className="text-muted-foreground/60"> ({state.policy})</span>
            )}
          </>
        ),
        icon: 'pending',
      }
    case 'sleeping':
      return { text: `${state.phase} · sleeping`, icon: 'pending' }
    default:
      return {
        text: `completing → ${state.outcome}`,
        icon: state.outcome === 'completed' ? 'done' : 'interrupted',
      }
  }
}

/**
 * Where a row sits in the tree: its depth, and for each ancestor level whether a sibling follows below (its rail goes
 * on); `last` when no sibling follows this row.
 */
type Place = { depth: number; rails?: readonly boolean[]; last?: boolean }

const INDENT = 14
const EDGE = 12
/** The x of the icon's centre at `depth`, where its children's lines start. */
const axis = (depth: number) => EDGE + depth * INDENT + 6

/**
 * Dashed elbows from a parent's icon to each child's, with the rails of ancestors that have more children below: the
 * shape of the task graph, kept quieter and distinct from the sidebar's solid branch rails.
 */
function Guides({ depth, rails = [], last = true }: Place) {
  if (depth === 0) return null
  const line = 'pointer-events-none absolute border-muted-foreground/35 border-dashed'
  return (
    <span aria-hidden>
      {rails
        .slice(0, depth - 1)
        .map((on, level) =>
          on ? (
            <span
              className={cn(line, 'inset-y-0 border-l')}
              key={level}
              style={{ left: axis(level) }}
            />
          ) : null,
        )}
      <span
        className={cn(line, 'top-0 border-l', last ? 'h-1/2' : 'bottom-0')}
        style={{ left: axis(depth - 1) }}
      />
      <span
        className={cn(line, 'top-1/2 border-t')}
        style={{ left: axis(depth - 1), width: INDENT - 8 }}
      />
    </span>
  )
}

/** The places of a row's children, tasks then conversations, in order. */
const places = (count: number, { depth, rails = [], last = true }: Place) =>
  Array.from({ length: count }, (_, index) => ({
    depth: depth + 1,
    rails: [...rails.slice(0, depth - 1), ...(depth > 0 ? [!last] : [])],
    last: index === count - 1,
  }))

export function TaskRow({ task, tree, ...place }: { task: TaskGraphNode; tree: Tree } & Place) {
  const { text, tone, icon } = status(task)
  const kind = task.kind.replace(/^pi\./, '')
  const tool = tree.tools.get(task.id)
  const children = tree.children.get(task.id) ?? []
  const below = places(children.length + task.conversations.length, place)
  return (
    <>
      <div
        className="relative flex min-w-0 items-center gap-1.5 py-1.5 pr-3 font-mono text-[11.5px]"
        style={{ paddingLeft: EDGE + place.depth * INDENT }}
      >
        <Guides {...place} />
        <ToolStatusIcon className="size-3" state={icon} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-foreground/90">{tool ?? kind}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground/60">
            <span className="shrink-0">#{task.id}</span>
            <span className={cn('truncate', tone)}>{text}</span>
          </span>
        </span>
        {task.background && (
          <span className="shrink-0 rounded-sm border border-border/80 px-1 text-[10px] text-muted-foreground">
            bg
          </span>
        )}
        {tree.started[task.id] !== undefined && !task.blocked && (
          <span
            className={cn(
              'shrink-0 text-[10.5px] tabular-nums',
              tree.now - tree.started[task.id] >= 10 * 60_000
                ? 'text-warning'
                : 'text-muted-foreground/70',
            )}
            title={`Running since ${new Date(tree.started[task.id]).toLocaleString()}`}
          >
            {formatDuration(tree.now - tree.started[task.id])}
          </span>
        )}
        {task.abortRequested && (
          <span className="shrink-0 text-[10.5px] text-warning">aborting</span>
        )}
      </div>
      {children.map((child, index) => (
        <TaskRow key={child.id} task={child} tree={tree} {...below[index]} />
      ))}
      {task.conversations.map((id, index) => (
        <ConversationRow id={id} key={`c${id}`} tree={tree} {...below[children.length + index]} />
      ))}
    </>
  )
}

function ConversationRow({ id, tree, ...place }: { id: number; tree: Tree } & Place) {
  const { conversationId, switchConversation } = useUltimate()
  const summary = tree.summaries.get(id)
  const link = useTaskOf(id)
  const shown = conversationId === id
  const tasks = tree.roots.get(id) ?? []
  const below = places(tasks.length, place)
  return (
    <>
      <button
        className={cn(
          'relative flex w-full min-w-0 items-center gap-1.5 py-1.5 pr-3 text-left font-mono text-[11.5px] transition-colors hover:bg-accent/50',
          shown && 'bg-accent/60',
        )}
        onClick={() => switchConversation(id)}
        style={{ paddingLeft: EDGE + place.depth * INDENT }}
        title={shown ? 'Shown' : 'Show this conversation'}
        type="button"
      >
        <Guides {...place} />
        <MessageSquareIcon
          className={cn('size-3 shrink-0', shown ? 'text-brand' : 'text-muted-foreground')}
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {link && <TaskChip task={link} />}
            <span
              className="truncate font-sans text-[12px] text-foreground/90"
              title={summary?.title}
            >
              {summary?.title || summary?.label || 'Untitled conversation'}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground/60">
            {tree.features.get(id) && <FeatureTag feature={tree.features.get(id)!} />}
            <span className="shrink-0">#{id}</span>
            {summary?.workspace && (
              <GitBranchIcon
                aria-label="Isolated checkout"
                className="size-3 shrink-0 text-muted-foreground"
              />
            )}
          </span>
        </span>
      </button>
      {tasks.map((task, index) => (
        <TaskRow key={task.id} task={task} tree={tree} {...below[index]} />
      ))}
    </>
  )
}

function TasksPanel() {
  const graph = useTasks()
  const conversations = useConversations()
  const { live } = useConversation()
  const [concluded] = useUiState<number[]>('ext.conversations.concluded', [])
  const { tasks, top, ...rest } = build(graph, conversations, concluded)
  const overview = useOverview()
  const now = useNow(1000, tasks.length > 0)
  // A start time never changes, so only tasks without one yet are asked for.
  const [started, setStarted] = useState<Record<string, number>>({})
  const missing = tasks.map((task) => task.id).filter((id) => !(id in started))
  const { data } = useAction(StartedAction, { ids: missing }, { enabled: missing.length > 0 })
  useEffect(() => {
    if (data) setStarted((previous) => ({ ...previous, ...data }))
  }, [data])
  const tree: Tree = {
    ...rest,
    started,
    now,
    features: new Map(
      Object.entries(overview).flatMap(([id, row]) =>
        row.feature ? [[Number(id), row.feature]] : [],
      ),
    ),
    tools: new Map(
      (live.tools ?? []).flatMap((slot) =>
        slot.taskId === undefined ? [] : [[slot.taskId, slot.name]],
      ),
    ),
  }
  const busy = tasks.filter((task) => task.state.status === 'running' && !task.blocked).length
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 px-3 pb-2 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
        Task graph
        <span className="ml-auto tracking-normal normal-case text-muted-foreground/70">
          {tasks.length} live{busy > 0 && ` · ${busy} running`}
        </span>
      </div>
      {top.map((id) => (
        <ConversationRow depth={0} id={id} key={id} tree={tree} />
      ))}
      {tasks.length === 0 && (
        <div className="px-3 py-6 text-center font-mono text-[11.5px] text-muted-foreground/70">
          idle · no live tasks
        </div>
      )}
    </div>
  )
}

/** When run task `id` first ran, asked once per run, for the transcript's working clock. */
function useRunStart(id: number | undefined): number | undefined {
  const { data } = useAction(
    StartedAction,
    { ids: id === undefined ? [] : [id] },
    {
      enabled: id !== undefined,
    },
  )
  return id === undefined ? undefined : data?.[id]
}

export default defineWebExtension({
  provides: [provide(RunStart, useRunStart)],
  panels: [{ id: 'tasks', title: 'Tasks', icon: ListTreeIcon, component: TasksPanel, order: 1 }],
  commands: [
    {
      id: 'tasks.open',
      title: 'Show the task graph',
      run: (context) => context.openPanel('tasks'),
    },
  ],
})
