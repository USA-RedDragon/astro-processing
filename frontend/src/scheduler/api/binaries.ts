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

export interface StarType {
  key: string
  words: string
  verb: string
  vsx: string
}

export type VetKind = '' | 'periodic' | 'fades' | 'brightens'

export interface OtherStar {
  source_id: number
  name: string
  alt_name: string
  field: string
  magnitude: string
  vet_kind: VetKind
  vet_line: string
  waiting: string
  period: number
  period_text: string
  confidence: string
  star_type: StarType | null
  vsx: VsxState
  notes: string
  share: Share
  dipper?: DipperSummary | null
}

export interface DipperSummary {
  windows_text: string
  dips_text: string
  every_window: boolean
}

export interface BinaryList {
  stars: Binary[]
  others?: OtherStar[]
  star_types?: StarType[]
  discoverer: string
  facts: FactsJob
}

export interface BinaryChange {
  vsx_submitted?: boolean
  vsx_ref?: string
  notes?: string
  primary_name?: string
  star_type?: string
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
  dips?: DipWindow[]
  hidden: number
}

export interface TimeSpan {
  start: string
  end: string
}

export interface DipImaging {
  subs: number
  seconds: number
  text: string
}

export type DipResultState = 'dip' | 'no-dip' | 'not-imaged' | 'waiting' | 'measuring' | 'unsure'

export interface DipResult {
  state: DipResultState
  label: string
  note: string
}

export interface DipWindow {
  source_id: number
  name: string
  field: string
  magnitude: string
  period_text: string
  n: number
  mid: string
  start: string
  end: string
  group_at: string
  day_label: string
  window_text: string
  zone: string
  mid_text: string
  mid_label: string
  dark: TimeSpan[]
  dark_minutes: number
  dark_text: string
  dark_note: string
  observable: boolean
  observable_note: string
  why: string
  every_window: boolean
  over: boolean
  request: EclipseRequest | null
  imaging: DipImaging | null
  result: DipResult
}

export interface DipperEphemeris {
  period: number
  epoch_mjd: number
  window_hours: number
  depth_low: number
  depth_high: number
  dur_low_hours: number
  dur_high_hours: number
  active_share: number
  past_surveys: string
  past_dips: number
  past_years: number
  past_active: number
  past_covered: number
}

export interface DipperView {
  source_id: number
  ephemeris: DipperEphemeris | null
  every_window: boolean
  windows_text: string
  dips_text: string
  past_text: string
  zone_note: string
  windows: DipWindow[]
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

export const updateOther = (id: number, change: BinaryChange) =>
  api.put<OtherStar>(`/discoveries/others/${id}`, change)

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

export const getDipper = (id: number) => api.get<DipperView>(`/discoveries/dippers/${id}`)

export const setEveryWindow = (id: number, on: boolean) =>
  api.put<DipperView>(`/discoveries/dippers/${id}/every-window`, { on })

export const requestDip = (id: number, mid: string) =>
  api.post<EclipseRequest>(`/discoveries/dippers/${id}/requests`, { mid })

export type LiveState = 'early' | 'following' | 'off' | 'comps' | 'no-dip' | 'dip'

export interface LivePoint {
  frame_id: number
  time: string
  filter: string
  mag: number
  err: number
  comp: number
}

export interface CurveSample {
  t: string
  v: number
  lo: number
  hi: number
}

export interface LiveEclipse {
  kind: 'primary' | 'secondary'
  mid: string
  err_min: number
  start: string
  end: string
  depth: number
  band: string
  basis: string
  curve: CurveSample[]
  shift_min?: number
  shift_err_min?: number
  fit_depth?: number
  fit_depth_err?: number
  planned_end: string
}

export interface LiveDip {
  start: string
  end: string
  depth_low: number
  depth_high: number
  active_share: number
  latest?: number
  smallest?: number
  over_min?: number
  dip_start?: string
  dip_depth?: number
}

export interface LiveCurve {
  kind: 'eclipse' | 'dip-watch'
  project_guid: string
  project_name: string
  object: string
  source_id: number
  name: string
  state: LiveState
  why: string
  note?: string
  filter?: string
  other_subs: number
  from: string
  to: string
  points: LivePoint[] | null
  comps: number
  comp_scatter?: number
  scatter?: number
  last_sub?: string
  eclipse?: LiveEclipse
  dip?: LiveDip
  updated_at: string
}

export const getLiveCurve = () => api.get<{ live: LiveCurve | null }>('/discoveries/live-curve')
