import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MessageResponse } from '@/components/ai/message'
import { Shimmer } from '@/components/ai/shimmer'
import {
  Tool,
  ToolContent,
  ToolDiagnostics,
  ToolHeader,
  ToolOutput,
  ToolSection,
} from '@/components/ai/tool'
import { defineWebExtension, plural, useToolDuration } from '@/sdk'
import type { ToolCallView } from '@/sdk'

// The card's contract mirrors `web_search`'s `details` (server.ts); the web project does not load server modules.
type Source = { title: string; url: string }
type Fallback = { from: string; reason: string }

/** The provider's summary is page content: the card keeps its gist, while the model gets all of it. */
const SUMMARY = 700
const gist = (answer: string) =>
  answer.length > SUMMARY ? `${answer.slice(0, SUMMARY).trimEnd()}…` : answer

/** The `details` of `web_search` (server.ts). */
type Details =
  | {
      status: 'success'
      query: string
      provider: string
      fallback: Fallback | null
      answer: string
      results: Source[]
    }
  | {
      status: 'error'
      query: string
      error: string
      attempts: { provider: string; error: string }[]
    }
const text = (value: unknown) => (typeof value === 'string' ? value : '')
/** A provider's summary must not load anything from the web: no images. */
const offline = ['img', 'picture', 'source']

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
/** The first few distinct domains, in rank order. */
function domains(urls: readonly string[], count = 3) {
  const unique = [...new Set(urls.map(host))]
  return unique.length > count
    ? `${unique.slice(0, count).join(', ')} +${unique.length - count}`
    : unique.join(', ')
}

/** Which provider answered, as a quiet chip in the header. */
function Provider({ name }: { name: string }) {
  return (
    <span
      className="rounded-sm border border-border/70 px-1 py-px text-[10px] tracking-wide text-muted-foreground uppercase"
      title={`answered by ${name}`}
    >
      {name}
    </span>
  )
}

/** A link that opens in a new tab; nothing is requested until it is followed. */
function Link({
  url,
  className,
  children,
}: {
  url: string
  className?: string
  children: ReactNode
}) {
  return (
    <a className={className} href={url} rel="noreferrer" target="_blank" title={url}>
      {children}
    </a>
  )
}

/** Why the default provider did not answer: a warning line above the sources. */
function FallbackNote({ fallback }: { fallback: Fallback }) {
  return (
    <ToolSection className="border-b border-border/60 py-1.5 text-[11px]">
      <div className="flex min-w-0 items-start gap-1.5 text-warning">
        <span className="shrink-0">!</span>
        <span className="min-w-0 break-words">
          <span className="uppercase">{fallback.from}</span> did not answer ·{' '}
          <span className="text-muted-foreground">{fallback.reason}</span>
        </span>
      </div>
    </ToolSection>
  )
}

function Sources({ results }: { results: Source[] }) {
  return (
    <ol aria-label="Search results" className="divide-y divide-border/60">
      {results.map((result, index) => (
        <li className="flex gap-2.5 px-2.5 py-2" key={result.url}>
          <span className="w-4 shrink-0 text-right text-muted-foreground/60 tabular-nums">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              className="block truncate font-sans text-[13px] text-foreground hover:underline"
              url={result.url}
            >
              {result.title}
            </Link>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={result.url}>
              {host(result.url)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Search({ call }: { call: ToolCallView }) {
  const duration = useToolDuration(call)
  const details = call.details as Details | undefined
  const success = details?.status === 'success' ? details : undefined
  const failure = details?.status === 'error' ? details : undefined
  const query = details?.query ?? text(call.args.query)
  const running =
    call.status === 'running' || call.status === 'pending' || call.status === 'streaming'
  // Collapsed while it goes well; a failure opens it, also one that arrives live.
  const failed = call.status === 'error'
  const [open, setOpen] = useState(failed)
  const was = useRef(failed)
  useEffect(() => {
    if (failed && !was.current) setOpen(true)
    was.current = failed
  }, [failed])
  return (
    <Tool onOpenChange={setOpen} open={open}>
      <ToolHeader
        meta={
          <>
            {success && <Provider name={success.provider} />}
            {success && <span>{plural(success.results.length, 'result')}</span>}
            {duration && <span>{duration}</span>}
          </>
        }
        name="search"
        state={call.status}
        title={
          <>
            <span className="text-foreground/90">{query}</span>
            {success && success.results.length > 0 && (
              <span className="text-muted-foreground/60">
                {' '}
                · {domains(success.results.map((result) => result.url))}
              </span>
            )}
          </>
        }
      />
      <ToolContent>
        {running && (
          <ToolSection>
            <Shimmer className="text-[12px]">searching the web…</Shimmer>
          </ToolSection>
        )}
        {failure ? (
          <>
            <ToolSection className="space-y-1.5">
              {failure.attempts.length === 0 && (
                <div className="break-words text-[12px] text-error">{failure.error}</div>
              )}
              {failure.attempts.map((attempt) => (
                <div
                  className="flex min-w-0 items-start gap-2 text-[11.5px]"
                  key={`${attempt.provider}:${attempt.error}`}
                >
                  <span className="shrink-0 rounded-sm border border-border/70 px-1 py-px text-[10px] tracking-wide text-muted-foreground uppercase">
                    {attempt.provider}
                  </span>
                  <span className="min-w-0 break-words text-error">{attempt.error}</span>
                </div>
              ))}
            </ToolSection>
            <ToolSection className="border-t border-border/60 text-[11px] text-muted-foreground/70">
              providers and keys: webAccess in .ultimate/settings.json, keys in the Secrets panel
            </ToolSection>
          </>
        ) : (
          success && (
            <>
              {success.fallback && <FallbackNote fallback={success.fallback} />}
              {success.answer && (
                <ToolSection className="border-b border-border/60">
                  <MessageResponse
                    className="text-[12.5px] leading-snug text-muted-foreground"
                    disallowedElements={offline}
                  >
                    {gist(success.answer)}
                  </MessageResponse>
                </ToolSection>
              )}
              {success.results.length > 0 ? (
                <Sources results={success.results} />
              ) : (
                <ToolSection className="text-muted-foreground/70">no results</ToolSection>
              )}
            </>
          )
        )}
        {!details && call.status === 'error' && <ToolOutput isError output={call.output} />}
        <ToolDiagnostics diagnostics={call.diagnostics.filter((d) => d.code !== 'tool_error')} />
      </ToolContent>
    </Tool>
  )
}

export default defineWebExtension({ tools: { web_search: Search } })
