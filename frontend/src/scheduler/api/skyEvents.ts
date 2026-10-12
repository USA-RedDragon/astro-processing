import { api, query } from './client'
import type { CommandRecord } from './commands'

export type SkyEventsStatus = 'ready' | 'pending' | 'unavailable'
export type BodyKind = 'moon' | 'planet' | 'comet' | 'asteroid'
export type ObjectKind = BodyKind | 'dso'
export type EventPriority = 'normal' | 'high'
export type PlanState =
  | 'queued'
  | 'pending'
  | 'applied'
  | 'saved'
  | 'failed'
  | 'rejected'
  | 'conflict'
  | 'cancelled'
  | 'undone'

export interface SkyCriteria {
  sun_below_deg: number
  min_altitude_deg: number
  step_minutes: number
  usable_width_deg: number
  usable_height_deg: number
  basis: string
}

export interface SkyFrameSize {
  width_deg: number
  height_deg: number
  basis: string
}

export interface SkyBody {
  name: string
  kind: BodyKind
  source: string
}

export interface BodyError {
  name: string
  error: string
}

export interface EventMember {
  name: string
  kind: ObjectKind
  designation: string | null
  type: string | null
  diameter_deg: number
  magnitude: number | null
}

export interface FrameObject {
  name: string
  kind: ObjectKind
  type: string | null
  east_deg: number
  north_deg: number
  x_deg: number
  y_deg: number
  diameter_deg: number
}

export interface EventFrame {
  center_ra: number
  center_dec: number
  rotation_deg: number
  width_deg: number
  height_deg: number
  objects: FrameObject[]
}

export interface NightWindow {
  night: string
  start: string
  end: string
  hours: number
  center_ra: number
  center_dec: number
}

export interface EventExposure {
  short_seconds: number | null
  normal_seconds: number | null
  basis: string
}

export interface EventPlan {
  state: PlanState
  priority: EventPriority
  project_guid: string
  target_guid: string
  command_id: string
  planned_at: string
  message: string | null
}

export interface SkyEvent {
  id: string
  kind: 'body-dso' | 'body-body'
  title: string
  members: EventMember[]
  first_night: string
  last_night: string
  nights: number
  start: string
  end: string
  best: { at: string; separation_deg: number; altitude_deg: number }
  hours_in_frame: number
  frame: EventFrame
  moving_center: boolean
  night_windows: NightWindow[]
  exposure: EventExposure
  priority: EventPriority
  plan: EventPlan | null
}

export interface SkyEvents {
  status: SkyEventsStatus
  reason: string | null
  computed_at: string | null
  from: string | null
  to: string | null
  months: number
  criteria: SkyCriteria | null
  frame: SkyFrameSize | null
  bodies: SkyBody[] | null
  body_errors: BodyError[] | null
  planning: { available: boolean; reason: string | null } | null
  events: SkyEvent[] | null
}

export interface EventChange {
  event: SkyEvent
  command: CommandRecord | null
}

const path = (id: string, action: string) => `/sky-events/${encodeURIComponent(id)}/${action}`

export const getSkyEvents = (months = 6, signal?: AbortSignal) =>
  api.get<SkyEvents>('/sky-events' + query({ months }), signal)

export const planSkyEvent = (id: string, priority: EventPriority) =>
  api.post<EventChange>(path(id, 'plan'), { priority })

export const setSkyEventPriority = (id: string, priority: EventPriority) =>
  api.post<EventChange>(path(id, 'priority'), { priority })

export const unplanSkyEvent = (id: string) => api.post<EventChange>(path(id, 'unplan'))
