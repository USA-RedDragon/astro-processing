import { api, query } from './client'
import type { CometWindow } from './comets'

export type AsteroidSource = 'two-body' | 'horizons'

export interface Asteroid {
  name: string
  designation: string
  number: number | null
  full_name: string
  kind: 'asteroid'
  horizons_command: string
  h: number
  g: number
  magnitude: number | null
  magnitude_source: AsteroidSource
  position_source: AsteroidSource
  neo: boolean
  r_au: number
  delta_au: number
  phase_angle: number
  ra: number
  dec: number
  rate_arcsec_per_min: number
  window: CometWindow
}

export interface AsteroidSourceInfo {
  source: string
  fetched_at: string | null
  asteroids: number
  error?: string
}

export interface AsteroidView {
  computed_at: string
  night: { start: string; dusk?: string; dawn?: string }
  min_altitude: number
  max_magnitude: number
  elements: AsteroidSourceInfo
  close_approaches: AsteroidSourceInfo
  basis: string
  asteroids: Asteroid[] | null
}

export const ASTEROID_MAX_MAG = 12
export const ASTEROID_MIN_ALT = 30

export const getAsteroids = (maxMag = ASTEROID_MAX_MAG, minAlt = ASTEROID_MIN_ALT) =>
  api.get<AsteroidView>('/asteroids' + query({ max_mag: maxMag, min_alt: minAlt }))
