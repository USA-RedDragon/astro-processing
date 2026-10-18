import type {
  CalibrationQueueItem,
  CalibrationSet,
  CalibrationSetup,
  CalibrationStatus,
  CalibrationTaken,
  CameraHistoryPoint,
  Conditions,
  RecentCalibration,
  RecentCalibrationRun,
  SchedulerStatus,
  Twilight,
} from './api/scheduler'
import type { DarkBacklog, DarkBacklogCombo } from './api/darks'
import { darkRuleText } from '@/lib/darkBacklog'
import { SITE_TZ, hm, mmss, shortDate } from './format'
import { capitalise, duration, filterName, ms, type Tone } from './plan'
import { hasData } from './nowtonight'

export const NOT_MEASURED = 'not measured yet'
export const NOT_REPORTED = 'not reported yet by the observatory'
export const CALIBRATION_PLUGIN_VERSION = '5.8.2.231'
export const CALIBRATION_BLOCKED =
  'Nothing is imaging right now. Calibration runs outside the scheduler, so pause and skip do not apply.'

export type CalibCard = 'cooling' | 'darks' | 'flats' | 'done' | 'unreported'

export interface Fact {
  label: string
  value: string
  note: string
}

const fin = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v)

const thousands = (v: number) => Math.round(v).toLocaleString('en-US')

export function signed(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits))
  const s = Math.abs(r).toFixed(digits)
  return r < 0 ? '−' + s : s
}

export function tempText(v: number | null | undefined, digits = 1): string {
  if (!fin(v)) return ''
  const r = Number(v.toFixed(digits))
  return `${signed(r, Number.isInteger(r) ? 0 : digits)} °C`
}

export function readingText(v: number | null | undefined): string {
  return fin(v) ? `${signed(v, 1)} °C` : ''
}

export function secText(v: number | null | undefined): string {
  if (!fin(v)) return ''
  return `${Number(v.toPrecision(3))} s`
}

export function dateOnly(v: string | null | undefined, weekday = true): string {
  if (!v) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?(?:Z|[+-]00:?00))?$/.exec(v)
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
    return new Intl.DateTimeFormat('en-GB', {
      weekday: weekday ? 'short' : undefined,
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(d)
  }
  return shortDate(v)
}

export function versionAtLeast(v: string | undefined | null, min: string): boolean | null {
  if (!v) return null
  const a = v.split('.').map((x) => parseInt(x, 10))
  if (a.some((x) => isNaN(x))) return null
  const b = min.split('.').map((x) => parseInt(x, 10))
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}

/** reportsCalibration is whether the installed plugin sends the calibration block at all. */
export function reportsCalibration(s: SchedulerStatus): boolean {
  if (s.calibration) return true
  const v = versionAtLeast(s.version, CALIBRATION_PLUGIN_VERSION)
  if (v !== null) return v
  return s.calibration !== undefined
}

export function roofClosed(c: Conditions | null | undefined): boolean {
  const s = c?.safety
  return !!s && hasData(s) && s.connected !== false && s.safe === false
}

function camera(c: Conditions | null | undefined) {
  const cam = c?.camera
  return cam && hasData(cam) && cam.connected !== false ? cam : undefined
}

function cameraBusy(c: Conditions | null | undefined): boolean {
  const cam = camera(c)
  if (!cam) return false
  return cam.is_exposing === true || cam.cooler_on === true || (cam.cooler_power ?? 0) > 0
}

export function calibCard(s: SchedulerStatus, c: Conditions | null | undefined): CalibCard | null {
  const cal = s.calibration
  if (s.paused) return null
  if (cal?.kind === 'cooling' && cal.purpose === 'imaging') return s.exposure ? null : 'cooling'
  if (s.state === 'imaging') return null
  switch (cal?.kind) {
    case 'cooling':
      return 'cooling'
    case 'darks':
    case 'bias':
      return 'darks'
    case 'flats':
      return 'flats'
    case 'done':
      return s.state === 'waiting' ? null : 'done'
  }
  if (s.state === 'calibrating') return cal ? null : 'unreported'
  if (reportsCalibration(s)) return null
  const idle = !s.state || s.state === 'stopped' || s.state === 'idle'
  return idle && roofClosed(c) && cameraBusy(c) ? 'unreported' : null
}

/** showCalibLower is whether the missing-darks and recent-calibration cards belong on the page. */
export function showCalibLower(
  card: CalibCard | null,
  s: SchedulerStatus,
  c: Conditions | null | undefined,
): boolean {
  const imagingCool = card === 'cooling' && s.calibration?.purpose === 'imaging'
  if (card && !imagingCool) return true
  if (s.state === 'imaging' || s.state === 'waiting') return false
  return roofClosed(c)
}

/** pauseApplies is whether the scheduler can still be paused while calibration runs. */
export function pauseApplies(s: SchedulerStatus): boolean {
  return s.state === 'calibrating' && s.calibration?.placement === 'before_wait'
}

/** outsideScheduler is whether calibration runs where pause and skip do not reach it. */
export function outsideScheduler(card: CalibCard | null, s: SchedulerStatus): boolean {
  const cal = s.calibration
  if (!cal || (card !== 'cooling' && card !== 'darks' && card !== 'flats')) return false
  if (cal.kind === 'cooling' && cal.purpose === 'imaging') return false
  return cal.placement === 'while_unsafe' || cal.placement === 'end_of_night'
}

const hourFmt = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  hour12: false,
  timeZone: SITE_TZ,
})

export function isMorning(now: number): boolean {
  const h = Number(hourFmt.format(new Date(now)))
  return h >= 4 && h < 12
}

function kindWord(cal: CalibrationStatus | null | undefined): string {
  return cal?.kind === 'bias' ? 'bias' : 'darks'
}

function sensorOf(cal: CalibrationStatus | null | undefined, c: Conditions | null | undefined) {
  const cam = camera(c)
  return {
    temperature: cam?.temperature ?? cal?.camera?.temperature ?? undefined,
    setpoint: cam?.target_temperature ?? cal?.camera?.setpoint ?? undefined,
    power: cam?.cooler_power ?? cal?.camera?.cooler_power ?? undefined,
    exposing: cam?.is_exposing,
  }
}

export function calibBadge(
  card: CalibCard | null,
  cal: CalibrationStatus | null | undefined,
  c: Conditions | null | undefined,
  now: number,
): { label: string; tone: Tone } | null {
  if (!card) return null
  const closed = roofClosed(c)
  const join = (parts: string[]) => capitalise(parts.filter(Boolean).join(' · '))
  switch (card) {
    case 'cooling':
      return {
        label: join([
          closed ? 'Roof closed' : '',
          cal?.purpose === 'imaging' ? 'cooling for imaging' : 'cooling for darks',
        ]),
        tone: closed ? 'warn' : 'info',
      }
    case 'darks':
      return {
        label: join([closed ? 'Roof closed' : '', `taking ${kindWord(cal)}`]),
        tone: closed ? 'warn' : 'ok',
      }
    case 'flats':
      return {
        label: join([isMorning(now) ? 'Morning' : closed ? 'Roof closed' : '', 'taking flats']),
        tone: '',
      }
    case 'done':
      return closed
        ? { label: 'Roof closed · waiting', tone: 'warn' }
        : { label: 'No calibration left', tone: '' }
    case 'unreported': {
      const cam = sensorOf(cal, c)
      return {
        label: join([closed ? 'Roof closed' : '', 'camera ' + cameraActivity(cam)]),
        tone: closed ? 'warn' : '',
      }
    }
  }
}

function cameraActivity(cam: ReturnType<typeof sensorOf>): string {
  if (cam.exposing) return 'exposing'
  if (fin(cam.temperature) && fin(cam.setpoint) && cam.temperature > cam.setpoint + 0.5)
    return 'cooling'
  return 'cold'
}

export function ninaPill(
  card: CalibCard | null,
  cal: CalibrationStatus | null | undefined,
  c: Conditions | null | undefined,
): { value: string; dot: string } | null {
  switch (card) {
    case 'cooling':
      return {
        value: cal?.purpose === 'imaging' ? 'cooling for imaging' : 'cooling for darks',
        dot: 'var(--info)',
      }
    case 'darks':
      return { value: `taking ${kindWord(cal)}`, dot: 'var(--ok)' }
    case 'flats':
      return { value: 'taking flats', dot: 'var(--ok)' }
    case 'done':
      return roofClosed(c) ? { value: 'waiting to be safe', dot: 'var(--warn)' } : null
  }
  return null
}

export function cameraPill(
  card: CalibCard | null,
  cal: CalibrationStatus | null | undefined,
  c: Conditions | null | undefined,
): { label: string; value: string; dot: string } | null {
  if (!card) return null
  const cam = sensorOf(cal, c)
  if (!fin(cam.temperature))
    return { label: 'Camera', value: NOT_MEASURED, dot: 'var(--muted-foreground)' }
  const target = cal?.cooling?.target
  const value =
    card === 'cooling' && fin(target)
      ? `${readingText(cam.temperature)}, cooling to ${tempText(target)}`
      : readingText(cam.temperature)
  return { label: 'Camera', value, dot: 'var(--ok)' }
}

export function setLabel(s: CalibrationSetup & { kind?: string | null }, kind?: string): string {
  const k = kind ?? s.kind ?? ''
  const gain = fin(s.gain) ? `gain ${s.gain}` : ''
  if (k === 'flats') {
    return [filterName(s.filter), s.target_name ?? '', secText(s.exposure)]
      .filter(Boolean)
      .join(', ')
  }
  if (k === 'bias') return ['Bias', gain].filter(Boolean).join(', ')
  const head = [secText(s.exposure), fin(s.set_temp) ? `at ${tempText(s.set_temp)}` : '']
    .filter(Boolean)
    .join(' ')
  return [head, gain].filter(Boolean).join(', ')
}

function sunPhrase(cal: CalibrationStatus | null | undefined, about = false): string {
  const deg = cal?.sun_limit_degrees
  const at = cal?.sun_limit_at ? (about ? ', about ' : ' at ') + hm(cal.sun_limit_at) : ''
  if (!fin(deg)) return `the sun gets too high for darks${at}`
  return `the sun reaches ${signed(Math.abs(deg), 0)}° below the horizon${at}`
}

export function reasonText(
  item: Pick<CalibrationQueueItem, 'reason_code' | 'reason' | 'set_temp'> & {
    filter?: string | null
  },
  cal: CalibrationStatus | null | undefined,
): string {
  const t = fin(item.set_temp) ? tempText(item.set_temp) : 'this temperature'
  const air = fin(cal?.ambient) ? tempText(cal.ambient) : ''
  switch (item.reason_code) {
    case 'sun':
      return `Does not fit before ${sunPhrase(cal)}.`
    case 'wait_end':
      return 'Does not fit before the wait ends and imaging starts.'
    case 'above_ambient':
      return air
        ? `${capitalise(t)} is warmer than the air (${air}), and the camera can only cool.`
        : `${capitalise(t)} is warmer than the air, and the camera can only cool.`
    case 'cooler_capacity':
      return air
        ? `The camera has never cooled to ${t} with the air at ${air}. It waits for a cooler night.`
        : `The camera has never cooled to ${t} at this air temperature. It waits for a cooler night.`
    case 'cooler_limit':
      return `The camera could not hold ${t} earlier. It tries again when the air is cooler.`
    case 'unmeasured_move':
      return `How fast the camera gets to ${t} is not measured yet, so it may not get there in time.`
    case 'not_reached':
      return `The camera did not reach ${t}.`
    case 'drift':
      return `The sensor drifted away from ${t}.`
    case 'stopped':
      return 'Calibration stopped before this set.'
    case 'untrained':
      return `The flat panel has no trained exposure for ${filterName(item.filter)}.`
    case 'already_taken':
      return 'These flats were already taken in this run.'
  }
  const r = (item.reason ?? '').trim()
  if (item.reason_code === 'error' && !r) return 'An error stopped this set.'
  if (!r) return 'No reason reported yet.'
  return capitalise(r) + (/[.!?]$/.test(r) ? '' : '.')
}

export function placementText(
  cal: CalibrationStatus,
  waitUntil?: string | null,
  twilight?: Twilight | null,
  now: number = Date.now(),
): string {
  const kind = cal.kind
  if (kind === 'flats') {
    const total = cal.set?.frames_total
    const night = cal.set?.session_date ? ` on the night of ${dateOnly(cal.set.session_date)}` : ''
    const dawn = ms(twilight?.astronomical_dawn)
    const ended =
      !isNaN(dawn) && dawn <= now && now - dawn < 12 * 3600e3
        ? `Imaging ended at astronomical dawn, ${hm(dawn)}. `
        : ''
    return `${ended}NINA takes ${fin(total) ? total + ' ' : ''}panel flats for each filter and target imaged${night}.`
  }
  if (kind === 'cooling') {
    const t = cal.cooling?.target
    const to = fin(t) ? ` to ${tempText(t)}` : ''
    if (cal.purpose === 'imaging') return `The camera cools${to} for imaging.`
    const first = `It cools the camera${to} first.`
    switch (cal.placement) {
      case 'while_unsafe':
        return `The roof is closed, so NINA uses the time for darks. ${first}`
      case 'before_wait':
        return `NINA uses the wait before the next target for darks. ${first}`
      case 'end_of_night':
        return `Imaging is over for tonight, so NINA takes darks. ${first}`
    }
    return `NINA takes darks. ${first}`
  }
  const w = kindWord(cal)
  switch (cal.placement) {
    case 'while_unsafe':
      return `The roof is closed, so NINA takes ${w} in the meantime. If it turns safe, ${w} stop after this frame and imaging starts.`
    case 'before_wait':
      return `NINA takes ${w} to fill the wait before the next target${waitUntil ? `, until about ${hm(waitUntil)}` : ''}.`
    case 'end_of_night':
      return `Imaging is over for tonight, so NINA takes ${w} until ${sunPhrase(cal, true)}.`
  }
  return ''
}

export function stopNote(cal: CalibrationStatus): string {
  const w = cal.kind === 'bias' ? 'Bias frames' : 'Darks'
  switch (cal.placement) {
    case 'while_unsafe':
      return `${w} stop when it is safe to image again or when ${sunPhrase(cal, true)}.`
    case 'before_wait':
      return `${w} stop in time for the next target, or when ${sunPhrase(cal, true)}.`
    case 'end_of_night':
      return `${w} stop when ${sunPhrase(cal, true)}.`
  }
  return ''
}

export interface QueueRow {
  at: string
  what: string
  note: string
  len: string
  cut: boolean
}

export function comboMap(b: DarkBacklog | null | undefined): Map<string, DarkBacklogCombo> {
  return new Map((b?.combos ?? []).map((c) => [c.combo_key, c]))
}

function whoNote(item: CalibrationQueueItem, combo: DarkBacklogCombo | undefined): string {
  const targets = combo?.targets ?? []
  if (targets.length) {
    if (targets.length <= 3) return targets.map((t) => t.name).join(', ')
    const latest = combo?.latest_night ? `, latest ${dateOnly(combo.latest_night)}` : ''
    return `for ${targets.length} targets${latest}`
  }
  const blocked = item.lights_blocked ?? combo?.lights_blocked
  const scaled = item.lights_scaled ?? combo?.lights_scaled
  if (fin(blocked) && blocked > 0) return `${thousands(blocked)} lights with no dark`
  if (fin(scaled) && scaled > 0) return `${thousands(scaled)} lights on a scaled dark`
  return ''
}

export function queueRows(
  cal: CalibrationStatus,
  combos: Map<string, DarkBacklogCombo>,
): QueueRow[] {
  const out: QueueRow[] = []
  const set = cal.set
  for (const q of cal.queue ?? []) {
    if (q.status === 'done') continue
    const combo = q.combo_key ? combos.get(q.combo_key) : undefined
    const total = q.frames_total
    const isSet = q.status === 'taking' && !!set && (!q.combo_key || q.combo_key === set.combo_key)
    const have = isSet ? (set.frames_done ?? q.frames_have) : q.frames_have
    const count = fin(total) ? `${fin(have) ? have : 0} of ${total}` : ''
    const left = isSet && fin(total) && fin(have) ? `${Math.max(0, total - have)} left` : ''
    const parts = [count, left, q.kind === 'flats' ? '' : whoNote(q, combo)]
    let cut = false
    let len = ''
    const blocked = q.status === 'skipped' || q.status === 'waiting'
    if (blocked) {
      parts.length = 0
      parts.push(reasonText(q, cal))
      cut = true
      len =
        q.reason_code === 'sun' || q.reason_code === 'wait_end' || q.fit_frames === 0
          ? 'does not fit'
          : q.status === 'waiting'
            ? 'waits'
            : 'skipped'
    } else if (q.fit_frames === 0) {
      cut = true
      len = 'does not fit'
    } else {
      if (fin(q.fit_frames) && fin(q.remaining) && q.fit_frames < q.remaining) {
        cut = true
        parts.push(`about ${q.fit_frames} of ${q.remaining} fit before the sun limit`)
      }
      if (isSet && set?.ends_at) len = `ends about ${hm(set.ends_at)}`
      else {
        const a = ms(q.planned_start)
        const b = ms(q.planned_end)
        if (!isNaN(a) && !isNaN(b) && b > a) len = `about ${duration((b - a) / 1000)}`
      }
    }
    out.push({
      at: q.status === 'taking' ? 'now' : !blocked && q.planned_start ? hm(q.planned_start) : '',
      what: setLabel(q, q.kind ?? cal.kind ?? undefined),
      note: parts.filter(Boolean).join(' · '),
      len,
      cut,
    })
  }
  return out
}

export interface Progress {
  pct: number
  elapsed: number
  len: number
  end: number
}

export function progress(
  start: string | null | undefined,
  end: string | null | undefined,
  now: number,
): Progress | null {
  const a = ms(start)
  const b = ms(end)
  if (isNaN(a) || isNaN(b) || b <= a) return null
  const len = (b - a) / 1000
  const elapsed = Math.min(len, Math.max(0, (now - a) / 1000))
  return { pct: Math.round((elapsed / len) * 100), elapsed, len, end: b }
}

export function powerTrend(points: CameraHistoryPoint[] | null | undefined): string {
  const p = (points ?? []).filter((x) => fin(x.cooler_power) && !isNaN(ms(x.t)))
  if (p.length < 2) return ''
  const last = p[p.length - 1]
  const tEnd = ms(last.t)
  const first = p.find((x) => tEnd - ms(x.t) <= 5 * 60e3) ?? p[0]
  const mins = (tEnd - ms(first.t)) / 60e3
  if (mins < 2) return ''
  const rate = ((last.cooler_power as number) - (first.cooler_power as number)) / mins
  if (Math.abs(rate) < 0.5) return 'steady'
  return `${rate > 0 ? 'rising' : 'falling'} ${Math.round(Math.abs(rate))}% a minute`
}

export interface CoolingView {
  headline: string
  facts: Fact[]
  bar: { label: string; right: string; pct: number } | null
}

export function coolingView(
  cal: CalibrationStatus,
  c: Conditions | null | undefined,
  history: CameraHistoryPoint[] | null | undefined,
  now: number,
): CoolingView {
  const cam = sensorOf(cal, c)
  const co = cal.cooling ?? {}
  const target = co.target
  const stepping = fin(target) && fin(cam.setpoint) && cam.setpoint > target + 0.05
  const end = ms(co.ends_at)
  const trend = powerTrend(history)
  const facts: Fact[] = [
    {
      label: 'Sensor now',
      value: fin(cam.temperature) ? readingText(cam.temperature) : NOT_MEASURED,
      note: fin(cam.setpoint)
        ? `setpoint ${tempText(cam.setpoint)}${stepping ? ', stepping down' : ''}`
        : '',
    },
    {
      label: 'Target',
      value: fin(target) ? tempText(target) : NOT_MEASURED,
      note: fin(co.from)
        ? `from ${tempText(co.from)}`
        : fin(cal.ambient)
          ? `air ${tempText(cal.ambient)}`
          : '',
    },
    {
      label: 'Cooler power',
      value: fin(cam.power) ? `${Math.round(cam.power)}%` : NOT_MEASURED,
      note: trend,
    },
    {
      label: 'Time left',
      value: isNaN(end)
        ? NOT_MEASURED
        : end > now
          ? `about ${duration((end - now) / 1000)}`
          : 'about done',
      note: isNaN(end) ? '' : `done about ${hm(end)}`,
    },
  ]
  const p = progress(co.started_at, co.ends_at, now)
  return {
    headline: fin(target) ? `Cooling the camera to ${tempText(target)}` : 'Cooling the camera',
    facts,
    bar: p
      ? {
        label: fin(co.rate_c_per_min)
          ? `Cooling, ${Number(co.rate_c_per_min.toPrecision(2))} °C a minute`
          : 'Cooling',
        right: `${mmss(p.elapsed)} of ${mmss(p.len)} · done about ${hm(p.end)}`,
        pct: p.pct,
      }
      : null,
  }
}

export interface Step {
  at: string
  text: string
  state: 'done' | 'cur' | 'later'
}

export function calibSteps(cal: CalibrationStatus): Step[] {
  const log = (cal.log ?? []).filter((l) => l.text)
  const out: Step[] = log.map((l, i) => ({
    at: hm(l.at),
    text: capitalise(String(l.text)),
    state: i === log.length - 1 ? 'cur' : 'done',
  }))
  if (cal.kind === 'cooling' && cal.purpose !== 'imaging') {
    const first = (cal.queue ?? []).find(
      (q) => q.status !== 'done' && q.status !== 'skipped' && q.status !== 'waiting',
    )
    if (first) {
      const order =
        (cal.queue ?? []).filter((q) => (q.kind ?? 'darks') === 'darks').length > 1
          ? 'the coldest set: '
          : ''
      out.push({
        at: first.planned_start ? 'about ' + hm(first.planned_start) : '',
        text: `Darks start with ${order}${setLabel(first, first.kind ?? 'darks')}.`,
        state: 'later',
      })
    }
  }
  return out
}

export interface Tick {
  pos: number
  label: string
}

export interface ChartBox {
  x0: number
  x1: number
  yTop: number
  yBottom: number
}

export interface CoolChart {
  empty: boolean
  sensor: string
  area: string
  setpoint: string
  ramp: string
  target: { y: number; label: string } | null
  yTicks: Tick[]
  xTicks: Tick[]
  now: { x: number; y: number; label: string } | null
  end: { x: number; y: number; label: string } | null
  label: string
}

export function coolChart(
  points: CameraHistoryPoint[] | null | undefined,
  opts: {
    target?: number | null
    setpoint?: number | null
    endsAt?: string | null
    now: number
  },
  box: ChartBox,
): CoolChart {
  const pts = (points ?? [])
    .map((p) => ({ t: ms(p.t), v: p.temperature, s: p.setpoint }))
    .filter(
      (p): p is { t: number; v: number; s: number | null | undefined } => !isNaN(p.t) && fin(p.v),
    )
    .sort((a, b) => a.t - b.t)
  const blank: CoolChart = {
    empty: true,
    sensor: '',
    area: '',
    setpoint: '',
    ramp: '',
    target: null,
    yTicks: [],
    xTicks: [],
    now: null,
    end: null,
    label: '',
  }
  if (pts.length < 2) return blank
  const last = pts[pts.length - 1]
  const end = ms(opts.endsAt)
  const target = fin(opts.target) ? opts.target : undefined
  const setNow = fin(opts.setpoint) ? opts.setpoint : last.s
  const ramp = target !== undefined && fin(setNow) && !isNaN(end) && end > last.t
  const t0 = pts[0].t
  let t1 = Math.max(last.t, opts.now)
  if (ramp) t1 = Math.max(t1, end)
  t1 += (t1 - t0) * 0.04
  const vals = pts.map((p) => p.v)
  for (const p of pts) if (fin(p.s)) vals.push(p.s)
  if (target !== undefined) vals.push(target)
  if (fin(setNow)) vals.push(setNow)
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  const span = Math.max(hi - lo, 4)
  const step = span <= 12 ? 2 : span <= 30 ? 5 : 10
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step
  if (hi === lo) hi = lo + step
  const X = (t: number) => box.x0 + ((t - t0) / (t1 - t0)) * (box.x1 - box.x0)
  const Y = (v: number) => box.yTop + ((hi - v) / (hi - lo)) * (box.yBottom - box.yTop)
  const f = (n: number) => n.toFixed(1)
  const sensor = pts.map((p, i) => `${i ? 'L' : 'M'}${f(X(p.t))} ${f(Y(p.v))}`).join(' ')
  const area = `${sensor} L${f(X(last.t))} ${box.yBottom} L${f(X(pts[0].t))} ${box.yBottom} Z`
  const sp = pts.filter((p) => fin(p.s))
  const setpoint =
    !ramp && sp.length > 1
      ? sp.map((p, i) => `${i ? 'L' : 'M'}${f(X(p.t))} ${f(Y(p.s as number))}`).join(' ')
      : ''
  const yTicks: Tick[] = []
  for (let v = hi; v >= lo - 1e-9; v -= step) yTicks.push({ pos: Y(v), label: signed(v, 0) })
  const spanMin = (t1 - t0) / 60e3
  const every = (spanMin <= 90 ? 10 : spanMin <= 240 ? 30 : 60) * 60e3
  const xTicks: Tick[] = []
  for (let t = Math.ceil(t0 / every) * every; t <= t1; t += every) {
    const x = X(t)
    if (x - box.x0 > 16 && box.x1 - x > 16) xTicks.push({ pos: x, label: hm(t) })
  }
  const nowLabel = `${readingText(last.v)} now`
  return {
    empty: false,
    sensor,
    area,
    setpoint,
    ramp: ramp
      ? `M${f(X(last.t))} ${f(Y(setNow as number))} L${f(X(end))} ${f(Y(target as number))}`
      : '',
    target: target !== undefined ? { y: Y(target), label: `target ${tempText(target)}` } : null,
    yTicks,
    xTicks,
    now: { x: X(last.t), y: Y(last.v), label: nowLabel },
    end: ramp ? { x: X(end), y: Y(target as number), label: hm(end) } : null,
    label:
      `Sensor temperature from ${tempText(pts[0].v)} at ${hm(pts[0].t)} to ${tempText(last.v)} at ${hm(last.t)}` +
      (ramp ? `, setpoint ramp continues to ${tempText(target)} at about ${hm(end)}` : ''),
  }
}

export interface Frames {
  cells: ('old' | 'done' | 'now' | '')[]
  old: number
  done: number
  now: boolean
  total: number
}

export function framesGrid(
  set: CalibrationSet | null | undefined,
  inProgress: boolean,
): Frames | null {
  const total = set?.frames_total
  if (!fin(total) || total <= 0) return null
  const old = Math.min(Math.max(0, set?.frames_before ?? 0), total)
  const doneAll = Math.min(Math.max(old, set?.frames_done ?? old), total)
  const done = doneAll - old
  const now = inProgress && doneAll < total
  const cells: Frames['cells'] = []
  for (let i = 0; i < total; i++)
    cells.push(i < old ? 'old' : i < doneAll ? 'done' : i === doneAll && now ? 'now' : '')
  return { cells, old, done, now, total }
}

function sameExposure(a: number | null | undefined, b: number | null | undefined): boolean {
  return fin(a) && fin(b) && Math.abs(a - b) <= Math.max(0.001, 0.01 * Math.max(a, b))
}

function lastMedian(
  c: Conditions | null | undefined,
  exposure: number | null | undefined,
): number | null {
  const li = c?.last_image
  if (!li || !hasData(li) || !fin(li.median_adu)) return null
  return sameExposure(li.exposure, exposure) ? li.median_adu : null
}

function airTemp(cal: CalibrationStatus | null | undefined, c: Conditions | null | undefined) {
  const w = c?.weather
  if (w && hasData(w) && w.connected !== false && fin(w.temperature)) return w.temperature
  return fin(cal?.ambient) ? cal.ambient : undefined
}

export function darkFacts(cal: CalibrationStatus, c: Conditions | null | undefined): Fact[] {
  const cam = sensorOf(cal, c)
  const med = lastMedian(c, cal.set?.exposure ?? cal.frame?.seconds)
  const air = airTemp(cal, c)
  const w = cal.kind === 'bias' ? 'bias frame' : 'dark'
  return [
    {
      label: 'Sensor',
      value: fin(cam.temperature) ? readingText(cam.temperature) : NOT_MEASURED,
      note: fin(cam.setpoint) ? `set ${tempText(cam.setpoint)}` : '',
    },
    {
      label: 'Cooler power',
      value: fin(cam.power) ? `${Math.round(cam.power)}%` : NOT_MEASURED,
      note: '',
    },
    {
      label: `Last ${w}`,
      value: med !== null ? `${thousands(med)} ADU` : NOT_MEASURED,
      note: med !== null ? 'median' : '',
    },
    {
      label: 'Air',
      value: fin(air) ? readingText(air) : NOT_MEASURED,
      note:
        fin(air) && fin(cam.temperature) && air > cam.temperature
          ? `camera ${Math.round(air - cam.temperature)} °C below`
          : '',
    },
  ]
}

export interface WhoNeeds {
  scope: string
  text: string
  pills: { name: string; lights: string }[]
  more: number
}

export function whoNeeds(combo: DarkBacklogCombo | undefined, shown = 9): WhoNeeds | null {
  if (!combo) return null
  const temps = [...(combo.set_temps_covered ?? [])].sort((a, b) => a - b)
  const at =
    temps.length > 1
      ? `${signed(temps[0], 0)} to ${tempText(temps[temps.length - 1])}`
      : fin(combo.set_temp)
        ? tempText(combo.set_temp)
        : ''
  const scope = [
    at ? `lights at ${at}` : 'lights',
    secText(combo.exposure),
    fin(combo.gain) ? `gain ${combo.gain}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  const parts: string[] = []
  if (fin(combo.lights_blocked) && combo.lights_blocked > 0)
    parts.push(`${thousands(combo.lights_blocked)} have no dark`)
  if (fin(combo.lights_scaled) && combo.lights_scaled > 0)
    parts.push(
      `${thousands(combo.lights_scaled)} use a dark scaled from another temperature or exposure`,
    )
  if (fin(combo.lights_thin) && combo.lights_thin > 0)
    parts.push(
      `${thousands(combo.lights_thin)} use a set of fewer than ${combo.frames_needed ?? 'enough'} darks`,
    )
  const targets = combo.targets ?? []
  const who = targets.length
    ? `Lights from ${targets.length} ${targets.length === 1 ? 'target' : 'targets'} wait on this set`
    : 'Lights wait on this set'
  const list =
    parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]
  const need = fin(combo.frames_needed) ? ` of ${combo.frames_needed}` : ''
  const text = list
    ? `${who}: ${list}. This set gives them a full set${need} at their temperature.`
    : `${who}.`
  return {
    scope,
    text,
    pills: targets.slice(0, shown).map((t) => ({ name: t.name, lights: thousands(t.lights) })),
    more: Math.max(0, targets.length - shown),
  }
}

export function flatFacts(cal: CalibrationStatus, c: Conditions | null | undefined): Fact[] {
  const set = cal.set ?? {}
  const fd = c?.flat_device
  const fdOk = fd && hasData(fd) && fd.connected !== false ? fd : undefined
  const b = fin(set.panel_brightness) ? set.panel_brightness : fdOk?.brightness
  const max = fdOk?.brightness_max
  const exp = set.exposure ?? cal.frame?.seconds
  const med = lastMedian(c, exp)
  const cam = sensorOf(cal, c)
  let pct = ''
  if (fin(b) && fin(max) && max > 0) {
    const p = (b / max) * 100
    pct = `${p < 10 ? Number(p.toFixed(1)) : Math.round(p)}% brightness`
  }
  return [
    {
      label: 'Panel',
      value: fin(b) ? (fin(max) ? `${b} of ${thousands(max)}` : String(b)) : NOT_MEASURED,
      note: pct,
    },
    { label: 'Exposure', value: fin(exp) ? secText(exp) : NOT_MEASURED, note: '' },
    {
      label: 'Last flat',
      value: med !== null ? `${thousands(med)} ADU` : NOT_MEASURED,
      note: med !== null ? 'median' : '',
    },
    {
      label: 'Sensor',
      value: fin(cam.temperature) ? readingText(cam.temperature) : NOT_MEASURED,
      note: fin(cam.setpoint) ? `set ${tempText(cam.setpoint)}` : '',
    },
  ]
}

export interface FlatRow {
  done: string
  target: string
  filter: string
  flats: string
  exposure: string
  current: boolean
}

export interface TakenGroup {
  first: CalibrationTaken
  entries: CalibrationTaken[]
  frames: number
  started: number
  ended: number
}

export function takenKey(t: CalibrationSetup & { kind?: string | null }): string {
  if (t.kind === 'flats') return `flats|${t.target_name ?? ''}|${filterName(t.filter)}`
  return `${t.kind ?? 'darks'}|${t.combo_key || setLabel(t)}`
}

/** groupTaken merges the runs of one set, as the plugin lists a set again for each run. */
export function groupTaken(taken: CalibrationTaken[] | null | undefined): TakenGroup[] {
  const groups = new Map<string, TakenGroup>()
  for (const t of taken ?? []) {
    const k = takenKey(t)
    const a = ms(t.started_at)
    const b = ms(t.ended_at)
    const g = groups.get(k)
    if (!g) {
      groups.set(k, { first: t, entries: [t], frames: t.frames ?? 0, started: a, ended: b })
      continue
    }
    g.entries.push(t)
    g.frames += t.frames ?? 0
    if (!isNaN(a) && (isNaN(g.started) || a < g.started)) g.started = a
    if (!isNaN(b) && (isNaN(g.ended) || b > g.ended)) g.ended = b
  }
  return [...groups.values()]
}

export function flatRows(cal: CalibrationStatus): FlatRow[] {
  const current = cal.set ? takenKey({ ...cal.set, kind: 'flats' }) : ''
  const rows: FlatRow[] = groupTaken((cal.taken ?? []).filter((t) => t.kind === 'flats'))
    .filter((g) => takenKey(g.first) !== current)
    .map((g) => ({ t: g.first, frames: g.frames, ended: g.ended }))
    .map(({ t, frames, ended }) => ({
      done: hm(ended),
      target: t.target_name ?? '',
      filter: t.filter ?? '',
      flats: String(frames),
      exposure: secText(t.exposure),
      current: false,
    }))
  const s = cal.set
  if (s)
    rows.push({
      done: 'now',
      target: s.target_name ?? '',
      filter: s.filter ?? '',
      flats: fin(s.frames_total)
        ? `${s.frames_done ?? 0} of ${s.frames_total}`
        : String(s.frames_done ?? ''),
      exposure: secText(s.exposure ?? cal.frame?.seconds),
      current: true,
    })
  return rows
}

export function afterFlats(cal: CalibrationStatus): Step[] {
  const out: Step[] = []
  const s = cal.set
  if (s)
    out.push({
      at: s.ends_at ? 'about ' + hm(s.ends_at) : '',
      text: `${filterName(s.filter)} flats for ${s.target_name ?? 'this target'} finish.`,
      state: 'cur',
    })
  for (const q of cal.queue ?? []) {
    if (q.status === 'taking' || q.status === 'done') continue
    const what =
      q.kind === 'flats' || !q.kind
        ? `${filterName(q.filter)} flats for ${q.target_name ?? 'a target'}`
        : setLabel(q)
    const blocked = q.status === 'skipped' || q.status === 'waiting'
    out.push({
      at: !blocked && q.planned_start ? 'about ' + hm(q.planned_start) : '',
      text: blocked ? `${what}: ${reasonText(q, cal)}` : `${what}.`,
      state: 'later',
    })
  }
  return out
}

function overlap(t: CalibrationTaken, r: RecentCalibrationRun): number | null {
  const slack = 30 * 60e3
  const a0 = ms(t.started_at)
  const a1 = ms(t.ended_at)
  const b0 = ms(r.started_at)
  const b1 = ms(r.ended_at)
  if ([a0, a1, b0, b1].some(isNaN)) return null
  if (b0 > a1 + slack || b1 < a0 - slack) return -Infinity
  return Math.min(a1, b1) - Math.max(a0, b0)
}

function sameTemp(a: number | null | undefined, b: number | null | undefined) {
  if (!fin(a) && !fin(b)) return true
  return fin(a) && fin(b) && Math.abs(a - b) <= 0.5
}

function sameNum(a: number | null | undefined, b: number | null | undefined) {
  return !fin(a) || !fin(b) || a === b
}

export function matchRun(
  t: CalibrationTaken,
  runs: RecentCalibrationRun[] | null | undefined,
): RecentCalibrationRun | null {
  let best: RecentCalibrationRun | null = null
  let bestO = -Infinity
  for (const r of runs ?? []) {
    if (r.kind !== t.kind) continue
    if (t.kind === 'flats') {
      if ((r.target_name ?? '') !== (t.target_name ?? '')) continue
      if (filterName(r.filter) !== filterName(t.filter)) continue
      if (!sameExposure(r.exposure, t.exposure)) continue
    } else {
      if (t.kind === 'darks' && !sameExposure(r.exposure, t.exposure)) continue
      if (
        !sameNum(r.gain, t.gain) ||
        !sameNum(r.offset, t.offset) ||
        !sameNum(r.binning, t.binning)
      )
        continue
      if (t.kind === 'darks' && !sameTemp(r.set_temp, t.set_temp)) continue
    }
    const o = overlap(t, r) ?? 0
    if (o === -Infinity) continue
    if (o > bestO) {
      best = r
      bestO = o
    }
  }
  return best
}

export interface TakenRow {
  set: string
  frames: string
  clean: string
  ended: string
}

export function takenRows(
  cal: CalibrationStatus,
  recent: RecentCalibration | null | undefined,
): TakenRow[] {
  return groupTaken(cal.taken).map((g) => {
    const runs = new Set<RecentCalibrationRun>()
    let missing = 0
    for (const e of g.entries) {
      const r = matchRun(e, recent?.runs)
      if (r && fin(r.clean)) runs.add(r)
      else missing++
    }
    const clean = [...runs].reduce((a, r) => a + (r.clean ?? 0), 0)
    return {
      set: setLabel(g.first),
      frames: String(g.frames),
      clean: !runs.size ? 'not checked yet' : missing ? `${clean} so far` : String(clean),
      ended: hm(g.ended),
    }
  })
}

export function stopText(cal: CalibrationStatus): string {
  const stop = cal.stop
  if (!stop) return ''
  const r = (stop.reason ?? '').trim()
  const own = r ? capitalise(r) + (/[.!?]$/.test(r) ? '' : '.') : ''
  switch (stop.code) {
    case 'finished':
      return 'The calibration run finished.'
    case 'nothing_left':
      return 'No set that is still missing fits tonight.'
    case 'safe':
      return 'It turned safe, so calibration stopped for imaging.'
    case 'sun':
      return `Calibration stopped because ${sunPhrase(cal)}.`
    case 'cover':
      return 'The flat panel cover is not confirmed closed, so darks stopped.'
    case 'time_limit':
      return "The calibration instruction's time limit is up."
    case 'wait_end':
      return 'The wait before the next target ended.'
    case 'replan':
      return 'A re-plan or pause was asked for from the web.'
    case 'no_safety':
      return 'No safety monitor is connected, so it is not known when imaging can resume.'
    case 'canceled':
      return 'The run was cancelled in NINA.'
    case 'error':
      return own || 'An error stopped the run.'
  }
  return own
}

export interface DoneView {
  headline: string
  why: string
  facts: Fact[]
  waits: { set: string; reason: string }[]
}

export function doneView(cal: CalibrationStatus, c: Conditions | null | undefined): DoneView {
  const closed = roofClosed(c)
  const cam = sensorOf(cal, c)
  const stop = cal.stop
  let why = stopText(cal)
  if (fin(cam.temperature))
    why = [why, `The camera is at ${readingText(cam.temperature)}.`].filter(Boolean).join(' ')
  const darks = groupTaken((cal.taken ?? []).filter((t) => t.kind === 'darks' || t.kind === 'bias'))
  const frames = darks.reduce((a, g) => a + g.frames, 0)
  const starts = darks.map((g) => g.started).filter((x) => !isNaN(x))
  const ends = darks.map((g) => g.ended).filter((x) => !isNaN(x))
  const facts: Fact[] = [
    {
      label: 'Darks tonight',
      value: darks.length
        ? `${darks.length} ${darks.length === 1 ? 'set' : 'sets'} · ${frames} ${frames === 1 ? 'frame' : 'frames'}`
        : 'none',
      note:
        starts.length && ends.length
          ? `${hm(Math.min(...starts))} to ${hm(Math.max(...ends))}`
          : '',
    },
    {
      label: 'Sensor',
      value: fin(cam.temperature) ? readingText(cam.temperature) : NOT_MEASURED,
      note: fin(cam.setpoint) ? `set ${tempText(cam.setpoint)}` : '',
    },
  ]
  if (stop?.at) facts.push({ label: 'Stopped', value: hm(stop.at), note: '' })
  return {
    headline: closed ? 'Roof closed, no calibration left to take' : 'No calibration left to take',
    why,
    facts,
    waits: (cal.queue ?? [])
      .filter((q) => q.status === 'skipped' || q.status === 'waiting')
      .map((q) => ({ set: setLabel(q, q.kind ?? 'darks'), reason: reasonText(q, cal) })),
  }
}

export interface MissingView {
  summary: string
  rows: { key: string; set: string; have: string; waiting: string; bad: boolean; latest: string }[]
  more: number
  foot: string
}

function plainUnschedulable(r: string): string {
  if (/no gain or offset/i.test(r)) return 'their files have no gain or offset'
  return r
}

export function missingView(b: DarkBacklog | null | undefined, shown = 7): MissingView | null {
  if (!b) return null
  const combos = b.combos ?? []
  const sum = (f: (c: DarkBacklogCombo) => number | null | undefined) =>
    combos.reduce((a, c) => a + (f(c) ?? 0), 0)
  const blocked = sum((c) => c.lights_blocked)
  const scaled = sum((c) => c.lights_scaled)
  let summary: string
  if (!combos.length) summary = 'No dark sets are missing.'
  else {
    const rule = darkRuleText(b)
    const target =
      rule == null
        ? 'enough clean darks'
        : fin(b.frames_needed_long) && fin(b.long_exposure_s)
          ? `a full set of clean darks (${rule})`
          : `${rule} clean darks`
    summary = `${combos.length} ${combos.length === 1 ? 'set is' : 'sets are'} short of ${target}.`
    const parts: string[] = []
    if (blocked > 0) parts.push(`${thousands(blocked)} lights have no dark at all`)
    if (scaled > 0) parts.push(`${thousands(scaled)} use a scaled one`)
    if (parts.length) summary += ' ' + parts.join(' and ') + '.'
  }
  const rows = combos.slice(0, shown).map((c) => {
    const bad = fin(c.lights_blocked) && c.lights_blocked > 0
    const waiting = bad
      ? `${thousands(c.lights_blocked as number)} with none`
      : fin(c.lights_scaled) && c.lights_scaled > 0
        ? `${thousands(c.lights_scaled)} scaled`
        : fin(c.lights_thin) && c.lights_thin > 0
          ? `${thousands(c.lights_thin)} on a short set`
          : '0'
    return {
      key: c.combo_key,
      set: setLabel(c, 'darks'),
      have: `${c.frames_have ?? 0} of ${c.frames_needed ?? '?'}`,
      waiting,
      bad,
      latest: dateOnly(c.latest_night, false),
    }
  })
  const un = b.unschedulable ?? []
  const unLights = un.reduce((a, u) => a + (u.lights ?? 0), 0)
  const reasons = [...new Set(un.map((u) => u.reason ?? ''))]
  const foot =
    unLights > 0
      ? `${thousands(unLights)} lights cannot be matched to any dark` +
        (reasons.length === 1 && reasons[0] ? `: ${plainUnschedulable(reasons[0])}.` : '.')
      : ''
  return { summary, rows, more: Math.max(0, combos.length - shown), foot }
}

export interface RecentView {
  rows: { ended: string; kind: string; set: string; frames: string; leak: boolean }[]
  foot: string
}

export function recentView(r: RecentCalibration | null | undefined): RecentView | null {
  if (!r) return null
  const runs = r.runs ?? []
  const rows = runs.map((x) => ({
    ended: hm(x.ended_at),
    kind: x.kind === 'flats' ? 'Flats' : x.kind === 'bias' ? 'Bias' : 'Darks',
    set: setLabel(x),
    frames:
      (fin(x.frames) ? thousands(x.frames) : '') +
      (fin(x.leak) && x.leak > 0 ? `, ${x.leak} leak` : ''),
    leak: fin(x.leak) && x.leak > 0,
  }))
  const darks = runs.filter((x) => x.kind !== 'flats')
  const frames = darks.reduce((a, x) => a + (x.frames ?? 0), 0)
  const leak = darks.reduce((a, x) => a + (x.leak ?? 0), 0)
  const unchecked = darks.reduce((a, x) => a + (x.unchecked ?? 0), 0)
  const clean = darks.reduce((a, x) => a + (x.clean ?? 0), 0)
  const parts: string[] = []
  if (frames > 0) {
    if (leak === 0 && unchecked === 0 && clean === frames)
      parts.push(`All ${thousands(frames)} darks passed the light-leak check.`)
    else {
      const bits = [`${thousands(clean)} clean`]
      if (leak) bits.push(`${thousands(leak)} with a light leak`)
      if (unchecked) bits.push(`${thousands(unchecked)} not checked yet`)
      parts.push(`Of ${thousands(frames)} darks: ${bits.join(', ')}.`)
    }
  }
  if (r.newest_indexed) parts.push(`Newest frame on record from ${hm(r.newest_indexed)}.`)
  return { rows, foot: parts.join(' ') }
}

export interface UnreportedView {
  headline: string
  facts: Fact[]
}

export function unreportedView(c: Conditions | null | undefined): UnreportedView {
  const cam = sensorOf(null, c)
  const air = airTemp(null, c)
  const act = cameraActivity(cam)
  const closed = roofClosed(c)
  const what =
    act === 'cold' && fin(cam.temperature)
      ? `camera at ${readingText(cam.temperature)}`
      : `camera ${act}`
  return {
    headline: capitalise((closed ? 'roof closed, ' : '') + what),
    facts: [
      {
        label: 'Sensor',
        value: fin(cam.temperature) ? readingText(cam.temperature) : NOT_MEASURED,
        note: '',
      },
      {
        label: 'Setpoint',
        value: fin(cam.setpoint) ? tempText(cam.setpoint) : NOT_MEASURED,
        note: '',
      },
      {
        label: 'Cooler power',
        value: fin(cam.power) ? `${Math.round(cam.power)}%` : NOT_MEASURED,
        note: '',
      },
      { label: 'Air', value: fin(air) ? readingText(air) : NOT_MEASURED, note: '' },
    ],
  }
}
