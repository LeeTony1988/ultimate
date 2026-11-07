/**
 * The Constellation tab: one pure-circle DAG per checked conversation, deterministic cluster anchors, an infinite
 * world/camera canvas, hover-to-read one star chain and chain/cluster focus. Structure and Timeline stay in graph.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { formatDuration, formatTime, useAction, useNow } from '@/sdk'
import type { TaskGraphNode } from '@/sdk'
import { useTaskOf } from '../plan/ui.tsx'
import {
  CLUSTER_RADIUS,
  clusterAnchors,
  clusterBounds,
  conversationEdges,
  conversationNodes,
  edgePath,
  fitCamera,
  layoutConversationCluster,
  separateClusterNodes,
  taskHue,
  withinCluster,
  zoomAtPoint,
} from './constellation.ts'
import type {
  Camera,
  ClusterAnchor,
  ConstellationEdge,
  ConstellationNode,
  ConstellationTurn,
  LaidNode,
} from './constellation.ts'
import { mergeRunLive } from './history.ts'
import type { DagSettings, RunDetail, RunSummary, RunTask, TaskSettings } from './history.ts'
import { DescribeAction, RunAction, StartedAction } from './refs.ts'
import type { TaskFacts } from './refs.ts'
import { useOnce } from './shared.tsx'

const POLL_MS = 2000

export type ConstellationFrame = {
  conversationId: number
  agent: string
  /** Every run in the visible history for this conversation, oldest first. */
  runs: RunSummary[]
  earliest: number
}

type Focus =
  | { kind: 'chain'; conversationId: number; turn: number; nodeId: number }
  | { kind: 'cluster'; conversationId: number }
type HoveredChain = { conversationId: number; turn: number }

type TurnView = {
  run: RunSummary
  tasks: RunTask[]
  running: boolean
  error?: string
}

type ClusterModel = {
  conversationId: number
  agent: string
  title?: string
  runs: RunSummary[]
  tasks: RunTask[]
  omitted: number
  nodes: LaidNode[]
  edges: ConstellationEdge[]
  /** The drawn halo radius: tight around sparse content, up to the cluster maximum when full. */
  radius: number
  running: boolean
  startedAt: number
  error?: string
}

type RunView = {
  tasks: RunTask[]
  detail: RunDetail | undefined
  running: boolean
  error: Error | undefined
}

/** The same RunAction + live merge contract as RunFrame, kept local so a snapshot cluster never consumes live nodes. */
function useRunView(
  conversationId: number,
  runId: number | undefined,
  costDetail: 'run' | 'tool',
  live: readonly TaskGraphNode[],
): RunView {
  const { data, error, refetch } = useAction(
    RunAction,
    { id: runId ?? 0, costDetail },
    { enabled: runId !== undefined },
  )
  const detail = data
  const running = runId !== undefined && detail?.run.outcome === 'running'
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
    () => (running ? live.filter((node) => node.conversationId === conversationId) : []),
    [running, live, conversationId],
  )
  const liveIds = liveHere.map((node) => node.id)
  const started = useOnce(StartedAction, liveIds)
  const facts = useOnce<TaskFacts>(DescribeAction, liveIds)
  const tasks = useMemo(() => {
    const stored = (detail?.tasks ?? []).filter((task) => task.conversationId === conversationId)
    const merged = running
      ? mergeRunLive(
          stored,
          liveHere,
          detail?.generationIds?.length ? detail.generationIds : runId === undefined ? [] : [runId],
          started,
        )
      : stored
    return merged.map((task) => ({
      ...task,
      ...(!task.facts && facts[task.id]
        ? { facts: facts[task.id], tool: facts[task.id].tool }
        : {}),
      ...(task.startedAt === undefined && started[task.id] !== undefined
        ? { startedAt: started[task.id] }
        : {}),
    }))
  }, [detail, running, liveHere, conversationId, runId, started, facts])
  return { tasks, detail, running, error }
}

/** Fetches one run's tasks and reports its turn to the conversation cluster; draws nothing itself. */
function TurnData({
  conversationId,
  run,
  live,
  settings,
  onTurn,
}: {
  conversationId: number
  run: RunSummary
  live: readonly TaskGraphNode[]
  settings: TaskSettings
  onTurn: (turn: TurnView) => void
}) {
  const view = useRunView(conversationId, run.id, settings.costDetail, live)
  const turn = useMemo<TurnView>(
    () => ({
      run,
      tasks: view.tasks,
      running: view.running,
      ...(view.error ? { error: view.error.message } : {}),
    }),
    [run, view.tasks, view.running, view.error],
  )
  useEffect(() => onTurn(turn), [turn, onTurn])
  return null
}

/** Collects a conversation's turns, builds their independent star chains, and hands the finished model to the surface. */
function ConversationData({
  frame,
  live,
  settings,
  onModel,
}: {
  frame: ConstellationFrame
  live: readonly TaskGraphNode[]
  settings: TaskSettings
  onModel: (model: ClusterModel) => void
}) {
  const [turns, setTurns] = useState<Record<number, TurnView>>({})
  const onTurn = useCallback((turn: TurnView) => {
    setTurns((previous) =>
      previous[turn.run.id] === turn ? previous : { ...previous, [turn.run.id]: turn },
    )
  }, [])
  const plan = useTaskOf(frame.conversationId)
  const model = useMemo<ClusterModel>(() => {
    const ordered = frame.runs.toSorted((a, b) => a.startedAt - b.startedAt || a.id - b.id)
    const inputs: ConstellationTurn[] = ordered.map((run) => ({
      runId: run.id,
      startedAt: run.startedAt,
      ...(run.endedAt === undefined ? {} : { endedAt: run.endedAt }),
      outcome: run.outcome,
      tasks: turns[run.id]?.tasks ?? [],
      label: `turn · ${formatTime(run.startedAt, true)}`,
    }))
    const { nodes, omitted } = conversationNodes(frame.conversationId, inputs)
    const edges = withinCluster(conversationEdges(frame.conversationId, inputs), nodes)
    const laid = layoutConversationCluster(nodes, {
      radius: CLUSTER_RADIUS,
      clustering: settings.dag.visualClustering,
    })
    const extent = laid.reduce(
      (maximum, node) => Math.max(maximum, Math.hypot(node.x, node.y) + node.r),
      0,
    )
    const error = ordered.map((run) => turns[run.id]?.error).find(Boolean)
    return {
      conversationId: frame.conversationId,
      agent: frame.agent,
      ...(plan?.title ? { title: plan.title } : {}),
      runs: ordered,
      tasks: inputs.flatMap((input) => [...input.tasks]),
      omitted,
      nodes: laid,
      edges,
      radius: Math.min(CLUSTER_RADIUS, Math.max(90, extent + 42)),
      running: ordered.some((run) => turns[run.id]?.running ?? run.outcome === 'running'),
      startedAt: ordered[0]?.startedAt ?? frame.earliest,
      ...(error ? { error } : {}),
    }
  }, [
    frame.conversationId,
    frame.agent,
    frame.runs,
    frame.earliest,
    plan,
    turns,
    settings.dag.visualClustering,
  ])
  useEffect(() => onModel(model), [model, onModel])
  return (
    <>
      {frame.runs.map((run) => (
        <TurnData
          conversationId={frame.conversationId}
          key={run.id}
          live={live}
          onTurn={onTurn}
          run={run}
          settings={settings}
        />
      ))}
    </>
  )
}

const statusText: Record<ConstellationNode['status'], string> = {
  pending: 'pending',
  running: 'running',
  waiting: 'waiting',
  done: 'done',
  failed: 'failed',
}

const statusDot: Record<ConstellationNode['status'], string> = {
  pending: 'bg-muted-foreground/30',
  running: 'bg-brand shadow-[0_0_6px_var(--brand)]',
  waiting: 'border border-dashed border-muted-foreground/60',
  done: 'bg-muted-foreground/55',
  failed: 'border border-muted-foreground/70',
}

const fillOf = (hue: number, status: ConstellationNode['status']) => {
  if (status === 'running') return `hsl(${hue}, 72%, 64%)`
  if (status === 'done') return `hsl(${hue}, 55%, 54%)`
  if (status === 'waiting') return `hsl(${hue}, 45%, 46%)`
  if (status === 'failed') return `hsl(${hue}, 62%, 58%)`
  return `hsl(${hue}, 40%, 40%)`
}

const fillOpacityOf = (status: ConstellationNode['status']) => {
  if (status === 'running') return 0.95
  if (status === 'done') return 0.55
  if (status === 'waiting') return 0.42
  if (status === 'failed') return 0.78
  return 0.38
}

const shortTitle = (value: string, max = 34) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

/** The floating detail card: one chain's node details and neighbours, or the cluster's progress. */
function Detail({
  focus,
  model,
  onClose,
  onCluster,
}: {
  focus: Focus
  model: ClusterModel | undefined
  onClose: () => void
  onCluster: () => void
}) {
  const node =
    focus.kind === 'chain' ? model?.nodes.find((item) => item.id === focus.nodeId) : undefined
  const task = node ? model?.tasks.find((item) => item.id === node.id) : undefined
  const incoming = model?.edges.filter((edge) => edge.to === node?.id).length ?? 0
  const outgoing = model?.edges.filter((edge) => edge.from === node?.id).length ?? 0
  const neighbors = model?.edges.flatMap((edge) => {
    if (edge.from === node?.id) return [model?.nodes.find((item) => item.id === edge.to)]
    if (edge.to === node?.id) return [model?.nodes.find((item) => item.id === edge.from)]
    return []
  })
  const now = useNow(1000, node?.status === 'running')
  const title =
    focus.kind === 'chain'
      ? (node?.label ?? `turn ${focus.turn + 1}`)
      : (model?.title ?? `@${model?.agent ?? 'agent'} #${focus.conversationId}`)
  const stepNodes = model?.nodes ?? []
  const counts = {
    done: stepNodes.filter((item) => item.status === 'done').length,
    running: stepNodes.filter((item) => item.status === 'running').length,
    waiting: stepNodes.filter((item) => item.status === 'waiting').length,
    failed: stepNodes.filter((item) => item.status === 'failed').length,
    pending: stepNodes.filter((item) => item.status === 'pending').length,
  }
  const total = stepNodes.length
  return (
    <aside
      className="absolute top-3 right-3 bottom-3 z-20 w-[286px] overflow-auto rounded-xl border border-border/70 bg-popover/95 p-4 font-mono text-[10.5px] text-foreground shadow-2xl backdrop-blur-md max-lg:inset-x-3 max-lg:top-auto max-lg:bottom-3 max-lg:h-48 max-lg:w-auto"
      data-constellation-detail
    >
      <div className="flex items-center gap-2 text-[9px] tracking-[.18em] text-muted-foreground uppercase">
        {focus.kind === 'chain' ? 'Chain focus' : 'Cluster focus'}
        <button
          aria-label="Close details"
          className="ml-auto cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <h2 className="mt-2 font-sans text-[15px] leading-snug font-medium text-foreground">
        {focus.kind === 'chain' ? shortTitle(title, 52) : shortTitle(title, 42)}
      </h2>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {focus.kind === 'chain'
          ? `${model?.agent ? `@${model.agent}` : ''} #${focus.conversationId} · turn ${focus.turn + 1} · ${task?.kind ?? node?.type ?? 'task'}`
          : `@${model?.agent ?? 'agent'} #${focus.conversationId}${model?.running ? ' · LIVE' : ''}`}
      </p>
      {focus.kind === 'chain' && node ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <span className={cnDot(node.status)} />
            <span className="text-foreground/90">{statusText[node.status]}</span>
            <span className="ml-auto text-muted-foreground/70">{node.type}</span>
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-muted-foreground">
            <dt>step</dt>
            <dd className="text-foreground">
              {task ? `#${task.id}` : `#${node.id}`} · {node.type}
            </dd>
            {task?.phase && (
              <>
                <dt>phase</dt>
                <dd className="text-foreground">{task.phase}</dd>
              </>
            )}
            {task?.startedAt !== undefined && (
              <>
                <dt>duration</dt>
                <dd className="text-foreground">
                  {formatDuration(
                    Math.max(
                      0,
                      (task.endedAt ?? (node.status === 'running' ? now : task.startedAt)) -
                        task.startedAt,
                    ),
                  )}
                </dd>
              </>
            )}
            <dt>neighbours</dt>
            <dd className="text-foreground">
              {incoming} in · {outgoing} out
            </dd>
            <dt>cluster</dt>
            <dd className="text-foreground">{model?.nodes.length ?? 0} steps</dd>
            {task?.error && (
              <>
                <dt>error</dt>
                <dd className="break-words text-warning">{task.error}</dd>
              </>
            )}
          </dl>
          {neighbors && neighbors.length > 0 && (
            <div className="mt-4 border-t border-border/70 pt-3">
              <div className="text-[9px] tracking-[.16em] text-muted-foreground/70 uppercase">
                Neighbours
              </div>
              <div className="mt-2 grid gap-1.5">
                {neighbors
                  .filter((item): item is LaidNode => item !== undefined)
                  .slice(0, 8)
                  .map((item) => (
                    <div
                      className="flex min-w-0 items-center gap-2 text-muted-foreground"
                      key={item.id}
                    >
                      <span className={cnDot(item.status)} />
                      <span className="truncate">{item.label}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <button
            className="mt-4 w-full cursor-pointer rounded-md border border-border/70 px-2 py-1.5 text-left text-foreground/90 hover:border-border hover:text-foreground"
            onClick={onCluster}
            type="button"
          >
            ← back to the cluster
          </button>
        </>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2">
            <span className={cnDot(model?.running ? 'running' : 'done')} />
            <span className="text-foreground/90">
              {model?.running
                ? 'live'
                : model?.runs.some((run) => run.outcome === 'failed' || run.outcome === 'aborted')
                  ? 'failed'
                  : (model?.runs.at(-1)?.outcome ?? 'snapshot')}
            </span>
            <span className="ml-auto text-muted-foreground/70">
              {total > 0 ? `${Math.round((counts.done / total) * 100)}%` : '—'}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand/80 transition-[width] duration-300"
              style={{ width: `${total ? (counts.done / total) * 100 : 0}%` }}
            />
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-muted-foreground">
            <dt>done</dt>
            <dd className="text-foreground">{counts.done}</dd>
            <dt>running</dt>
            <dd className="text-foreground">{counts.running}</dd>
            <dt>waiting</dt>
            <dd className="text-foreground">{counts.waiting}</dd>
            <dt>failed</dt>
            <dd className={counts.failed > 0 ? 'text-warning' : 'text-foreground'}>
              {counts.failed}
            </dd>
            <dt>pending</dt>
            <dd className="text-foreground">{counts.pending}</dd>
            <dt>steps</dt>
            <dd className="text-foreground">
              {total}
              {model?.omitted ? ` (+${model.omitted} omitted)` : ''}
            </dd>
            <dt>turns</dt>
            <dd className="text-foreground">{model?.runs.length ?? 0}</dd>
            {model?.startedAt ? (
              <>
                <dt>first turn</dt>
                <dd className="text-foreground">{formatTime(model.startedAt, true)}</dd>
              </>
            ) : null}
          </dl>
          <div className="mt-4 border-t border-border/70 pt-3">
            <div className="text-[9px] tracking-[.16em] text-muted-foreground/70 uppercase">
              Steps
            </div>
            <div className="mt-2 grid gap-1.5">
              {(model?.nodes ?? []).slice(0, 12).map((item) => (
                <div
                  className="flex min-w-0 items-center gap-2 text-muted-foreground"
                  key={item.id}
                >
                  <span className={cnDot(item.status)} />
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/70">
                    {statusText[item.status]}
                  </span>
                </div>
              ))}
              {total === 0 && (
                <span className="text-muted-foreground/70">no steps in this conversation</span>
              )}
            </div>
          </div>
          <button
            className="mt-4 w-full cursor-pointer rounded-md border border-border/70 px-2 py-1.5 text-left text-foreground/90 hover:border-border hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            ← back to all clusters
          </button>
        </>
      )}
    </aside>
  )
}

const cnDot = (status: ConstellationNode['status']) =>
  `size-1.5 shrink-0 rounded-full ${statusDot[status]}`

/** The constellation surface: data children, one world layer, camera controls and focus. */
export function Constellation({
  frames,
  live,
  settings,
  onDagSettings,
}: {
  frames: readonly ConstellationFrame[]
  live: readonly TaskGraphNode[]
  settings: TaskSettings
  onDagSettings: (patch: Partial<DagSettings>) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [offsets, setOffsets] = useState<Record<number, ClusterAnchor>>({})
  const [models, setModels] = useState<Record<number, ClusterModel>>({})
  const [focus, setFocus] = useState<Focus>()
  const [hovered, setHovered] = useState<HoveredChain>()
  const [dragging, setDragging] = useState<number>()
  const [overlap, setOverlap] = useState(settings.dag.clusterOverlap)
  const [clustering, setClustering] = useState(settings.dag.visualClustering)
  const [crossRepel, setCrossRepel] = useState(settings.dag.crossRepulsion)
  const pan = useRef<
    { x: number; y: number; cameraX: number; cameraY: number; moved: boolean } | undefined
  >(undefined)
  const drag = useRef<
    | {
        conversationId: number
        x: number
        y: number
        origin: ClusterAnchor
        moved: boolean
      }
    | undefined
  >(undefined)
  const movedAt = useRef(0)

  useEffect(() => {
    setOverlap(settings.dag.clusterOverlap)
    setClustering(settings.dag.visualClustering)
    setCrossRepel(settings.dag.crossRepulsion)
  }, [settings.dag.clusterOverlap, settings.dag.visualClustering, settings.dag.crossRepulsion])

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return undefined
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const anchorOverlap = overlap * (1 - crossRepel)
  const anchors = useMemo(
    () => clusterAnchors(frames.length, CLUSTER_RADIUS, anchorOverlap),
    [frames.length, anchorOverlap],
  )
  const offsetByIndex = useMemo(
    () =>
      Object.fromEntries(
        frames.map((frame, index) => [index, offsets[frame.conversationId] ?? { x: 0, y: 0 }]),
      ) as Record<number, ClusterAnchor>,
    [frames, offsets],
  )
  const fit = useMemo(
    () => () => {
      if (!size.width || !size.height) return
      setCamera(
        fitCamera(
          clusterBounds(frames.length, CLUSTER_RADIUS, anchorOverlap, offsetByIndex),
          size.width,
          size.height,
        ),
      )
    },
    [frames.length, anchorOverlap, offsetByIndex, size.width, size.height, setCamera],
  )
  const fitRef = useRef(fit)
  fitRef.current = fit

  useEffect(() => {
    if (!size.width || !size.height) return
    fitRef.current()
  }, [size.width, size.height, frames.length])

  const frameSignature = frames.map((frame) => frame.conversationId).join(',')
  useEffect(() => {
    const ids = new Set(frames.map((frame) => frame.conversationId))
    setModels((previous) => {
      const kept = Object.fromEntries(
        Object.entries(previous).filter(([id]) => ids.has(Number(id))),
      )
      return Object.keys(kept).length === Object.keys(previous).length ? previous : kept
    })
    setFocus((current) => (current && !ids.has(current.conversationId) ? undefined : current))
  }, [frameSignature, frames])

  const onModel = useMemo(
    () => (model: ClusterModel) =>
      setModels((previous) =>
        previous[model.conversationId] === model
          ? previous
          : { ...previous, [model.conversationId]: model },
      ),
    [],
  )

  const displayNodes = useMemo(
    () =>
      separateClusterNodes(
        frames.map((frame, index) => ({
          cluster: frame.conversationId,
          anchor: anchors[index] ?? { x: 0, y: 0 },
          offset: offsets[frame.conversationId] ?? { x: 0, y: 0 },
          nodes: models[frame.conversationId]?.nodes ?? [],
        })),
      ),
    [frames, models, anchors, offsets],
  )

  const viewSettings = useMemo(
    () => ({
      ...settings,
      dag: {
        ...settings.dag,
        clusterOverlap: overlap,
        visualClustering: clustering,
        crossRepulsion: crossRepel,
      },
    }),
    [settings, overlap, clustering, crossRepel],
  )

  const emphasis = (conversationId: number) => {
    if (hovered) return hovered.conversationId === conversationId ? 1 : 0.055
    if (focus?.kind === 'chain') return focus.conversationId === conversationId ? 1 : 0.08
    if (focus?.kind === 'cluster') return focus.conversationId === conversationId ? 1 : 0.04
    return 1
  }

  const chainState = (conversationId: number, turn: number) => {
    if (hovered)
      return hovered.conversationId === conversationId && hovered.turn === turn ? 'active' : 'dim'
    if (focus?.kind === 'chain' && focus.conversationId === conversationId)
      return focus.turn === turn ? 'active' : 'dim'
    return undefined
  }

  const clusterTransform = (index: number, conversationId: number) => {
    const anchor = anchors[index] ?? { x: 0, y: 0 }
    const offset = offsets[conversationId]
    const x = anchor.x + (offset?.x ?? 0)
    const y = anchor.y + (offset?.y ?? 0)
    const scale = focus?.kind === 'cluster' && focus.conversationId === conversationId ? 1.035 : 1
    return {
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
      transformOrigin: '0 0',
      transition:
        dragging === conversationId
          ? 'opacity 120ms ease-out'
          : 'transform 220ms ease-out, opacity 120ms ease-out',
    } as const
  }

  const startClusterDrag = (
    event: ReactPointerEvent<SVGEllipseElement>,
    conversationId: number,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    drag.current = {
      conversationId,
      x: event.clientX,
      y: event.clientY,
      origin: offsets[conversationId] ?? { x: 0, y: 0 },
      moved: false,
    }
    svgRef.current?.setPointerCapture(event.pointerId)
    setDragging(conversationId)
  }
  const moveClusterDrag = (clientX: number, clientY: number) => {
    const current = drag.current
    if (!current) return
    const dx = (clientX - current.x) / camera.zoom
    const dy = (clientY - current.y) / camera.zoom
    if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true
    setOffsets((previous) => ({
      ...previous,
      [current.conversationId]: { x: current.origin.x + dx, y: current.origin.y + dy },
    }))
  }
  const endClusterDrag = () => {
    const current = drag.current
    if (!current) return
    if (current.moved) movedAt.current = performance.now()
    drag.current = undefined
    setDragging(undefined)
  }

  const startPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    const target = event.target as Element
    if (target !== svgRef.current && target.getAttribute('data-pan') !== '1') return
    event.currentTarget.setPointerCapture(event.pointerId)
    pan.current = {
      x: event.clientX,
      y: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      moved: false,
    }
  }
  const movePan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      moveClusterDrag(event.clientX, event.clientY)
      return
    }
    const current = pan.current
    if (!current) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (Math.abs(dx) + Math.abs(dy) > 4) current.moved = true
    setCamera((value) => ({ ...value, x: current.cameraX + dx, y: current.cameraY + dy }))
  }
  const endPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      endClusterDrag()
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }
    const current = pan.current
    if (!current) return
    if (current.moved) movedAt.current = performance.now()
    pan.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    const element = svgRef.current
    if (!element) return undefined
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      setCamera((value) =>
        zoomAtPoint(
          value,
          event.clientX - rect.left,
          event.clientY - rect.top,
          Math.exp(-event.deltaY * 0.0012),
        ),
      )
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'SELECT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      )
        return
      if (event.key === 'Escape') {
        if (focus?.kind === 'chain')
          setFocus({ kind: 'cluster', conversationId: focus.conversationId })
        else if (focus) setFocus(undefined)
      }
      if (event.key === '0') {
        event.preventDefault()
        fitRef.current()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [focus])

  const zoomBy = (factor: number) =>
    setCamera((value) => zoomAtPoint(value, size.width / 2, size.height / 2, factor))

  const reset = () => {
    setFocus(undefined)
    setHovered(undefined)
    setOffsets({})
    setCamera(
      fitCamera(
        clusterBounds(frames.length, CLUSTER_RADIUS, anchorOverlap, {}),
        size.width,
        size.height,
      ),
    )
  }

  const totalNodes = frames.reduce(
    (total, frame) => total + (models[frame.conversationId]?.nodes.length ?? 0),
    0,
  )
  const liveClusters = frames.filter((frame) => models[frame.conversationId]?.running).length
  const focusedModel = focus ? models[focus.conversationId] : undefined

  const labelsClass =
    settings.dag.labels === 'always'
      ? 'constellation-labels-always'
      : settings.dag.labels === 'off'
        ? 'constellation-labels-off'
        : ''

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      data-constellation
    >
      <style>{constellationCss}</style>
      <div className="relative z-10 flex items-center gap-x-2 overflow-x-auto border-b border-border/60 bg-card/30 px-3 py-1.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
        <span>
          {frames.length} {frames.length === 1 ? 'cluster' : 'clusters'} · {totalNodes} nodes
        </span>
        {liveClusters > 0 && (
          <span className="rounded border border-brand/40 px-1 py-0.5 text-[9px] tracking-[.12em] text-brand">
            LIVE {liveClusters}
          </span>
        )}
        <label className="flex items-center gap-1.5 max-[1400px]:hidden">
          overlap
          <input
            aria-label="Cluster overlap"
            className="w-14 accent-brand"
            max={0.6}
            min={0}
            onChange={(event) => setOverlap(Number(event.target.value))}
            onPointerUp={(event) =>
              onDagSettings({ clusterOverlap: Number(event.currentTarget.value) })
            }
            onKeyUp={(event) =>
              onDagSettings({ clusterOverlap: Number(event.currentTarget.value) })
            }
            step={0.05}
            type="range"
            value={overlap}
          />
          <span className="w-7 tabular-nums text-foreground/90">{overlap.toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-1.5 max-[1000px]:hidden">
          cross-repel
          <input
            aria-label="Cross-cluster repulsion"
            className="w-14 accent-brand"
            max={1}
            min={0}
            onChange={(event) => setCrossRepel(Number(event.target.value))}
            onPointerUp={(event) =>
              onDagSettings({ crossRepulsion: Number(event.currentTarget.value) })
            }
            onKeyUp={(event) =>
              onDagSettings({ crossRepulsion: Number(event.currentTarget.value) })
            }
            step={0.05}
            type="range"
            value={crossRepel}
          />
          <span className="w-7 tabular-nums text-foreground/90">{crossRepel.toFixed(2)}</span>
        </label>
        <button
          className="cursor-pointer rounded border border-border/70 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground max-[1000px]:hidden"
          onClick={() =>
            onDagSettings({
              labels:
                settings.dag.labels === 'hover'
                  ? 'always'
                  : settings.dag.labels === 'always'
                    ? 'off'
                    : 'hover',
            })
          }
          type="button"
        >
          Labels: {settings.dag.labels}
        </button>
        <span className="ml-auto flex items-center gap-1">
          <button
            aria-label="Zoom out"
            className="size-5 cursor-pointer rounded text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => zoomBy(0.78)}
            type="button"
          >
            −
          </button>
          <span className="w-9 text-center tabular-nums text-foreground/90">
            {Math.round(camera.zoom * 100)}%
          </span>
          <button
            aria-label="Zoom in"
            className="size-5 cursor-pointer rounded text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => zoomBy(1.28)}
            type="button"
          >
            +
          </button>
          <button
            className="cursor-pointer rounded border border-border/70 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground"
            onClick={() => fitRef.current()}
            type="button"
          >
            Fit
          </button>
          <button
            className="cursor-pointer rounded border border-border/70 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground"
            onClick={reset}
            type="button"
          >
            Reset
          </button>
        </span>
      </div>
      <div
        className={cnCanvas(
          'relative min-h-0 flex-1 overflow-hidden',
          labelsClass,
          !settings.dag.pulse && 'constellation-no-pulse',
          camera.zoom < 0.64 && 'constellation-zoomed-out',
        )}
        ref={canvasRef}
      >
        <svg
          aria-label="Task DAG constellation"
          className="absolute inset-0 size-full touch-none select-none"
          onClick={(event) => {
            const target = event.target as Element
            if (target !== svgRef.current && target.getAttribute('data-pan') !== '1') return
            if (performance.now() - movedAt.current < 300) return
            setFocus(undefined)
          }}
          onDoubleClick={(event) => {
            const target = event.target as Element
            if (target === svgRef.current || target.getAttribute('data-pan') === '1')
              fitRef.current()
          }}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          ref={svgRef}
          role="img"
        >
          <defs>
            <filter height="300%" id="constellation-halo" width="300%" x="-100%" y="-100%">
              <feGaussianBlur stdDeviation="18" />
            </filter>
          </defs>
          <rect data-pan="1" fill="transparent" height="100%" width="100%" />
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
            {frames.map((frame, index) => {
              const model = models[frame.conversationId]
              const hue = taskHue(index, frames.length)
              const radius = model?.radius ?? CLUSTER_RADIUS
              const style = {
                ...clusterTransform(index, frame.conversationId),
                opacity: emphasis(frame.conversationId),
              }
              return (
                <g
                  className="constellation-cluster constellation-halo"
                  key={`halo:${frame.conversationId}`}
                  style={style}
                >
                  {[
                    { dx: -0.08, dy: 0.02, rx: 0.82, ry: 0.58, rot: -16, opacity: 0.042 },
                    { dx: 0.15, dy: -0.08, rx: 0.64, ry: 0.72, rot: 24, opacity: 0.034 },
                    { dx: -0.18, dy: 0.14, rx: 0.72, ry: 0.46, rot: 38, opacity: 0.03 },
                  ].map((blob) => (
                    <ellipse
                      cx={blob.dx * radius}
                      cy={blob.dy * radius}
                      fill={`hsl(${hue} 45% 70%)`}
                      filter="url(#constellation-halo)"
                      key={blob.rot}
                      opacity={blob.opacity}
                      rx={radius * blob.rx}
                      ry={radius * blob.ry}
                      transform={`rotate(${blob.rot} ${blob.dx * radius} ${blob.dy * radius})`}
                    />
                  ))}
                  <ellipse
                    aria-label={`Move cluster ${model?.title ?? `@${frame.agent} #${frame.conversationId}`}`}
                    className="constellation-cluster-hit"
                    cx={0}
                    cy={0}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (performance.now() - movedAt.current < 300) return
                      setFocus(undefined)
                    }}
                    onPointerDown={(event) => startClusterDrag(event, frame.conversationId)}
                    rx={radius * 0.95}
                    ry={radius * 0.82}
                  />
                </g>
              )
            })}
            {frames.map((frame, index) => {
              const model = models[frame.conversationId]
              if (!model) return null
              const hue = taskHue(index, frames.length)
              const nodes = displayNodes.get(frame.conversationId) ?? model.nodes
              const style = {
                ...clusterTransform(index, frame.conversationId),
                opacity: emphasis(frame.conversationId),
              }
              return (
                <g
                  className="constellation-cluster constellation-edges"
                  key={`edges:${frame.conversationId}`}
                  style={style}
                >
                  {model.edges.map((edge, edgeIndex) => {
                    const from = nodes.find((node) => node.id === edge.from)
                    const to = nodes.find((node) => node.id === edge.to)
                    if (!from || !to) return null
                    const chain = chainState(frame.conversationId, from.turn)
                    return (
                      <path
                        className={cnCanvas(
                          'constellation-edge',
                          (from.status === 'running' ||
                            to.status === 'running' ||
                            from.status === 'waiting' ||
                            to.status === 'waiting') &&
                            'is-live',
                          chain === 'active' && 'is-hot',
                          chain === 'dim' && 'is-dim',
                        )}
                        d={edgePath(from, to, edgeIndex)}
                        key={`${edge.from}:${edge.to}`}
                        stroke={`hsl(${hue} 60% 58%)`}
                      />
                    )
                  })}
                </g>
              )
            })}
            {frames.map((frame, index) => {
              const model = models[frame.conversationId]
              if (!model) return null
              const hue = taskHue(index, frames.length)
              const nodes = displayNodes.get(frame.conversationId) ?? model.nodes
              const style = {
                ...clusterTransform(index, frame.conversationId),
                opacity: emphasis(frame.conversationId),
              }
              const focusNodeId =
                focus?.kind === 'chain' && focus.conversationId === frame.conversationId
                  ? focus.nodeId
                  : undefined
              const neighbors = focusNodeId
                ? new Set(
                    model.edges.flatMap((edge) =>
                      edge.from === focusNodeId
                        ? [edge.to]
                        : edge.to === focusNodeId
                          ? [edge.from]
                          : [],
                    ),
                  )
                : undefined
              return (
                <g
                  className="constellation-cluster constellation-nodes"
                  key={`nodes:${frame.conversationId}`}
                  style={style}
                >
                  {nodes.map((node) => {
                    const selected = focusNodeId === node.id
                    const neighbor = neighbors?.has(node.id) ?? false
                    const chain = chainState(frame.conversationId, node.turn)
                    return (
                      <g
                        aria-label={`${node.label}, ${statusText[node.status]}`}
                        className={cnCanvas(
                          'constellation-node',
                          `status-${node.status}`,
                          selected && 'is-selected',
                          neighbor && 'is-neighbor',
                          chain === 'active' && 'is-chain-active',
                          chain === 'dim' && 'is-dim',
                        )}
                        data-node-id={node.id}
                        key={node.id}
                        onClick={(event) => {
                          event.stopPropagation()
                          setFocus({
                            kind: 'chain',
                            conversationId: frame.conversationId,
                            turn: node.turn,
                            nodeId: node.id,
                          })
                          setHovered(undefined)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          setFocus({
                            kind: 'chain',
                            conversationId: frame.conversationId,
                            turn: node.turn,
                            nodeId: node.id,
                          })
                        }}
                        onMouseEnter={() =>
                          setHovered({ conversationId: frame.conversationId, turn: node.turn })
                        }
                        onMouseLeave={() => setHovered(undefined)}
                        role="button"
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                        transform={`translate(${node.x.toFixed(2)} ${node.y.toFixed(2)})`}
                      >
                        <title>{`${node.label} · ${statusText[node.status]}`}</title>
                        {node.status === 'running' && (
                          <circle
                            className="constellation-aura"
                            fill={`hsl(${hue}, 70%, 62%)`}
                            fillOpacity={0.14}
                            r={node.r + 8}
                          />
                        )}
                        <circle
                          className="constellation-core"
                          fill={fillOf(hue, node.status)}
                          fillOpacity={fillOpacityOf(node.status)}
                          r={node.r}
                        />
                        <circle
                          className="constellation-ring"
                          fill="none"
                          opacity={
                            selected
                              ? 0.92
                              : node.status === 'failed'
                                ? 0.68
                                : node.status === 'waiting'
                                  ? 0.4
                                  : 0
                          }
                          r={node.r + 4.5}
                          stroke={`hsl(${hue}, 70%, 68%)`}
                          strokeDasharray={
                            node.status === 'failed' || node.status === 'waiting'
                              ? '2 4'
                              : undefined
                          }
                          strokeWidth={selected ? 1.4 : 1}
                        />
                        <circle
                          className="constellation-hit"
                          fill="transparent"
                          r={Math.max(16, node.r + 8)}
                        />
                        <text className="constellation-label" x={node.r + 7} y={3}>
                          {shortTitle(node.label, 38)}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
            {frames.map((frame, index) => {
              const model = models[frame.conversationId]
              const hue = taskHue(index, frames.length)
              const radius = model?.radius ?? CLUSTER_RADIUS
              const style = {
                ...clusterTransform(index, frame.conversationId),
                opacity: emphasis(frame.conversationId),
              }
              return (
                <g
                  className="constellation-cluster constellation-titles"
                  key={`title:${frame.conversationId}`}
                  style={style}
                >
                  <g
                    className="constellation-title"
                    onClick={(event) => {
                      event.stopPropagation()
                      setFocus({ kind: 'cluster', conversationId: frame.conversationId })
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      setFocus({ kind: 'cluster', conversationId: frame.conversationId })
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <circle
                      cx={-radius + 3}
                      cy={-radius + 16}
                      fill={`hsl(${hue} 62% 58%)`}
                      opacity={0.9}
                      r={2.6}
                    />
                    <text
                      className="constellation-title-name"
                      fill="var(--foreground)"
                      x={-radius + 10}
                      y={-radius + 20}
                    >
                      {shortTitle(model?.title ?? `@${frame.agent} #${frame.conversationId}`)}
                    </text>
                    <text
                      className="constellation-title-meta"
                      fill="var(--muted-foreground)"
                      x={-radius + 10}
                      y={-radius + 34}
                    >
                      {[
                        model?.title ? `@${frame.agent} #${frame.conversationId}` : undefined,
                        model?.startedAt ? formatTime(model.startedAt, true) : undefined,
                        `${model?.runs.length ?? 0} turns`,
                        `${Math.max(0, model?.nodes.length ?? 0)}${model?.omitted ? `+${model.omitted}` : ''} steps`,
                        model?.running ? 'LIVE' : undefined,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </text>
                    {model?.running && (
                      <g transform={`translate(${radius - 38} ${-radius + 7})`}>
                        <rect
                          fill={`hsl(${hue}, 80%, 60%)`}
                          fillOpacity={0.12}
                          height={13}
                          rx={3}
                          stroke={`hsl(${hue}, 80%, 65%)`}
                          strokeOpacity={0.35}
                          width={29}
                        />
                        <text
                          className="constellation-live-badge"
                          fill={`hsl(${hue} 85% 74%)`}
                          x={5}
                          y={9.5}
                        >
                          LIVE
                        </text>
                      </g>
                    )}
                  </g>
                </g>
              )
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[9.5px] text-muted-foreground/70">
          drag background to pan · wheel to zoom · click a dot or cluster title · Esc to go back
        </div>
        <div className="absolute right-3 bottom-3 hidden h-[92px] w-[148px] overflow-hidden rounded-lg border border-border/70 bg-card/60 backdrop-blur-sm sm:block">
          <svg
            className="size-full cursor-crosshair"
            onClick={(event) => {
              const bounds = clusterBounds(
                frames.length,
                CLUSTER_RADIUS,
                anchorOverlap,
                offsetByIndex,
              )
              const rect = event.currentTarget.getBoundingClientRect()
              const x = bounds.x + ((event.clientX - rect.left) / rect.width) * bounds.width
              const y = bounds.y + ((event.clientY - rect.top) / rect.height) * bounds.height
              setCamera((value) => ({
                ...value,
                x: size.width / 2 - x * value.zoom,
                y: size.height / 2 - y * value.zoom,
              }))
            }}
          >
            <svg
              preserveAspectRatio="xMidYMid meet"
              viewBox={(() => {
                const bounds = clusterBounds(
                  frames.length,
                  CLUSTER_RADIUS,
                  anchorOverlap,
                  offsetByIndex,
                )
                const pad = CLUSTER_RADIUS * 0.2
                return `${bounds.x - pad} ${bounds.y - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`
              })()}
            >
              {frames.map((frame, index) => {
                const anchor = anchors[index] ?? { x: 0, y: 0 }
                const offset = offsets[frame.conversationId]
                const radius = models[frame.conversationId]?.radius ?? CLUSTER_RADIUS
                return (
                  <circle
                    cx={anchor.x + (offset?.x ?? 0)}
                    cy={anchor.y + (offset?.y ?? 0)}
                    fill={`hsl(${taskHue(index, frames.length)} 68% 62%)`}
                    key={frame.conversationId}
                    opacity={0.16}
                    r={radius * 0.95}
                  />
                )
              })}
              <rect
                fill="none"
                height={size.height / camera.zoom}
                rx={4}
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                width={size.width / camera.zoom}
                x={-camera.x / camera.zoom}
                y={-camera.y / camera.zoom}
              />
            </svg>
          </svg>
          <span className="absolute top-1 right-1 rounded bg-card/80 px-1 py-0.5 font-mono text-[8px] text-muted-foreground">
            {Math.round(camera.zoom * 100)}%
          </span>
        </div>
        {focus && (
          <Detail
            focus={focus}
            model={focusedModel}
            onClose={() => setFocus(undefined)}
            onCluster={() => setFocus({ kind: 'cluster', conversationId: focus.conversationId })}
          />
        )}
      </div>
      {frames.map((frame) => (
        <ConversationData
          frame={frame}
          key={frame.conversationId}
          live={live}
          onModel={onModel}
          settings={viewSettings}
        />
      ))}
    </div>
  )
}

const cnCanvas = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' ')

const constellationCss = `
.constellation-halo { mix-blend-mode: screen; pointer-events: none; }
.constellation-cluster-hit { fill: transparent; cursor: grab; pointer-events: all; }
.constellation-cluster-hit:active { cursor: grabbing; }
.constellation-edge { fill: none; stroke-width: 1.1; stroke-opacity: .22; stroke-linecap: round; transition: opacity .18s, stroke-opacity .18s; pointer-events: none; }
.constellation-edge.is-live { stroke-dasharray: 4 8; animation: constellation-flow 2.4s linear infinite; }
.constellation-edge.is-hot { stroke-opacity: .72; stroke-width: 1.35; }
.constellation-edge.is-dim { stroke-opacity: .07; }
.constellation-node { opacity: .84; transition: opacity .18s; outline: none; }
.constellation-node .constellation-core { transition: fill .18s, opacity .18s, filter .18s; }
.constellation-node .constellation-ring { transition: opacity .18s; }
.constellation-node.is-selected { opacity: 1; }
.constellation-node.is-selected .constellation-core { filter: brightness(1.3); }
.constellation-node.is-neighbor { opacity: 1; }
.constellation-node.is-neighbor .constellation-label { opacity: .92; }
.constellation-node.is-chain-active { opacity: 1; }
.constellation-node.is-chain-active .constellation-core { filter: brightness(1.2); }
.constellation-node.is-dim { opacity: .18; }
.constellation-node.is-dim .constellation-label { opacity: 0; }
.constellation-node:hover .constellation-label,
.constellation-node.is-selected .constellation-label,
.constellation-node.is-neighbor .constellation-label { opacity: 1; }
.constellation-label { opacity: 0; fill: var(--foreground); font-size: 9.5px; letter-spacing: .01em; paint-order: stroke; stroke: var(--background); stroke-width: 3px; stroke-linejoin: round; transition: opacity .15s; pointer-events: none; }
.constellation-labels-always .constellation-label { opacity: .78; }
.constellation-labels-off .constellation-label { display: none; }
.constellation-zoomed-out .constellation-label { display: none; }
.constellation-title { cursor: pointer; outline: none; }
.constellation-title-name { font-size: 12px; font-weight: 600; letter-spacing: .05em; paint-order: stroke; stroke: var(--background); stroke-width: 3px; }
.constellation-title-meta { font-size: 9px; letter-spacing: .02em; paint-order: stroke; stroke: var(--background); stroke-width: 3px; }
.constellation-title:hover .constellation-title-name { filter: brightness(1.18); }
.constellation-live-badge { font-size: 8px; letter-spacing: .1em; }
.constellation-node.status-running .constellation-core { animation: constellation-pulse 1.9s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.constellation-node.status-running .constellation-aura { animation: constellation-aura 1.9s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.constellation-node.status-failed .constellation-core { opacity: .9; }
.constellation-no-pulse .constellation-node .constellation-core,
.constellation-no-pulse .constellation-node .constellation-aura,
.constellation-no-pulse .constellation-edge { animation: none !important; }
@keyframes constellation-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
@keyframes constellation-aura { 0%, 100% { transform: scale(.85); opacity: .3; } 50% { transform: scale(1.35); opacity: .8; } }
@keyframes constellation-flow { to { stroke-dashoffset: -24; } }
@media (prefers-reduced-motion: reduce) {
  .constellation-node .constellation-core,
  .constellation-node .constellation-aura,
  .constellation-edge { animation: none !important; }
  .constellation-cluster { transition: opacity .12s ease-out !important; }
}
`
