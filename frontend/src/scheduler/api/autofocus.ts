import { api, query } from './client'
import type { AfRuns } from '../autofocus'

export function getAutofocusRuns(since: string, limit = 200, signal?: AbortSignal): Promise<AfRuns> {
  return api.get<AfRuns>('/scheduler/autofocus' + query({ since, limit }), signal)
}
