import {
  createClaudeCodeProvider,
  claudeCodeEnv,
} from '@earendil-works/pi-claude-code/src/provider.ts'
import {
  getClaudeStatus,
  closeClaudeProcesses,
  useSpawn,
} from '@earendil-works/pi-claude-code/src/claude-cli.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { implementAction } from '../../lib/actions.ts'
import { spawn } from '../../lib/spawn.ts'
import { StatusAction } from './refs.ts'

export function createUltimateClaudeCodeProvider() {
  const provider = createClaudeCodeProvider()
  const getModels = () =>
    provider
      .getModels()
      .map((model) =>
        model.id === 'claude-sonnet-5'
          ? { ...model, thinkingLevelMap: { ...model.thinkingLevelMap, off: null } }
          : model,
      )
  // Both getters must adapt the current catalog, including discovered/restored rows.
  // Upstream exposes only chat models. Keep its transport and refresh implementation intact.
  return { ...provider, getModels, getAllModels: getModels }
}

export default function claudeCode(host: ExtensionHost) {
  // Pi upstream: @earendil-works/pi-claude-code@0.1.0 src/claude-cli.ts useSpawn (patched). Claude Code starts from the
  // process helper, so a launch does not block this process.
  useSpawn(spawn)
  const shared = host.resource('claude-code.provider', () => {
    const provider = createUltimateClaudeCodeProvider()
    const active = new Set<Promise<unknown>>()
    let closing = false
    const track = (response: ReturnType<typeof provider.streamSimple>) => {
      const settled = response.result()
      active.add(settled)
      void settled.then(
        () => active.delete(settled),
        // The stream consumer receives the failure; tracking must not create another rejection.
        () => active.delete(settled),
      )
      return response
    }
    host.onClose(async () => {
      closing = true
      // Extension cleanup precedes harness suspension. Let its signal stop active
      // requests before closing warm workers; never turn suspension into an error.
      if (active.size)
        void Promise.allSettled(active)
          .then(() => closeClaudeProcesses())
          .catch((error: unknown) =>
            host.notice(`Closing Claude processes failed: ${String(error)}`),
          )
      else await closeClaudeProcesses()
    })
    const stream: typeof provider.stream = (...args) => {
      if (closing) throw new Error('Claude Code provider is closing')
      return track(provider.stream(...args))
    }
    const streamSimple: typeof provider.streamSimple = (...args) => {
      if (closing) throw new Error('Claude Code provider is closing')
      return track(provider.streamSimple(...args))
    }
    return { provider: { ...provider, stream, streamSimple }, facets: new Set<symbol>() }
  })
  const provider = { ...shared.provider }
  // Keep subscription accounting, but do not offer an in-app login for external auth.
  if (provider.auth.oauth) Reflect.deleteProperty(provider.auth.oauth, 'login')
  const facet = Symbol('claude-code')
  shared.facets.add(facet)
  host.onClose(async () => {
    shared.facets.delete(facet)
    if (!shared.facets.size) host.modelRuntime.unregisterProvider(provider.id)
  })
  // The replacement factory runs before the old facet closes. Keep its models
  // registered throughout that handoff, including disposal of a failed reload.
  host.modelRuntime.registerNativeProvider(provider)
  return { name: 'claude-code' }
}

export const actions = {
  status: implementAction(StatusAction, async (_args, { host, signal }) => {
    signal.throwIfAborted()
    const refreshed = await host.modelRuntime.refresh({ allowNetwork: false, signal })
    if (refreshed.aborted || refreshed.errors.has('claude-code'))
      throw new Error('Claude Code status refresh failed')
    const status = await getClaudeStatus(claudeCodeEnv(), signal)
    // Only expose status metadata, never CLI output or account identity.
    return {
      available: status.available,
      loggedIn: status.loggedIn,
      subscription: status.subscription,
      plan: status.plan ?? null,
    }
  }),
}
