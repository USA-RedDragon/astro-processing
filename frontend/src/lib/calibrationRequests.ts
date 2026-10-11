import { ApiError } from '@/scheduler/api/client'
import type {
  CalibrationPayload,
  CalibrationRequest,
  CalibrationRequestItem,
  CalibrationRequestPublish,
  CalibrationRequestRef,
  CalibrationType,
} from '@/scheduler/api/calibration'
import { NOT_RECORDED, num, text, when } from './darkBacklog'

export const CALIBRATION_TYPES: readonly CalibrationType[] = ['flats', 'darks', 'bias']

export const TYPE_LABELS: Record<CalibrationType, string> = {
  flats: 'Flats',
  darks: 'Darks',
  bias: 'Bias',
}

const STATUS_ORDER: Record<string, number> = { open: 0, done: 1, cancelled: 2 }

export function typeLabel(t: string): string {
  return TYPE_LABELS[t as CalibrationType] ?? t
}

export function nightsOf(rows: { night: string }[]): string[] {
  return [...new Set(rows.map((r) => r.night).filter(Boolean))].sort((a, b) => b.localeCompare(a))
}

export function sortRequests(list: CalibrationRequest[] | null | undefined): CalibrationRequest[] {
  const at = (r: CalibrationRequest) => (r.created_at ? Date.parse(r.created_at) || 0 : 0)
  return [...(list ?? [])].sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) ||
      at(b) - at(a) ||
      b.night.localeCompare(a.night),
  )
}

export function openRequests(list: CalibrationRequest[] | null | undefined): CalibrationRequest[] {
  return sortRequests(list).filter((r) => r.status === 'open')
}

export function hasOpenRequest(
  list: CalibrationRequest[] | null | undefined,
  type: CalibrationType,
  night: string,
  object?: string,
): boolean {
  return (list ?? []).some(
    (r) => r.status === 'open' && r.type === type && r.night === night && (object == null || r.object === object),
  )
}

export function requestPayload(
  type: CalibrationType,
  object: string,
  targetId: number | string | null | undefined,
  night: string,
): CalibrationPayload {
  const id = targetId == null || targetId === '' ? Number.NaN : Number(targetId)
  return Number.isInteger(id) ? { type, object, target_id: id, night } : { type, object, night }
}

export function payloadOf(r: Pick<CalibrationRequest, 'type' | 'object' | 'target_id' | 'night'>): CalibrationPayload {
  return requestPayload(r.type, r.object, r.target_id, r.night)
}

export function requestTitle(r: Pick<CalibrationRequest, 'type' | 'object' | 'night'>): string {
  return `${typeLabel(r.type)} for ${r.object} · night of ${r.night}`
}

export function itemText(i: CalibrationRequestItem): string {
  return `${num(i.frames_have)} of ${num(i.frames_needed, '', NOT_RECORDED)}`
}

export function progressText(r: Pick<CalibrationRequest, 'items'>): string {
  const items = r.items ?? []
  if (items.length === 0) return 'No items recorded.'
  const done = items.filter((i) => i.done).length
  return `${done} of ${items.length} done`
}

export function askedText(r: Pick<CalibrationRequest, 'created_by' | 'created_at'>): string {
  return `Asked by ${text(r.created_by, 'someone not recorded')} on ${when(r.created_at, NOT_RECORDED)}`
}

export function statusText(
  r: Pick<CalibrationRequest, 'status' | 'done_at' | 'cancelled_at' | 'cancelled_by'>,
): string {
  if (r.status === 'open') return 'Open'
  if (r.status === 'done') return `Done on ${when(r.done_at, NOT_RECORDED)}`
  if (r.status === 'cancelled') {
    return `Cancelled by ${text(r.cancelled_by, 'someone not recorded')} on ${when(r.cancelled_at, NOT_RECORDED)}`
  }
  return `Status: ${text(r.status, NOT_RECORDED)}`
}

export function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'open') return 'default'
  if (status === 'done') return 'secondary'
  return 'outline'
}

export interface PublishState {
  seen: boolean
  text: string
}

function settingFor(table: string): string {
  return table === 'ts_dark_need' ? 'darks.publish' : 'calibration.publish'
}

export function requestPublishState(
  p: CalibrationRequestPublish | null | undefined,
  createdAt?: string | null,
): PublishState {
  const notYet = 'The observatory does not see this request yet'
  if (!p) return { seen: false, text: `${notYet}: the publish state is ${NOT_RECORDED}.` }
  const table = p.table || 'its table'
  const setting = settingFor(table)
  if (p.mode === 'off') return { seen: false, text: `${notYet}: publishing to ${table} is off (${setting}).` }
  if (p.mode === 'dry-run') {
    return {
      seen: false,
      text: `${notYet}: publishing to ${table} is in dry-run mode (${setting}), so the stacker only logs what it would write.`,
    }
  }
  if (p.mode !== 'on') {
    return { seen: false, text: `${notYet}: the publishing mode for ${table} is ${text(p.mode, NOT_RECORDED)}.` }
  }
  if (p.skipped) return { seen: false, text: `${notYet}: the last publish to ${table} was skipped: ${p.skipped}` }
  if (!p.published_at) {
    return { seen: false, text: `${notYet}: publishing to ${table} is on, but nothing was published since the stacker started.` }
  }
  const pub = Date.parse(p.published_at)
  const made = createdAt ? Date.parse(createdAt) : Number.NaN
  if (Number.isFinite(pub) && Number.isFinite(made) && pub < made) {
    return {
      seen: false,
      text: `${notYet}: it waits for the next publish to ${table}; the last one was on ${when(p.published_at)}.`,
    }
  }
  return { seen: true, text: `Published to ${table} for the observatory on ${when(p.published_at)}.` }
}

export function refsText(refs: CalibrationRequestRef[] | null | undefined): string[] {
  return (refs ?? []).map((r) => `${r.object} · night of ${r.night}`)
}

const INVALID_PREFIX = /^invalid command payload:\s*/i

export function commandErrorText(e: unknown): string {
  const msg = e instanceof ApiError ? e.message || `HTTP ${e.status}` : e instanceof Error ? e.message : String(e)
  return msg.replace(INVALID_PREFIX, '')
}

export function requestsUnavailableText(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Not available: the stacker does not serve calibration requests (HTTP 404).'
  }
  return `Not available: ${commandErrorText(error)}`
}
