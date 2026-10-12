import { api } from './client'
import type { CommandRecord } from './commands'
import type { ProjectSettingValues } from './planning'

export type GlobalSettings = Omit<ProjectSettingValues, 'useCustomHorizon' | 'horizonOffset'>

export interface SchedulingView {
  mode: 'off' | 'dry-run' | 'on'
  global: GlobalSettings
  defaults: GlobalSettings
  saved: boolean
  savedAt?: string
  savedBy?: string
  rules: { hardMinAltitude: number }
}

export const getScheduling = () => api.get<SchedulingView>('/scheduling')

export const saveScheduling = (settings: GlobalSettings) =>
  api.post<{ command: CommandRecord; refresh_error?: string }>('/scheduling/global', { settings })
