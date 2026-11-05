/**
 * Secrets in the browser: which secrets extensions declare and which are set, and the actions that set and delete them.
 * Values never come back. Browser-safe.
 */
import { actionRef } from '../../shared/extension-api.ts'

/** A declared or stored secret, without its value. */
export type Secret = {
  name: string
  description?: string
  /** Where to get the value. */
  url?: string
  /** The extensions that declare it. */
  declaredBy: string[]
  /** Stored in the user's secrets file. */
  set: boolean
  /** The model provider whose configured auth stands in for it, when it has auth. */
  via?: string
  /** ISO time of the last change, while set. */
  updatedAt?: string
}
/** What a change leaves: whether the secret is set now, and when it changed. */
export type Written = { name: string; set: boolean; updatedAt?: string }

/** No arguments → every declared or stored secret by name, without values. */
export const ListAction = actionRef<null, Secret[]>('secrets', 'list')
/** `{ name, value }` → the stored secret: save `value` under `name` in the user's secrets file. */
export const SetAction = actionRef<{ name: string; value: string }, Written>('secrets', 'set')
/** `{ name }` → the secret, now unset: remove it from the user's secrets file. */
export const DeleteAction = actionRef<{ name: string }, Written>('secrets', 'delete')
