import { cn } from 'cn'
import { ChevronDownIcon, CommandIcon, EllipsisIcon } from 'lucide-react'
import { forwardRef } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SystemInfo } from '../../../shared/protocol.ts'
import { actions, shellKeys } from '../sdk/actions.ts'
import { shortenPath } from '../sdk/format.ts'
import { useExtensions, useRegionOpen, useStore, useSystem, useUiState } from '../sdk/hooks.ts'
import { HOME, panelItems, shownPanels, slotItems, surfaceItems } from '../sdk/registry.ts'
import { useViewport } from '../sdk/viewport.ts'
import { Slot } from './boundary.tsx'
import { Shortcut } from './palette.tsx'
import { sidebarWidthBeyondPhone } from './primitives.tsx'

/**
 * The project as tabs name it: its folder from home. A branch's checkout (`<home>/worktrees/<id>`) is the project's
 * name and that conversation, and a server with a home outside `~/.ultimate/projects`, as test previews have, says
 * it is a preview.
 */
/** Windows paths use `\`; the patterns and comparisons here use `/`. */
const slashed = (path: string) => path.replaceAll('\\', '/')

export function projectTitle(system: SystemInfo | undefined) {
  if (!system) return undefined
  const { home } = system.machine
  const worktree = /\/\.ultimate\/projects\/(.+)-[\da-f]{8}\/worktrees\/(\d+)$/.exec(
    slashed(system.project.root),
  )
  const project = worktree
    ? `${worktree[1]} #${worktree[2]}`
    : shortenPath(system.project.root, { home })
  return slashed(system.persistence.path).startsWith(`${slashed(home)}/.ultimate/projects/`)
    ? project
    : `preview · ${project}`
}

/**
 * The project as the title bar's chip says it beside the wordmark: another project's name, a branch checkout's
 * `#<worktree>`; nothing for Ultimate's own checkout, whose name the wordmark already says.
 */
export function projectName(system: SystemInfo | undefined) {
  if (!system) return ''
  const worktree = /\/\.ultimate\/projects\/(.+)-[\da-f]{8}\/worktrees\/(\d+)$/.exec(
    slashed(system.project.root),
  )
  const name = worktree?.[1] ?? system.project.name
  const own = name.toLowerCase() === 'ultimate'
  return [own ? '' : name, worktree ? `#${worktree[2]}` : ''].filter(Boolean).join(' ')
}

/**
 * The title bar's project chip: `projectName`, its full path in the tooltip; nothing when that is empty and nothing
 * else is in it. Pass `menu` to show a chevron and act as a dropdown trigger (spread the trigger's props through);
 * without it the chip is plain text.
 */
export const ProjectChip = forwardRef<
  HTMLButtonElement,
  ComponentProps<'button'> & { menu?: boolean; children?: ReactNode }
>(function ProjectChip({ menu, className, children, ...props }, ref) {
  const system = useSystem()
  const name = projectName(system)
  const preview =
    system &&
    !slashed(system.persistence.path).startsWith(
      `${slashed(system.machine.home)}/.ultimate/projects/`,
    )
  if (!system || (!name && !preview && !menu)) return null
  const body = (
    <>
      {preview && (
        <span className="text-muted-foreground max-md:hidden">preview{name && ' ·'}</span>
      )}
      {name && <span className="truncate">{name}</span>}
      {children}
      {menu && <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />}
    </>
  )
  const chip =
    'flex h-7 min-w-0 shrink items-center gap-1.5 rounded-md px-2 font-sans text-[13px] font-medium text-foreground/90'
  if (!menu)
    return (
      <span className={cn(chip, className)} title={system?.project.root}>
        {body}
      </span>
    )
  return (
    <button
      className={cn(
        chip,
        'transition-colors outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent',
        className,
      )}
      ref={ref}
      title={system?.project.root}
      type="button"
      {...props}
    >
      {body}
    </button>
  )
})

/** The project chip, or what extensions put in its place (`titlebar.project`), such as the chip with a menu. */
function Project() {
  const replaced = slotItems(useExtensions(), 'titlebar.project').length > 0
  return replaced ? <Slot name="titlebar.project" variant="inline" /> : <ProjectChip />
}

const wordmark =
  'flex shrink-0 items-center gap-2 rounded-sm px-1 font-sans text-[11px] font-semibold tracking-[0.28em] text-brand'

/** The ULTIMATE wordmark beyond a phone; with `onClick` a button, for an extension that fills `titlebar.brand`. */
export function Wordmark({ onClick, label }: { onClick?: () => void; label?: string }) {
  if (!onClick) return <span className={wordmark}>ULTIMATE</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className={cn(
            wordmark,
            'h-6 cursor-pointer px-1.5 transition-colors outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring',
          )}
          onClick={onClick}
          type="button"
        >
          ULTIMATE
        </button>
      </TooltipTrigger>
      {label && <TooltipContent>{label}</TooltipContent>}
    </Tooltip>
  )
}

/**
 * The brand. Beyond a phone it is the mark, which an extension may make a button (`titlebar.brand`), since the tabs
 * beside it list the surfaces; on phones it opens the list of surfaces and names the shown one.
 */
function Brand() {
  const surfaces = surfaceItems(useExtensions())
  const shown = useStore((state) => state.ui.surface?.id)
  const current = surfaces.find((surface) => surface.id === shown)
  const Icon = current?.icon
  const replaced = slotItems(useExtensions(), 'titlebar.brand').length > 0
  return (
    <>
      <span className="contents max-md:hidden">
        {replaced ? <Slot name="titlebar.brand" variant="inline" /> : <Wordmark />}
      </span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              wordmark,
              'transition-opacity outline-none hover:opacity-80 focus-visible:ring-1 focus-visible:ring-ring md:hidden',
            )}
            title="Switch surface"
            type="button"
          >
            ULTIMATE
            {current && current.id !== HOME && (
              <span className="flex items-center gap-1.5 text-[12px] font-medium tracking-normal text-foreground">
                {Icon && <Icon className="size-3.5 text-muted-foreground" />}
                {current.title}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-96" sideOffset={4}>
          <DropdownMenuLabel className="px-2 pt-1 pb-1.5 font-mono text-[10.5px] font-normal tracking-wider text-muted-foreground uppercase">
            Surfaces
          </DropdownMenuLabel>
          {surfaces.map((surface, index) => {
            const Item = surface.icon
            const active = surface.id === shown
            return (
              <DropdownMenuItem
                className="items-start gap-2.5 py-1.5"
                data-surface={surface.id}
                key={surface.id}
                onSelect={() => actions.showSurface(surface.id)}
              >
                <Item
                  className={cn('mt-0.5 size-4', active ? 'text-brand' : 'text-muted-foreground')}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[13px]', active && 'text-brand')}>
                    {surface.title}
                  </span>
                  {surface.description && (
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {surface.description}
                    </span>
                  )}
                </span>
                {index < 9 && (
                  <span className="mt-0.5 shrink-0">
                    <Shortcut keys={`mod+${index + 1}`} />
                  </span>
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/** One segment per surface beyond a phone, the shown one raised like a selected tab. */
function SurfaceItems() {
  const surfaces = surfaceItems(useExtensions())
  const shown = useStore((state) => state.ui.surface?.id)
  return (
    <nav className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/50 p-0.5 font-sans text-[12.5px] max-md:hidden">
      {surfaces.map((surface, index) => {
        const Icon = surface.icon
        const active = surface.id === shown
        const button = (
          <button
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-6 items-center gap-1.5 rounded-[5px] px-2 transition-colors outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-xs ring-1 ring-border/70'
                : 'hover:bg-accent/60',
            )}
            data-surface={surface.id}
            key={surface.id}
            onClick={() => actions.showSurface(surface.id)}
            type="button"
          >
            <Icon className={cn('size-3.5', active && 'text-brand')} />
            {surface.title}
          </button>
        )
        if (index >= 9) return button
        return (
          <Tooltip key={surface.id}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              {surface.description ?? surface.title}
              <Shortcut keys={`mod+${index + 1}`} />
            </TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}

/** The panels an unfolded foldable's title bar shows as icons; the others sit behind its `⋯`. */
const quickPanels = ['todos', 'tasks', 'activity', 'info']

const action =
  'flex size-7 items-center justify-center rounded-md transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring'

/**
 * On a tablet (an unfolded foldable) the panels overlay the conversation and the header's toggle sits far from the
 * hand, so the title bar's right end gets the `quickPanels` as icons, each opening its panel or closing it when
 * shown, and a `⋯` menu with the rest.
 */
function PanelActions() {
  const panels = panelItems(useExtensions())
  const open = useRegionOpen('panels')
  const [selected] = useUiState<string | null>(shellKeys.panel, null)
  const { active, tabs } = shownPanels(panels, selected)
  const tablet = useViewport() === 'tablet'
  const agent = useStore((state) => state.ui.surface?.id === HOME)
  if (!tablet || !agent) return null
  const quick = tabs.filter((panel) => quickPanels.includes(panel.id))
  const more = tabs.filter((panel) => !quickPanels.includes(panel.id))
  return (
    <nav className="flex items-center gap-0.5">
      {quick.map((panel) => {
        const Icon = panel.icon
        const shown = open && panel.id === active?.id
        return (
          <Tooltip key={`${panel.extension}:${panel.id}`}>
            <TooltipTrigger asChild>
              <button
                aria-label={panel.title}
                aria-pressed={shown}
                className={cn(action, shown && 'bg-accent text-foreground')}
                onClick={() => (shown ? actions.closePanel() : actions.openPanel(panel.id))}
                type="button"
              >
                {Icon ? <Icon className="size-4" /> : panel.title}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{panel.title}</TooltipContent>
          </Tooltip>
        )
      })}
      {more.length > 0 && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="More panels"
              className={cn(
                action,
                'data-[state=open]:bg-accent data-[state=open]:text-foreground',
                open && active && more.includes(active) && 'bg-accent text-foreground',
              )}
              type="button"
            >
              <EllipsisIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {more.map((panel) => {
              const Icon = panel.icon
              return (
                <DropdownMenuItem
                  className="gap-2 py-1.5 font-mono text-[12px]"
                  key={`${panel.extension}:${panel.id}`}
                  onSelect={() => actions.openPanel(panel.id)}
                >
                  {Icon && <Icon className="size-3.5" />}
                  {panel.title}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  )
}

/**
 * The bar above every surface, as the status line's background: the brand (the surface switcher on phones), the
 * project chip, `titlebar.left`, the surfaces; then `titlebar.right`, the panel actions on a tablet and the command
 * palette.
 */
export function TitleBar() {
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 overflow-hidden border-b border-border/70 bg-sidebar pr-3 font-mono text-[11.5px] text-muted-foreground">
      <div className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap">
        {/* As wide as the docked sidebar on every surface, so the surfaces never move and start where Agent's conversation does. */}
        <div
          className={cn(
            'flex min-w-0 items-center gap-2 overflow-hidden pl-3 pr-3 md:shrink-0 md:pr-2',
            sidebarWidthBeyondPhone,
          )}
        >
          <Brand />
          <Project />
          <Slot name="titlebar.left" variant="inline" />
        </div>
        <div className="flex shrink-0 items-center pl-2">
          <SurfaceItems />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        <Slot name="titlebar.right" variant="inline" />
        <PanelActions />
        <Button
          aria-label="Command palette"
          className="-mr-1 h-6 gap-1.5 px-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground max-lg:hidden"
          onClick={actions.openPalette}
          size="sm"
          variant="ghost"
        >
          commands
          <Shortcut keys="mod+k" />
        </Button>
        <Button
          aria-label="Command palette"
          className="-mr-1 size-6 text-muted-foreground hover:text-foreground md:max-lg:size-7 lg:hidden"
          onClick={actions.openPalette}
          size="icon"
          variant="ghost"
        >
          <CommandIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
