/** The task panel's model, shared by its list and DAG views: the filtered live tree and the words for a task's state. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAction } from '@/sdk'
import type { TaskGraph, TaskGraphNode } from '@/sdk'
import type { WorkspaceConversation as ConversationSummary } from '../workspaces/ui.tsx'
import { hiddenConversationIds } from '../conversations/ui.tsx'
import type { Meaning } from './kinds.ts'

export interface Tree {
  /** Live tasks by owner task id. */
  children: Map<number, TaskGraphNode[]>
  /** Conversation-owned running work by conversation id: the tree the Running group draws. */
  roots: Map<number, TaskGraphNode[]>
  summaries: Map<number, ConversationSummary>
  /** When each task first ran, in wall-clock milliseconds. */
  started: Record<string, number>
  /** What each task means, by task id. */
  meanings: Map<number, Meaning>
  /** Feature tags of top-level conversations. */
  features: Map<number, string>
  now: number
}

export function build(
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

export function status(task: TaskGraphNode): {
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

/** Facts a value never changes for, asked once per id: start times, what a task's input says. */
export function useOnce<T>(
  ref: Parameters<typeof useAction<{ ids: number[] }, Record<string, T>>>[0],
  ids: number[],
) {
  const [known, setKnown] = useState<Record<string, T>>({})
  const missing = ids.filter((id) => !(id in known))
  const { data } = useAction(ref, { ids: missing }, { enabled: missing.length > 0 })
  useEffect(() => {
    if (data) setKnown((previous) => ({ ...previous, ...data }))
  }, [data])
  return known
}
