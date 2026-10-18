import { api, query } from './client'

export type FlagId = 'twice' | 'half' | 'few' | 'blend'

export interface Flag {
  id: FlagId
  label: string
  why: string
}

export interface EclipseInfo {
  kind: 'primary' | 'secondary'
  phase: number
  depth: number | null
  band: string
  duration_hours: number | null
}

export interface VsxState {
  submitted: boolean
  ref: string
  submitted_at: string | null
}

export type FactsState = 'ready' | 'pending' | 'failed'

export interface Share {
  state: 'ready' | 'pending' | 'none' | 'failed'
  url: string
  version: number
  note: string
}

export interface Binary {
  source_id: number
  name: string
  alt_name: string
  field: string
  magnitude: string
  type: string
  type_words: string
  period: number
  period_text: string
  alt_period_text: string
  eclipses: EclipseInfo[]
  depth_text: string
  confidence: string
  period_settled: boolean
  flags: Flag[]
  vsx: VsxState
  notes: string
  facts_state: FactsState
  facts_error: string
  share: Share
}

export interface FactsJob {
  state: 'idle' | 'running'
  done: number
  total: number
}

export interface BinaryList {
  stars: Binary[]
  discoverer: string
  facts: FactsJob
}

export interface BinaryChange {
  vsx_submitted?: boolean
  vsx_ref?: string
  notes?: string
  primary_name?: string
  checklist?: Record<string, boolean>
}

export type KitFieldState = 'value' | 'not_measured' | 'not_looked_up' | 'empty' | 'not_set'

export interface KitField {
  key: string
  label: string
  value: string
  state: KitFieldState
  hint: string
  editable: boolean
}

export type KitFileKey = 'phased' | 'own' | 'chart'

export interface KitFile {
  key: KitFileKey
  title: string
  state: 'ready' | 'pending' | 'none' | 'failed'
  url: string
  caption: string
  bytes: number
  note: string
}

export interface KitCheck {
  key: string
  text: string
  done: boolean
  auto: boolean
  note: string
}

export interface Kit {
  star: Binary
  lede: string
  fields: KitField[]
  files: KitFile[]
  checklist: KitCheck[]
}

export type EclipsePurpose = 'flag' | 'period' | 'own'
export type RequestState = 'waiting' | 'sent' | 'failed' | 'done'

export interface EclipseRequest {
  id: number
  state: RequestState
  note: string
}

export interface PlannedEclipse {
  source_id: number
  name: string
  field: string
  magnitude: string
  period_text: string
  alt_period_text: string
  kind: 'primary' | 'secondary'
  kind_label: string
  mid: string
  day_label: string
  time_label: string
  zone: 'CDT' | 'CST'
  err_minutes: number
  duration_hours: number | null
  observable: boolean
  observable_note: string
  purpose: EclipsePurpose
  why: string
  window: { start: string; end: string }
  request: EclipseRequest | null
}

export interface EclipsePlan {
  from: string
  to: string
  zone_note: string
  site_known: boolean
  eclipses: PlannedEclipse[]
  hidden: number
}

export const getBinaries = () => api.get<BinaryList>('/discoveries/binaries')

export const updateBinary = (id: number, change: BinaryChange) =>
  api.put<Binary>(`/discoveries/binaries/${id}`, change)

export const setDiscoverer = (discoverer: string) =>
  api.put<{ discoverer: string }>('/discoveries/binaries/settings', { discoverer })

export const getShare = (sourceId: number) =>
  api.get<Share>(`/discoveries/sources/${sourceId}/share`)

export const getKit = (id: number) => api.get<Kit>(`/discoveries/binaries/${id}/kit`)

export const getEclipses = (days: number, all: boolean) =>
  api.get<EclipsePlan>('/discoveries/eclipses' + query({ days, all: all ? 1 : undefined }))

export const requestEclipse = (e: Pick<PlannedEclipse, 'source_id' | 'kind' | 'mid'>) =>
  api.post<EclipseRequest>('/discoveries/eclipses/requests', {
    source_id: e.source_id,
    kind: e.kind,
    mid: e.mid,
  })

export const cancelEclipseRequest = (id: number) =>
  api.del<unknown>(`/discoveries/eclipses/requests/${id}`)
