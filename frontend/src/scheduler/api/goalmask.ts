import { api, API_BASE, query } from './client'

export interface GoalMaskInfo {
  object: string
  filter: string
  width: number
  height: number
  bin: number
  frame_width: number
  frame_height: number
  source: 'faint' | 'region'
  noise_mask: 'faint' | 'region' | 'background'
  sky: number
  band_lo: number | null
  band_hi: number | null
  band_low_percentile: number
  band_high_percentile: number
  total_pixels: number
  covered_pixels: number
  band_pixels: number
  star_pixels: number
  sky_pixels: number
  band_pct: number
  star_pct: number
  subs: number
  measured_at: string
}

export type GoalMaskLayer = 'band' | 'stars' | 'sky'

export const getGoalMaskInfo = (object: string, filter: string) =>
  api.get<GoalMaskInfo>('/goals/mask/info' + query({ object, filter }))

export const goalMaskURL = (info: GoalMaskInfo, layer: GoalMaskLayer) =>
  API_BASE +
  '/goals/mask' +
  query({ object: info.object, filter: info.filter, layer, v: info.measured_at })
