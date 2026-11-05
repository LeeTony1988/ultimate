import { randomUUID } from 'node:crypto'
import type { BuildInfo } from '../shared/protocol.ts'

export type CoreReport =
  | { type: 'log'; level: 'info' | 'warn' | 'error'; source: string; text: string }
  | { type: 'web'; state: 'preparing' | 'ready' | 'stopped' }
  | { type: 'access'; origins: string[] }

export function reportCore(message: CoreReport) {
  if (process.send && process.connected) process.send(message, () => {})
}

/** Presentation never enters the lifecycle acknowledgement queue. */
export function isCoreReport(message: ChildMessage): message is CoreReport {
  return message.type === 'log' || message.type === 'web' || message.type === 'access'
}

export type ChildMessage =
  | CoreReport
  | { type: 'prepared'; port: number }
  | { type: 'ready' | 'released' }
  | { type: 'failed'; error: string }
  | { type: 'swap'; requestId: string; build?: BuildInfo }
  | { type: 'swap-ack'; requestId: string; ok: boolean; error?: string }
export type SupervisorMessage =
  | { type: 'go' | 'release' | 'exit' }
  | { type: 'reacquire'; error: string }
  | { type: 'swap-result'; requestId: string; ok: false; error: string }
  | { type: 'swap-result'; requestId: string; ok: true; generation: number }

// Success is acknowledged only after the caller has durably recorded its replay result.
export async function requestSwap(
  approved: (generation: number) => Promise<void>,
  build?: BuildInfo,
): Promise<string> {
  if (!process.send) return 'Restart requires pnpm start (the supervisor).'
  const requestId = randomUUID()
  return new Promise((resolve) => {
    const listener = (message: SupervisorMessage) => {
      if (message.type !== 'swap-result' || message.requestId !== requestId) return
      process.off('message', listener)
      if (!message.ok) return resolve(message.error.slice(-4096))
      void approved(message.generation).then(
        () => {
          process.send?.({ type: 'swap-ack', requestId, ok: true } satisfies ChildMessage)
        },
        (error) => {
          process.send?.({
            type: 'swap-ack',
            requestId,
            ok: false,
            error: String(error),
          } satisfies ChildMessage)
          resolve(String(error))
        },
      )
    }
    process.on('message', listener)
    process.send?.({ type: 'swap', requestId, build } satisfies ChildMessage)
  })
}
