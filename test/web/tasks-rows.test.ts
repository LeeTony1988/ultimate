import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import type { ConversationId, TaskGraphNode, TaskId } from '@earendil-works/pi-durable'

vi.mock('@/sdk', () => ({
  cn: (...names: unknown[]) => names.filter(Boolean).join(' '),
  defineWebExtension: (extension: unknown) => extension,
  formatDuration: (ms: number) => `${ms}ms`,
  provide: () => ({}),
  RunStart: {},
  useAction: () => () => undefined,
  useConversation: () => undefined,
  useNow: () => 0,
  useTasks: () => undefined,
  useUltimate: () => ({ conversationId: undefined, switchConversation: () => undefined }),
  useUiState: () => ({}),
}))
vi.mock('@/components/ai/tool', () => ({
  ToolStatusIcon: ({ state }: { state: string }) => createElement('i', { 'data-state': state }),
}))
vi.mock('../../extensions/workspaces/ui.tsx', () => ({}))
vi.mock('../../extensions/conversations/ui.tsx', () => ({}))
vi.mock('../../extensions/plan/ui.tsx', () => ({}))
const { TaskRow } = await import('../../extensions/tasks/web.tsx')

const task = (blocked?: TaskGraphNode['blocked']): TaskGraphNode => ({
  id: 7 as TaskId,
  kind: 'pi.generation',
  conversationId: 3 as ConversationId,
  background: false,
  abortRequested: false,
  state: { status: 'running', phase: 'stream' },
  conversations: [],
  ...(blocked ? { blocked } : {}),
})
const tree = {
  children: new Map(),
  roots: new Map(),
  summaries: new Map(),
  tools: new Map(),
  started: {},
  features: new Map(),
  now: 0,
}
const row = (node: TaskGraphNode, depth = 0, rails: readonly boolean[] = [], last = true) =>
  renderToStaticMarkup(
    createElement(TaskRow, { task: node, tree, depth, rails, last }) as ReactNode,
  )

it('names a blocked reason without offering a Retry, since Pi ends a task cut off restartLimit times', () => {
  const html = row(task('missing_task'))
  expect(html).toContain('blocked · missing task')
  expect(html).not.toContain('data-retry')
  expect(html).toContain('data-state="interrupted"')
})

it('draws elbows to children, a rail past an ancestor with siblings below, and none at the top', () => {
  // A top row has no line above it; a middle row with siblings below runs full height; a last row is half height.
  expect(row(task(), 0, [], true)).not.toContain('border-dashed')
  const middle = row(task(), 1, [true], false)
  expect(middle).toContain('bottom-0')
  const lastChild = row(task(), 2, [true, true], true)
  expect(lastChild).toContain('h-1/2')
})
