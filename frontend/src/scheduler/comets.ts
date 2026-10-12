import { ApiError } from './api/client'
import type { BodyTable, Comet, CometView, CometWindow } from './api/comets'
import type { CommandRecord } from './api/commands'
import type { ExposureSet, Template } from './api/planning'
import { clock, hm } from './format'

export const PIXEL_SCALE_ARCSEC = 1.91
export const SHORT_SUB_SECONDS = 60

export function brightest(c: Pick<Comet, 'magnitude_mpc' | 'magnitude_jpl'>): number | null {
  const m = [c.magnitude_mpc, c.magnitude_jpl].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  return m.length ? Math.min(...m) : null
}

export function sortComets<T extends Comet>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const ma = brightest(a)
    const mb = brightest(b)
    if (ma === null && mb === null) return a.name.localeCompare(b.name)
    if (ma === null) return 1
    if (mb === null) return -1
    return ma - mb || a.name.localeCompare(b.name)
  })
}

export function longestSub(rate: number): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null
  return Math.floor((PIXEL_SCALE_ARCSEC / rate) * 60)
}

export function shortSubs(rate: number): boolean {
  const s = longestSub(rate)
  return s !== null && s < SHORT_SUB_SECONDS
}

export function magText(m: number | null | undefined): string {
  return typeof m === 'number' && Number.isFinite(m) ? m.toFixed(1) : '—'
}

export function rateText(rate: number): string {
  if (!Number.isFinite(rate)) return '—'
  return `${rate < 1 ? rate.toFixed(2) : rate.toFixed(1)}″/min`
}

function hoursText(h: number): string {
  const r = Math.round(h * 10) / 10
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)} h`
}

export function windowText(w: CometWindow, minAlt: number): { main: string; sub: string } {
  if (!w.start || !w.end || !(w.hours > 0))
    return { main: 'Not up', sub: `never above ${minAlt}° in darkness` }
  return {
    main: `${hm(w.start)} to ${clock(w.end)}`,
    sub: `${hoursText(w.hours)} above ${minAlt}°`,
  }
}

export function peakText(w: CometWindow): { main: string; sub: string } {
  return { main: `${Math.round(w.peak_alt)}°`, sub: w.peak_at ? `at ${hm(w.peak_at)}` : '' }
}

export interface EmptyState {
  title: string
  text: string
}

export function emptyState(err: unknown, view: CometView | null): EmptyState | null {
  if (err) {
    if (err instanceof ApiError && err.status === 404)
      return {
        title: 'No comet list on this stacker yet',
        text: 'The stacker does not serve /api/v1/comets. It comes with a newer astro-stacker release.',
      }
    if (err instanceof ApiError && err.status === 503)
      return {
        title: 'The comet list is not available',
        text: `The stacker says: ${err.message}.`,
      }
    const msg = err instanceof Error ? err.message : String(err)
    return { title: 'Could not load the comet list', text: msg }
  }
  if (view && !(view.comets ?? []).length)
    return {
      title: 'No comets tonight',
      text: `No comet brighter than magnitude ${view.max_magnitude} in either estimate gets above ${view.min_altitude}° in darkness tonight.`,
    }
  return null
}

export function designationKey(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

export type AddState =
  | { state: 'added'; source: 'scheduler' | 'command'; commandId?: string }
  | { state: 'adding'; commandId: string; status: string }
  | { state: 'failed'; commandId: string; status: string; message: string }

interface CreatePayload {
  project?: { guid?: string }
  targets?: { designation?: string }[]
}

function payloadDesignations(r: CommandRecord): string[] {
  const p = r.payload as CreatePayload | null
  return (p?.targets ?? []).map((t) => designationKey(t.designation)).filter(Boolean)
}

function projectGuid(r: CommandRecord): string {
  return (r.payload as CreatePayload | null)?.project?.guid ?? ''
}

const FAILED = new Set(['rejected', 'failed', 'conflict'])

export function addStates(
  records: readonly CommandRecord[],
  tables: readonly BodyTable[],
): Map<string, AddState> {
  const out = new Map<string, AddState>()
  const deleted = new Map<string, number>()
  for (const r of records)
    if (r.kind === 'project.delete' && r.status === 'applied')
      deleted.set(projectGuid(r), Date.parse(r.created_at))
  const creates = records
    .filter((r) => r.kind === 'project.create' && !r.undone_by)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  for (const r of creates) {
    const gone = deleted.get(projectGuid(r))
    if (gone !== undefined && gone > Date.parse(r.created_at)) continue
    for (const d of payloadDesignations(r)) {
      if (r.status === 'applied') out.set(d, { state: 'added', source: 'command', commandId: r.id })
      else if (r.status === 'queued' || r.status === 'pending')
        out.set(d, { state: 'adding', commandId: r.id, status: r.status })
      else if (FAILED.has(r.status) && out.get(d)?.state !== 'added')
        out.set(d, {
          state: 'failed',
          commandId: r.id,
          status: r.status,
          message: r.message || 'The scheduler did not apply it.',
        })
    }
  }
  for (const t of tables) {
    const d = designationKey(t.designation)
    if (d) out.set(d, { state: 'added', source: 'scheduler' })
  }
  return out
}

export interface DraftPlan {
  guid: string
  template_id: number
  template_name: string
  exposure: number
  desired: number
}

export interface CometDraft {
  project: { guid: string; name: string }
  targets: {
    guid: string
    name: string
    designation?: string
    kind?: BodyKind
    plans: DraftPlan[]
  }[]
  goals: unknown[]
}

export const LRGB = [
  { key: 'L', label: 'Luminance' },
  { key: 'R', label: 'Red' },
  { key: 'G', label: 'Green' },
  { key: 'B', label: 'Blue' },
] as const

export function canonicalFilter(name: string | null | undefined): string {
  const n = (name ?? '')
    .trim()
    .toUpperCase()
    .replace(/[-\s_]/g, '')
  if (n.startsWith('HA') || n === 'H') return 'H'
  if (n.startsWith('OIII') || n === 'O3' || n === 'O') return 'O'
  if (n.startsWith('SII') || n === 'S2' || n === 'S') return 'S'
  if (n === 'L' || n === 'LUM' || n === 'LUMINANCE') return 'L'
  if (n === 'R' || n === 'RED') return 'R'
  if (n === 'G' || n === 'GREEN') return 'G'
  if (n === 'B' || n === 'BLUE') return 'B'
  return n
}

type TemplateLite = Pick<Template, 'id' | 'name' | 'filter' | 'usedByPlans'>

function lrgbSet(
  templates: readonly TemplateLite[],
  sets: readonly Pick<ExposureSet, 'items'>[],
): Map<string, TemplateLite> | null {
  const byName = new Map(templates.map((t) => [t.name.trim().toLowerCase(), t]))
  const keys: string[] = LRGB.map((f) => f.key)
  for (const set of sets) {
    if (set.items.length !== keys.length) continue
    const got = new Map<string, TemplateLite>()
    for (const it of set.items) {
      const t = byName.get(it.template.trim().toLowerCase())
      const c = canonicalFilter(t?.filter)
      if (!t || !keys.includes(c) || got.has(c)) break
      got.set(c, t)
    }
    if (got.size === keys.length) return got
  }
  return null
}

function mostUsed(templates: readonly TemplateLite[], key: string): TemplateLite | null {
  let best: TemplateLite | null = null
  for (const t of templates) {
    if (canonicalFilter(t.filter) !== key) continue
    if (
      !best ||
      t.usedByPlans > best.usedByPlans ||
      (t.usedByPlans === best.usedByPlans && t.name < best.name)
    )
      best = t
  }
  return best
}

export interface LrgbPlans {
  plans: { templateId: number }[]
  missing: string[]
}

export function lrgbPlans(
  templates: readonly TemplateLite[],
  sets: readonly Pick<ExposureSet, 'items'>[],
): LrgbPlans {
  const set = lrgbSet(templates, sets)
  const plans: { templateId: number }[] = []
  const missing: string[] = []
  for (const f of LRGB) {
    const t = set ? set.get(f.key) : mostUsed(templates, f.key)
    if (t) plans.push({ templateId: t.id })
    else missing.push(f.label)
  }
  return { plans, missing }
}

export type BodyKind = 'comet' | 'asteroid'

export function withDesignation(
  draft: CometDraft,
  designation: string,
  kind?: BodyKind,
): CometDraft {
  return {
    ...draft,
    targets: draft.targets.map((t) => (kind ? { ...t, designation, kind } : { ...t, designation })),
  }
}

export function missingText(missing: readonly string[]): string {
  if (!missing.length) return ''
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  const n = missing.length === 1 ? 'template' : 'templates'
  return `No exposure ${n} for ${list}. Make one in Templates first.`
}
