import type {
  AutoPlan,
  EventExposure,
  EventFrame,
  EventPlan,
  PlanState,
  Rarity,
  SkyEvent,
  SkyEvents,
} from './api/skyEvents'
import { SITE_TZ, clock, toDate } from './format'

const DAY = 24 * 3600 * 1000

export type PageState = 'loading' | 'error' | 'pending' | 'unavailable' | 'empty' | 'ready'

export function pageState(r: SkyEvents | null, error: string, loading: boolean): PageState {
  if (r) {
    if (r.status === 'pending') return 'pending'
    if (r.status === 'unavailable') return 'unavailable'
    return r.events?.length ? 'ready' : 'empty'
  }
  if (error && !loading) return 'error'
  return 'loading'
}

const NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
]

export function monthsText(n: number): string {
  const w = NUMBERS[n] ?? String(n)
  return n === 1 ? 'next month' : `next ${w} months`
}

export function countText(n: number, months: number): string {
  return `${n} ${n === 1 ? 'event' : 'events'} in the ${monthsText(months)}`
}

const ACTIVE: ReadonlySet<PlanState> = new Set(['queued', 'pending', 'applied', 'saved'])

export function planActive(p: EventPlan | null | undefined): boolean {
  return !!p && ACTIVE.has(p.state)
}

const PLAN_LABEL: Record<PlanState, string> = {
  queued: 'Queued',
  pending: 'Pending',
  applied: 'Planned',
  saved: 'Saved',
  failed: 'Failed',
  rejected: 'Rejected',
  conflict: 'Conflict',
  cancelled: 'Cancelled',
  undone: 'Unplanned',
}

const PLAN_TONE: Record<PlanState, 'ok' | 'info' | 'warn' | 'bad' | ''> = {
  queued: 'info',
  pending: 'info',
  applied: 'ok',
  saved: 'info',
  failed: 'bad',
  rejected: 'bad',
  conflict: 'bad',
  cancelled: '',
  undone: '',
}

export interface PlanView {
  label: string
  tone: 'ok' | 'info' | 'warn' | 'bad' | ''
  message: string
  active: boolean
}

export function planView(p: EventPlan | null | undefined): PlanView | null {
  if (!p) return null
  const prio = p.priority === 'high' ? ', high priority' : ''
  const when = p.planned_at ? ` ${clock(p.planned_at)}` : ''
  return {
    label: PLAN_LABEL[p.state] ?? p.state,
    tone: PLAN_TONE[p.state] ?? '',
    message: p.message || (ACTIVE.has(p.state) ? `Sent${when}${prio}` : ''),
    active: ACTIVE.has(p.state),
  }
}

export function thisWeek(e: Pick<SkyEvent, 'start' | 'end'>, now: number): boolean {
  const s = toDate(e.start)
  const end = toDate(e.end)
  if (!s || !end) return false
  return s.getTime() <= now + 7 * DAY && end.getTime() >= now
}

function bodyCount(e: Pick<SkyEvent, 'members'>): number {
  return (e.members ?? []).filter((m) => m.kind !== 'dso').length
}

export function isMosaic(e: Pick<SkyEvent, 'kind' | 'frame'>): boolean {
  return e.kind === 'mosaic-2' || !!e.frame?.mosaic
}

export function kindChip(e: Pick<SkyEvent, 'kind' | 'members' | 'frame'>): string {
  if (isMosaic(e)) return `${e.frame?.mosaic?.panels?.length || 2}-panel mosaic`
  if (e.kind === 'body-dso') return 'near a deep-sky object'
  const n = bodyCount(e)
  return n > 2 ? `${NUMBERS[n] ?? n} bodies` : 'two bodies'
}

export function movingChip(e: Pick<SkyEvent, 'kind' | 'members' | 'frame' | 'moving_center'>): string {
  if (!e.moving_center) return ''
  const who = bodyCount(e) > 2 ? 'the bodies' : 'the pair'
  return isMosaic(e) ? `panels follow ${who}` : `frame follows ${who}`
}

export function separationLabel(e: Pick<SkyEvent, 'members'>): string {
  return bodyCount(e) > 2 ? 'widest separation' : 'separation'
}

export function nightsText(n: number): string {
  return `${n} ${n === 1 ? 'night' : 'nights'}`
}

const nightFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const nightYearFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function nightDate(d: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : null
}

export function windowText(first: string, last: string): string {
  const a = nightDate(first)
  const b = nightDate(last)
  if (!a || !b) return [first, last].filter(Boolean).join(' to ')
  if (first === last) return `night of ${nightFmt.format(a)}`
  const fa = a.getUTCFullYear() === b.getUTCFullYear() ? nightFmt : nightYearFmt
  return `nights of ${fa.format(a)} to ${nightYearFmt.format(b)}`
}

const momentFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: SITE_TZ,
})

export function momentText(v: string | null | undefined): string {
  const d = toDate(v)
  return d ? `${momentFmt.format(d)}, ${clock(d)}` : ''
}

export function secondsText(v: number): string {
  return String(Math.abs(v) >= 10 ? Number(v.toFixed(1)) : Number(v.toPrecision(2)))
}

export function exposureText(x: EventExposure | null | undefined): string {
  if (!x) return 'Exposure not measured yet.'
  const s = x.short_seconds
  const n = x.normal_seconds
  const basis = x.basis ? ` ${x.basis.trim().replace(/\.?$/, '.')}` : ''
  if ((s === null || s === undefined) && (n === null || n === undefined))
    return `Exposure not measured yet.${basis}`
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? 'not measured yet' : `${secondsText(v)} s`
  const parts: string[] = []
  if (s !== null && s !== undefined) parts.push(`short ${fmt(s)}`)
  parts.push(`normal ${fmt(n)}`)
  return `Exposures: ${parts.join(', ')}.${basis}`
}

const LABEL_ROOM = 1

export interface Lane {
  id: string
  left: number
  width: number
  high: boolean
  rare: boolean
  label: string
  labelSide: 'left' | 'right'
  labelAt: number
  labelMax: number
  title: string
}

function pct(t: number, t0: number, t1: number): number {
  return Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100))
}

export function laneLabel(e: Pick<SkyEvent, 'members' | 'title'>): string {
  const m = e.members ?? []
  if (m.length < 2) return e.title
  return `${m[0]!.name} + ${m
    .slice(1)
    .map((x) => x.designation || x.name)
    .join(', ')}`
}

export function lanes(events: SkyEvent[], t0: number, t1: number): Lane[] {
  if (!(t1 > t0)) return []
  return events.map((e) => {
    const s = toDate(e.start)?.getTime() ?? NaN
    const end = toDate(e.end)?.getTime() ?? NaN
    let a = pct(s, t0, t1)
    const b = Math.max(a, pct(end, t0, t1))
    const width = Math.min(100, Math.max(b - a, 0.8))
    a = Math.min(a, 100 - width)
    const right = 100 - (a + width)
    const room = right >= a
    const label = laneLabel(e)
    return {
      id: e.id,
      left: a,
      width,
      high: e.priority === 'high',
      rare: isRare(e),
      label,
      labelSide: room ? 'right' : 'left',
      labelAt: room ? a + width + LABEL_ROOM : 100 - a + LABEL_ROOM,
      labelMax: Math.max(0, (room ? right : a) - LABEL_ROOM),
      title: `${e.title}: ${momentText(e.start)} to ${momentText(e.end)}`,
    }
  })
}

export function zoneOffsetMinutes(t: number, tz = SITE_TZ): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(t))
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(t / 1000) * 1000) / 60000)
}

export function zonedMidnight(y: number, m: number, d: number, tz = SITE_TZ): number {
  const guess = Date.UTC(y, m, d)
  const off = zoneOffsetMinutes(guess, tz)
  const t = guess - off * 60000
  const off2 = zoneOffsetMinutes(t, tz)
  return off2 === off ? t : guess - off2 * 60000
}

const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: SITE_TZ })
const ymFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'numeric',
  timeZone: SITE_TZ,
})

export interface MonthMark {
  label: string
  at: number
  year: string | null
}

export function monthMarks(t0: number, t1: number, minGap = 4): MonthMark[] {
  if (!(t1 > t0)) return []
  const parts = ymFmt.formatToParts(new Date(t0))
  let y = Number(parts.find((p) => p.type === 'year')?.value)
  let m = Number(parts.find((p) => p.type === 'month')?.value) - 1
  const out: MonthMark[] = [{ label: monthFmt.format(new Date(t0)), at: 0, year: String(y) }]
  for (let i = 0; ; i++) {
    m++
    if (m > 11) {
      m = 0
      y++
    }
    const t = zonedMidnight(y, m, 1)
    if (t >= t1) break
    const at = pct(t, t0, t1)
    let year = m === 0 ? String(y) : null
    if (i === 0 && at < minGap) {
      out.shift()
      year = String(y)
    }
    out.push({ label: monthFmt.format(new Date(t + DAY / 2)), at, year })
  }
  return out
}

export interface FramePoint {
  name: string
  label: string
  kind: string
  x: number
  y: number
  r: number
  disc: boolean
  enlarged: boolean
  title: string
  lx: number
  ly: number
  anchor: 'start' | 'end'
}

export interface FrameRect {
  x: number
  y: number
  w: number
  h: number
  rotate: number
  cx: number
  cy: number
}

export interface FrameGeometry {
  width: number
  height: number
  scale: number
  rect: FrameRect
  rects: FrameRect[]
  points: FramePoint[]
}

export const MIN_BODY_R = 3.2
export const MIN_DSO_R = 3

function offsetText(east: number, north: number): string {
  const ew = `${Math.abs(east).toFixed(2)}° ${east >= 0 ? 'east' : 'west'}`
  const ns = `${Math.abs(north).toFixed(2)}° ${north >= 0 ? 'north' : 'south'}`
  return `${ew}, ${ns} of centre`
}

export function frameGeometry(
  f: EventFrame,
  labels: Record<string, string> = {},
  width = 220,
  height = 160,
  fill = 0.86,
): FrameGeometry {
  const th = (f.rotation_deg * Math.PI) / 180
  const c = Math.abs(Math.cos(th))
  const s = Math.abs(Math.sin(th))
  const m = f.mosaic?.panels?.length ? f.mosaic : null
  const fw = m ? m.width_deg : f.width_deg
  const fh = m ? m.height_deg : f.height_deg
  const bw = fw * c + fh * s
  const bh = fw * s + fh * c
  const scale = Math.min((width * fill) / bw, (height * fill) / bh)
  const box = (east: number, north: number, rotation: number): FrameRect => {
    const cx = width / 2 - east * scale
    const cy = height / 2 - north * scale
    return {
      x: cx - (f.width_deg * scale) / 2,
      y: cy - (f.height_deg * scale) / 2,
      w: f.width_deg * scale,
      h: f.height_deg * scale,
      rotate: -rotation,
      cx,
      cy,
    }
  }
  const rects = m ? m.panels.map((p) => box(p.east_deg, p.north_deg, p.rotation_deg)) : [box(0, 0, f.rotation_deg)]
  const points = (f.objects ?? []).map((o) => {
    const body = o.kind !== 'dso'
    const exact = (o.diameter_deg / 2) * scale
    const min = o.kind === 'moon' ? 0 : body ? MIN_BODY_R : MIN_DSO_R
    const r = Math.max(exact, min)
    const x = width / 2 - o.east_deg * scale
    const y = height / 2 - o.north_deg * scale
    const off = Math.min(r, 30) * 0.7 + 3
    const anchor: 'start' | 'end' = x > width * 0.62 ? 'end' : 'start'
    return {
      name: o.name,
      label: labels[o.name] ?? o.name,
      kind: o.kind,
      x,
      y,
      r,
      disc: body,
      enlarged: r > exact,
      title: `${o.name}, ${offsetText(o.east_deg, o.north_deg)}, ${(o.diameter_deg * 60).toFixed(o.diameter_deg * 60 < 1 ? 2 : 1)}′ across`,
      lx: anchor === 'end' ? x - off : x + off,
      ly: Math.max(9, y - off),
      anchor,
    }
  })
  return {
    width,
    height,
    scale,
    rect: rects[0]!,
    rects,
    points,
  }
}

export function frameLabel(e: SkyEvent): string {
  const f = e.frame
  const objs = (f.objects ?? []).map((o) => `${o.name} ${offsetText(o.east_deg, o.north_deg)}`)
  const m = f.mosaic?.panels?.length ? f.mosaic : null
  const field = m
    ? `${m.panels.length}-panel mosaic of the ${f.width_deg.toFixed(2)}° × ${f.height_deg.toFixed(2)}° camera field, ` +
      `panels overlapping ${Math.round(m.overlap_pct)}%, ${m.width_deg.toFixed(2)}° × ${m.height_deg.toFixed(2)}° in all, `
    : `${f.width_deg.toFixed(2)}° × ${f.height_deg.toFixed(2)}° camera field `
  return `Frame preview, north up, east left: ${field}turned ${Math.round(f.rotation_deg)}°. ` + objs.join('; ') + '.'
}

export function objectLabels(e: Pick<SkyEvent, 'members'>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of e.members ?? []) out[m.name] = m.designation || m.name
  return out
}

export interface TonightBlock {
  id: string
  title: string
  start: number
  end: number
  high: boolean
  rare: boolean
  rarity: string
  automatic: boolean
  state: PlanState
}

export function tonightBlocks(events: SkyEvent[] | null | undefined, t0: number, t1: number): TonightBlock[] {
  if (!events || !(t1 > t0)) return []
  const out: TonightBlock[] = []
  for (const e of events) {
    if (!planActive(e.plan)) continue
    for (const w of e.night_windows ?? []) {
      const s = toDate(w.start)?.getTime()
      const end = toDate(w.end)?.getTime()
      if (s === undefined || end === undefined || end <= t0 || s >= t1) continue
      out.push({
        id: e.id,
        title: e.title,
        start: Math.max(s, t0),
        end: Math.min(end, t1),
        high: (e.plan?.priority ?? e.priority) === 'high',
        rare: isRare(e),
        rarity: isRare(e) ? rarityText(e.rarity) : '',
        automatic: !!e.plan?.automatic,
        state: e.plan!.state,
      })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

const ymdFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: SITE_TZ,
})

export function stripRange(
  from: string | null | undefined,
  to: string | null | undefined,
  months: number,
  now: number,
): { t0: number; t1: number } | null {
  const parts = ymdFmt.formatToParts(new Date(now))
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value)
  const y = get('year')
  const m = get('month') - 1
  const d = get('day')
  const f = toDate(from)?.getTime()
  const e = toDate(to)?.getTime()
  const t0 = Math.max(zonedMidnight(y, m, d), f ?? -Infinity)
  const t1 = Math.min(zonedMidnight(y, m + months, d), e ?? Infinity)
  return t1 > t0 ? { t0, t1 } : null
}

const spanFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: SITE_TZ,
})

export function spanDate(v: string | null | undefined): string {
  const d = toDate(v)
  return d ? spanFmt.format(d) : ''
}

export function isRare(e: Pick<SkyEvent, 'rarity'>): boolean {
  return e.rarity?.status === 'ready' && e.rarity.rare
}

const yearOf = (v: string | null | undefined) => toDate(v)?.getUTCFullYear() ?? null

export function yearsText(y: number): string {
  if (y < 1) {
    const m = Math.max(1, Math.round(y * 12))
    return `${m} ${m === 1 ? 'month' : 'months'}`
  }
  const v = y >= 10 ? Math.round(y) : Number(y.toFixed(1))
  return `${v} ${v === 1 ? 'year' : 'years'}`
}

export function rarityText(r: Rarity | null | undefined): string {
  if (!r || r.status !== 'ready') return ''
  if (r.interval_years !== null && r.interval_years !== undefined) return `once in ${yearsText(r.interval_years)}`
  if (r.method === 'orbit') return 'once in a lifetime'
  const to = yearOf(r.searched_to)
  return to ? `no recurrence before ${to}` : 'no recurrence found'
}

export function rareBadge(r: Rarity | null | undefined): string {
  const t = rarityText(r)
  return t ? `Rare: ${t}` : 'Rare'
}

const occFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function occDate(night: string): string {
  const d = nightDate(night)
  return d ? occFmt.format(d) : night
}

export function rarityDetail(r: Rarity | null | undefined): string {
  if (!r) return 'Recurrence not searched yet.'
  if (r.status !== 'ready') return `Recurrence not searched: ${r.reason || 'no reason given.'}`
  if (r.method === 'orbit') return r.basis
  const from = yearOf(r.searched_from)
  const to = yearOf(r.searched_to)
  const prev =
    r.previous && r.previous_years !== null
      ? `Previous ${occDate(r.previous.first_night)}, ${yearsText(r.previous_years)} before.`
      : `None earlier${from ? ` back to ${from}` : ''}.`
  const next =
    r.next && r.next_years !== null
      ? `Next ${occDate(r.next.first_night)}, ${yearsText(r.next_years)} after.`
      : `None later${to ? ` up to ${to}` : ''}.`
  return `${prev} ${next}`
}

export interface AutoView {
  label: string
  tone: 'ok' | 'info' | 'warn' | 'bad' | ''
  message: string
}

export function autoView(e: Pick<SkyEvent, 'plan' | 'auto_plan'>): AutoView | null {
  const a: AutoPlan | null | undefined = e.auto_plan
  if (e.plan?.automatic) {
    const when = e.plan.planned_at ? ` ${shortDay(e.plan.planned_at)}` : ''
    return { label: 'Planned automatically', tone: 'info', message: `The stacker planned this rare event at high priority${when}.` }
  }
  if (!a) return null
  switch (a.state) {
    case 'waiting':
      return { label: 'Plans itself', tone: 'info', message: a.reason || 'The stacker plans this rare event at high priority.' }
    case 'declined':
      return { label: 'Automatic planning off', tone: '', message: a.reason || '' }
    case 'failed':
      return { label: 'Automatic plan failed', tone: 'bad', message: a.reason || '' }
    case 'planned':
      return { label: 'Planned automatically', tone: 'info', message: '' }
    case 'skipped':
      return null
  }
  return null
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: SITE_TZ })

function shortDay(v: string): string {
  const d = toDate(v)
  return d ? `on ${dayFmt.format(d)}, ${clock(d)}` : ''
}

export interface EventGroup {
  key: 'rare' | 'other'
  title: string
  events: SkyEvent[]
}

export function groupEvents(events: SkyEvent[]): EventGroup[] {
  const rare = events.filter(isRare)
  const other = events.filter((e) => !isRare(e))
  const out: EventGroup[] = []
  if (rare.length) out.push({ key: 'rare', title: 'Rare', events: rare })
  if (other.length) out.push({ key: 'other', title: rare.length ? 'Other events' : '', events: other })
  return out
}

export function rareFirst(events: SkyEvent[]): SkyEvent[] {
  return [...events.filter(isRare), ...events.filter((e) => !isRare(e))]
}
