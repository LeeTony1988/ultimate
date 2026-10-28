/**
 * Lineage for other extensions' browser code: the project's roots, a root's tally, landing links and compaction, the
 * branch and root events, and the Memory surface with its header point.
 */
import type { ReactNode } from 'react'
import { definePoint, getState, useDocOf, useUiState, useUltimate } from '@/sdk'
import { RootsDoc } from './refs.ts'

export {
  Branched,
  CompactAction,
  MemoryDoc,
  RecentAction,
  Rooted,
  RootsDoc,
  TallyDoc,
} from './refs.ts'
export type { MemoryItem } from './refs.ts'

/** The id of lineage's Memory surface: every root's project memory, grouped by kind, in a reading column. */
export const MEMORY_SURFACE = 'memory'
/** The UI state key of the memory the Memory surface shows unfolded and scrolled into view. */
export const MEMORY_FOCUS = 'ext.lineage.memoryFocus'

/** A function that opens the Memory surface, on memory `slug` unfolded when given. */
export function useOpenMemory() {
  const { showSurface } = useUltimate()
  const [, setFocus] = useUiState<string | null>(MEMORY_FOCUS, null)
  return (slug?: string) => {
    if (slug) setFocus(slug)
    showSurface(MEMORY_SURFACE)
  }
}

/** The composer's reading column, as the core lays it out; a card in place of a root's composer uses it. */
export const column = (dock?: boolean) =>
  dock ? 'w-full px-4' : 'mx-auto w-full max-w-[46rem] px-3 sm:px-6'

/** What the Memory surface shows above the memories (`dream` provides its Dream button). */
export const MemoryHeader = definePoint<null, ReactNode>('lineage.memory-header')

/** Conversation 1 keeps the `lineage.roots` document. */
const keeper = 1

/** The project's roots, live in every client; undefined until the stream delivers them. */
export function useRoots() {
  return useDocOf(keeper, RootsDoc)?.roots
}

/** The roots as last streamed, for synchronous readers such as a command's `when`; a mounted `useRoots` keeps them. */
export function getRoots() {
  return (getState().docsOf[keeper]?.[RootsDoc.kind] as { roots: number[] } | null | undefined)
    ?.roots
}
