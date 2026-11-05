import { expect, it } from 'vitest'
import type { ConversationId, TaskGraphNode, TaskId } from '@earendil-works/pi-durable'
import {
  edgesOf,
  layout,
  NODE_HEIGHT,
  NODE_WIDTH,
  COLUMN_GAP,
} from '../../extensions/tasks/layout.ts'

const task = (
  id: number,
  overrides: {
    conversationId?: number
    owner?: TaskId
    kind?: string
    background?: boolean
    state?: TaskGraphNode['state']
  } = {},
): TaskGraphNode => ({
  id: id as TaskId,
  kind: overrides.kind ?? 'pi.generation',
  conversationId: (overrides.conversationId ?? 1) as ConversationId,
  background: overrides.background ?? false,
  abortRequested: false,
  state: overrides.state ?? { status: 'running', phase: 'run' },
  conversations: [],
  ...(overrides.owner === undefined ? {} : { owner: overrides.owner }),
})

it('keeps one wait edge when a task owns the same task it waits on', () => {
  const generation = task(2, {
    state: { status: 'waiting', phase: 'tools', on: [1 as TaskId], policy: 'allSettled' },
  })
  const tool = task(1, { kind: 'pi.tool', owner: 2 as TaskId })
  expect(edgesOf([generation, tool])).toEqual([{ from: 1, to: 2, kind: 'wait' }])
})

it('places owner chains left to right and puts a wait one column further', () => {
  const a = task(1)
  const b = task(2, { owner: 1 as TaskId })
  const c = task(3, { owner: 2 as TaskId })
  const d = task(4, {
    owner: 1 as TaskId,
    state: { status: 'waiting', phase: 'next', on: [3 as TaskId], policy: 'allSettled' },
  })
  const drawing = layout([a, b, c, d])
  const node = (id: number) => drawing.nodes.find((entry) => entry.task.id === id)!
  expect(node(1).column).toBe(0)
  expect(node(2).column).toBe(1)
  expect(node(3).column).toBe(2)
  expect(node(4).column).toBe(3)
  expect(node(1).x).toBe(0)
  expect(node(2).x).toBe(NODE_WIDTH + COLUMN_GAP)
  expect(drawing.width).toBe(4 * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP)
})

it('puts a running conversation band before an idle one', () => {
  const drawing = layout([
    task(1, { conversationId: 9, state: { status: 'pending', phase: 'wait' } }),
    task(2, { conversationId: 4 }),
  ])
  expect(drawing.bands.map((band) => band.conversation)).toEqual([4, 9])
})

it('survives a wait cycle without dropping the nodes', () => {
  const one = task(1, {
    state: { status: 'waiting', phase: 'a', on: [2 as TaskId], policy: 'allSettled' },
  })
  const two = task(2, {
    state: { status: 'waiting', phase: 'b', on: [1 as TaskId], policy: 'allSettled' },
  })
  const drawing = layout([one, two])
  expect(drawing.nodes).toHaveLength(2)
  expect(drawing.edges).toEqual([])
})

it('keeps a wide, many-node graph bounded by its real columns and rows', () => {
  const tasks: TaskGraphNode[] = []
  for (let root = 0; root < 12; root++) {
    let owner: TaskId | undefined
    for (let depth = 0; depth < 5; depth++) {
      const id = root * 5 + depth + 1
      tasks.push(task(id, owner === undefined ? {} : { owner }))
      owner = id as TaskId
    }
  }
  const drawing = layout(tasks)
  expect(drawing.nodes).toHaveLength(60)
  expect(drawing.columns).toBe(5)
  expect(drawing.width).toBe(5 * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP)
  expect(drawing.height).toBeGreaterThan(12 * NODE_HEIGHT)
})
