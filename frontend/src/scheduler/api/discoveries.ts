import { api, query } from './client'

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
  mid_time: string | null
  finished_at: string | null
  seconds: number
}

export interface DiscoveryMatch {
  catalog: string
  name: string
  type?: string
  sep_arcsec: number
  mag?: number | null
  note?: string
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

export const CANDIDATE_LIMIT = 5000

export const getDiscoveryNights = () => api.get<DiscoveryNight[] | null>('/discoveries/nights')

export const getDiscoveryRuns = (night: string, object?: string) =>
  api.get<DiscoveryRun[] | null>('/discoveries/runs' + query({ night, object }))

export const getDiscoveryCandidates = (night: string, object?: string) =>
  api.get<DiscoveryCandidate[] | null>(
    '/discoveries/candidates' + query({ night, object, limit: CANDIDATE_LIMIT }),
  )

export const getDiscoveryCandidate = (id: number) =>
  api.get<DiscoveryDetail>(`/discoveries/candidates/${id}`)

export const setDiscoveryVetting = (id: number, state: Vetting, note: string) =>
  api.put<DiscoveryCandidate>(`/discoveries/candidates/${id}/vetting`, { state, note })

export const getDiscoveryStatus = () => api.get<DiscoveryStatus>('/discoveries/status')
