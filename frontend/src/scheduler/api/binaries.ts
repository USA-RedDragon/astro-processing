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
  timing: TimingSummary
}

export interface TimingSummary {
  count: number
  text: string
  flags: string[]
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
export type RequestState = 'waiting' | 'sent' | 'failed' | 'done' | 'cancelled' | 'moved'

export interface EclipseRequest {
  id: number
  state: RequestState
  note: string
  auto: boolean
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

export type TimingKind = 'primary' | 'secondary'

export interface Timing {
  id: number
  kind: TimingKind
  kind_label: string
  night: string
  mid: string
  filter: string
  bjd_tdb: number
  hjd_utc: number
  err_minutes: number
  late_minutes: number
  late_text: string
  cycle: number
  points: number
  method: string
  check_minutes: number | null
  used: boolean
  state: 'good' | 'doubtful'
  note: string
  request_id: number | null
}

export interface UntimedEclipse {
  id: number
  kind: TimingKind
  kind_label: string
  night: string
  mid: string
  state: 'none'
  note: string
  request_id: number | null
}

export interface LatePoint {
  year: number
  kind: TimingKind
  minutes: number
  err_minutes: number
  used: boolean
}

export interface LateLine {
  kind: TimingKind
  points: [number, number][]
}

export type TrendId = 'ephemeris' | 'period' | 'orbit' | 'third'
export type TrendState = 'flag' | 'clear' | 'need'

export interface Trend {
  id: TrendId
  label: string
  state: TrendState
  why: string
  basis: string
}

export interface UpdatedEphemeris {
  period_text: string
  period: number
  period_err: number
  epoch_bjd_tdb: number
}

export interface SeasonKind {
  kind: TimingKind
  label: string
  want: number
  timed: number
  asked: number
  needed: number
}

export interface SeasonRequest {
  id: number
  state: RequestState
  note: string
  auto: boolean
}

export interface TimingSeason {
  start: string
  end: string
  opposition: string
  label: string
  kinds: SeasonKind[]
  stopped: string
  requests: SeasonRequest[]
}

export interface TimingRecord {
  source_id: number
  name: string
  period_text: string
  epoch_bjd_tdb: number
  epoch_hjd_utc: number
  prediction_note?: string
  summary: string
  timings: Timing[]
  untimed: UntimedEclipse[]
  points: LatePoint[]
  lines: LateLine[]
  trends: Trend[]
  updated: UpdatedEphemeris | null
  season: TimingSeason | null
}

export const getBinaries = () => api.get<BinaryList>('/discoveries/binaries')

export const updateBinary = (id: number, change: BinaryChange) =>
  api.put<Binary>(`/discoveries/binaries/${id}`, change)

export const setDiscoverer = (discoverer: string) =>
  api.put<{ discoverer: string }>('/discoveries/binaries/settings', { discoverer })

export const getShare = (sourceId: number) =>
  api.get<Share>(`/discoveries/sources/${sourceId}/share`)

export const getKit = (id: number) => api.get<Kit>(`/discoveries/binaries/${id}/kit`)

export const getTimings = (id: number) =>
  api.get<TimingRecord>(`/discoveries/binaries/${id}/timings`)

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
