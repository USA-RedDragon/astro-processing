import { ApiError } from '@/scheduler/api/client'
import type {
  DarkBacklog,
  DarkBacklogCombo,
  DarkBacklogPublish,
  DarkBacklogRejected,
  DarkBacklogSession,
} from '@/scheduler/api/darks'
import { fmt } from './calibration'
import { formatDate } from './formatters'

export const NOT_MEASURED = 'not measured yet'
export const NOT_RECORDED = 'not recorded'
export const COMBO_LIMIT = 25

export function num(v: number | null | undefined, unit = '', missing = NOT_MEASURED): string {
  if (v == null || !Number.isFinite(v)) return missing
  return unit ? `${fmt(v)} ${unit}` : fmt(v)
}

export function when(v: string | null | undefined, missing = NOT_MEASURED): string {
  if (!v) return missing
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? missing : formatDate(ms / 1000)
}

export function text(v: string | null | undefined, missing = NOT_MEASURED): string {
  return v ? v : missing
}

export function isDarkBacklog(v: unknown): v is DarkBacklog {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function unavailableText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Not available: the stacker does not serve the dark backlog (HTTP 404).'
    return `Not available: ${error.message || `HTTP ${error.status}`}`
  }
  return `Not available: ${error instanceof Error ? error.message : String(error)}`
}

export function sortCombos(combos: DarkBacklogCombo[] | null | undefined): DarkBacklogCombo[] {
  return [...(combos ?? [])].sort(
    (a, b) => a.priority - b.priority || a.combo_key.localeCompare(b.combo_key),
  )
}

export function visibleCombos(
  combos: DarkBacklogCombo[] | null | undefined,
  showAll: boolean,
  limit = COMBO_LIMIT,
): DarkBacklogCombo[] {
  const sorted = sortCombos(combos)
  return showAll ? sorted : sorted.slice(0, limit)
}

export function framesNeededText(b: Pick<DarkBacklog, 'frames_needed'>): string {
  if (b.frames_needed == null) return `Darks needed per combo: ${NOT_RECORDED}.`
  return `Darks needed per combo: ${fmt(b.frames_needed)}.`
}

export function basisText(basis: string | null | undefined): string {
  return `Basis: ${text(basis, NOT_RECORDED)}`
}

export function setTempMatchText(b: Pick<DarkBacklog, 'set_temp_exact_c'>): string {
  if (b.set_temp_exact_c == null) return `Set temperature match: ${NOT_RECORDED}.`
  return `A dark matches a light when their set temperatures are within ${fmt(b.set_temp_exact_c)} °C.`
}

export function sessionGapText(b: Pick<DarkBacklog, 'session_gap_hours'>): string {
  if (b.session_gap_hours == null) return `Session gap: ${NOT_RECORDED}.`
  const h = fmt(b.session_gap_hours)
  return `Darks of one setup taken less than ${h} h apart form one set; a longer pause starts a new set.`
}

export function computedText(b: Pick<DarkBacklog, 'computed_at'>): string {
  return `Computed: ${when(b.computed_at, NOT_RECORDED)}.`
}

export function setpointText(c: Pick<DarkBacklogCombo, 'set_temp'>): string {
  return num(c.set_temp, '°C', NOT_RECORDED)
}

export function coveredText(c: Pick<DarkBacklogCombo, 'set_temps_covered'>): string {
  const temps = c.set_temps_covered ?? []
  if (temps.length === 0) return ''
  return `covers ${[...temps].sort((a, b) => a - b).map(fmt).join(', ')} °C`
}

export function framesText(c: Pick<DarkBacklogCombo, 'frames_have' | 'frames_needed'>): string {
  return `${num(c.frames_have)} of ${num(c.frames_needed)}`
}

export function readoutText(c: Pick<DarkBacklogCombo, 'readout_mode'>): string {
  return text(c.readout_mode, NOT_RECORDED)
}

export function setupText(r: Pick<DarkBacklogRejected, 'exposure' | 'gain' | 'offset' | 'set_temp'>): string {
  return [
    `${num(r.exposure, 's', 'exposure not recorded')}`,
    `gain ${num(r.gain, '', NOT_RECORDED)}`,
    `offset ${num(r.offset, '', NOT_RECORDED)}`,
    `${num(r.set_temp, '°C', 'set temperature not recorded')}`,
  ].join(', ')
}

export function sessionText(s: DarkBacklogSession | null | undefined): string {
  if (!s) return 'No darks session seen yet.'
  return (
    `${when(s.from)} to ${when(s.to)}: ${num(s.frames)} frames, ${num(s.clean)} clean, ` +
    `${num(s.leak)} rejected, ${num(s.unchecked)} not checked yet.`
  )
}

export function uncheckedText(b: Pick<DarkBacklog, 'unchecked'>): string {
  return `Darks not checked yet: ${num(b.unchecked)}.`
}

const publishModes: Record<string, string> = {
  off: 'Publishing is off: the observatory is not receiving the backlog.',
  'dry-run': 'Publishing is in dry-run mode: the stacker logs what it would write and the observatory receives nothing.',
  on: 'Publishing is on: the observatory receives the backlog.',
}

export function publishText(p: DarkBacklogPublish | null | undefined): string[] {
  if (!p) return [`Publishing: ${NOT_RECORDED}.`]
  const mode = p.mode ? (publishModes[p.mode] ?? `Publishing mode: ${p.mode}.`) : `Publishing mode: ${NOT_RECORDED}.`
  const lines = [mode]
  if (p.published_at) lines.push(`Last published: ${when(p.published_at)}, ${num(p.rows)} rows.`)
  else lines.push('Last published: not since the stacker started.')
  if (p.skipped) lines.push(`Skipped: ${p.skipped}`)
  return lines
}
