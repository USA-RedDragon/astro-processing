import { ApiError } from '@/scheduler/api/client'
import type { BiasBacklog, BiasBacklogCombo, BiasBacklogPublish } from '@/scheduler/api/calibration'
import { fmt } from './calibration'
import { NOT_RECORDED, num, publishText, when } from './darkBacklog'

export function isBiasBacklog(v: unknown): v is BiasBacklog {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function biasUnavailableText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Not available: the stacker does not serve the bias backlog (HTTP 404).'
    return `Not available: ${error.message || `HTTP ${error.status}`}`
  }
  return `Not available: ${error instanceof Error ? error.message : String(error)}`
}

export function sortBiasCombos(combos: BiasBacklogCombo[] | null | undefined): BiasBacklogCombo[] {
  return [...(combos ?? [])].sort((a, b) => a.priority - b.priority || a.combo_key.localeCompare(b.combo_key))
}

export function biasFramesNeededText(b: Pick<BiasBacklog, 'frames_needed'>): string {
  if (b.frames_needed == null) return `Bias frames needed per set: ${NOT_RECORDED}.`
  return `Bias frames needed per set: ${fmt(b.frames_needed)}.`
}

export function biasNeedRuleText(b: Pick<BiasBacklog, 'frames_needed'>): string {
  const target = b.frames_needed == null ? `the frame target (${NOT_RECORDED})` : `${fmt(b.frames_needed)} frames`
  return `Bias does not go stale by age. Lights use the nearest bias set of their gain, offset and binning, however old. A setup is on the backlog only when it has no bias set or its set has fewer than ${target}.`
}

export function biasSessionGapText(b: Pick<BiasBacklog, 'session_gap_hours'>): string {
  if (b.session_gap_hours == null) return `Session gap: ${NOT_RECORDED}.`
  return `Bias frames of one setup taken less than ${fmt(b.session_gap_hours)} h apart form one set; a longer pause starts a new set.`
}

export function biasOpenSetTitle(b: Pick<BiasBacklog, 'session_gap_hours'>): string {
  if (b.session_gap_hours == null) return `Bias frames in the set being taken now. Session gap: ${NOT_RECORDED}.`
  return `Bias frames in the set being taken now: the newest bias frame of this setup is less than ${fmt(b.session_gap_hours)} h old. Older frames do not count; a new set starts at 0.`
}

export function currentBiasText(c: Pick<BiasBacklogCombo, 'current_bias_night' | 'current_bias_age_days'>): string {
  if (!c.current_bias_night) return 'none on record'
  const age = c.current_bias_age_days == null ? `age ${NOT_RECORDED}` : `${fmt(c.current_bias_age_days)} d old`
  return `${c.current_bias_night}, ${age}`
}

export function newestBiasText(c: Pick<BiasBacklogCombo, 'newest_bias_at'>): string {
  return when(c.newest_bias_at, 'none taken')
}

export function biasPublishText(p: BiasBacklogPublish | null | undefined): string[] {
  const lines = publishText(p)
  if (p?.published_at) lines.push(`Last publish changed ${num(p.changed)} rows and deleted ${num(p.deleted)}.`)
  return lines
}
