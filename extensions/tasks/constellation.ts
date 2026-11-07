/**
 * The Constellation view's model: a conversation is one cluster, every turn is an independent star chain of meaningful
 * task steps, and only those steps become visible dots. Pure, so the surface only draws what this returns and every
 * rule (no cross-cluster edge, hidden generations, tool labels) is testable without a DOM.
 */
import { failed } from './history.ts'
import type { RunTask } from './history.ts'

/** A cluster's world radius; anchors and halos share it so overlap is predictable. */
export const CLUSTER_RADIUS = 180
/** A single turn's visible dots cap; a longer turn keeps its head and tail and reports the omitted middle. */
export const MAX_TURN_NODES = 6

export type ConstellationNodeType = 'tool' | 'subagent' | 'wait' | 'turn'
export type ConstellationStatus = 'pending' | 'running' | 'waiting' | 'done' | 'failed'

export type ConstellationNode = {
  id: number
  /** The conversation this node belongs to; edges may never join two different values. */
  cluster: number
  type: ConstellationNodeType
  status: ConstellationStatus
  label: string
  r: number
  /** The turn index inside the cluster; every visible node belongs to one turn. */
  turn: number
  /** Position along its turn's chain. */
  order: number
  startedAt?: number
  endedAt?: number
}

export type ConstellationEdge = {
  from: number
  to: number
  kind: 'sequence'
  /** The conversation both endpoints belong to. */
  cluster: number
}

export type ConstellationTurn = {
  runId: number
  startedAt: number
  endedAt?: number
  /** A run's outcome; `running` while the turn is live. */
  outcome?: string
  tasks: readonly RunTask[]
  /** A short label for a turn with no visible tool calls. */
  label?: string
}

export type LaidNode = ConstellationNode & { x: number; y: number }
export type ClusterAnchor = { x: number; y: number }
export type Bounds = { x: number; y: number; width: number; height: number }
export type Camera = { x: number; y: number; zoom: number }

/** How a task reads as a dot: waiting and sleeping tasks are waits, terminal failures keep their own ring. */
export function constellationStatus(task: RunTask): ConstellationStatus {
  if (task.status === 'waiting' || task.status === 'sleeping') return 'waiting'
  if (task.status === 'pending') return 'pending'
  if (task.status === 'running' || task.status === 'completing') return 'running'
  return failed(task) ? 'failed' : 'done'
}

/**
 * Generation and compaction are internal turn boundaries, never visible dots. Every other task kind is a real step
 * the user asked for: a tool call, a subagent, a wait, a delivery.
 */
export function isVisibleTask(task: RunTask): boolean {
  return task.kind !== 'pi.generation' && task.kind !== 'pi.compaction'
}

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

/** A tool argument's useful part: `{"command":"npm test"}` reads as `npm test`, not JSON. */
export function toolDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined
  const text = detail.trim()
  if (text.startsWith('{')) {
    try {
      const value = JSON.parse(text) as Record<string, unknown>
      for (const key of [
        'command',
        'cmd',
        'path',
        'file',
        'pattern',
        'query',
        'url',
        'description',
        'task',
        'prompt',
      ]) {
        const found = value[key]
        if (typeof found === 'string' && found.trim()) return truncate(found.trim(), 42)
      }
    } catch {
      // Not JSON: show the original text rather than losing the only detail the task has.
    }
  }
  return truncate(text, 42)
}

/** The phrase a dot shows on hover; dots themselves never carry text. */
export function nodeLabel(task: RunTask): string {
  if (task.kind === 'ultimate.subagent-anchor') {
    const conversation = task.facts?.conversation
    return conversation === undefined ? 'subagent' : `subagent · #${conversation}`
  }
  const name = task.facts?.tool ?? task.tool ?? task.kind.replace(/^pi\./, '')
  const detail = toolDetail(
    task.facts?.detail ?? task.detail ?? (task.kind === 'pi.tool' ? undefined : task.phase),
  )
  return detail ? `${name} · ${detail}` : name
}

const radiusOf = (type: ConstellationNodeType, status: ConstellationStatus) => {
  const base =
    type === 'turn'
      ? 8
      : type === 'subagent'
        ? 8.5
        : type === 'tool'
          ? 5.8
          : type === 'wait'
            ? 6.3
            : 7
  return base + (status === 'running' ? 2 : status === 'pending' ? -0.4 : 0)
}

const turnStatus = (turn: ConstellationTurn): ConstellationStatus => {
  if (turn.outcome === 'running') return 'running'
  if (
    turn.outcome === 'failed' ||
    turn.outcome === 'faulted' ||
    turn.outcome === 'orphaned' ||
    turn.outcome === 'aborted'
  )
    return 'failed'
  return 'done'
}

/** The synthetic dot of a turn with no visible tool calls. */
export const turnNodeId = (conversationId: number, turnIndex: number) =>
  -(1_000_000 + conversationId * 1000 + turnIndex)

/** Keep a turn's head and tail when it exceeds the dot budget; the removed middle is reported, never silently lost. */
export function capTurnTasks(
  tasks: readonly RunTask[],
  cap = MAX_TURN_NODES,
): { tasks: RunTask[]; omitted: number } {
  const sorted = tasks.toSorted(
    (a, b) => (a.startedAt ?? a.id) - (b.startedAt ?? b.id) || a.id - b.id,
  )
  if (sorted.length <= cap) return { tasks: sorted, omitted: 0 }
  const head = Math.ceil(cap * 0.6)
  const tail = cap - head
  return {
    tasks: [...sorted.slice(0, head), ...sorted.slice(Math.max(head, sorted.length - tail))],
    omitted: sorted.length - cap,
  }
}

/**
 * A conversation's dots: one independent chain of visible tool/subagent steps per turn. Turns carry the run's
 * start time so a no-tool turn still has a labelled dot; generation and compaction tasks never appear. There is no
 * shared conversation root; a turn with no visible tasks is a one-dot chain.
 */
export function conversationNodes(
  conversationId: number,
  turns: readonly ConstellationTurn[],
): { nodes: ConstellationNode[]; omitted: number } {
  const nodes: ConstellationNode[] = []
  let omitted = 0
  turns.forEach((turn, turnIndex) => {
    const visible = turn.tasks
      .filter(isVisibleTask)
      .toSorted((a, b) => (a.startedAt ?? a.id) - (b.startedAt ?? b.id) || a.id - b.id)
    const capped = capTurnTasks(visible)
    omitted += capped.omitted
    if (capped.tasks.length === 0) {
      const status = turnStatus(turn)
      nodes.push({
        id: turnNodeId(conversationId, turnIndex),
        cluster: conversationId,
        type: 'turn',
        status,
        label: turn.label ?? 'turn',
        r: radiusOf('turn', status),
        turn: turnIndex,
        order: 0,
        startedAt: turn.startedAt,
        ...(turn.endedAt === undefined ? {} : { endedAt: turn.endedAt }),
      })
      return
    }
    capped.tasks.forEach((task, order) => {
      const status = constellationStatus(task)
      const type: ConstellationNodeType =
        status === 'waiting'
          ? 'wait'
          : task.kind === 'ultimate.subagent-anchor'
            ? 'subagent'
            : 'tool'
      nodes.push({
        id: task.id,
        cluster: conversationId,
        type,
        status,
        label: nodeLabel(task),
        r: radiusOf(type, status),
        turn: turnIndex,
        order,
        ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
        ...(task.endedAt === undefined ? {} : { endedAt: task.endedAt }),
      })
    })
  })
  return { nodes, omitted }
}

/**
 * The edges inside a conversation cluster: a sequence chain within each turn. Turns never share a root and never
 * link to one another.
 */
export function conversationEdges(
  conversationId: number,
  turns: readonly ConstellationTurn[],
): ConstellationEdge[] {
  const { nodes } = conversationNodes(conversationId, turns)
  const byTurn = new Map<number, ConstellationNode[]>()
  for (const node of nodes) {
    byTurn.set(node.turn, [...(byTurn.get(node.turn) ?? []), node])
  }
  const edges: ConstellationEdge[] = []
  for (const [, list] of [...byTurn.entries()].toSorted(([a], [b]) => a - b)) {
    const ordered = list.toSorted((a, b) => a.order - b.order)
    for (let index = 1; index < ordered.length; index += 1)
      edges.push({
        from: ordered[index - 1].id,
        to: ordered[index].id,
        kind: 'sequence',
        cluster: conversationId,
      })
  }
  return edges
}

/** Edges whose two endpoints sit in the same cluster; a missing endpoint is dropped too. */
export function withinCluster(
  edges: readonly ConstellationEdge[],
  nodes: readonly ConstellationNode[],
): ConstellationEdge[] {
  const clusterOf = new Map(nodes.map((node) => [node.id, node.cluster]))
  return edges.filter(
    (edge) => clusterOf.get(edge.from) === edge.cluster && clusterOf.get(edge.to) === edge.cluster,
  )
}

/** The inverse guard: every edge that would join two clusters, for a test to prove there are none. */
export function crossClusterEdges(
  edges: readonly ConstellationEdge[],
  nodes: readonly ConstellationNode[],
): ConstellationEdge[] {
  return edges.filter((edge) => !withinCluster([edge], nodes).length)
}

/** The hue distance in degrees, 0–180. */
export function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360
  return Math.min(distance, 360 - distance)
}

/**
 * Task hues on a rainbow rotation. Up to six tasks are evenly spaced from the design's cyan anchor, so every pair is
 * at least 60° apart; beyond six the golden angle keeps neighbours as far apart as the wheel allows.
 */
export function taskHue(index: number, count: number): number {
  if (count <= 1) return 188
  if (count <= 6) return (188 + (index * 360) / count) % 360
  return (188 + index * 137.508) % 360
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/**
 * Cluster anchors on a ring. If `d` is the centre distance, `d = 2R(1 − overlap)`: the overlap slider therefore sets
 * exactly how much neighbouring halos share. Three clusters sit in a triangle; the rest start at the top.
 */
export function clusterAnchors(
  count: number,
  radius = CLUSTER_RADIUS,
  overlap = 0.3,
): ClusterAnchor[] {
  if (count <= 0) return []
  if (count === 1) return [{ x: 0, y: 0 }]
  const ring = (radius * (1 - clamp(overlap, 0, 0.6))) / Math.sin(Math.PI / count)
  return Array.from({ length: count }, (_, index) => {
    const degrees = count === 3 ? -150 + index * 120 : -90 + (index * 360) / count
    const angle = (degrees * Math.PI) / 180
    return { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring }
  })
}

/** World bounds of every cluster anchor plus its halo, including drag offsets. */
export function clusterBounds(
  count: number,
  radius = CLUSTER_RADIUS,
  overlap = 0.3,
  offsets: Readonly<Record<number, ClusterAnchor>> = {},
): Bounds {
  if (count <= 0) return { x: -160, y: -120, width: 320, height: 240 }
  const anchors = clusterAnchors(count, radius, overlap)
  const reach = radius * 1.06
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  anchors.forEach((anchor, index) => {
    const offset = offsets[index]
    const x = anchor.x + (offset?.x ?? 0)
    const y = anchor.y + (offset?.y ?? 0)
    minX = Math.min(minX, x - reach)
    minY = Math.min(minY, y - reach)
    maxX = Math.max(maxX, x + reach)
    maxY = Math.max(maxY, y + reach)
  })
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** A camera that fits `bounds` inside a viewport, with a little air and the 0.32–2.6 zoom range. */
export function fitCamera(bounds: Bounds, width: number, height: number, padding = 28): Camera {
  const zoom = clamp(
    Math.min((width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height) * 0.94,
    0.32,
    1.5,
  )
  return {
    zoom,
    x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
  }
}

/** Zoom around a screen point: the world point under the cursor stays put. */
export function zoomAtPoint(
  camera: Camera,
  screenX: number,
  screenY: number,
  factor: number,
): Camera {
  const zoom = clamp(camera.zoom * factor, 0.32, 2.6)
  const worldX = (screenX - camera.x) / camera.zoom
  const worldY = (screenY - camera.y) / camera.zoom
  return { zoom, x: screenX - worldX * zoom, y: screenY - worldY * zoom }
}

/** A deterministic 0–1 hash, so scattered positions never change between renders. */
const hash01 = (value: number) => {
  const noise = Math.sin(value * 12.9898 + 78.233) * 43758.5453
  return noise - Math.floor(noise)
}

/**
 * Each turn is an independent star chain. Chain centres follow a sunflower scatter (the golden angle, not a ring),
 * each chain has its own direction and gentle bend, and a small force pass keeps neighbours apart and edge lengths
 * even. Chains can therefore float independently and cross one another without sharing an origin. `clustering`
 * tightens the scatter toward the cluster centre.
 */
export function layoutConversationCluster(
  nodes: readonly ConstellationNode[],
  options: { radius?: number; clustering?: number } = {},
): LaidNode[] {
  if (nodes.length === 0) return []
  const radius = options.radius ?? CLUSTER_RADIUS
  const clustering = clamp(options.clustering ?? 0.72, 0, 1)
  const turns = [
    ...new Set(nodes.filter((node) => node.turn >= 0).map((node) => node.turn)),
  ].toSorted((a, b) => a - b)
  const lists = turns
    .map((turn) => nodes.filter((node) => node.turn === turn).toSorted((a, b) => a.order - b.order))
    .filter((list) => list.length > 0)
  const centreRadius = radius * (0.3 + (1 - clustering) * 0.35)
  const spacing = 24 + (1 - clustering) * 8
  const chains = lists.map((list, index) => {
    const angle = index * 2.399963229728653 + (hash01(index + 1) - 0.5) * 1.6
    const distance =
      centreRadius * Math.sqrt((index + 0.5) / lists.length) * (0.72 + hash01(index + 7) * 0.56)
    return {
      list,
      direction: hash01(index + 17) * Math.PI * 2,
      bend: (hash01(index + 31) - 0.5) * 24,
      spacing,
      centre: {
        x: Math.cos(angle) * distance + (hash01(index + 43) - 0.5) * radius * 0.14,
        y: Math.sin(angle) * distance + (hash01(index + 59) - 0.5) * radius * 0.14,
      },
    }
  })
  const points = nodes.map((node) => {
    const chain = chains.find((candidate) => candidate.list[0].turn === node.turn)!
    const last = chain.list.length - 1
    const fraction = last === 0 ? 0 : node.order / last
    const along = chain.spacing * (node.order - last / 2)
    const bend = Math.sin(fraction * Math.PI) * chain.bend
    return {
      node,
      anchor: chain.centre,
      x: chain.centre.x + Math.cos(chain.direction) * along - Math.sin(chain.direction) * bend,
      y: chain.centre.y + Math.sin(chain.direction) * along + Math.cos(chain.direction) * bend,
    }
  })
  const pointById = new Map(points.map((point) => [point.node.id, point]))
  const edges = chains.flatMap((chain) =>
    chain.list.slice(1).map((node, index) => ({
      from: pointById.get(chain.list[index].id)!,
      to: pointById.get(node.id)!,
      spacing: chain.spacing,
    })),
  )
  const passes = 48
  const limit = radius * 0.94
  for (let pass = 0; pass < passes; pass += 1) {
    const strength = 0.5 * (1 - pass / passes)
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const one = points[a]
        const two = points[b]
        const dx = two.x - one.x
        const dy = two.y - one.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.001
        const minimum = one.node.r + two.node.r + 6
        if (distance >= minimum) continue
        const push = ((minimum - distance) / distance) * strength
        one.x -= dx * push
        one.y -= dy * push
        two.x += dx * push
        two.y += dy * push
      }
    }
    for (const edge of edges) {
      const dx = edge.to.x - edge.from.x
      const dy = edge.to.y - edge.from.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.001
      const pull = ((distance - edge.spacing) / distance) * 0.08
      edge.from.x += dx * pull
      edge.from.y += dy * pull
      edge.to.x -= dx * pull
      edge.to.y -= dy * pull
    }
    for (const point of points) {
      point.x += (point.anchor.x - point.x) * 0.012
      point.y += (point.anchor.y - point.y) * 0.012
      const distance = Math.sqrt(point.x * point.x + point.y * point.y)
      if (distance > limit) {
        point.x = (point.x / distance) * limit
        point.y = (point.y / distance) * limit
      }
    }
  }
  return points.map((point) => ({ ...point.node, x: point.x, y: point.y }))
}

/** A cluster's local dots plus the world transform they are drawn under. */
export type ClusterPlacement = {
  cluster: number
  anchor: ClusterAnchor
  offset: ClusterAnchor
  nodes: readonly LaidNode[]
}

/**
 * Global collision between dots of different clusters: halos may overlap and edges may interleave, but two dots never
 * cover each other. Runs on the laid-out local positions, returns local positions again so every layer stays in sync.
 */
export function separateClusterNodes(
  clusters: readonly ClusterPlacement[],
  iterations = 16,
): Map<number, LaidNode[]> {
  type WorldNode = { cluster: number; node: LaidNode; x: number; y: number }
  const world: WorldNode[] = []
  for (const cluster of clusters)
    for (const node of cluster.nodes)
      world.push({
        cluster: cluster.cluster,
        node,
        x: cluster.anchor.x + cluster.offset.x + node.x,
        y: cluster.anchor.y + cluster.offset.y + node.y,
      })
  for (let pass = 0; pass < iterations; pass += 1) {
    let moved = false
    for (let i = 0; i < world.length; i += 1) {
      const a = world[i]
      for (let j = i + 1; j < world.length; j += 1) {
        const b = world[j]
        if (a.cluster === b.cluster) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.001
        const minimum = a.node.r + b.node.r + 6
        if (distance >= minimum) continue
        if (distance < 0.01) {
          const angle = ((a.node.id * 37 + b.node.id * 17) % 360) * (Math.PI / 180)
          a.x -= Math.cos(angle) * (minimum / 2)
          a.y -= Math.sin(angle) * (minimum / 2)
          b.x += Math.cos(angle) * (minimum / 2)
          b.y += Math.sin(angle) * (minimum / 2)
          moved = true
          continue
        }
        const push = (minimum - distance) / distance / 2
        a.x -= dx * push
        a.y -= dy * push
        b.x += dx * push
        b.y += dy * push
        moved = true
      }
    }
    if (!moved) break
  }
  const result = new Map<number, LaidNode[]>()
  for (const cluster of clusters) {
    const local = world
      .filter((item) => item.cluster === cluster.cluster)
      .map((item) => ({
        ...item.node,
        x: item.x - cluster.anchor.x - cluster.offset.x,
        y: item.y - cluster.anchor.y - cluster.offset.y,
      }))
    result.set(cluster.cluster, local)
  }
  return result
}

/** A short, stable curve between two dots; the bend alternates by edge index so parallel edges do not overlap. */
export function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  index: number,
): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = -dy / length
  const ny = dx / length
  const bend = Math.min(22, length * 0.14) * (index % 2 === 0 ? 1 : -1)
  const mx = (from.x + to.x) / 2 + nx * bend
  const my = (from.y + to.y) / 2 + ny * bend
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`
}
