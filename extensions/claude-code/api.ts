/** Claude Code: an optional per-conversation environment for its CLI requests. */
import { defineApi } from '../../shared/extension-api.ts'

export type ClaudeCodeEnvService = {
  /**
   * Extra environment for one Claude Code request, merged over the request's own (for example
   * `PI_CLAUDE_CODE_CONFIG_DIR`). `conversationId` is the conversation the request generates for, or undefined when it
   * is not known (an extension's one-shot call, a compaction resumed after a restart). Return undefined to change
   * nothing. Each distinct environment gets its own warm CLI process.
   */
  env(conversationId: number | undefined): Record<string, string> | undefined
}
/** Implemented by another extension; claude-code `want`s it on every request. */
export const ClaudeCodeEnv = defineApi<ClaudeCodeEnvService>()('claude-code.env')
