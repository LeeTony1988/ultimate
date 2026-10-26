# web-access

A free web search for this project: the `web_search` tool bridges the `pi-web-access` package's local stdio MCP
server, asks **Jina** first and falls back to **Exa**, which needs no API key. Ultimate is the only config system it
reads: settings from `.ultimate/settings.json`, keys from the Secrets panel.

Files: `client.ts` (settings, secrets, sanitized child environment, MCP stdio bridge, provider fallback),
`server.ts` (the tool and its prompt guidance), `web.tsx` (the card).

## Settings

`webAccess` in `<project>/.ultimate/settings.json`; each field is optional and the defaults are exactly this (the
project's settings load once its setup decision is made, which onboarding asks for):

```json
{
  "webAccess": {
    "mcpCommand": ["npx", "-y", "pi-web-access@0.44.0"],
    "defaultProvider": "jina",
    "fallbackProvider": "exa",
    "timeoutMs": 20000
  }
}
```

- `mcpCommand` is an argv array, program first; a single string is a bare command. The query never touches it (it
  travels over stdin), and nothing is run through a shell, except that on Windows a bare command such as `npx` goes
  through `cmd.exe`, which Node requires for `.cmd` shims: there `%` and `"` are refused as a command part, and an
  absolute executable path runs directly. For a pinned install, point it at the package entry,
  `["node", "<path>/pi-web-access/dist/mcp-cli.js"]`; the `npx` default resolves the package on its first use.
- `defaultProvider` is tried first; `fallbackProvider` answers when it errors, times out or returns no results. Both
  may name any provider the MCP server supports; the same name twice means one attempt.
- `timeoutMs` bounds one provider attempt (1 s – 120 s).

## Secrets

| Name           | Needed | What it is                                            |
| -------------- | ------ | ----------------------------------------------------- |
| `JINA_API_KEY` | no     | Jina Search key; without it searches use Exa          |
| `EXA_API_KEY`  | no     | Optional Exa key; keyless Exa search works without it |

Add them in ⌘K → Secrets. Both are declared here as metadata only; values never enter extension info, logs or the
model's context.

## What the MCP server gets

The child inherits the server's environment except the variables this bridge owns:

- `PI_CODING_AGENT_DIR` is set to `<ULTIMATE_HOME>/web-access/pi-config`, a directory the bridge creates and never
  writes into, and `PI_CONFIG_DIR` and `XDG_CONFIG_HOME` are removed: `pi-web-access` cannot read Pi's config, its
  `web-search.json`, or keys configured there.
- `JINA_API_KEY` and `EXA_API_KEY` are removed from the inherited environment and set only from Ultimate's secret
  store, so a key in a shell variable or a Pi config never leaks in.

Jina's own "API key not found" message, and any other message naming the package's `web-search.json`, is replaced
with how to add the key in Ultimate's Secrets panel.

## How a search runs

One `web_search` call starts the MCP server (`initialize`, `notifications/initialized`, then `tools/call`), reads the
answer, and stops it again by ending its stdin and killing it; a fallback starts a second process, so a timeout in one
attempt cannot poison the other. The process is stopped when the call finishes, when `timeoutMs` passes, or when the
tool call is cancelled.
`tools/call` replies with text only (the package keeps `details` off the wire), so `client.ts` maps its
`**Provider:**`/`**Sources:**` format to results, and accepts a source-only reply that carries no `**Sources:**`
marker; the version in the default command pins that format.

`details` carries `status`, the `provider` that answered, the `fallback` (`from` and `reason`) and the ranked
`results`, so the card can show a provider badge, the fallback note and links. When both providers fail, the result
is an error whose text lists both reasons and whose card shows them per provider.

## The card

The query with its top domains in the header, and beside it the provider badge and result count. The body shows why
the default provider did not answer, the provider's summary as markdown (images disallowed) and the numbered sources
with links. A failure lists one line per provider.

## Tests

`vp test test/web-access.test.ts` is the fast suite: a fake MCP call proves the Jina→Exa fallback (an error, a
thrown timeout, an empty result and a source-only reply), Jina used when Ultimate secrets hold a key, both-fail
reporting, the text→results mapping, `maxResults` reaching the server as `numResults`, settings defaults and
overrides, and the sanitized child environment. It spawns nothing and waits on nothing.

A live check needs network and a package the command can start — the `npx` default fetches it, or point
`webAccess.mcpCommand` at an installed `pi-web-access/dist/mcp-cli.js`. Run `web_search` from any agent: with no Jina
key configured the card shows `EXA` and the fallback note.

## Notes

- The `parallel` built-in also defines `web_search` (and needs a Parallel API key); it ships off, and both on means one
  of them wins. This extension is the keyless one.
- `fetch_content`, `get_search_content` and `source_check` are not bridged: this is a search tool. For a known page,
  use the shell's `curl` or the browser tool.
