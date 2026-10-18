import type {
  LateLine,
  LatePoint,
  SeasonKind,
  Timing,
  TimingKind,
  TimingRecord,
  Trend,
  TrendId,
  TrendState,
} from './api/binaries'
import { SITE_TZ, toDate } from './format'

export const KIND_ORDER: TimingKind[] = ['primary', 'secondary']

const KIND_WORDS: Record<TimingKind, string> = {
  primary: 'Deeper eclipse',
  secondary: 'Second eclipse',
}

/**
 * The names the record uses for each kind of eclipse, so stars with two
 * alike eclipses keep "Eclipse A" and "Eclipse B".
 */
export function kindLabels(
  r: Pick<TimingRecord, 'timings' | 'untimed'>,
): Record<TimingKind, string> {
  const out = { ...KIND_WORDS }
  for (const t of [...r.timings, ...r.untimed]) if (t.kind_label) out[t.kind] = t.kind_label
  return out
}

export function kindsIn(points: Pick<LatePoint, 'kind'>[]): TimingKind[] {
  return KIND_ORDER.filter((k) => points.some((p) => p.kind === k))
}

const midFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SITE_TZ,
  timeZoneName: 'short',
})

/** An instant in the site's zone, "Mon Oct 12, 2026, 4:33 AM CDT". */
export function midText(v: string): string {
  const d = toDate(v)
  if (!d) return ''
  const p = Object.fromEntries(midFmt.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.weekday} ${p.month} ${p.day}, ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`
}

const onTime = (m: number) => Math.abs(m) < 0.05

/** Minutes against the prediction in a few words, "0.6 late", "2.0 early" or "on time". */
export function lateShort(m: number): string {
  if (onTime(m)) return 'on time'
  return `${Math.abs(m).toFixed(1)} ${m > 0 ? 'late' : 'early'}`
}

export function lateLong(m: number): string {
  if (onTime(m)) return 'on time'
  return `${Math.abs(m).toFixed(1)} minutes ${m > 0 ? 'late' : 'early'}`
}

export function giveOrTake(err: number): string {
  return `give or take ${err.toFixed(1)}`
}

export function checkText(t: Pick<Timing, 'check_minutes'>): string {
  const c = t.check_minutes
  if (c === null || c === undefined) return ''
  if (onTime(c)) return 'A second method puts the middle at the same time.'
  return `A second method puts the middle ${Math.abs(c).toFixed(1)} minutes ${c > 0 ? 'later' : 'earlier'}.`
}

export function framesText(n: number): string {
  return `${n} ${n === 1 ? 'frame' : 'frames'}`
}

export function predictionText(r: TimingRecord): string {
  if (r.prediction_note) return r.prediction_note
  if (!r.period_text) return ''
  return `Predictions use a period of ${r.period_text} days for this star.`
}

export function untimedLine(n: number): string {
  if (!n) return ''
  return `${n} more eclipse ${n === 1 ? 'night' : 'nights'} covered but not timed.`
}

export const TREND_WHAT: Record<TrendId, string> = {
  ephemeris:
    'The predicted times need updating: the eclipses come steadily earlier or later than predicted.',
  period: 'The time between eclipses slowly gets longer or shorter.',
  orbit:
    'An oval orbit slowly turns, so the deeper and the second eclipse drift apart or together over the years.',
  third:
    'The eclipses run early, then late, in a slow cycle, as a third star pulls the pair to and fro.',
}

export interface Chip {
  text: string
  tone: '' | 'ok' | 'warn'
}

const TREND_CHIPS: Record<TrendState, Chip> = {
  flag: { text: 'Flag', tone: 'warn' },
  clear: { text: 'Clear', tone: 'ok' },
  need: { text: 'Not enough timings yet', tone: '' },
}

export function trendChip(state: TrendState): Chip {
  return TREND_CHIPS[state] ?? { text: state, tone: '' }
}

const NOT_ENOUGH = 'Not enough timings yet. '

/** The finding without the "Not enough timings yet." the state chip already says. */
export function trendWhy(t: Pick<Trend, 'state' | 'why'>): string {
  if (t.state === 'need' && t.why.startsWith(NOT_ENOUGH)) return t.why.slice(NOT_ENOUGH.length)
  return t.why
}

export function seasonKindText(k: SeasonKind): string {
  const parts = [`${k.timed} of ${k.want} timed`]
  if (k.asked) parts.push(`${k.asked} asked for`)
  if (k.needed) parts.push(`${k.needed} still needed`)
  return parts.join(', ')
}

export const PLOT = { W: 640, H: 270, L: 52, R: 70, T: 16, B: 36 }

export interface PlotScale {
  x0: number
  x1: number
  ym: number
  yTicks: number[]
  xTicks: number[]
  sx: (year: number) => number
  sy: (minutes: number) => number
}

function niceStep(raw: number): number {
  const mag = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag
  return 10 * mag
}

/** The axes for the minutes-late plot: whole years across, the same span early and late with zero in the middle. */
export function plotScale(points: LatePoint[], lines: LateLine[] = []): PlotScale {
  const years = [...points.map((p) => p.year), ...lines.flatMap((l) => l.points.map((q) => q[0]))]
  const lo = years.length ? Math.min(...years) : new Date().getUTCFullYear()
  const hi = years.length ? Math.max(...years) : lo
  const x0 = Math.floor(lo)
  const x1 = Math.max(Math.ceil(hi), x0 + 2)
  const ext = Math.max(
    0,
    ...points.map((p) => Math.abs(p.minutes) + Math.max(0, p.err_minutes)),
    ...lines.flatMap((l) => l.points.map((q) => Math.abs(q[1]))),
  )
  let ym = Math.max(10, Math.ceil(ext / 5) * 5)
  const step = ym <= 10 ? 5 : niceStep(ym / 3)
  ym = Math.ceil(ym / step) * step
  const yTicks: number[] = []
  for (let v = -ym; v <= ym; v += step) yTicks.push(v)
  const xStep = Math.max(1, Math.ceil((x1 - x0) / 8))
  const xTicks: number[] = []
  for (let y = x0; y <= x1; y += xStep) xTicks.push(y)
  const { W, H, L, R, T, B } = PLOT
  return {
    x0,
    x1,
    ym,
    yTicks,
    xTicks,
    sx: (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R),
    sy: (v) => T + ((ym - v) / (2 * ym)) * (H - T - B),
  }
}

export interface PlotMark {
  i: number
  kind: TimingKind
  used: boolean
  x: number
  y: number
  top: number
  bottom: number
}

export function plotMarks(points: LatePoint[], s: PlotScale): PlotMark[] {
  return points.map((p, i) => ({
    i,
    kind: p.kind,
    used: p.used,
    x: s.sx(p.year),
    y: s.sy(p.minutes),
    top: s.sy(p.minutes + Math.max(0, p.err_minutes)),
    bottom: s.sy(p.minutes - Math.max(0, p.err_minutes)),
  }))
}

export function linePath(l: LateLine, s: PlotScale): string {
  return l.points
    .map((q, i) => `${i ? 'L' : 'M'}${s.sx(q[0]).toFixed(1)} ${s.sy(q[1]).toFixed(1)}`)
    .join('')
}

/** The timing behind each plotted point: the stacker lists both in the same order. */
export function pointTiming(r: Pick<TimingRecord, 'points' | 'timings'>, i: number): Timing | null {
  if (r.points.length !== r.timings.length) return null
  const t = r.timings[i]
  return t && t.kind === r.points[i]?.kind ? t : null
}

export function pointTip(
  p: LatePoint,
  t: Timing | null,
  labels: Record<TimingKind, string>,
): string[] {
  const out = [labels[p.kind]]
  if (t) out.push(`Night of ${t.night}`, `Middle: ${midText(t.mid)}`)
  out.push(`${lateLong(p.minutes)}, ${giveOrTake(p.err_minutes)}`)
  if (t) out.push(`${t.filter}, ${framesText(t.points)}`)
  if (!p.used) out.push('Left out of the trend checks')
  return out
}

export function pointLabel(
  p: LatePoint,
  t: Timing | null,
  labels: Record<TimingKind, string>,
): string {
  return pointTip(p, t, labels).join(', ')
}
