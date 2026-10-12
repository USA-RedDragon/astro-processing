import type { SkyPoint } from './api/mosaics'
import type { BodyFrameInfo, BodyFraming, BodyTrackRow } from './api/comets'

export type FramingMode = 'tail' | 'center' | 'custom'

export const TAIL_OFFSET = -0.25
export const OFFSET_LIMIT_PCT = 45
export const RECENTER_FRACTION = 0.1

const deg = Math.PI / 180

export function norm360(d: number): number {
  const v = ((d % 360) + 360) % 360
  return v === 360 ? 0 : v
}

function round(v: number, places: number): number {
  const p = 10 ** places
  return Math.round(v * p) / p
}

export function move(p: SkyPoint, paDeg: number, distDeg: number): SkyPoint {
  if (distDeg === 0) return { ra: p.ra, dec: p.dec }
  const dec = p.dec * deg
  const d = distDeg * deg
  const pa = paDeg * deg
  const sinDec = Math.sin(dec) * Math.cos(d) + Math.cos(dec) * Math.sin(d) * Math.cos(pa)
  const dec2 = Math.asin(Math.max(-1, Math.min(1, sinDec)))
  const dra = Math.atan2(
    Math.sin(pa) * Math.sin(d) * Math.cos(dec),
    Math.cos(d) - Math.sin(dec) * Math.sin(dec2),
  )
  return { ra: norm360(p.ra + dra / deg), dec: dec2 / deg }
}

export function positionAngle(a: SkyPoint, b: SkyPoint): number {
  const dra = (b.ra - a.ra) * deg
  const y = Math.sin(dra) * Math.cos(b.dec * deg)
  const x =
    Math.cos(a.dec * deg) * Math.sin(b.dec * deg) -
    Math.sin(a.dec * deg) * Math.cos(b.dec * deg) * Math.cos(dra)
  return norm360(Math.atan2(y, x) / deg)
}

export function separation(a: SkyPoint, b: SkyPoint): number {
  const sd = Math.sin(((b.dec - a.dec) * deg) / 2)
  const sa = Math.sin(((b.ra - a.ra) * deg) / 2)
  const h = sd * sd + Math.cos(a.dec * deg) * Math.cos(b.dec * deg) * sa * sa
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / deg
}

export function frameCenter(head: SkyPoint, f: BodyFraming | null, longDeg: number): SkyPoint {
  if (!f) return { ra: head.ra, dec: head.dec }
  return move(head, f.rotation_deg, -f.offset_frac * longDeg)
}

export function frameCorners(
  center: SkyPoint,
  rotationDeg: number,
  longDeg: number,
  shortDeg: number,
): SkyPoint[] {
  const out: SkyPoint[] = []
  for (const [a, b] of [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ] as const) {
    const mid = move(center, rotationDeg, (a * longDeg) / 2)
    const back = positionAngle(mid, center)
    const axis = a > 0 ? back + 180 : back
    out.push(move(mid, axis + 90 * b, shortDeg / 2))
  }
  return out
}

export function tailFraming(tailPa: number): BodyFraming {
  return { rotation_deg: round(norm360(tailPa), 2), offset_frac: TAIL_OFFSET }
}

export function centeredFraming(tailPa: number): BodyFraming {
  return { rotation_deg: round(norm360(tailPa), 2), offset_frac: 0 }
}

export interface CustomValues {
  rotation: number
  offsetPct: number
}

export function toCustom(f: BodyFraming | null): CustomValues {
  if (!f) return { rotation: 0, offsetPct: 0 }
  let rot = norm360(f.rotation_deg)
  let off = f.offset_frac
  if (rot >= 180) {
    rot -= 180
    off = -off
  }
  const r = Math.round(rot) % 180
  const pct = Math.max(-OFFSET_LIMIT_PCT, Math.min(OFFSET_LIMIT_PCT, Math.round(off * 100)))
  return { rotation: r, offsetPct: pct === 0 ? 0 : pct }
}

export function fromCustom(v: CustomValues): BodyFraming {
  return {
    rotation_deg: norm360(Math.round(v.rotation)),
    offset_frac: Math.round(v.offsetPct) / 100,
  }
}

function sameAxis(a: number, b: number, tol: number): number | null {
  const d = norm360(a - b)
  if (d <= tol || d >= 360 - tol) return 1
  if (Math.abs(d - 180) <= tol) return -1
  return null
}

export function modeOf(f: BodyFraming | null, tailPa: number | null): FramingMode | null {
  if (!f) return null
  if (tailPa === null) return 'custom'
  const axis = sameAxis(f.rotation_deg, tailPa, 1)
  if (axis === null) return 'custom'
  if (Math.abs(f.offset_frac) < 1e-9) return 'center'
  if (Math.abs(f.offset_frac * axis - TAIL_OFFSET) < 1e-6) return 'tail'
  return 'custom'
}

export function ninaPositionAngle(rotationDeg: number): number {
  return round(norm360(rotationDeg + 90), 1)
}

export function headDirection(f: BodyFraming): number {
  return norm360(f.offset_frac < 0 ? f.rotation_deg + 180 : f.rotation_deg)
}

export function headText(f: BodyFraming | null, tailPa: number | null): string {
  if (!f || Math.abs(f.offset_frac) < 1e-9) return 'centered'
  const pct = Math.round(Math.abs(f.offset_frac) * 100)
  const dir = headDirection(f)
  if (tailPa !== null) {
    const sunward = norm360(tailPa + 180)
    const d = Math.min(norm360(dir - sunward), 360 - norm360(dir - sunward))
    if (d < 90) return `${pct}% toward the sunward end`
    if (d > 90) return `${pct}% toward the tail end`
  }
  return `${pct}% toward position angle ${Math.round(dir)}°`
}

export function recenterHours(rateArcsecPerMin: number, shortDeg: number): number | null {
  if (!(rateArcsecPerMin > 0) || !(shortDeg > 0)) return null
  return (RECENTER_FRACTION * shortDeg * 3600) / rateArcsecPerMin / 60
}

export function hoursText(h: number | null): string {
  if (h === null) return 'not needed'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h >= 24) return 'more than a day'
  return `${Math.round(h * 10) / 10} h`
}

export function rateText(r: number): string {
  if (!Number.isFinite(r)) return '—'
  return `${r < 1 ? r.toFixed(2) : r.toFixed(1)}″/min`
}

export function tonightPath(rows: readonly BodyTrackRow[]): BodyTrackRow[] {
  return rows.filter((r) => r.dark && r.alt > 0)
}

export interface PreviewView {
  center: SkyPoint
  fov: number
}

export function previewView(
  head: SkyPoint,
  frameCenterPt: SkyPoint,
  frame: BodyFrameInfo | null,
  path: readonly SkyPoint[],
  aspect: number,
  project: (c: SkyPoint, p: SkyPoint) => [number, number],
): PreviewView {
  const center = frameCenterPt
  const long = frame?.width_deg ?? 1
  let ext = Math.max(long * 1.5, 1)
  for (const p of [head, ...path]) {
    const [x, y] = project(center, p)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    ext = Math.max(ext, Math.abs(x) * 2 * 1.15, Math.abs(y) * 2 * 1.15 * aspect)
  }
  return { center, fov: Math.min(30, round(ext, 3)) }
}

export function withFraming<T extends { targets: object[] }>(draft: T, f: BodyFraming | null): T {
  if (!f) return draft
  return {
    ...draft,
    targets: draft.targets.map((t) => ({
      ...t,
      rotation_deg: f.rotation_deg,
      offset_frac: f.offset_frac,
    })),
  }
}
