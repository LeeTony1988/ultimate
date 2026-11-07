import type { TaskGraphNode } from '@earendil-works/pi-durable'
import { describe, expect, it } from 'vitest'
import {
  capTurnTasks,
  clusterAnchors,
  clusterBounds,
  conversationEdges,
  conversationNodes,
  crossClusterEdges,
  fitCamera,
  hueDistance,
  layoutConversationCluster,
  separateClusterNodes,
  taskHue,
  toolDetail,
  zoomAtPoint,
} from '../extensions/tasks/constellation.ts'
import type { ConstellationTurn } from '../extensions/tasks/constellation.ts'
import { mergeRunLive } from '../extensions/tasks/history.ts'
import type { RunTask } from '../extensions/tasks/history.ts'

const task = (value: Partial<RunTask> & Pick<RunTask, 'id'>): RunTask => ({
  conversationId: 1,
  kind: 'pi.tool',
  background: false,
  abortRequested: false,
  status: 'terminal',
  outcome: 'completed',
  ...value,
})

const run = (value: Partial<RunTask> & Pick<RunTask, 'id'>): RunTask =>
  task({ kind: 'pi.generation', status: 'terminal', outcome: 'completed', ...value })

const turn = (
  value: Partial<ConstellationTurn> & Pick<ConstellationTurn, 'runId'>,
): ConstellationTurn => ({
  startedAt: value.runId * 1000,
  outcome: 'completed',
  tasks: [],
  ...value,
})

const liveNode = (value: { id: number } & Record<string, unknown>): TaskGraphNode =>
  ({
    kind: 'pi.tool',
    conversationId: 1,
    background: false,
    abortRequested: false,
    state: { status: 'running', phase: 'call' },
    conversations: [],
    ...value,
  }) as unknown as TaskGraphNode

describe('conversation clusters', () => {
  it('puts every selected conversation in its own cluster with one root', () => {
    const first = conversationNodes(1, [
      turn({ runId: 1, tasks: [run({ id: 10 }), task({ id: 11 })] }),
    ])
    const second = conversationNodes(2, [
      turn({ runId: 2, tasks: [task({ id: 20, conversationId: 2 })] }),
    ])
    expect(first.nodes.filter((node) => node.type === 'root')).toHaveLength(1)
    expect(first.nodes.every((node) => node.cluster === 1)).toBe(true)
    expect(second.nodes.every((node) => node.cluster === 2)).toBe(true)
    const edges = [
      ...conversationEdges(1, [turn({ runId: 1, tasks: [task({ id: 11 })] })]),
      ...conversationEdges(2, [turn({ runId: 2, tasks: [task({ id: 20, conversationId: 2 })] })]),
    ]
    expect(crossClusterEdges(edges, [...first.nodes, ...second.nodes])).toEqual([])
  })

  it('starts each turn from the shared root and never links two turns', () => {
    const turns = [
      turn({ runId: 1, tasks: [task({ id: 11 }), task({ id: 12 })] }),
      turn({ runId: 2, tasks: [task({ id: 21 }), task({ id: 22 })] }),
    ]
    const { nodes } = conversationNodes(1, turns)
    const edges = conversationEdges(1, turns)
    const root = nodes.find((node) => node.type === 'root')!
    const firstTurn = nodes.filter((node) => node.turn === 0).toSorted((a, b) => a.order - b.order)
    const secondTurn = nodes.filter((node) => node.turn === 1).toSorted((a, b) => a.order - b.order)
    expect(edges.filter((edge) => edge.kind === 'turn')).toEqual([
      { from: root.id, to: firstTurn[0].id, kind: 'turn', cluster: 1 },
      { from: root.id, to: secondTurn[0].id, kind: 'turn', cluster: 1 },
    ])
    expect(
      edges.some(
        (edge) =>
          firstTurn.some((node) => node.id === edge.from) &&
          secondTurn.some((node) => node.id === edge.to),
      ),
    ).toBe(false)
    expect(edges.filter((edge) => edge.kind === 'sequence')).toHaveLength(2)
  })

  it('hides generations and compaction from the visible dots', () => {
    const turns = [
      turn({
        runId: 1,
        tasks: [
          run({ id: 10 }),
          task({ id: 11, kind: 'pi.compaction' }),
          task({ id: 12, facts: { tool: 'read' }, detail: '{"path":"a.ts"}' }),
        ],
      }),
    ]
    const { nodes } = conversationNodes(1, turns)
    expect(nodes.some((node) => node.id === 10 || node.id === 11)).toBe(false)
    expect(nodes.find((node) => node.id === 12)?.label).toBe('read · a.ts')
  })

  it('labels tools from facts and task detail, not from internal kinds', () => {
    const turns = [
      turn({
        runId: 1,
        tasks: [
          task({
            id: 11,
            kind: 'pi.tool',
            facts: { tool: 'powershell', detail: '{"command":"npm test"}' },
            detail: '{"command":"npm test"}',
          }),
          task({
            id: 12,
            kind: 'pi.tool',
            facts: { tool: 'read' },
            detail: '{"path":"extensions/tasks/graph.tsx"}',
          }),
          task({
            id: 13,
            kind: 'ultimate.subagent-anchor',
            facts: { conversation: 42 },
          }),
        ],
      }),
    ]
    const labels = conversationNodes(1, turns).nodes.map((node) => node.label)
    expect(labels).toEqual([
      'conversation root',
      'powershell · npm test',
      'read · extensions/tasks/graph.tsx',
      'subagent · #42',
    ])
    expect(labels.some((label) => label.startsWith('generation'))).toBe(false)
  })

  it('creates a labelled turn dot when a turn has no visible tools', () => {
    const turns = [turn({ runId: 1, label: 'turn · 14:30', tasks: [run({ id: 10 })] })]
    const { nodes } = conversationNodes(1, turns)
    expect(nodes).toHaveLength(2)
    expect(nodes[1]).toMatchObject({ type: 'turn', label: 'turn · 14:30' })
  })

  it('keeps the head and tail of an oversized turn', () => {
    const tasks = Array.from({ length: 10 }, (_, index) => task({ id: index + 1 }))
    const capped = capTurnTasks(tasks, 4)
    expect(capped.tasks.map((item) => item.id)).toEqual([1, 2, 3, 10])
    expect(capped.omitted).toBe(6)
  })
})

describe('conversation layout', () => {
  it('is deterministic and puts the root at the centre of every turn fan', () => {
    const turns = [
      turn({ runId: 1, tasks: [task({ id: 11 }), task({ id: 12 }), task({ id: 13 })] }),
      turn({ runId: 2, tasks: [task({ id: 21 }), task({ id: 22 })] }),
      turn({ runId: 3, tasks: [task({ id: 31 })] }),
    ]
    const { nodes } = conversationNodes(1, turns)
    const first = layoutConversationCluster(nodes, { clustering: 0.7 })
    const second = layoutConversationCluster(nodes, { clustering: 0.7 })
    expect(first.map((node) => [node.id, node.x, node.y])).toEqual(
      second.map((node) => [node.id, node.x, node.y]),
    )
    const root = first.find((node) => node.type === 'root')!
    expect([root.x, root.y]).toEqual([0, 0])
    for (const turnIndex of [0, 1, 2]) {
      const line = first
        .filter((node) => node.turn === turnIndex)
        .toSorted((a, b) => a.order - b.order)
      expect(line.length).toBeGreaterThan(0)
      expect(Math.hypot(line[0].x, line[0].y)).toBeGreaterThan(0)
    }
  })

  it('separates dots of different clusters even when their halos overlap', () => {
    const one = conversationNodes(1, [turn({ runId: 1, tasks: [task({ id: 11 })] })])
    const two = conversationNodes(2, [
      turn({ runId: 2, tasks: [task({ id: 21, conversationId: 2 })] }),
    ])
    const first = layoutConversationCluster(one.nodes)
    const second = layoutConversationCluster(two.nodes)
    const separated = separateClusterNodes([
      { cluster: 1, anchor: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, nodes: first },
      { cluster: 2, anchor: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, nodes: second },
    ])
    const all = [...separated.get(1)!, ...separated.get(2)!]
    for (let a = 0; a < all.length; a += 1)
      for (let b = a + 1; b < all.length; b += 1)
        expect(Math.hypot(all[a].x - all[b].x, all[a].y - all[b].y)).toBeGreaterThanOrEqual(
          all[a].r + all[b].r - 0.001,
        )
  })
})

describe('constellation camera and palette', () => {
  it('gives every task a hue at least 60° from every other task up to six', () => {
    for (let count = 2; count <= 6; count += 1)
      for (let a = 0; a < count; a += 1)
        for (let b = a + 1; b < count; b += 1)
          expect(hueDistance(taskHue(a, count), taskHue(b, count))).toBeGreaterThanOrEqual(60)
  })

  it('puts neighbouring anchors exactly 2R(1−overlap) apart', () => {
    const radius = 180
    for (const count of [2, 3, 4, 5, 6]) {
      for (const overlap of [0, 0.3, 0.6]) {
        const anchors = clusterAnchors(count, radius, overlap)
        const wanted = 2 * radius * (1 - overlap)
        for (let index = 0; index < anchors.length; index += 1) {
          const next = anchors[(index + 1) % anchors.length]
          expect(Math.hypot(anchors[index].x - next.x, anchors[index].y - next.y)).toBeCloseTo(
            wanted,
            6,
          )
        }
      }
    }
    expect(clusterAnchors(1)).toEqual([{ x: 0, y: 0 }])
  })

  it('fits the cluster bounds and keeps the wheel anchor fixed', () => {
    const bounds = clusterBounds(3, 180, 0.3)
    const camera = fitCamera(bounds, 900, 700)
    expect(camera.zoom).toBeGreaterThanOrEqual(0.32)
    expect(camera.zoom).toBeLessThanOrEqual(1.5)
    const zoomed = zoomAtPoint(camera, 400, 300, 1.5)
    expect((400 - zoomed.x) / zoomed.zoom).toBeCloseTo((400 - camera.x) / camera.zoom, 6)
    expect((300 - zoomed.y) / zoomed.zoom).toBeCloseTo((300 - camera.y) / camera.zoom, 6)
  })
})

describe('tool detail formatting', () => {
  it('reads useful argument fields and keeps plain text', () => {
    expect(toolDetail('{"command":"npm test"}')).toBe('npm test')
    expect(toolDetail('{"path":"extensions/tasks/graph.tsx"}')).toBe('extensions/tasks/graph.tsx')
    expect(toolDetail('plain argument')).toBe('plain argument')
  })
})

describe('snapshot and live turns', () => {
  it('leaves a snapshot untouched and adds only a live run’s own nodes', () => {
    const stored = [run({ id: 10 }), task({ id: 11, owner: 10 })]
    expect(mergeRunLive(stored, [], [])).toEqual(stored)
    const live = [liveNode({ id: 12, owner: 11 }), liveNode({ id: 30, owner: 99 })]
    expect(mergeRunLive(stored, live, [10]).map((item) => item.id)).toEqual([10, 11, 12])
  })
})
