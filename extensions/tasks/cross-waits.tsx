import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { TaskGraphNode } from '@/sdk'

type Edge = { from: number; to: number; x1: number; y1: number; x2: number; y2: number }

/** Current cross-conversation waits, drawn above the independently scrollable conversation frames. */
export function CrossWaits({
  root,
  live,
}: {
  root: RefObject<HTMLDivElement | null>
  live: readonly TaskGraphNode[]
}) {
  const [edges, setEdges] = useState<Edge[]>([])
  useLayoutEffect(() => {
    const container = root.current
    const frames = container?.querySelector('[data-frame-list]')
    if (!container || !frames) return undefined
    let queued = 0
    const measure = () => {
      queued = 0
      const origin = container.getBoundingClientRect()
      const nodes = new Map<number, { rect: DOMRect; frame: Element }>()
      for (const element of frames.querySelectorAll('[data-task-id]')) {
        const id = Number(element.getAttribute('data-task-id'))
        const frame = element.closest('[data-frame]')
        const rect = element.getBoundingClientRect()
        if (!frame || !rect.width || !rect.height) continue
        const bounds = frame.getBoundingClientRect()
        if (
          rect.bottom <= bounds.top ||
          rect.top >= bounds.bottom ||
          rect.right <= bounds.left ||
          rect.left >= bounds.right ||
          rect.bottom <= origin.top ||
          rect.top >= origin.bottom ||
          rect.right <= origin.left ||
          rect.left >= origin.right
        )
          continue
        nodes.set(id, { rect, frame })
      }
      const next: Edge[] = []
      for (const task of live) {
        if (task.state.status !== 'waiting') continue
        const to = nodes.get(task.id)
        if (!to) continue
        for (const id of task.state.on) {
          const from = nodes.get(id)
          if (!from || from.frame === to.frame) continue
          next.push({
            from: id,
            to: task.id,
            x1: from.rect.right - origin.left,
            y1: from.rect.top + from.rect.height / 2 - origin.top,
            x2: to.rect.left - origin.left,
            y2: to.rect.top + to.rect.height / 2 - origin.top,
          })
        }
      }
      setEdges((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next))
    }
    const schedule = () => {
      if (!queued) queued = requestAnimationFrame(measure)
    }
    const mutation = new MutationObserver(schedule)
    mutation.observe(frames, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style'],
    })
    const resize = new ResizeObserver(schedule)
    resize.observe(container)
    const scrollRoot = container.parentElement
    scrollRoot?.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      if (queued) cancelAnimationFrame(queued)
      mutation.disconnect()
      resize.disconnect()
      scrollRoot?.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [root, live])
  if (!edges.length) return null
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
      data-cross-waits
    >
      <defs>
        <marker
          id="cross-wait-arrow"
          markerHeight="6"
          markerWidth="6"
          orient="auto"
          refX="5"
          refY="3"
        >
          <path className="fill-brand/60" d="M0,0 L6,3 L0,6 z" />
        </marker>
      </defs>
      {edges.map((edge) => (
        <path
          className="stroke-brand/60"
          d={`M${edge.x1} ${edge.y1} C${edge.x1 + 36} ${edge.y1}, ${edge.x2 - 36} ${edge.y2}, ${edge.x2} ${edge.y2}`}
          fill="none"
          key={`${edge.from}:${edge.to}`}
          markerEnd="url(#cross-wait-arrow)"
          strokeDasharray="3 4"
        />
      ))}
    </svg>
  )
}
