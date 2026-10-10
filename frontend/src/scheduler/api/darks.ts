import { api } from './client'

export interface DarkBacklogCombo {
  combo_key: string
  priority: number
  exposure: number | null
  gain: number | null
  offset: number | null
  binning: number | null
  readout_mode: string | null
  set_temp: number | null
  set_temps_covered: number[] | null
  frames_needed: number | null
  frames_have: number | null
  frames_rejected: number | null
  lights_blocked: number | null
  lights_scaled: number | null
  nights: number | null
  latest_night: string | null
  newest_dark_at: string | null
  basis: string | null
}

export interface DarkBacklogUnschedulable {
  exposure: number | null
  set_temp: number | null
  lights: number | null
  reason: string | null
}

export interface DarkBacklogSession {
  from: string | null
  to: string | null
  frames: number | null
  clean: number | null
  leak: number | null
  unchecked: number | null
}

export interface DarkBacklogRejected {
  key: string
  taken_at: string | null
  exposure: number | null
  gain: number | null
  offset: number | null
  set_temp: number | null
  spread_adu: number | null
  median_adu: number | null
  reason: string | null
}

export interface DarkBacklogPublish {
  mode: string | null
  published_at: string | null
  rows: number | null
  skipped: string | null
}

export interface DarkBacklog {
  computed_at: string | null
  frames_needed: number | null
  frames_needed_basis: string | null
  set_temp_exact_c: number | null
  session_gap_hours: number | null
  combos: DarkBacklogCombo[] | null
  unschedulable: DarkBacklogUnschedulable[] | null
  last_session: DarkBacklogSession | null
  rejected: DarkBacklogRejected[] | null
  unchecked: number | null
  publish: DarkBacklogPublish | null
}

export const getDarkBacklog = (signal?: AbortSignal) =>
  api.get<DarkBacklog>('/coverage/dark-backlog', signal)
