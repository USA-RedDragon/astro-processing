import type { LiveCurve, LiveState } from './api/binaries'
import { clock, hm } from './format'
import { zoneOffsetMinutes } from './skyEvents'

export interface Pill {
  label: string
  tone: 'ok' | 'warn'
}

/** pillFor is the card's status pill. */
export function pillFor(state: LiveState, stored = false): Pill {
  switch (state) {
    case 'following':
      return { label: 'Following the expected curve', tone: 'ok' }
    case 'off':
      return { label: 'Off the expected curve', tone: 'warn' }
    case 'comps':
      return { label: 'Nearby stars disagree', tone: 'warn' }
    case 'faint':
      return { label: 'Star too faint to read', tone: 'warn' }
    case 'dip':
      return { label: 'Dip seen', tone: 'ok' }
    case 'no-dip':
      return stored ? { label: 'No dip', tone: 'ok' } : { label: 'No dip yet', tone: 'warn' }
  }
  return stored
    ? { label: 'Could not judge', tone: 'warn' }
    : { label: 'Too early to tell', tone: 'warn' }
}

/**
 * showLive says whether the card belongs on the page: its run is the
 * current target, or nothing else has started since.
 */
export function showLive(live: LiveCurve | null, currentGuid: string | null | undefined): boolean {
  if (!live) return false
  if (live.stored) return true
  return !currentGuid || currentGuid === live.project_guid
}

const nightFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** nightText is a night's evening date in words: "Oct 20". */
export function nightText(night: string | undefined): string {
  if (!night) return ''
  const d = new Date(night + 'T00:00:00Z')
  return isNaN(d.getTime()) ? night : nightFmt.format(d)
}

export function title(live: LiveCurve): string {
  const when = live.stored ? `, night of ${nightText(live.night)}` : ', live'
  if (live.kind === 'dip-watch') return `Dip watch on ${live.name}${when}`
  const kind = live.eclipse?.kind === 'secondary' ? 'Second eclipse' : 'Deep eclipse'
  return `${kind} of ${live.name}${when}`
}

/** storedText is the line that says a card shows a past night's stored result. */
export function storedText(live: LiveCurve): string {
  if (!live.stored) return ''
  return `Last night's result, night of ${nightText(live.night)}. It stays here until the next night's imaging starts.`
}

function ago(t: string, now: number): string {
  const m = Math.max(0, Math.round((now - new Date(t).getTime()) / 60000))
  return m === 0 ? 'just now' : m === 1 ? '1 min ago' : `${m} min ago`
}

/** measuredText says how many subs are measured and when the last one was taken. */
export function measuredText(live: LiveCurve, now: number): string {
  const n = live.points?.length ?? 0
  if (n === 0) return 'no sub measured yet'
  const subs = n === 1 ? '1 sub measured' : `${n} subs measured`
  if (live.stored && live.points?.length) {
    return `${subs}, ${hm(live.points[0]!.time)} to ${clock(live.points[n - 1]!.time)}`
  }
  return live.last_sub ? `${subs}, the last one taken ${ago(live.last_sub, now)}` : subs
}

/** subline is the line under the title: the expectation and the measuring so far. */
export function subline(live: LiveCurve, now: number): string {
  const parts: string[] = []
  const e = live.eclipse
  const d = live.dip
  if (e) {
    parts.push(`Expected middle ${clock(e.mid)}, give or take ${Math.round(e.err_min)} min`)
    if (e.depth > 0) parts.push(`${e.depth.toFixed(2)} mag deep${e.band ? ' in ' + e.band : ''}`)
  } else if (d) {
    parts.push(`Window ${hm(d.start)} to ${clock(d.end)}`)
    if (d.active_share > 0) parts.push(`dips seen in about ${shareWords(d.active_share)}`)
  }
  parts.push(measuredText(live, now))
  return parts.join(' · ')
}

/** shareWords is a share of windows in words: "1 window in 4". */
export function shareWords(share: number): string {
  const n = Math.max(1, Math.round(1 / share))
  return n === 1 ? 'every window' : `1 window in ${n}`
}

export interface Fact {
  label: string
  value: string
  note: string
}

function mag(v: number): string {
  return `${Math.abs(v).toFixed(2)} mag`
}

function compsFact(live: LiveCurve): Fact {
  if (live.comp_scatter === undefined || live.comp_scatter === null) {
    return {
      label: 'Nearby stars',
      value: 'Not measured yet',
      note: `${live.comps || 'no'} stars to compare with`,
    }
  }
  const disagree = live.state === 'comps'
  const shift = live.comp_shift ?? 0
  const spread = live.comp_spread !== undefined ? `, ${live.comp_spread.toFixed(2)} mag apart` : ''
  return {
    label: 'Nearby stars',
    value: `${disagree ? 'Disagree' : 'Agree'}${spread}`,
    note: disagree
      ? `${live.comps} stars, so the reading is held back`
      : Math.abs(shift) >= 0.05
        ? `${live.comps} stars, ${mag(shift)} ${shift > 0 ? 'dimmer' : 'brighter'} together now, taken out of the star's points`
        : `${live.comps} stars, so a change is the star's own`,
  }
}

/** eclipseFacts are the facts row of an eclipse run. */
export function eclipseFacts(live: LiveCurve): Fact[] {
  const e = live.eclipse
  if (!e) return []
  const out: Fact[] = []
  if (e.shift_min !== undefined && e.shift_err_min !== undefined) {
    const s = e.shift_min
    const word =
      Math.abs(s) < 0.5 ? 'On time' : `${Math.round(Math.abs(s))} min ${s > 0 ? 'late' : 'early'}`
    out.push({
      label: 'Minimum so far',
      value: `${word}, give or take ${Math.max(1, Math.round(e.shift_err_min))}`,
      note: 'firms up after the middle passes',
    })
  } else {
    out.push({
      label: 'Minimum so far',
      value: 'Not measured yet',
      note: 'needs subs on both sides of the middle',
    })
  }
  if (e.fit_depth !== undefined) {
    out.push({
      label: 'Depth so far',
      value: mag(e.fit_depth),
      note: `expected ${e.depth.toFixed(2)}`,
    })
  } else {
    out.push({
      label: 'Depth so far',
      value: 'Not measured yet',
      note: `expected ${e.depth.toFixed(2)}`,
    })
  }
  out.push(compsFact(live))
  const mid = new Date(e.mid).getTime()
  const pts = live.points ?? []
  const before = pts.filter((p) => new Date(p.time).getTime() < mid).length
  out.push({
    label: 'Coverage',
    value: `${before} before and ${pts.length - before} after the middle`,
    note: `the eclipse ends ${hm(e.end)}, imaging planned to ${hm(e.planned_end)}`,
  })
  return out
}

/** dipFacts are the facts row of a dip watch. */
export function dipFacts(live: LiveCurve, now: number): Fact[] {
  const d = live.dip
  if (!d) return []
  const out: Fact[] = []
  if (d.dip_start && d.dip_depth !== undefined) {
    out.push({
      label: 'Dip',
      value: `${mag(d.dip_depth)} from ${hm(d.dip_start)}`,
      note: 'nearby stars agree through it',
    })
  }
  if (d.latest !== undefined && live.scatter !== undefined) {
    const word =
      Math.abs(d.latest) < 0.005
        ? 'At the normal level'
        : `${mag(d.latest)} ${d.latest > 0 ? 'fainter' : 'brighter'}`
    out.push({
      label: live.stored ? 'Level at the end' : 'Level now',
      value: word,
      note: d.run
        ? `last ${d.run} subs averaged; single subs scatter ${live.scatter.toFixed(2)}`
        : `single subs scatter ${live.scatter.toFixed(2)}`,
    })
  } else {
    out.push({
      label: live.stored ? 'Level at the end' : 'Level now',
      value: live.stored ? 'Not measured' : 'Not measured yet',
      note: 'needs 6 subs',
    })
  }
  if (d.smallest !== undefined) {
    out.push({
      label: 'Smallest dip it would catch',
      value: mag(d.smallest),
      note: d.over_min ? `over ${Math.round(d.over_min)} minutes` : '',
    })
  }
  out.push(compsFact(live))
  const left = new Date(d.end).getTime() - now
  out.push({
    label: 'Window left',
    value: left > 0 ? durationText(left) : 'Window over',
    note: d.active_share > 0 ? `a quiet window is expected ${quietWords(d.active_share)}` : '',
  })
  return out
}

function quietWords(share: number): string {
  const n = Math.max(1, Math.round(1 / share))
  return `${n - 1} times in ${n}`
}

/** durationText is a length of time in hours and minutes: "1 h 29 min". */
export function durationText(ms: number): string {
  const m = Math.round(ms / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`
}

export interface Chart {
  x0: number
  x1: number
  y0: number
  y1: number
  sx: (t: number) => number
  sy: (v: number) => number
  box: ChartBox
}

export interface ChartBox {
  w: number
  h: number
  l: number
  r: number
  t: number
  b: number
}

/** chartBox is the card's chart area for a chart drawn w pixels wide. */
export function chartBox(w = 640): ChartBox {
  const width = Math.max(280, Math.round(w))
  return { w: width, h: 260, l: 52, r: width - 12, t: 14, b: 226 }
}

/** chartOf scales the card's chart, w pixels wide: time across, magnitudes fainter down. */
export function chartOf(live: LiveCurve, now: number, w = 640): Chart {
  const pts = live.points ?? []
  let x0 = new Date(live.from).getTime()
  let x1 = Math.max(
    new Date(live.to).getTime(),
    Math.min(now, new Date(live.to).getTime() + 3600e3),
  )
  if (live.stored && live.dip && pts.length) {
    x0 = new Date(pts[0]!.time).getTime()
    x1 = new Date(pts[pts.length - 1]!.time).getTime()
  }
  const e = live.eclipse
  if (e?.curve?.length) {
    x0 = Math.min(x0, new Date(e.curve[0]!.t).getTime())
    x1 = Math.max(x1, new Date(e.curve[e.curve.length - 1]!.t).getTime())
  }
  for (const p of pts) {
    const t = new Date(p.time).getTime()
    x0 = Math.min(x0, t)
    x1 = Math.max(x1, t)
  }
  if (live.dip) {
    const pad = (x1 - x0) * 0.06
    x0 -= pad
    x1 += pad
  }
  let lo = -0.1
  let hi = Math.max(0.2, (e?.depth ?? 0) + 0.15, live.dip ? live.dip.depth_high + 0.1 : 0)
  for (const p of pts) {
    lo = Math.min(lo, p.mag - p.err, p.comp)
    hi = Math.max(hi, p.mag + p.err, p.comp)
  }
  const y0 = Math.floor(lo * 10) / 10
  const y1 = Math.ceil(hi * 10) / 10
  const box = chartBox(w)
  const { l, r, t, b } = box
  return {
    x0,
    x1,
    y0,
    y1,
    box,
    sx: (v) => l + ((v - x0) / (x1 - x0 || 1)) * (r - l),
    sy: (v) => t + ((v - y0) / (y1 - y0 || 1)) * (b - t),
  }
}

/** yTicks are the magnitude grid lines, about five of them. */
export function yTicks(c: Chart): number[] {
  const span = c.y1 - c.y0
  const step = span > 1.2 ? 0.5 : span > 0.6 ? 0.2 : 0.1
  const out: number[] = []
  for (let v = Math.ceil(c.y0 / step - 1e-9) * step; v <= c.y1 + 1e-9; v += step)
    out.push(Math.round(v * 100) / 100)
  return out
}

/** TICK_GAP is the least room, in pixels, from one time label's middle to the next. */
export const TICK_GAP = 48

const TICK_STEPS = [15, 30, 60, 120, 180, 240, 360, 720, 1440].map((m) => m * 60e3)

/**
 * xTicks are the times on the axis, on whole site-time quarter hours or hours. The
 * step is the shortest that leaves TICK_GAP pixels between labels, and labels
 * that would run past the chart's edges are left off.
 */
export function xTicks(c: Chart): number[] {
  const span = c.x1 - c.x0
  const px = c.box.r - c.box.l
  if (span <= 0 || px <= 0) return []
  const step =
    TICK_STEPS.find((s) => (s / span) * px >= TICK_GAP) ?? TICK_STEPS[TICK_STEPS.length - 1]!
  const off = zoneOffsetMinutes(c.x0) * 60e3
  const half = TICK_GAP / 2 - 6
  const out: number[] = []
  for (let t = Math.ceil((c.x0 + off) / step) * step - off; t <= c.x1; t += step) {
    const x = c.sx(t)
    if (x - half >= 0 && x + half <= c.box.w) out.push(t)
  }
  return out
}

/** linePath joins points into an SVG path. */
export function linePath(pts: [number, number][]): string {
  return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
}

/** bandPath is the shape between the lo and hi of the expected curve. */
export function bandPath(live: LiveCurve, c: Chart): string {
  const s = live.eclipse?.curve ?? []
  if (!s.length) return ''
  const up = s.map((p) => [c.sx(new Date(p.t).getTime()), c.sy(p.lo)] as [number, number])
  const dn = s.map((p) => [c.sx(new Date(p.t).getTime()), c.sy(p.hi)] as [number, number]).reverse()
  return linePath(up) + ' ' + linePath(dn).replace('M', 'L') + ' Z'
}

/** expectedPath is the expected curve. */
export function expectedPath(live: LiveCurve, c: Chart): string {
  const s = live.eclipse?.curve ?? []
  return linePath(s.map((p) => [c.sx(new Date(p.t).getTime()), c.sy(p.v)]))
}

/** compPath is the nearby stars' average, sub by sub. */
export function compPath(live: LiveCurve, c: Chart): string {
  return linePath((live.points ?? []).map((p) => [c.sx(new Date(p.time).getTime()), c.sy(p.comp)]))
}

/** LOW_LABEL_W is about how wide the low stretch's label is drawn. */
export const LOW_LABEL_W = 160

/** lowSpan is the stretch of the chart after the star dropped below the height limit, or null. */
export function lowSpan(
  live: LiveCurve,
  c: Chart,
): { x: number; w: number; tx: number; anchor: 'start' | 'end' } | null {
  if (!live.low_from) return null
  const pts = live.points ?? []
  const from = new Date(live.low_from).getTime()
  const last = pts.length ? new Date(pts[pts.length - 1]!.time).getTime() : c.x1
  const end = Math.min(c.x1, Math.max(last, from))
  const a = Math.max(c.x0, from)
  if (!(end > a)) return null
  const x = c.sx(a)
  const w = c.sx(end) - x
  const right = x + 4 + LOW_LABEL_W <= c.box.r
  return { x, w, tx: right ? x + 4 : x + w - 4, anchor: right ? 'start' : 'end' }
}

/** binLegend names the averages: how many subs each holds, with a shorter last one said so. */
export function binLegend(live: LiveCurve): string {
  const bins = live.dip?.bins ?? []
  if (!bins.length) return ''
  const most = Math.max(...bins.map((b) => b.subs))
  const least = Math.min(...bins.map((b) => b.subs))
  const n = most === 1 ? '1 sub' : `${most} subs`
  if (least === most) return `Average of ${n}, with its own error`
  return `Average of ${n}, the last of ${least}, each with its own error`
}

/** binTitle is one average's hover text. */
export function binTitle(b: { time: string; mag: number; err: number; subs: number }): string {
  const subs = b.subs === 1 ? '1 sub' : `${b.subs} subs`
  return `Average of ${subs} at ${hm(b.time)}: ${b.mag >= 0 ? '+' : ''}${b.mag.toFixed(2)} ± ${b.err.toFixed(2)} mag`
}

/** whyText is the card's sentence on why it reads as it does, times in local time. */
export function whyText(live: LiveCurve): string {
  if (live.note) return live.note
  if (!live.why) return ''
  const s = live.why.replace(/(\d{4}-\d{2}-\d{2}T[\d:]+Z)/g, (m) => clock(m))
  return s.charAt(0).toUpperCase() + s.slice(1) + '.'
}
