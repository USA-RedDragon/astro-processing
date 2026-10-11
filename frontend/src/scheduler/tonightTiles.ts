import type { MoonNight, Preview, SchedProject } from './api/scheduler'
import type { Snapshot } from './api/planning'
import { clock, hm } from './format'
import { duration, filterName, ms, runs } from './plan'
import { phaseName } from './nowtonight'
import { FLATS_OFF, FLATS_TARGET_COMPLETION, FLATS_WITH_IMMEDIATE } from './projectSettings'

export interface Tile {
  label: string
  value: string
  note: string
  lines?: string[]
}

type Span = [number, number]

function imagingSpans(p: Preview | null | undefined): Span[] {
  return runs(p?.blocks)
    .filter((r) => !r.wait)
    .map((r): Span => [r.start, r.end])
}

export function moonUpSpans(m: MoonNight, t0: number, t1: number): Span[] {
  const events = [
    ...m.rises.map((v) => ({ t: ms(v), up: true })),
    ...m.sets.map((v) => ({ t: ms(v), up: false })),
  ]
    .filter((e) => !isNaN(e.t) && e.t >= t0 && e.t <= t1)
    .sort((a, b) => a.t - b.t)
  let up = events.length
    ? !events[0].up
    : m.samples.some((s) => s.alt > 0 && ms(s.t) >= t0 && ms(s.t) <= t1)
  let from = t0
  const out: Span[] = []
  for (const e of events) {
    if (up && !e.up) out.push([from, e.t])
    if (!up && e.up) from = e.t
    up = e.up
  }
  if (up) out.push([from, t1])
  return out
}

function overlap(a: Span[], b: Span[]): Span[] {
  const out: Span[] = []
  for (const [a0, a1] of a)
    for (const [b0, b1] of b) {
      const s = Math.max(a0, b0)
      const e = Math.min(a1, b1)
      if (e > s) out.push([s, e])
    }
  out.sort((x, y) => x[0] - y[0])
  const merged: Span[] = []
  for (const s of out) {
    const last = merged[merged.length - 1]
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
    else merged.push([s[0], s[1]])
  }
  return merged
}

const spanSeconds = (spans: Span[]) => spans.reduce((a, [s, e]) => a + (e - s) / 1000, 0)

export function moonTile(
  m: MoonNight | null,
  p: Preview | null | undefined,
  range: Span | null,
  error = '',
): Tile {
  if (!m || !range) return { label: 'Moon', value: error ? 'Not available' : '…', note: error }
  const [t0, t1] = range
  const pct = Math.round(m.illumination * 100)
  const inside = (v: string) => ms(v) >= t0 && ms(v) <= t1
  const up = moonUpSpans(m, t0, t1)
  const parts = [phaseName(m.age)]
  const events = [
    ...m.rises.filter(inside).map((v) => ({ t: ms(v), text: 'rises ' + clock(v) })),
    ...m.sets.filter(inside).map((v) => ({ t: ms(v), text: 'sets ' + clock(v) })),
  ].sort((a, b) => a.t - b.t)
  if (events.length) parts.push(events.map((e) => e.text).join(', '))
  else parts.push(up.length ? 'up all night' : 'below the horizon all night')
  const imaging = imagingSpans(p)
  const total = spanSeconds(imaging)
  if (total > 0) {
    const over = overlap(up, imaging)
    if (!over.length) parts.push('down for all planned imaging')
    else {
      const when = over.map(([s, e]) => `${hm(s)}–${hm(e)}`).join(', ')
      parts.push(`up for ${duration(spanSeconds(over))} of ${duration(total)} planned: ${when}`)
    }
  }
  return { label: 'Moon', value: `${pct}% lit`, note: parts.join(' · ') }
}

export function mosaicTile(
  p: Preview | null | undefined,
  projects: SchedProject[],
  error = '',
): Tile {
  if (!projects.length)
    return {
      label: 'Mosaic time',
      value: error ? 'Not available' : '…',
      note: error ? 'The project list is not available: ' + error : '',
    }
  const byId = new Map(projects.map((x) => [x.id, x]))
  const per = new Map<number, { name: string; seconds: number; panels: Set<number> }>()
  for (const r of runs(p?.blocks)) {
    if (r.wait || r.project_id === undefined) continue
    const proj = byId.get(r.project_id)
    if (!proj?.isMosaic) continue
    const cur = per.get(proj.id) ?? { name: proj.name, seconds: 0, panels: new Set<number>() }
    cur.seconds += (r.end - r.start) / 1000
    if (r.target_id !== undefined) cur.panels.add(r.target_id)
    per.set(proj.id, cur)
  }
  if (!per.size)
    return { label: 'Mosaic time', value: 'None', note: 'No mosaic panels in the plan' }
  const list = [...per.entries()].sort((a, b) => b[1].seconds - a[1].seconds)
  const total = list.reduce((a, [, v]) => a + v.seconds, 0)
  const note = list
    .map(([id, v]) => {
      const proj = byId.get(id)!
      const active = proj.targets.filter((t) => t.active).length || proj.targets.length
      return `${v.name} ${duration(v.seconds)}, ${v.panels.size} of ${active} panels`
    })
    .join('; ')
  return { label: 'Mosaic time', value: duration(total), note }
}

export interface FlatSet {
  filter: string
  rotation: number | null
  gain: number | null
  offset: number | null
  bin: number | null
  targets: string[]
}

export interface FlatsPlan {
  dawn: FlatSet[]
  cadence: { project: string; days: number }[]
  completion: string[]
  immediate: string[]
  off: string[]
  unknown: string[]
}

const setting = (v: number | null | undefined) =>
  v === null || v === undefined || v < 0 ? null : v
const angle = (v: number | null | undefined) =>
  v === null || v === undefined ? null : Math.round(v * 10) / 10

function addOnce<T>(list: T[], v: T) {
  if (!list.includes(v)) list.push(v)
}

export function flatsPlan(p: Preview | null | undefined, snap: Snapshot): FlatsPlan {
  const out: FlatsPlan = {
    dawn: [],
    cadence: [],
    completion: [],
    immediate: [],
    off: [],
    unknown: [],
  }
  const projects = new Map(snap.projects.map((x) => [x.id, x]))
  const templates = new Map(snap.templates.map((x) => [x.id, x]))
  const keys = new Map<string, FlatSet>()
  for (const b of p?.blocks ?? []) {
    if (b.wait || b.project_id === undefined || b.target_id === undefined || !b.filter) continue
    const proj = projects.get(b.project_id)
    const target = proj?.targets.find((t) => t.id === b.target_id)
    if (!proj || !target) {
      addOnce(out.unknown, b.project_name ?? `Project ${b.project_id}`)
      continue
    }
    const h = proj.flatsHandling
    if (h === null || h === undefined) addOnce(out.unknown, proj.name)
    else if (h === FLATS_OFF) addOnce(out.off, proj.name)
    else if (h === FLATS_TARGET_COMPLETION) addOnce(out.completion, target.name)
    else if (h === FLATS_WITH_IMMEDIATE) addOnce(out.immediate, target.name)
    else if (h > 1 && h < FLATS_TARGET_COMPLETION) {
      if (!out.cadence.some((c) => c.project === proj.name))
        out.cadence.push({ project: proj.name, days: h })
    } else if (h !== 1) addOnce(out.unknown, proj.name)
    else {
      const matching = target.plans.filter((x) => x.enabled && x.filter === b.filter)
      const exact = matching.filter((x) => x.exposure === b.exposure_seconds)
      const plans = exact.length ? exact : matching
      const specs = plans.length ? plans : [null]
      for (const plan of specs) {
        const tpl = plan ? templates.get(plan.templateId) : undefined
        const set: FlatSet = {
          filter: b.filter,
          rotation: angle(target.rotation),
          gain: setting(plan?.gain ?? tpl?.gain),
          offset: setting(tpl?.offset),
          bin: setting(tpl?.bin),
          targets: [],
        }
        const key = [set.filter, set.rotation, set.gain, set.offset, set.bin].join('|')
        const cur = keys.get(key) ?? set
        addOnce(cur.targets, target.name)
        if (!keys.has(key)) {
          keys.set(key, cur)
          out.dawn.push(cur)
        }
      }
    }
  }
  return out
}

export function flatSetText(s: FlatSet): string {
  const rot = s.rotation === null ? 'no rotation set' : `rotation ${s.rotation}°`
  const gain = s.gain === null ? 'camera default gain' : `gain ${s.gain}`
  return `${filterName(s.filter)} · ${rot} · ${gain}`
}

export function flatsTile(p: Preview | null | undefined, snap: Snapshot | null, error = ''): Tile {
  if (!snap)
    return {
      label: 'Flats at dawn',
      value: error ? 'Not available' : '…',
      note: error ? 'Project settings are not available: ' + error : '',
    }
  const f = flatsPlan(p, snap)
  const n = f.dawn.length
  const end = ms(p?.end)
  const lines = f.dawn.map(flatSetText)
  if (f.cadence.length)
    lines.push(
      f.cadence.map((c) => `${c.project} every ${c.days} days`).join(', ') +
        ", so tonight's subs wait for a later dawn",
    )
  if (f.completion.length) lines.push(`At target completion: ${f.completion.join(', ')}`)
  if (f.immediate.length) lines.push(`Use with immediate: ${f.immediate.join(', ')}`)
  if (f.off.length) lines.push(`Off: ${f.off.join(', ')}`)
  if (f.unknown.length) lines.push(`Flats handling not reported: ${f.unknown.join(', ')}`)
  let note = ''
  if (n) note = isNaN(end) ? 'At dawn' : `After the plan ends at ${clock(end)}`
  else if (!lines.length) note = 'Nothing planned'
  return {
    label: 'Flats at dawn',
    value: n ? `${n} ${n === 1 ? 'set' : 'sets'}` : 'None',
    note,
    lines,
  }
}
