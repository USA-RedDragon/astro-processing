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
