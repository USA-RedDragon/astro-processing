import type { MoonKeepRow, MoonKeepSlot, MoonKeepView } from './api/moonkeep'
import type { LeftOut, PlanBlock, SchedulerStatus } from './api/scheduler'
import { hm } from './format'

export const BRIGHT_MOON_TARGET = 'all exposure plans rejected for a bright Moon'
export const BRIGHT_MOON_FILTER = 'bright Moon'

const ms = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN)

export function pct(v: number): string {
  const p = v * 100
  if (p > 0 && p < 1) return `${p.toFixed(1)}%`
  return `${Math.round(p)}%`
}

export function under(high: number): string {
  return `under ${Math.max(1, Math.ceil(high * 100))}%`
}

export function inUse(v: MoonKeepView | null | undefined): boolean {
  if (!v || v.mode !== 'on') return false
  return !!v.publish.published_at || v.publish.skipped === 'unchanged'
}

export function notUsedText(v: MoonKeepView | null | undefined): string {
  if (!v) return ''
  if (v.mode === 'off') return 'The scheduler does not use these rates: publishing is off.'
  if (v.mode === 'dry-run')
    return 'The scheduler does not use these rates yet: publishing is a dry run.'
  if (v.publish.skipped === 'no ts_moon_keep table')
    return 'The scheduler does not use these rates yet: the table that carries them to it is not set up.'
  if (v.publish.error) return `The rates could not be sent to the scheduler: ${v.publish.error}`
  return ''
}

export type SpanKind = 'idle' | 'narrowband' | 'partial'

export interface BrightSpan {
  kind: SpanKind
  from: string
  to: string
  illumination: number
  high: number
  skipped: number
  plans: number
}

function kindOf(s: MoonKeepSlot): SpanKind | null {
  const bb = s.broadband
  const nb = s.narrowband
  if (!bb && !nb) return null
  const bbAll = !!bb && bb.plans > 0 && bb.skip
  const nbAll = !nb || nb.plans === 0 || nb.skip
  if (bbAll && nbAll) return 'idle'
  if (bbAll) return 'narrowband'
  if ((bb?.skipped ?? 0) + (nb?.skipped ?? 0) > 0) return 'partial'
  return null
}

function slotHigh(s: MoonKeepSlot): number {
  return Math.max(s.broadband?.rate_high ?? 0, s.narrowband?.rate_high ?? 0)
}

export function brightSpans(
  slots: MoonKeepSlot[] | null | undefined,
  step = 15 * 60 * 1000,
): BrightSpan[] {
  const out: BrightSpan[] = []
  let cur: BrightSpan | null = null
  for (const s of slots ?? []) {
    const k = kindOf(s)
    const end = new Date(ms(s.at) + step).toISOString()
    const skipped = (s.broadband?.skipped ?? 0) + (s.narrowband?.skipped ?? 0)
    const plans = (s.broadband?.plans ?? 0) + (s.narrowband?.plans ?? 0)
    if (k && cur && cur.kind === k) {
      cur.to = end
      cur.illumination = Math.max(cur.illumination, s.illumination)
      cur.high = Math.max(cur.high, slotHigh(s))
      if (skipped > cur.skipped) {
        cur.skipped = skipped
        cur.plans = plans
      }
      continue
    }
    cur = null
    if (!k) continue
    cur = {
      kind: k,
      from: s.at,
      to: end,
      illumination: s.illumination,
      high: slotHigh(s),
      skipped,
      plans,
    }
    out.push(cur)
  }
  return out
}

export function keptText(s: BrightSpan): string {
  const lit = `Moon ${Math.round(s.illumination * 100)}% lit`
  if (s.kind === 'narrowband')
    return `${lit}: past nights like this kept ${under(s.high)} of broadband subs`
  return `${lit}: past nights like this kept ${under(s.high)} of subs`
}

function actionText(s: BrightSpan, waits: string[]): string {
  if (s.kind === 'idle')
    return waits.length
      ? `so the scheduler waits ${waits.join(', ')}, and darks and flats set to run in waits use that time`
      : 'so the scheduler stops imaging, and darks and flats set to run after it use that time'
  if (s.kind === 'narrowband') return 'so the scheduler takes narrowband filters only'
  return `for ${s.skipped} of the ${s.plans} planned target filters that are up, so the scheduler skips those and takes the rest`
}

function overlaps(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

export interface MoonNote {
  headline: string
  lines: string[]
}

const HEADLINES: Record<SpanKind, string> = {
  idle: 'Bright Moon: time left to darks and flats',
  narrowband: 'Bright Moon: narrowband only',
  partial: 'Bright Moon: some filters left out',
}

export function tonightNote(
  v: MoonKeepView | null | undefined,
  blocks: PlanBlock[] | null | undefined,
  leftOut: LeftOut[] | null | undefined,
): MoonNote | null {
  const spans = brightSpans(v?.night)
  if (!v || !spans.length) return null
  const used = inUse(v)
  const lines = spans.map((s) => {
    const a = ms(s.from)
    const b = ms(s.to)
    const waits = (blocks ?? [])
      .filter((x) => x.wait && overlaps(a, b, ms(x.start), ms(x.end)) > 0)
      .map((w) => `${hm(w.start)}–${hm(w.end)}`)
    const action = used
      ? actionText(s, waits)
      : s.kind === 'partial'
        ? `for ${s.skipped} of the ${s.plans} planned target filters that are up`
        : ''
    return `${hm(s.from)}–${hm(s.to)}: ${keptText(s)}${action ? (action.startsWith('for ') ? ' ' : ', ') + action : ''}.`
  })
  const brightLeft = (leftOut ?? []).filter((l) =>
    [l.reason, ...(l.reasons ?? []).map((r) => r.reason)].some(
      (r) => r === BRIGHT_MOON_TARGET || r === BRIGHT_MOON_FILTER,
    ),
  )
  if (!used) lines.push(notUsedText(v) || 'The scheduler does not use these rates yet.')
  else if (brightLeft.length)
    lines.push(
      `In the simulated plan, ${brightLeft.length} ${brightLeft.length === 1 ? 'target is' : 'targets are'} left out for a bright Moon.`,
    )
  const order: SpanKind[] = ['idle', 'narrowband', 'partial']
  const worst = order.find((k) => spans.some((s) => s.kind === k))!
  return { headline: used ? HEADLINES[worst] : 'Bright Moon tonight', lines }
}

export function slotAt(slots: MoonKeepSlot[] | null | undefined, now: number): MoonKeepSlot | null {
  let best: MoonKeepSlot | null = null
  let d = Infinity
  for (const s of slots ?? []) {
    const x = Math.abs(ms(s.at) - now)
    if (x < d) {
      d = x
      best = s
    }
  }
  return d <= 15 * 60 * 1000 ? best : null
}

export function nowNote(
  v: MoonKeepView | null | undefined,
  status: SchedulerStatus | null | undefined,
  now: number,
): string {
  const s = slotAt(v?.night, now)
  if (!v || !s) return ''
  const k = kindOf(s)
  if (!k) return ''
  const span: BrightSpan = {
    kind: k,
    from: s.at,
    to: s.at,
    illumination: s.illumination,
    high: slotHigh(s),
    skipped: (s.broadband?.skipped ?? 0) + (s.narrowband?.skipped ?? 0),
    plans: (s.broadband?.plans ?? 0) + (s.narrowband?.plans ?? 0),
  }
  const kept = keptText(span)
  if (!inUse(v))
    return `${kept}. ${notUsedText(v) || 'The scheduler does not use these rates yet.'}`
  const state = status?.state
  if (k === 'idle' && state === 'waiting')
    return `${kept}, so the scheduler is waiting, and darks and flats set to run in waits use that time.`
  if (k === 'idle') return `${kept}, so the scheduler has nothing worth taking now.`
  if (k === 'narrowband') return `${kept}, so the scheduler is taking narrowband filters only.`
  return `${kept} ${actionText(span, [])}.`
}

export interface GridCell {
  row: MoonKeepRow | null
  text: string
  tone: 'skip' | 'none' | 'thin' | 'ok'
  title: string
}

export interface GridRow {
  label: string
  cells: GridCell[]
}

function cell(r: MoonKeepRow | null | undefined, sepLabel: string, rowLabel: string): GridCell {
  if (!r || r.subs === 0)
    return { row: r ?? null, text: '—', tone: 'none', title: `${rowLabel}, ${sepLabel}: no subs` }
  const tone = r.skip ? 'skip' : r.usable ? 'ok' : 'thin'
  const why = r.skip
    ? 'left to darks, flats or other filters'
    : r.usable
      ? 'used to weigh subs'
      : 'too few subs or nights to act on'
  return {
    row: r,
    text: pct(r.rate),
    tone,
    title: `${rowLabel}, ${sepLabel}: kept ${r.kept} of ${r.subs} subs on ${r.nights} nights; estimate ${pct(r.rate)} (${pct(r.low)}–${pct(r.high)}); ${why}`,
  }
}

const range = (a: number, b: number, unit: string) => `${a}–${b}${unit}`

export function sepLabels(v: MoonKeepView): string[] {
  const e = v.rules.sep_edges
  return e.slice(0, -1).map((x, i) => range(x, e[i + 1]!, '° away'))
}

export function grid(v: MoonKeepView, filter: string, narrowband: boolean): GridRow[] {
  const rows = (v.rows ?? []).filter((r) => r.filter === filter && r.narrowband === narrowband)
  const ie = v.rules.illum_edges
  const ae = v.rules.alt_edges
  const seps = sepLabels(v)
  const out: GridRow[] = []
  const down = rows.find((r) => r.moon_down)
  out.push({
    label: 'Moon down',
    cells: seps.map((s, i) =>
      i === 0
        ? cell(down, 'any distance', 'Moon down')
        : { row: null, text: '', tone: 'none', title: '' },
    ),
  })
  for (let i = ie.length - 2; i >= 0; i--) {
    for (let a = ae.length - 2; a >= 0; a--) {
      const label = `${Math.round(ie[i]! * 100)}–${Math.round(ie[i + 1]! * 100)}% lit, ${range(ae[a]!, ae[a + 1]!, '° up')}`
      out.push({
        label,
        cells: seps.map((s, p) =>
          cell(
            rows.find(
              (r) => !r.moon_down && r.illum_bin === i && r.alt_bin === a && r.sep_bin === p,
            ),
            s,
            label,
          ),
        ),
      })
    }
  }
  return out
}

export function filterChoices(
  v: MoonKeepView | null | undefined,
): { key: string; label: string; filter: string; narrowband: boolean }[] {
  const out = [
    { key: 'bb', label: 'All broadband', filter: '', narrowband: false },
    { key: 'nb', label: 'All narrowband', filter: '', narrowband: true },
  ]
  const seen = new Set<string>()
  for (const r of v?.rows ?? []) {
    if (!r.filter || seen.has(r.filter)) continue
    seen.add(r.filter)
    out.push({ key: 'f:' + r.filter, label: r.filter, filter: r.filter, narrowband: r.narrowband })
  }
  return out.slice(0, 2).concat(out.slice(2).sort((a, b) => a.label.localeCompare(b.label)))
}

export function replayText(v: MoonKeepView): string[] {
  const r = v.replay
  if (!r) return []
  const lost = r.kept_lost
  return [
    `Replayed over ${r.moon_up_nights} past nights with the Moon up, each judged by rates fitted without that night: the rule would have left ${r.skipped_hours.toFixed(1)} h (${r.skipped_subs} subs) on ${r.skipped_nights} nights to other filters, darks or flats.`,
    `${lost === 0 ? 'No kept sub' : `${lost} kept ${lost === 1 ? 'sub' : 'subs'}`} would have been lost, of ${r.moon_up_kept} kept with the Moon up and ${r.kept} kept in all. ${r.idle_hours.toFixed(1)} h of it had no other filter of the same target to take.`,
  ]
}

export function basisText(v: MoonKeepView): string {
  const r = v.rules
  return `From the stacker's verdict on ${v.subs.toLocaleString('en-US')} subs over ${v.nights} nights (kept: stacked, or passed its score and was left out only by an old moon rule; not kept: low score or rejected by the grader). Each cell is the share kept, shrunk toward the coarser cell with the weight of ${r.prior_strength} subs, with a ${Math.round(r.confidence * 100)}% upper bound that allows for subs on one night being alike. A cell needs ${r.min_subs} subs on ${r.min_nights} nights before the scheduler acts on it; it leaves the time to darks, flats or other filters when the upper bound is under ${pct(r.skip_below)}, unless the night's measured quality is ${r.good_night_quality} or better. The Moon within ${r.floor_degrees}° of a target is never imaged. The weight, the ${pct(r.skip_below)} limit and the ${r.good_night_quality} quality were chosen on these same nights, and the verdicts are the stacker's verdicts today, so the replay is a guide, not a promise.`
}
