import { hm, nightOf, SITE_TZ } from './format'

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: SITE_TZ, hour: 'numeric', hour12: false })

export interface AfPoint {
  position: number
  value: number
  error?: number | null
}

export interface AfFit {
  fittings?: Record<string, string> | null
  r_squared?: Record<string, number> | null
  intersections?: Record<string, unknown> | null
}

export interface AfRun {
  id: string
  profile_id?: string
  started_at?: string | null
  finished_at: string
  duration_seconds?: number | null
  success: boolean
  error?: string | null
  filter?: string | null
  temperature?: number | null
  autofocuser?: string | null
  method?: string | null
  fitting?: string | null
  initial_position?: number | null
  previous_position?: number | null
  previous_value?: number | null
  chosen_position?: number | null
  chosen_value?: number | null
  points: AfPoint[] | null
  fit?: AfFit | null
  target_name?: string | null
  target_guid?: string | null
  source?: string
  points_error?: string | null
}

export interface AfRuns {
  since: string
  available: boolean
  runs: AfRun[] | null
}

export interface AfStatus {
  run_id: string
  state: 'running' | 'finished' | 'failed' | string
  started_at?: string | null
  finished_at?: string | null
  filter?: string | null
  temperature?: number | null
  autofocuser?: string | null
  method?: string | null
  fitting?: string | null
  target_name?: string | null
  initial_position?: number | null
  previous_position?: number | null
  previous_value?: number | null
  chosen_position?: number | null
  chosen_value?: number | null
  points?: AfPoint[] | null
  fit?: AfFit | null
  error?: string | null
}

export interface Hyperbola {
  c: number
  a: number
  bl: number
  br: number
  off: number
  w: number
}

export interface Curve {
  kind: 'nina' | 'provisional'
  c: number
  min: number
  at: (x: number) => number
}

const NUM = String.raw`([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)`

const TWO_SIDED = new RegExp(
  '^y=min\\(max\\(0,\\(' + NUM + '-x\\)/' + NUM + '\\),1\\)\\*' + NUM + '/' + NUM +
    '\\*√\\(\\(x-' + NUM + '\\)²\\+' + NUM + '²\\)\\+\\(1-min\\(max\\(0,\\(' + NUM + '-x\\)/' + NUM +
    '\\),1\\)\\)\\*' + NUM + '/' + NUM + '\\*√\\(\\(x-' + NUM + '\\)²\\+' + NUM + '²\\)\\+' + NUM + '$',
)

const COSH = new RegExp('^y=' + NUM + '\\*cosh\\(asinh\\(\\(' + NUM + '-x\\)/' + NUM + '\\)\\)$')

/**
 * parseHyperbolic reads NINA's Hyperbolic fitting string: the two-sided form
 * Hocus Focus writes, or NINA's own a * cosh(asinh((p - x) / b)).
 */
export function parseHyperbolic(s: string | null | undefined): Hyperbola | null {
  if (!s) return null
  const t = s.replace(/\s+/g, '').replace(/−/g, '-')
  const m = TWO_SIDED.exec(t)
  if (m) {
    const n = m.slice(1).map(Number)
    const [c1, w1, a1, bl1, c2, bl2, c3, w2, a2, br1, c4, br2, off] = n
    if (n.some((v) => !isFinite(v))) return null
    if (new Set([c1, c2, c3, c4]).size !== 1 || w1 !== w2 || a1 !== a2) return null
    if (bl1 !== bl2 || br1 !== br2 || bl1 === 0 || br1 === 0 || w1 <= 0) return null
    return { c: c1, a: a1, bl: Math.abs(bl1), br: Math.abs(br1), off, w: w1 }
  }
  const k = COSH.exec(t)
  if (k) {
    const [a, p, b] = k.slice(1).map(Number)
    if (![a, p, b].every(isFinite) || b === 0) return null
    return { c: p, a, bl: Math.abs(b), br: Math.abs(b), off: 0, w: 1 }
  }
  return null
}

export function evalHyperbola(h: Hyperbola, x: number): number {
  const w = Math.min(Math.max(0, (h.c - x) / h.w), 1)
  const d = (x - h.c) ** 2
  return (
    ((w * h.a) / h.bl) * Math.sqrt(d + h.bl * h.bl) +
    (((1 - w) * h.a) / h.br) * Math.sqrt(d + h.br * h.br) +
    h.off
  )
}

export function ninaCurve(fit: AfFit | null | undefined): Curve | null {
  const h = parseHyperbolic(fit?.fittings?.Hyperbolic)
  if (!h) return null
  return { kind: 'nina', c: h.c, min: evalHyperbola(h, h.c), at: (x) => evalHyperbola(h, x) }
}

/**
 * provisionalFit fits y = k * sqrt((x - c)² + b²) + o to the points: a grid
 * over c and b, with k and o by linear least squares. It needs 4 points.
 */
export function provisionalFit(points: AfPoint[]): Curve | null {
  if (points.length < 4) return null
  const xs = points.map((p) => p.position)
  const lo = Math.min(...xs) - 40
  const hi = Math.max(...xs) + 40
  let best: { c: number; b: number; k: number; o: number; e: number } | null = null
  for (let c = lo; c <= hi; c += 0.5) {
    for (let b = 5; b <= 200; b += 1) {
      let n = 0
      let sx = 0
      let sy = 0
      let sxx = 0
      let sxy = 0
      for (const p of points) {
        const u = Math.sqrt((p.position - c) ** 2 + b * b)
        n++
        sx += u
        sy += p.value
        sxx += u * u
        sxy += u * p.value
      }
      const det = n * sxx - sx * sx
      if (!det) continue
      const k = (n * sxy - sx * sy) / det
      if (k <= 0) continue
      const o = (sy - k * sx) / n
      let e = 0
      for (const p of points) {
        const r = k * Math.sqrt((p.position - c) ** 2 + b * b) + o - p.value
        e += r * r
      }
      if (!best || e < best.e) best = { c, b, k, o, e }
    }
  }
  if (!best) return null
  const f = best
  return {
    kind: 'provisional',
    c: f.c,
    min: f.k * f.b + f.o,
    at: (x) => f.k * Math.sqrt((x - f.c) ** 2 + f.b * f.b) + f.o,
  }
}

export function durationText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds) || seconds < 0) return ''
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function signed(n: number): string {
  if (n > 0) return '+' + n
  if (n < 0) return '−' + Math.abs(n)
  return '0'
}

export function movedSteps(chosen: number | null | undefined, start: number | null | undefined) {
  if (chosen === null || chosen === undefined || start === null || start === undefined) return null
  return Math.round(chosen - start)
}

export function movedText(chosen: number | null | undefined, start: number | null | undefined): string {
  const m = movedSteps(chosen, start)
  if (m === null) return ''
  const from = Math.round(start as number)
  return m === 0 ? `stayed at ${from}` : `moved ${signed(m)} steps from ${from}`
}

export interface StartPos {
  position: number
  basis: 'initial' | 'previous' | 'last'
}

export function startOf(
  r: Pick<AfRun, 'initial_position' | 'previous_position'>,
  last?: AfRun | null,
): StartPos | null {
  if (isNum(r.initial_position)) return { position: r.initial_position, basis: 'initial' }
  if (isNum(r.previous_position)) return { position: r.previous_position, basis: 'previous' }
  if (last && isNum(last.chosen_position)) return { position: last.chosen_position, basis: 'last' }
  return null
}

export function startNote(s: StartPos | null): string {
  if (!s) return ''
  return s.basis === 'initial'
    ? 'where NINA started'
    : "where the last run left the focuser; NINA did not report this run's start"
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function ms(v: string | null | undefined): number {
  const t = v ? Date.parse(v) : NaN
  return isNaN(t) ? NaN : t
}

export interface AfView {
  id: string
  state: 'running' | 'finished' | 'failed'
  startedAt: number
  finishedAt: number
  durationSeconds: number | null
  filter: string
  temperature: number | null
  start: StartPos | null
  chosen: { position: number; value: number | null } | null
  points: AfPoint[]
  curve: Curve | null
  ninaUnreadable: boolean
  rSquared: number | null
  error: string
  targetName: string
  autofocuser: string
}

function viewOf(
  r: AfStatus | AfRun,
  id: string,
  state: AfView['state'],
  duration: number | null,
  last?: AfRun | null,
): AfView {
  const points = (r.points ?? []).filter((p) => isNum(p.position) && isNum(p.value))
  const nina = state === 'running' ? null : ninaCurve(r.fit)
  const hasFormula = !!r.fit?.fittings?.Hyperbolic
  const curve = nina ?? provisionalFit(points)
  const chosenPos = isNum(r.chosen_position) ? r.chosen_position : null
  const r2 = r.fit?.r_squared?.Hyperbolic
  return {
    id,
    state,
    startedAt: ms(r.started_at),
    finishedAt: ms(r.finished_at),
    durationSeconds: duration,
    filter: r.filter ?? '',
    temperature: isNum(r.temperature) ? r.temperature : null,
    start: startOf(r, state === 'running' ? last : null),
    chosen:
      state === 'finished' && chosenPos !== null
        ? { position: chosenPos, value: isNum(r.chosen_value) ? r.chosen_value : null }
        : null,
    points,
    curve,
    ninaUnreadable: state !== 'running' && !nina && hasFormula,
    rSquared: isNum(r2) ? r2 : null,
    error: r.error ?? '',
    targetName: r.target_name ?? '',
    autofocuser: r.autofocuser ?? '',
  }
}

export function fromStatus(af: AfStatus, last?: AfRun | null): AfView {
  const state = af.state === 'running' ? 'running' : af.state === 'failed' ? 'failed' : 'finished'
  const a = ms(af.started_at)
  const b = ms(af.finished_at)
  const d = !isNaN(a) && !isNaN(b) && b >= a ? (b - a) / 1000 : null
  return viewOf(af, af.run_id, state, d, last)
}

export function fromRun(r: AfRun): AfView {
  const d = isNum(r.duration_seconds) ? r.duration_seconds : null
  return viewOf(r, r.id, r.success ? 'finished' : 'failed', d)
}

export function bestPoint(points: AfPoint[]): AfPoint | null {
  let b: AfPoint | null = null
  for (const p of points) if (!b || p.value < b.value) b = p
  return b
}

export function stepSize(points: AfPoint[]): number | null {
  const xs = [...new Set(points.map((p) => p.position))].sort((a, b) => a - b)
  if (xs.length < 2) return null
  const d = xs.slice(1).map((x, i) => x - xs[i]).sort((a, b) => a - b)
  return Math.round(d[Math.floor(d.length / 2)])
}

/** tonightSince is noon at the site on the day the current night began. */
export function tonightSince(now: number): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nightOf(now))
  const [y, m, d] = day.split('-').map(Number)
  let t = Date.UTC(y, m - 1, d, 12)
  for (let i = 0; i < 3; i++) {
    const h = Number(hourFmt.format(new Date(t))) % 24
    if (h === 12) break
    t += (12 - h) * 3600 * 1000
  }
  return new Date(t).toISOString()
}

export function sortRuns(runs: AfRun[] | null | undefined): AfRun[] {
  return [...(runs ?? [])].sort((a, b) => ms(b.finished_at) - ms(a.finished_at))
}

export function historyEmpty(data: AfRuns | null, error: string): string {
  if (error) return 'Autofocus history is not available: ' + error
  if (!data) return 'Loading.'
  if (!data.available)
    return "The scheduler database has no autofocus table yet, so there is no history. Runs appear here once the observatory's autofocus records reach the server."
  if (!data.runs?.length)
    return 'No autofocus runs since ' + hm(data.since) + ' tonight. Each run appears here when NINA finishes it.'
  return ''
}

export interface Tick {
  pos: number
  label: string
}

function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target)
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= raw) return k * p
  return 10 * p
}

function decimals(step: number): number {
  for (let d = 0; d < 6; d++) {
    const v = step * 10 ** d
    if (Math.abs(v - Math.round(v)) < 1e-9) return d
  }
  return 6
}


export interface CurveChart {
  width: number
  height: number
  box: { l: number; r: number; t: number; b: number }
  xTicks: Tick[]
  yTicks: Tick[]
  yTitle: { x: number; y: number }
  xTitle: { x: number; y: number }
  xTickY: number
  path: string
  dashed: boolean
  points: { x: number; y: number; latest: boolean }[]
  start: { x: number } | null
  marker: { x: number; y: number; filled: boolean; label: string; anchor: 'start' | 'middle' | 'end'; lx: number; ly: number } | null
}

export const CHART_FONT = 11
const CHAR_W = 6.8

export function curveChart(v: AfView, width: number, height = 230): CurveChart {
  const box = { l: 48, r: width - 16, t: 24, b: height - 44 }
  const pts = v.points
  const xsAll = pts.map((p) => p.position)
  if (v.start) xsAll.push(v.start.position)
  if (v.chosen) xsAll.push(v.chosen.position)
  else if (v.curve) xsAll.push(v.curve.c)
  let x0 = xsAll.length ? Math.min(...xsAll) - 5 : 0
  let x1 = xsAll.length ? Math.max(...xsAll) + 5 : 100
  if (x1 - x0 < 20) {
    const mid = (x0 + x1) / 2
    x0 = mid - 10
    x1 = mid + 10
  }
  const ys = pts.map((p) => p.value)
  if (v.chosen?.value !== null && v.chosen?.value !== undefined) ys.push(v.chosen.value)
  if (v.curve) {
    ys.push(v.curve.min)
    if (pts.length) {
      const top = Math.max(...pts.map((p) => p.value))
      const room = top + 0.25 * (top - Math.min(...ys))
      for (const e of [v.curve.at(x0), v.curve.at(x1)]) if (isFinite(e) && e <= room) ys.push(e)
    }
  }
  let lo = ys.length ? Math.min(...ys) : 1
  let hi = ys.length ? Math.max(...ys) : 2
  if (hi - lo < 0.1) {
    lo -= 0.05
    hi += 0.05
  }
  const yPad = (hi - lo) * 0.06
  const y0 = lo - yPad
  const y1 = hi + yPad
  let yStep = niceStep(hi - lo, 4)
  for (let n = 5; Math.floor(y1 / yStep) - Math.ceil(y0 / yStep) < 2 && n < 12; n++) yStep = niceStep(hi - lo, n)
  const sx = (x: number) => box.l + ((x - x0) / (x1 - x0)) * (box.r - box.l)
  const sy = (y: number) => box.t + ((y1 - y) / (y1 - y0)) * (box.b - box.t)
  const yd = decimals(yStep)
  const yTicks: Tick[] = []
  for (let i = Math.ceil(y0 / yStep); i * yStep <= y1 + 1e-9; i++)
    yTicks.push({ pos: sy(i * yStep), label: (i * yStep).toFixed(yd) })
  const labelW = String(Math.round(x1)).length * CHAR_W
  const maxTicks = Math.min(8, Math.max(2, Math.floor((box.r - box.l) / (labelW + 14))))
  const xStep = Math.max(1, niceStep(x1 - x0, Math.max(1, maxTicks - 1)))
  const xTicks: Tick[] = []
  for (let i = Math.ceil(x0 / xStep); i * xStep <= x1; i++) {
    const pos = sx(i * xStep)
    if (pos - labelW / 2 >= box.l - 4 && pos + labelW / 2 <= width - 2)
      xTicks.push({ pos, label: String(Math.round(i * xStep)) })
  }
  let path = ''
  if (v.curve) {
    const step = (x1 - x0) / Math.max(40, box.r - box.l)
    let pen = false
    for (let x = x0; x <= x1 + step / 2; x += step) {
      const y = v.curve.at(x)
      if (!isFinite(y) || y > y1 || y < y0) {
        pen = false
        continue
      }
      path += (pen ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(y).toFixed(1)
      pen = true
    }
  }
  const points = pts.map((p, i) => ({
    x: sx(p.position),
    y: sy(p.value),
    latest: v.state === 'running' && i === pts.length - 1,
  }))
  let marker: CurveChart['marker'] = null
  const mk = v.chosen
    ? { x: v.chosen.position, y: v.chosen.value ?? v.curve?.at(v.chosen.position) ?? null, filled: true, pre: '' }
    : v.state === 'running' && v.curve
      ? { x: v.curve.c, y: v.curve.min, filled: false, pre: 'fit so far ' }
      : null
  if (mk && mk.y !== null && isFinite(mk.y)) {
    const label = mk.pre + Math.round(mk.x) + ' · ' + mk.y.toFixed(2)
    const mx = sx(mk.x)
    const my = sy(Math.min(Math.max(mk.y, y0), y1))
    const w = label.length * CHAR_W
    const dots = pts.map((p) => [sx(p.position), sy(p.value)])
    const curveAt = (px: number) => {
      if (!v.curve) return null
      const y = v.curve.at(x0 + ((px - box.l) / (box.r - box.l)) * (x1 - x0))
      return isFinite(y) && y >= y0 && y <= y1 ? sy(y) : null
    }
    const clear = (l: number, base: number) => {
      const r = l + w
      const t = base - CHART_FONT
      const b = base + 3
      if (l < box.l + 2 || r > box.r || t < box.t - 6 || b > box.b) return false
      if (dots.some(([x, y]) => x + 7 > l && x - 7 < r && y + 7 > t && y - 7 < b)) return false
      if (mx + 8 > l && mx - 8 < r && my + 8 > t && my - 8 < b) return false
      for (let px = l; px <= r; px += 4) {
        const cy = curveAt(px)
        if (cy !== null && cy + 2 > t && cy - 2 < b) return false
      }
      return true
    }
    let placed: { lx: number; ly: number; anchor: 'start' | 'middle' | 'end' } | null = null
    for (const dy of [-16, -30, -46, -62, 22]) {
      for (const [l, anchor] of [
        [mx + 10, 'start'],
        [mx - 10 - w, 'end'],
        [mx - w / 2, 'middle'],
      ] as [number, 'start' | 'middle' | 'end'][]) {
        if (placed) break
        if (clear(l, my + dy)) placed = { lx: anchor === 'start' ? l : anchor === 'end' ? l + w : mx, ly: my + dy, anchor }
      }
    }
    marker = {
      x: mx,
      y: my,
      filled: mk.filled,
      label: placed ? label : '',
      anchor: placed?.anchor ?? 'start',
      lx: placed?.lx ?? mx,
      ly: placed?.ly ?? my,
    }
  }
  return {
    width,
    height,
    box,
    xTicks,
    yTicks,
    yTitle: { x: 4, y: 12 },
    xTitle: { x: box.r, y: height - 4 },
    xTickY: box.b + 16,
    path,
    dashed: v.curve?.kind === 'provisional',
    points,
    start: v.start ? { x: sx(v.start.position) } : null,
    marker,
  }
}

export function miniPath(v: AfView, w = 80, h = 24): { path: string; dots: { x: number; y: number }[] } {
  const pts = v.points
  if (pts.length < 2) return { path: '', dots: [] }
  const xs = pts.map((p) => p.position)
  const ys = pts.map((p) => p.value)
  const a = Math.min(...xs)
  const b = Math.max(...xs)
  const c = Math.min(...ys, v.curve ? v.curve.min : Infinity)
  const e = Math.max(...ys)
  const fx = (x: number) => ((x - a) / (b - a || 1)) * (w - 4) + 2
  const fy = (y: number) => h - 2 - ((Math.min(y, e) - c) / (e - c || 1)) * (h - 4)
  let path = ''
  if (v.curve) {
    const step = (b - a) / 40
    for (let x = a; x <= b + step / 2; x += step) path += (path ? 'L' : 'M') + fx(x).toFixed(1) + ' ' + fy(v.curve.at(x)).toFixed(1)
  }
  return { path, dots: pts.map((p) => ({ x: fx(p.position), y: fy(p.value) })) }
}

export interface DriftChart {
  width: number
  height: number
  box: { l: number; r: number; t: number; b: number }
  posTicks: Tick[]
  tempTicks: Tick[]
  timeTicks: Tick[]
  posPath: string
  tempPath: string
  posDots: { x: number; y: number; id: string }[]
  tempDots: { x: number; y: number; id: string }[]
}

export function driftChart(runs: AfRun[], width: number, height = 180): DriftChart | null {
  const ok = runs
    .filter((r) => r.success && isNum(r.chosen_position) && !isNaN(ms(r.finished_at)))
    .sort((a, b) => ms(a.finished_at) - ms(b.finished_at))
  if (!ok.length) return null
  const box = { l: 56, r: width - 56, t: 14, b: height - 28 }
  const ts = ok.map((r) => ms(r.finished_at))
  let t0 = Math.min(...ts)
  let t1 = Math.max(...ts)
  if (t1 - t0 < 3600e3) {
    const mid = (t0 + t1) / 2
    t0 = mid - 1800e3
    t1 = mid + 1800e3
  }
  const pad = (t1 - t0) * 0.04
  t0 -= pad
  t1 += pad
  const sx = (t: number) => box.l + ((t - t0) / (t1 - t0)) * (box.r - box.l)
  const pos = ok.map((r) => r.chosen_position as number)
  let p0 = Math.min(...pos)
  let p1 = Math.max(...pos)
  if (p1 - p0 < 10) {
    const m = (p0 + p1) / 2
    p0 = m - 5
    p1 = m + 5
  }
  const ps = niceStep(p1 - p0, 3)
  p0 = Math.floor(p0 / ps) * ps
  p1 = Math.ceil(p1 / ps) * ps
  const py = (v: number) => box.t + ((p1 - v) / (p1 - p0)) * (box.b - box.t)
  const posTicks: Tick[] = []
  for (let v = p0; v <= p1 + ps / 2; v += ps) posTicks.push({ pos: py(v), label: String(Math.round(v)) })
  const temps = ok.filter((r) => isNum(r.temperature))
  const tv = temps.map((r) => r.temperature as number)
  let c0 = tv.length ? Math.min(...tv) : 0
  let c1 = tv.length ? Math.max(...tv) : 1
  if (c1 - c0 < 1) {
    const m = (c0 + c1) / 2
    c0 = m - 0.5
    c1 = m + 0.5
  }
  const cs = niceStep(c1 - c0, 3)
  c0 = Math.floor(c0 / cs) * cs
  c1 = Math.ceil(c1 / cs) * cs
  const cy = (v: number) => box.t + ((c1 - v) / (c1 - c0)) * (box.b - box.t)
  const tempTicks: Tick[] = []
  if (tv.length)
    for (let v = c0; v <= c1 + cs / 2; v += cs) tempTicks.push({ pos: cy(v), label: v.toFixed(decimals(cs)) + ' °C' })
  const hours = [1, 2, 3, 4, 6, 12]
  const span = (t1 - t0) / 3600e3
  const maxT = Math.max(1, Math.floor((box.r - box.l) / 52))
  const hstep = hours.find((h) => span / h <= maxT) ?? 12
  const timeTicks: Tick[] = []
  const first = Math.ceil(t0 / 3600e3) * 3600e3
  for (let t = first; t <= t1; t += 3600e3) {
    const h = Number(hourFmt.format(new Date(t))) % 24
    if (h % hstep === 0) timeTicks.push({ pos: sx(t), label: hm(t) })
  }
  const posDots = ok.map((r) => ({ x: sx(ms(r.finished_at)), y: py(r.chosen_position as number), id: r.id }))
  const tempDots = temps.map((r) => ({ x: sx(ms(r.finished_at)), y: cy(r.temperature as number), id: r.id }))
  const line = (d: { x: number; y: number }[]) =>
    d.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('')
  return {
    width,
    height,
    box,
    posTicks,
    tempTicks,
    timeTicks,
    posPath: line(posDots),
    tempPath: line(tempDots),
    posDots,
    tempDots,
  }
}
