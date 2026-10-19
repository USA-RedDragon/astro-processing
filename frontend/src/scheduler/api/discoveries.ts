import { API_BASE, api, query } from './client'

export type RunState = 'queued' | 'running' | 'done' | 'failed' | 'skipped'
export type Vetting = '' | 'real' | 'artifact' | 'known' | 'unsure'
export type CandidateClass =
  | 'known_variable'
  | 'known_asteroid'
  | 'known_transient'
  | 'nova_candidate'
  | 'supernova_candidate'
  | 'new_variable_candidate'
  | 'unknown_mover'
  | 'low_confidence'

export interface DiscoveryNight {
  night: string
  runs: number
  candidates: number
  new: number
}

export interface DiscoveryRun {
  id: number
  object: string
  night: string
  group: string
  filters: string[]
  state: RunState
  stage?: string
  error?: string | null
  night_subs: number
  ref_subs: number
  ref_nights: number
  depth: number | null
  sub_depth: number | null
  zero_point: number | null
  astrometry_rms_arcsec: number | null
  astrometry_stars: number
  hfr_night_px: number
  hfr_ref_px: number
  pixel_scale: number
  field_ra: number
  field_dec: number
  candidates: number
  new: number
  tracks: number
  known_tracks: number
  known_bodies_in_field: number
  checked: string[]
  failed: string[]
  funnel?: Record<string, Record<string, number>>
  classes: Record<string, number>
  vetted: number
  needs_look?: number
  held_many?: number
  held_defects?: number
  mid_time: string | null
  finished_at: string | null
  seconds: number
  mover_null?: { tracks: number; max_hits: number }
  change_null?: {
    subs: number
    found: number
    max_snr: number
    filter_found?: number
    filter_max_snr?: number
  }
}

/** TnsEntry is what the local TNS copy says about a known object. */
export interface TnsEntry {
  name: string
  type?: string
  group?: string
  discovered: string
  mag?: number | null
  filter?: string
  our_class?: string
  seen?: string
  early_data?: boolean
}

export interface DiscoveryMatch {
  catalog: string
  name: string
  type?: string
  sep_arcsec: number
  mag?: number | null
  note?: string
  tns?: TnsEntry | null
}

export interface DiscoveryCutouts {
  night: string
  ref: string
  diff: string
  fits: string
}

export interface LightPoint {
  frame_id: number
  filter: string
  time: string
  flux: number
  flux_err: number
  mag?: number | null
  mag_err?: number | null
  delta_mag?: number | null
}

export interface DiscoveryTrack {
  points: unknown[]
  ades: unknown[]
  trkSub: string
  rate_arcsec_per_min: number
  pa_deg: number
  residual_px: number
  body_name?: string
  body_number?: string
}

export interface DiscoveryCandidate {
  id: number
  run_id: number
  object: string
  night: string
  group: string
  kind: 'change' | 'mover'
  class: CandidateClass
  x: number
  y: number
  ra: number
  dec: number
  sign: number
  snr: number
  delta_mag: number | null
  night_mag: number | null
  ref_mag: number | null
  gaia_g: number | null
  present_in: number
  subs_tested: number
  matches: DiscoveryMatch[]
  rate_arcsec_per_min?: number | null
  offset_arcsec?: number | null
  body_v?: number | null
  vetting: Vetting
  vet_note: string
  vetted_at: string | null
  source_id?: number | null
  cutouts: DiscoveryCutouts | null
}

export interface DiscoveryDetail extends DiscoveryCandidate {
  light?: LightPoint[]
  track?: DiscoveryTrack
  run?: DiscoveryRun
}

export interface DiscoveryStatus {
  state: string
  object?: string
  night?: string
  group?: string
  stage?: string
  started?: string
  queued: number
  done_in_pass: number
}

export type SourceView = 'look' | 'known' | 'movers' | 'low' | 'artifacts' | 'vetted'

export interface DiscoverySourceNight {
  night: string
  candidates: DiscoveryCandidate[]
}

export interface DiscoverySource {
  id: number
  object: string
  kind: 'change' | 'mover'
  class: CandidateClass
  ra: number
  dec: number
  first_seen: string
  last_seen: string
  nights_seen: number
  nights_compared: number
  needs_look: boolean
  vetting: Vetting
  vet_note: string
  vetted_at: string | null
  best: DiscoveryCandidate
  nights: DiscoverySourceNight[]
  checked: string[]
  failed: string[]
}

export interface SourceCounts {
  look: number
  known: number
  movers: number
  new_movers: number
  low: number
  artifacts?: number
  vetted: number
  all: number
  look_earlier?: number
}

export interface DiscoverySourceList {
  sources: DiscoverySource[]
  total: number
  counts: SourceCounts
  since: string | null
}

export interface SourceQuery {
  object?: string
  since?: string
  night?: string
  q?: string
  view?: SourceView | ''
  limit?: number
}

export const getDiscoverySources = (p: SourceQuery) =>
  api.get<DiscoverySourceList>('/discoveries/sources' + query({ ...p }))

export const getDiscoverySource = (id: number) =>
  api.get<DiscoverySource>(`/discoveries/sources/${id}`)

export const setSourceVetting = (id: number, state: Vetting, note: string) =>
  api.put<DiscoverySource>(`/discoveries/sources/${id}/vetting`, { state, note })

export const getRecentRuns = (since: string | undefined, object?: string) =>
  api.get<DiscoveryRun[] | null>('/discoveries/runs' + query({ since, object }))

export const getDiscoveryCandidate = (id: number) =>
  api.get<DiscoveryDetail>(`/discoveries/candidates/${id}`)

export const setDiscoveryVetting = (id: number, state: Vetting, note: string) =>
  api.put<DiscoveryCandidate>(`/discoveries/candidates/${id}/vetting`, { state, note })

export const getDiscoveryStatus = () => api.get<DiscoveryStatus>('/discoveries/status')

export type ReportKind = 'change' | 'mover'
export type CheckState = 'ok' | 'todo' | 'wait' | 'bad'
export type SpotState = 'none' | 'queued' | 'measuring' | 'done' | 'failed'

export interface ReportField {
  key: string
  label: string
  value: string
  source: string
  missing?: boolean
}

export interface ReportCheck {
  key: string
  state: CheckState
  title: string
  detail: string
  link?: string
  link_text?: string
}

export interface EarlierNight {
  night: string
  filter: string
  subs: number
  result: string
  hit?: boolean
}

export interface TnsDraft {
  applies: boolean
  fields: ReportField[]
  earlier: EarlierNight[]
  earlier_note: string
  copy_text: string
  can_send: boolean
  send_reason?: string
  name?: string
  name_link?: string
  sent_at?: string
  sent_reply?: string
}

export interface MpcDraft {
  applies: boolean
  reason?: string
  code: string
  psv?: string
  xml?: string
}

export interface VsxPoint {
  time: string
  filter: string
  mag: number
  mag_err?: number
}

export interface VsxDraft {
  applies: boolean
  position: string
  type_guess: string
  range: string
  points: VsxPoint[]
}

export interface SpotMeasure {
  state: SpotState
  error?: string
  measured_at?: string
}

export interface KnownTns {
  name: string
  link?: string
  text: string
  discovered: string
  early: boolean
  early_text?: string
  early_basis?: string[]
}

export interface FollowupPoint {
  time: string
  night: string
  filter: string
  mag?: number | null
  mag_err?: number | null
  limit?: number | null
  exposure: number
  early?: boolean
  note: string
}

export interface TnsFollowup {
  applies: boolean
  name?: string
  points: FollowupPoint[]
  non_detection?: string
  can_send: boolean
  send_reason?: string
  sent_at?: string
  sent_reply?: string
}

export interface DiscoveryReport {
  candidate_id: number
  object: string
  night: string
  class: CandidateClass
  kind: ReportKind
  ra: string
  dec: string
  facts: ReportField[]
  checks: ReportCheck[]
  tns: TnsDraft
  known?: KnownTns | null
  tns_followup?: TnsFollowup
  mpc: MpcDraft
  vsx: VsxDraft
  spot: SpotMeasure
}

export interface TnsSendReply {
  report_id: string | number
  name?: string
}

const reportPath = (id: number) => `/discoveries/candidates/${id}/report`

export const getDiscoveryReport = (id: number) => api.get<DiscoveryReport>(reportPath(id))

export const measureDiscoverySpot = (id: number, again = false) =>
  api.post<SpotMeasure>(reportPath(id) + '/measure' + query({ again: again ? 1 : undefined }))

export const setTnsName = (id: number, name: string) =>
  api.put<DiscoveryReport>(reportPath(id) + '/tns-name', { name })

export const sendToTns = (id: number) => api.post<TnsSendReply>(reportPath(id) + '/tns-send')

export const sendFollowupToTns = (id: number) =>
  api.post<TnsSendReply>(reportPath(id) + '/tns-followup-send')

export const reportBundleUrl = (id: number) => API_BASE + reportPath(id) + '/bundle.zip'

export type CheckStatus = 'pass' | 'fail' | 'skip'
export type ChecksState = 'none' | 'queued' | 'running' | 'done' | 'failed'
export type Confidence = 'high' | 'medium' | 'low'

export interface VetCheck {
  id: string
  name: string
  status: CheckStatus
  evidence: string
}

export interface VetGroup {
  id: string
  name: string
  checks: VetCheck[]
}

export interface VetSuggestion {
  state: Exclude<Vetting, ''>
  say: string
  why: string
  confidence: Confidence
}

export interface VetChartPoint {
  x: number
  y: number
  err?: number
}

export interface VetChart {
  id: string
  title: string
  sub: string
  x_label: string
  y_label: string
  x_unit: 'hours' | 'phase' | 'year'
  y_unit: 'dmag' | 'mag'
  x0: number
  x1: number
  y0: number
  y1: number
  x_ticks: number[]
  y_ticks: number[]
  points: VetChartPoint[] | null
  line?: [number, number][] | null
  refs?: { y: number; style: 'base' | 'fade' }[] | null
  vref?: number | null
  legend?: { style: 'dot' | 'line' | 'dash'; label: string }[] | null
  empty?: string
}

export interface VetReport {
  version: number
  source_id: number
  ran_at: string
  star: string
  suggestion: VetSuggestion
  groups: VetGroup[] | null
  charts: VetChart[] | null
  ephemeris?: Record<string, unknown> | null
  pending?: string[] | null
}

export interface SourceChecks {
  source_id: number
  state: ChecksState
  report: VetReport | null
  error: string
  requested_at: string | null
  finished_at: string | null
}

export const getSourceChecks = (id: number) =>
  api.get<SourceChecks>(`/discoveries/sources/${id}/checks`)

export const runSourceChecks = (id: number) =>
  api.post<SourceChecks>(`/discoveries/sources/${id}/checks`)
