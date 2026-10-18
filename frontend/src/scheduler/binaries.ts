import type {
  Binary,
  EclipsePurpose,
  EclipseRequest,
  KitCheck,
  KitField,
  PlannedEclipse,
} from './api/binaries'
import { SITE_TZ, toDate } from './format'

export type StarView = '' | 'sub' | 'not' | 'flagged'

export const STAR_VIEWS: { key: StarView; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'sub', label: 'Submitted to VSX' },
  { key: 'not', label: 'Not submitted yet' },
  { key: 'flagged', label: 'Flagged by the checks' },
]

export function isStarView(v: string): v is StarView {
  return STAR_VIEWS.some((x) => x.key === v)
}

export function inStarView(b: Binary, view: StarView): boolean {
  if (view === 'sub') return b.vsx.submitted
  if (view === 'not') return !b.vsx.submitted
  if (view === 'flagged') return b.flags.length > 0
  return true
}

export function starViewCounts(stars: Binary[]): Record<StarView, number> {
  const out = { '': 0, sub: 0, not: 0, flagged: 0 } as Record<StarView, number>
  for (const v of STAR_VIEWS) out[v.key] = stars.filter((b) => inStarView(b, v.key)).length
  return out
}

export function starsLine(label: string, n: number): string {
  return `${label} · ${n} ${n === 1 ? 'star' : 'stars'} · submitted first, then the rest`
}

export function vsxLabel(b: Binary): string {
  return b.vsx.submitted ? 'Submitted to VSX' : 'Not submitted yet'
}

export function vsxClass(b: Binary): 's-sub' | 's-not' {
  return b.vsx.submitted ? 's-sub' : 's-not'
}

export function vsxHref(ref: string): string {
  const r = ref.trim()
  return /^https?:\/\//i.test(r) ? r : ''
}

export function typeText(b: Binary): string {
  return `${b.type_words || b.type}, eclipsing binary`
}

export function noteLines(notes: string): string[] {
  return notes
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s+/, '').trim())
    .filter(Boolean)
}

export interface Badge {
  text: string
  tone: 'ok' | 'warn'
}

export function confidenceBadges(b: Binary): Badge[] {
  const out: Badge[] = []
  if (b.confidence) {
    out.push({
      text: `Eclipsing binary: ${b.confidence} confidence`,
      tone: b.confidence === 'high' ? 'ok' : 'warn',
    })
  }
  if (!b.period_settled) out.push({ text: 'Period: not settled', tone: 'warn' })
  return out
}

export function uncertaintyText(minutes: number): string {
  const m = Math.max(1, Math.round(minutes))
  if (m >= 90) return `give or take ${Number((m / 60).toFixed(1))} h`
  return `give or take ${m} min`
}

export function durationText(hours: number | null): string {
  if (hours === null || hours === undefined || !(hours > 0)) return ''
  if (hours >= 48) return `lasts about ${Number((hours / 24).toFixed(1))} days`
  return `lasts about ${hours >= 10 ? Math.round(hours) : Number(hours.toFixed(1))} h`
}

export interface EclipseDay {
  label: string
  eclipses: PlannedEclipse[]
}

export function groupByDay(eclipses: PlannedEclipse[]): EclipseDay[] {
  const out: EclipseDay[] = []
  for (const e of eclipses) {
    const last = out.at(-1)
    if (last && last.label === e.day_label) last.eclipses.push(e)
    else out.push({ label: e.day_label, eclipses: [e] })
  }
  return out
}

export type EclipseView = EclipsePurpose | 'all'

export const ECLIPSE_VIEWS: { key: Exclude<EclipseView, 'own'>; label: string }[] = [
  { key: 'flag', label: 'Settles a flag' },
  { key: 'period', label: 'Period check' },
  { key: 'all', label: 'All' },
]

export function inEclipseView(e: PlannedEclipse, view: EclipseView): boolean {
  return view === 'all' || e.purpose === view
}

export function eclipseKey(e: Pick<PlannedEclipse, 'source_id' | 'kind' | 'mid'>): string {
  return `${e.source_id}|${e.kind}|${e.mid}`
}

export interface RequestView {
  label: string
  tone: '' | 'ok' | 'bad'
  note: string
  by: string
  canRequest: boolean
  canCancel: boolean
}

export const ASKED_BY_APP = 'Asked by the app'

export function requestView(r: EclipseRequest | null): RequestView {
  if (!r) return { label: '', tone: '', note: '', by: '', canRequest: true, canCancel: false }
  const by = r.auto ? ASKED_BY_APP : ''
  if (r.state === 'waiting')
    return { label: 'Requested', tone: '', note: r.note, by, canRequest: false, canCancel: true }
  if (r.state === 'sent')
    return {
      label: 'Sent to the scheduler',
      tone: 'ok',
      note: r.note,
      by,
      canRequest: false,
      canCancel: true,
    }
  if (r.state === 'done')
    return { label: 'Window passed', tone: '', note: r.note, by, canRequest: false, canCancel: false }
  if (r.state === 'cancelled')
    return { label: 'Cancelled', tone: '', note: r.note, by, canRequest: true, canCancel: false }
  return {
    label: 'Request failed',
    tone: 'bad',
    note: r.note,
    by,
    canRequest: true,
    canCancel: false,
  }
}

export function checklistText(items: KitCheck[]): string {
  return `${items.filter((c) => c.done).length} of ${items.length} done`
}

export function manualChecklist(items: KitCheck[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const c of items) if (!c.auto) out[c.key] = c.done
  return out
}

const FIELD_WORDS: Record<Exclude<KitField['state'], 'value'>, string> = {
  not_measured: 'not measured yet',
  not_looked_up: 'not looked up yet',
  empty: 'leave empty',
  not_set: 'not set yet',
}

export function fieldWords(f: KitField): string {
  return f.state === 'value' ? '' : FIELD_WORDS[f.state]
}

export function canCopy(f: KitField): boolean {
  return f.state === 'value' && f.value !== ''
}

export function bytesText(n: number): string {
  if (!(n > 0)) return ''
  if (n < 1024) return `${n} bytes`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${Number((n / 1024 / 1024).toFixed(1))} MB`
}

const dayFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: SITE_TZ,
})
const yearFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: SITE_TZ })

export function rangeText(from: string, to: string): string {
  const a = toDate(from)
  const b = toDate(to)
  if (!a || !b) return ''
  const day = (d: Date) => dayFmt.format(d).replace(',', '')
  const ya = yearFmt.format(a)
  const yb = yearFmt.format(b)
  return ya === yb ? `${day(a)} to ${day(b)}, ${yb}` : `${day(a)}, ${ya} to ${day(b)}, ${yb}`
}

export function downloadUrl(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'download=1'
}

export function absoluteUrl(url: string, origin: string): string {
  try {
    return new URL(url, origin).href
  } catch {
    return url
  }
}
