// `web-access`: a free web search tool over the `pi-web-access` package's stdio MCP server. Jina answers first and
// Exa without a key; see README.md for the settings and secrets it reads.
import { Type } from 'typebox'
import type { JsonValue } from '@earendil-works/chord'
import { defineExtension, defineTool, section } from '@earendil-works/pi-durable'
import type { ExtensionHost } from '../../../server/extensions.ts'
import { search } from './client.ts'
import type { SearchOutcome } from './client.ts'

export const secrets = [
  {
    name: 'JINA_API_KEY',
    description: 'Jina Search key for web_search; without it searches fall back to Exa',
    url: 'https://jina.ai/api-dashboard',
  },
  {
    name: 'EXA_API_KEY',
    description: 'Optional Exa key; keyless Exa search works without one',
    url: 'https://dashboard.exa.ai',
  },
]

const guidance = `Use web_search to find current public web pages or to verify a fact you cannot confirm from the project.
It searches with Jina first and falls back to Exa when Jina has no key, fails or returns nothing; Exa needs no key.
Write a self-contained description of what to find, and vary the words rather than repeating the same search.
Do not use web_search for a URL you already have: fetch that page with the shell tool (curl) or the browser tool.`

/** The card reads these fields; `text` is only for the model. */
function details(outcome: SearchOutcome): JsonValue {
  return outcome.status === 'success'
    ? {
        status: outcome.status,
        query: outcome.query,
        provider: outcome.provider,
        fallback: outcome.fallback,
        answer: outcome.answer,
        results: outcome.results,
      }
    : {
        status: outcome.status,
        query: outcome.query,
        error: outcome.text,
        attempts: outcome.attempts,
      }
}

type Host = Pick<ExtensionHost, 'home' | 'userHome' | 'projectSettings'>

export default function webAccess(host: Host) {
  return defineExtension({
    name: 'web-access',
    sections: [section('web_access', () => guidance)],
    tools: [
      defineTool({
        name: 'web_search',
        // Repeating a search only reads public web results; it changes no project state.
        replay: 'safe',
        description:
          "Search the public web through the local pi-web-access MCP server and return ranked sources with titles, URLs and the provider's summary. Jina answers first; Exa, which needs no API key, answers when Jina has no key, fails or returns nothing. Use it to discover sources or find current information; for a known page, fetch it with curl or the browser tool.",
        parameters: Type.Object({
          query: Type.String({
            minLength: 1,
            maxLength: 5000,
            description:
              'A self-contained description of what to find on the web, with the key facts and any source or freshness preferences.',
          }),
          maxResults: Type.Optional(
            Type.Integer({
              minimum: 1,
              maximum: 20,
              description:
                "How many results to ask the provider for. Defaults to the provider's own 5.",
            }),
          ),
        }),
        async execute(args, api, context) {
          const outcome = await search(host, {
            query: args.query,
            maxResults: args.maxResults,
            signal: context.abortSignal,
          })
          await api.details(details(outcome), context)
          return {
            isError: outcome.status === 'error',
            output: [{ type: 'text', text: outcome.text }],
          }
        },
      }),
    ],
  })
}
