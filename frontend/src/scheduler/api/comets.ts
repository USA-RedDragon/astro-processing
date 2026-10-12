import { api, query } from './client'

export interface CometWindow {
  hours: number
  start: string | null
  end: string | null
  peak_alt: number
  peak_at: string | null
}

export interface Comet {
  name: string
  designation: string
  horizons_command: string
  orbit_type: string
  perihelion: string
  q_au: number
  e: number
  magnitude_mpc: number | null
  magnitude_jpl: number | null
  r_au: number
  delta_au: number
  ra: number
  dec: number
  rate_arcsec_per_min: number
  window: CometWindow
}

export interface ElementsInfo {
  source: string
  fetched_at: string | null
  comets: number
  error?: string
}

export interface CometView {
  computed_at: string
  night: { start: string; dusk?: string; dawn?: string }
  min_altitude: number
  max_magnitude: number
  elements: ElementsInfo
  jpl_magnitudes: ElementsInfo
  basis: string
  comets: Comet[] | null
}

export interface BodyTable {
  target_guid: string
  name: string
  designation: string
}

export interface BodiesResult {
  tables: BodyTable[] | null
}

export const COMET_MAX_MAG = 15
export const COMET_MIN_ALT = 30

export const getComets = (maxMag = COMET_MAX_MAG, minAlt = COMET_MIN_ALT) =>
  api.get<CometView>('/comets' + query({ max_mag: maxMag, min_alt: minAlt }))

export const getBodies = () => api.get<BodiesResult>('/bodies')

export interface BodyFraming {
  rotation_deg: number
  offset_frac: number
}

export interface BodyTrackRow {
  at: string
  ra: number
  dec: number
  alt: number
  dark: boolean
  rate_arcsec_per_min: number
  motion_pa: number | null
  tail_pa: number | null
  velocity_pa: number | null
  mag: number | null
}

export interface BodyTrack {
  designation: string
  kind: string
  horizons_command: string
  night: { night: string; start: string; stop: string }
  fetched_at: string | null
  cached: boolean
  angles: boolean
  best: BodyTrackRow | null
  rows: BodyTrackRow[] | null
  basis: string
}

export interface BodyFrameInfo {
  width_deg: number
  height_deg: number
  basis: string
}

export interface BodyTrackView {
  track: BodyTrack
  frame: BodyFrameInfo | null
  frame_reason: string | null
}

export interface BodyTargetView {
  target: {
    target_guid: string
    name: string
    designation: string
    kind: string
    active: boolean
    rotation_deg: number | null
    offset_frac: number | null
  } | null
  framing_columns: boolean
}

export const getBodyTrack = (designation: string, kind?: string, signal?: AbortSignal) =>
  api.get<BodyTrackView>('/bodies/track' + query({ designation, kind }), signal)

export const getBodyTarget = (guid: string) =>
  api.get<BodyTargetView>('/bodies/target' + query({ target_guid: guid }))
