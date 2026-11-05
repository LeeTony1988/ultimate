/** Cloud backups of the active chapter; optional because cloud ships disabled. */
import { defineApi } from '../../shared/extension-api.ts'
import type { LastBackup } from './types.ts'

export { BackupEvent } from './refs.ts'
export type { LastBackup } from './types.ts'
export type CloudService = {
  /** Back up the active chapter, without overriding a conflict. */
  backup(): Promise<LastBackup>
  /**
   * The active chapter's last backup: this home's record, else the Worker's register (a backup registered before a
   * restart let this home record it). Undefined unless backups are on and the chapter has one.
   */
  lastBackup(): Promise<LastBackup | undefined>
  /** Off when unconfigured; local when the project has no GitHub origin; satellite when this machine never backs up. */
  status(): Promise<'off' | 'local' | 'satellite' | 'on'>
}
/** Optional chapter backup service; resolve with `want` at call time. */
export const CloudApi = defineApi<CloudService>()('cloud')
