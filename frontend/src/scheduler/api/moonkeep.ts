import { api, query } from './client'

export interface MoonKeepRow {
  filter: string
  narrowband: boolean
  moon_down: boolean
  illum_bin: number
  alt_bin: number
  sep_bin: number
  illum_from: number
  illum_to: number
  alt_from: number
  alt_to: number
  sep_from: number
  sep_to: number
  subs: number
  kept: number
  nights: number
  rate: number
  low: number
  high: number
  worth: number
  usable: boolean
  skip: boolean
}

export interface MoonKeepSlotClass {
  targets: number
  plans: number
  skipped: number
  unknown: number
  skip: boolean
  rate: number
  rate_high: number
}

export interface MoonKeepSlot {
  at: string
  illumination: number
  altitude: number
  sun_altitude: number
  broadband: MoonKeepSlotClass | null
  narrowband: MoonKeepSlotClass | null
}

export interface MoonKeepReplayNight {
  night: string
  illumination: number
  subs: number
  kept: number
  skipped_subs: number
  skipped_hours: number
  kept_lost: number
  idle_hours: number
}

export interface MoonKeepReplay {
  nights: number
  moon_up_nights: number
  subs: number
  kept: number
  moon_up_subs: number
  moon_up_hours: number
  moon_up_kept: number
  skipped_subs: number
  skipped_hours: number
  skipped_nights: number
  kept_lost: number
  idle_subs: number
  idle_hours: number
  idle_kept_lost: number
  worst: MoonKeepReplayNight[] | null
  by_night: MoonKeepReplayNight[] | null
}

export interface MoonKeepRules {
  skip_below: number
  confidence: number
  min_subs: number
  min_nights: number
  good_night_quality: number
  floor_degrees: number
  prior_strength: number
  illum_edges: number[]
  alt_edges: number[]
  sep_edges: number[]
}

export interface MoonKeepPublish {
  mode: string
  published_at: string | null
  rows: number
  changed: number
  deleted: number
  skipped?: string
  error?: string
}

export interface MoonKeepView {
  computed_at: string | null
  mode: string
  rules: MoonKeepRules
  subs: number
  kept: number
  nights: number
  from: string | null
  to: string | null
  rows: MoonKeepRow[] | null
  replay: MoonKeepReplay | null
  publish: MoonKeepPublish
  reason?: string
  night?: MoonKeepSlot[] | null
}

export const getMoonKeep = (start?: string, end?: string) =>
  api.get<MoonKeepView>('/moonkeep' + query({ start, end }))
