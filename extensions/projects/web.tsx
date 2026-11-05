import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  api,
  cn,
  defineWebExtension,
  elidePath,
  ProjectChip,
  shortenPath,
  useAction,
  useSystem,
} from '@/sdk'
import { ListAction, OpenAction } from './refs.ts'
import type { Project } from './refs.ts'

/** `ultimate <root>` is what a person can type when starting from the switcher fails. */
const command = (root: string) => `ultimate ${root}`

/**
 * The title bar's project chip as a switcher: every registered project, newest-opened first, the current one marked.
 * A running project is a real link, so the browser gives new-tab and middle-click; a stopped one starts its host and
 * navigates when it is ready. Switching is a full page load: every project is its own origin.
 */
function ProjectSwitcher() {
  const system = useSystem()
  const [busy, setBusy] = useState<string>()
  const [failure, setFailure] = useState<{ root: string; message: string }>()
  const {
    data,
    error: listError,
    loading,
    refetch,
  } = useAction(ListAction, null, {
    // A failed list leaves the last one; opening the menu tries again.
    enabled: false,
    onError: () => {},
  })

  const start = async (project: Project) => {
    setBusy(project.root)
    setFailure(undefined)
    try {
      const { url } = await api.action(OpenAction, { root: project.root })
      window.location.assign(url)
    } catch (cause) {
      setFailure({
        root: project.root,
        message: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(undefined)
    }
  }

  /** The full path (shortened at home), the count, and how to start it by hand when it is stopped. */
  const tip = (project: Project) => {
    const root = elidePath(
      system ? shortenPath(project.root, { home: system.machine.home }) : project.root,
      72,
    )
    const count = `${project.conversationCount} ${project.conversationCount === 1 ? 'conversation' : 'conversations'}`
    return project.running
      ? `${root}\n${count}`
      : `${root}\n${count}\nStart in a terminal: ${command(project.root)}`
  }

  const rows = data ?? []
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) return
        setFailure(undefined)
        refetch().catch(() => {
          // useAction reports the failure through onError; the menu keeps its last list.
        })
      }}
    >
      <DropdownMenuTrigger asChild>
        <ProjectChip aria-label="Switch project" data-ui="project-switcher" menu />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)]" sideOffset={4}>
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 section-label">Projects</DropdownMenuLabel>
        {!data && loading && (
          <div className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">loading…</div>
        )}
        {!data && listError && (
          <div className="px-2 py-1.5 font-mono text-[11px] text-error">{listError.message}</div>
        )}
        {data && rows.length === 0 && (
          <div className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">no projects</div>
        )}
        {rows.map((project) => {
          const running = Boolean(project.running)
          const dot = (
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                running || busy === project.root ? 'bg-brand' : 'bg-muted-foreground/40',
                busy === project.root && 'animate-pulse-dot',
              )}
            />
          )
          const name = (
            <span
              className={cn('min-w-0 flex-1 truncate text-[13px]', project.current && 'text-brand')}
            >
              {project.name}
            </span>
          )
          const state = (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {busy === project.root
                ? 'starting…'
                : project.current
                  ? 'current · running'
                  : running
                    ? 'running'
                    : 'not running'}
            </span>
          )
          const failed = failure?.root === project.root && (
            <div
              className="px-2 pb-1.5 pl-[1.375rem] font-mono text-[11px] leading-snug text-error"
              role="alert"
            >
              {failure.message}
            </div>
          )

          if (project.current)
            return (
              <DropdownMenuItem
                aria-current="page"
                className="gap-2 py-1.5"
                data-project={project.name}
                key={project.root}
                onSelect={() => {
                  refetch().catch(() => {
                    // useAction reports the failure through onError.
                  })
                }}
                title={tip(project)}
              >
                {dot}
                {name}
                {state}
              </DropdownMenuItem>
            )

          if (project.running)
            return (
              <DropdownMenuItem asChild className="gap-2 py-1.5" key={project.root}>
                <a data-project={project.name} href={project.running.url} title={tip(project)}>
                  {dot}
                  {name}
                  {state}
                </a>
              </DropdownMenuItem>
            )

          return (
            <div key={project.root}>
              <DropdownMenuItem
                className="gap-2 py-1.5"
                data-project={project.name}
                disabled={busy !== undefined}
                onSelect={(event) => {
                  // Keep the menu open while the host boots, so the row can say what is happening.
                  event.preventDefault()
                  start(project).catch(() => {
                    // start reports its own failure in the row.
                  })
                }}
                title={tip(project)}
              >
                {dot}
                {name}
                {state}
              </DropdownMenuItem>
              {failed}
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default defineWebExtension({
  slots: { 'titlebar.project': [ProjectSwitcher] },
})
