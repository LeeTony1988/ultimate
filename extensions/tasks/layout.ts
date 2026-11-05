/**
 * The task DAG's geometry: dependency edges (owner and `on` waits), conversation bands, and a layered column per task.
 * Pure, so the surface only positions what this returns and the layout is testable without a DOM.
 */
import type { TaskGraphNode } from '@earendil-works/pi-durable'

/** A card in the DAG. */
export const NODE_WIDTH = 192
export const NODE_HEIGHT = 38
/** Space between columns, rows and conversation bands. */
export const COLUMN_GAP = 44
export const ROW_GAP = 10
export const BAND_GAP = 26
export const BAND_HEADER = 26

export type EdgeKind = 'owner' | 'wait'
export type DagEdge = { from: number; to: number; kind: EdgeKind }
export type DagNode = { task: TaskGraphNode; band: number; column: number; x: number; y: number }
export type DagBand = {
  conversation: number
  tasks: TaskGraphNode[]
  y: number
  height: number
  columns: number
}
export type DagLayout = {
  nodes: DagNode[]
  edges: DagEdge[]
  bands: DagBand[]
  width: number
  height: number
  columns: number
}

/** Edges point in execution order: a blocker or owner first, the task that runs after it second. */
export function edgesOf(tasks: readonly TaskGraphNode[]): DagEdge[] {
  const known = new Set<number>(tasks.map((task) => task.id))
  const edges = new Map<string, DagEdge>()
  const pairs = new Set<string>()
  const pair = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  const add = (edge: DagEdge, rememberPair = false) => {
    if (edge.from === edge.to || !known.has(edge.from) || !known.has(edge.to)) return
    edges.set(`${edge.from}:${edge.to}`, edge)
    if (rememberPair) pairs.add(pair(edge.from, edge.to))
  }
  // A wait edge replaces the owner edge between the same pair: the child blocks the parent that owns it.
  for (const task of tasks)
    if (task.state.status === 'waiting')
      for (const id of task.state.on) add({ from: id, to: task.id, kind: 'wait' }, true)
  for (const task of tasks)
    if (task.owner !== undefined && !pairs.has(pair(task.owner, task.id)))
      add({ from: task.owner, to: task.id, kind: 'owner' })
  return [...edges.values()]
}

/** Running bands first, then waiting and sleeping ones, then the rest; the project's own chores last. */
function bandRank(tasks: readonly TaskGraphNode[]) {
  if (tasks.some((task) => task.state.status === 'running' && !task.background)) return 0
  if (tasks.some((task) => task.state.status === 'waiting')) return 1
  if (tasks.some((task) => task.state.status === 'sleeping')) return 2
  if (tasks.some((task) => task.state.status === 'running')) return 3
  return 4
}

/** Longest-path depths over the acyclic part of `edges`; a cycle keeps its nodes at depth 0 instead of failing. */
function depths(tasks: readonly TaskGraphNode[], edges: readonly DagEdge[]) {
  const ids = tasks.map((task) => task.id).toSorted((a, b) => a - b)
  const depth = new Map<number, number>(ids.map((id) => [id, 0]))
  const out = new Map<number, DagEdge[]>(ids.map((id) => [id, []]))
  const indegree = new Map<number, number>(ids.map((id) => [id, 0]))
  for (const edge of edges) {
    out.get(edge.from)!.push(edge)
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }
  const queue = ids.filter((id) => indegree.get(id) === 0)
  const placed = new Set<number>()
  while (queue.length > 0) {
    const id = queue.shift()!
    placed.add(id)
    for (const edge of out.get(id)!) {
      depth.set(edge.to, Math.max(depth.get(edge.to)!, depth.get(id)! + 1))
      const left = indegree.get(edge.to)! - 1
      indegree.set(edge.to, left)
      if (left === 0) queue.push(edge.to)
    }
  }
  // A cycle has no source. Keep its nodes (and their outgoing edges) readable at the shallowest column.
  const kept = edges.filter((edge) => placed.has(edge.from) && placed.has(edge.to))
  return { depth, edges: kept }
}

/** The task graph as conversation bands of layered columns, with absolute card positions. */
export function layout(
  tasks: readonly TaskGraphNode[],
  started: Readonly<Record<string, number>> = {},
): DagLayout {
  const { depth, edges } = depths(tasks, edgesOf(tasks))
  const byConversation = new Map<number, TaskGraphNode[]>()
  for (const task of tasks) {
    const list = byConversation.get(task.conversationId) ?? []
    list.push(task)
    byConversation.set(task.conversationId, list)
  }
  const bands = [...byConversation.entries()]
    .map(([conversation, bandTasks]) => ({ conversation, tasks: bandTasks }))
    .toSorted((a, b) => bandRank(a.tasks) - bandRank(b.tasks) || a.conversation - b.conversation)

  const nodes: DagNode[] = []
  const placedBands: DagBand[] = []
  let y = 0
  let columns = 0
  for (const [index, band] of bands.entries()) {
    const min = Math.min(...band.tasks.map((task) => depth.get(task.id)!))
    const byColumn = new Map<number, TaskGraphNode[]>()
    for (const task of band.tasks) {
      const column = depth.get(task.id)! - min
      columns = Math.max(columns, column + 1)
      const list = byColumn.get(column) ?? []
      list.push(task)
      byColumn.set(column, list)
    }
    let height = BAND_HEADER
    for (const [column, list] of byColumn) {
      list.sort(
        (a, b) =>
          (started[a.id] ?? Number.MAX_SAFE_INTEGER) - (started[b.id] ?? Number.MAX_SAFE_INTEGER) ||
          a.id - b.id,
      )
      list.forEach((task, row) => {
        nodes.push({
          task,
          band: index,
          column,
          x: column * (NODE_WIDTH + COLUMN_GAP),
          y: y + BAND_HEADER + row * (NODE_HEIGHT + ROW_GAP),
        })
        height = Math.max(height, BAND_HEADER + (row + 1) * (NODE_HEIGHT + ROW_GAP) - ROW_GAP)
      })
    }
    placedBands.push({ ...band, y, height, columns: byColumn.size })
    y += height + BAND_GAP
  }
  return {
    nodes,
    edges,
    bands: placedBands,
    width: columns === 0 ? 0 : columns * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP,
    height: placedBands.length === 0 ? 0 : y - BAND_GAP,
    columns,
  }
}
