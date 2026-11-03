/** Tasks in the browser: when the durable tasks of the task tree first ran. Browser-safe. */
import { actionRef } from '../../shared/extension-api.ts'

/** `{ ids }` → `{ [taskId]: startedAt }`: when each task first ran, in milliseconds; unstarted or gone ones are left out. */
export const StartedAction = actionRef<{ ids: number[] }, Record<string, number>>(
  'tasks',
  'started',
)
