import { api, query } from './client'
import { submitCommand } from './commands'

export type CalibrationType = 'flats' | 'darks' | 'bias'
export type CalibrationRequestStatus = 'open' | 'done' | 'cancelled'

export interface CalibrationRequestRef {
  id: string
  object: string
  night: string
}

export interface CalibrationRequestItem {
  key: string
  label: string
  frames_have: number | null
  frames_needed: number | null
  done: boolean
}

export interface CalibrationRequestPublish {
  table: string | null
  mode: string | null
  published_at: string | null
  skipped: string | null
}

export interface CalibrationRequest {
  id: string
  type: CalibrationType
  object: string
  target_id: number | null
  night: string
  status: CalibrationRequestStatus
  created_at: string | null
  created_by: string | null
  done_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  items: CalibrationRequestItem[] | null
  publish: CalibrationRequestPublish | null
  basis: string | null
}

export interface CalibrationPayload {
  type: CalibrationType
  object: string
  target_id?: number
  night: string
}

export interface BiasBacklogCombo {
  combo_key: string
  priority: number
  gain: number | null
  offset: number | null
  binning: number | null
  readout_mode: string | null
  frames_needed: number | null
  frames_have: number | null
  lights_missing: number | null
  lights_thin: number | null
  nights: number | null
  latest_night: string | null
  newest_bias_at: string | null
  current_bias_night: string | null
  current_bias_age_days: number | null
  requests: CalibrationRequestRef[] | null
  basis: string | null
}

export interface BiasBacklogUnschedulable {
  lights: number | null
  reason: string | null
}

export interface BiasBacklogPublish {
  mode: string | null
  published_at: string | null
  rows: number | null
  changed: number | null
  deleted: number | null
  skipped: string | null
}

export interface BiasBacklog {
  computed_at: string | null
  frames_needed: number | null
  frames_needed_basis: string | null
  session_gap_hours: number | null
  combos: BiasBacklogCombo[] | null
  unschedulable: BiasBacklogUnschedulable[] | null
  publish: BiasBacklogPublish | null
}

export interface CalibrationRequestFilter {
  object?: string
  status?: CalibrationRequestStatus | 'all'
}

export const getBiasBacklog = (signal?: AbortSignal) =>
  api.get<BiasBacklog>('/coverage/bias-backlog', signal)

export const getCalibrationRequests = (f: CalibrationRequestFilter = {}, signal?: AbortSignal) =>
  api.get<CalibrationRequest[]>(
    '/calibration/requests' + query({ object: f.object, status: f.status }),
    signal,
  )

export const requestCalibration = (p: CalibrationPayload) => submitCommand('calibration.request', p)

export const cancelCalibration = (p: CalibrationPayload) => submitCommand('calibration.cancel', p)
