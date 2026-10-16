import type {
  CandidateClass,
  CheckState,
  DiscoveryCandidate,
  DiscoveryMatch,
  DiscoveryReport,
  DiscoveryRun,
  DiscoveryStatus,
  LightPoint,
  Vetting,
} from './api/discoveries'
import { filterColor } from './api/planning'
import { hm } from './format'

export type Edge = 'known' | 'low' | 'new'

const NEW_CLASSES: ReadonlySet<string> = new Set([
  'nova_candidate',
  'supernova_candidate',
  'new_variable_candidate',
  'unknown_mover',
])

const CLASS_LABELS: Record<CandidateClass, string> = {
  known_variable: 'Known variable',
  known_asteroid: 'Known asteroid',
  known_transient: 'Known transient',
  nova_candidate: 'Possible nova',
  supernova_candidate: 'Possible supernova',
  new_variable_candidate: 'New variable?',
  unknown_mover: 'Unknown mover',
  low_confidence: 'Low confidence',
}

export function classLabel(c: string): string {
  return CLASS_LABELS[c as CandidateClass] ?? c.replace(/_/g, ' ')
}

export function edgeOf(c: string): Edge {
  if (c.startsWith('known_')) return 'known'
  if (NEW_CLASSES.has(c)) return 'new'
  return 'low'
}

/** pillOf lists the CSS classes of a class pill: the edge, plus its own color where the class has one. */
export function pillOf(c: string): string[] {
  return c === 'nova_candidate' ? [edgeOf(c), 'nova'] : [edgeOf(c)]
}

export function moverName(c: DiscoveryCandidate): string {
  if (c.class === 'unknown_mover') return 'Unknown'
  return c.matches[0]?.name || 'Unknown'
}

function signed(v: number, digits: number): string {
  const s = Math.abs(v).toFixed(digits)
  if (Number(s) === 0) return s
  return (v < 0 ? '−' : '+') + s
}

/**
 * deltaText says how the night compares with the reference; long adds "than
 * the reference". A change with no measurable source in the reference (no
 * reference magnitude) is a new or faded source, never a magnitude change
 * against nothing.
 */
export function deltaText(
  c: Pick<DiscoveryCandidate, 'delta_mag' | 'night_mag' | 'ref_mag' | 'sign'>,
  long = false,
): string {
  const d = c.delta_mag
  const onSource = c.ref_mag !== null && c.ref_mag !== undefined
  if (onSource && d !== null && d !== undefined) {
    if (Number(Math.abs(d).toFixed(2)) === 0)
      return long ? 'no change from the reference' : 'no change'
    const word = d < 0 ? 'brighter' : 'fainter'
    return `${Math.abs(d).toFixed(2)} mag ${word}${long ? ' than the reference' : ''}`
  }
  if (c.sign < 0) return 'faded source'
  if (c.night_mag !== null && c.night_mag !== undefined)
    return `new source, G≈${c.night_mag.toFixed(1)}`
  return onSource ? 'not measured' : 'new source'
}

export function starText(c: Pick<DiscoveryCandidate, 'gaia_g'>): string {
  return c.gaia_g === null || c.gaia_g === undefined
    ? 'no cataloged star'
    : `Gaia G ${c.gaia_g.toFixed(2)}`
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** raText formats right ascension in degrees as "12h 37m 14.1s". */
export function raText(deg: number): string {
  const tenths = Math.round(((((deg % 360) + 360) % 360) / 15) * 36000) % (24 * 36000)
  const h = Math.floor(tenths / 36000)
  const m = Math.floor((tenths % 36000) / 600)
  const s = (tenths % 600) / 10
  return `${pad(h)}h ${pad(m)}m ${s.toFixed(1).padStart(4, '0')}s`
}

/** decText formats declination in degrees as "+14° 26′ 32″". */
export function decText(deg: number): string {
  const sign = deg < 0 ? '−' : '+'
  const t = Math.round(Math.abs(deg) * 3600)
  const d = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  return `${sign}${pad(d)}° ${pad(m)}′ ${pad(t % 60)}″`
}

export function positionText(c: Pick<DiscoveryCandidate, 'ra' | 'dec'>): string {
  return `${raText(c.ra)} ${decText(c.dec)}`
}

/** EARLY_TEXT labels a known object we have measurements of from before its TNS discovery. */
export const EARLY_TEXT =
  'Early data: you have measurements from before its discovery; worth sending to TNS as photometry'

/** tnsMatch is the candidate's match from the local TNS copy, if any. */
export function tnsMatch(c: Pick<DiscoveryCandidate, 'matches'>): DiscoveryMatch | undefined {
  return (c.matches ?? []).find((x) => x.catalog === 'TNS' && x.tns)
}

/** matchText is the one line on a card that says what the candidate matched. */
export function matchText(c: Pick<DiscoveryCandidate, 'class' | 'matches'>): string {
  const m = c.matches ?? []
  const of = (cat: string) => m.find((x) => x.catalog === cat)
  const tns = tnsMatch(c)
  if (c.class === 'known_transient' && tns?.note) {
    const known = tns.note.charAt(0).toUpperCase() + tns.note.slice(1)
    return tns.tns?.early_data ? `${known} · ${EARLY_TEXT}` : known
  }
  switch (c.class) {
    case 'known_variable':
      return 'Matches a cataloged variable star'
    case 'known_asteroid': {
      const a = of('SkyBoT')
      return a ? `Matches the known asteroid ${a.name}` : 'Matches a known asteroid'
    }
    case 'known_transient': {
      const a = m.find((x) => ['ALeRCE', 'Fink', 'TNS'].includes(x.catalog))
      return a ? `Already in the alert feeds as ${a.name}` : 'Already in the alert feeds'
    }
    case 'nova_candidate':
    case 'supernova_candidate': {
      const g = of('galaxy')
      return g ? `No cataloged star, inside ${g.name}` : 'No cataloged star, inside a galaxy'
    }
    case 'new_variable_candidate':
      return m.some((x) => x.catalog === 'ZTF' && x.type === 'variable')
        ? 'No catalog lists it; its ZTF light curve varies this much too'
        : 'Matches nothing known'
    case 'unknown_mover':
      return 'Moves across the subs; matches no known asteroid'
    case 'low_confidence':
      return m.some((x) => x.catalog === 'ZTF' && x.type === 'flat')
        ? 'Its ZTF light curve stays flat; likely ours'
        : 'Held back: weak, or not confirmed by another night, filter or ZTF'
  }
  return ''
}

const CATALOG_WORDS: Record<string, string> = {
  VSX: 'variable-star catalog',
  SIMBAD: 'star database',
  ZTF: 'ZTF light curves',
  night: 'the same change on another night',
  'Gaia DR3 variability': 'Gaia variable stars',
  'ATLAS variables': 'ATLAS variable stars',
  'ZTF variables': 'ZTF variable stars',
  'ASAS-SN variables': 'ASAS-SN variable stars',
  SkyBoT: 'known asteroids',
  ALeRCE: 'alert feeds',
  Fink: 'alert feeds',
  TNS: 'alert feeds',
  galaxies: 'galaxy catalog',
  galaxy: 'galaxy catalog',
  track: 'moving objects in the subs',
  many: 'new-source count of the night',
  defect: 'defect-pixel check',
  filter: 'found in one filter alone',
}

/** heldText warns that a night's new sources were held as likely defects. */
export function heldText(
  run: Pick<DiscoveryRun, 'held_many' | 'held_defects'> | null | undefined,
): string {
  const many = run?.held_many ?? 0
  const defects = run?.held_defects ?? 0
  if (!many && !defects) return ''
  const parts: string[] = []
  if (defects) parts.push(`${defects} too sharp in their subs`)
  if (many) parts.push(`${many} more because the night had too many`)
  return `Unreliable night for new sources: ${parts.join(', ')}, held as likely defects`
}

/** chanceText says what the night's chance checks found, in plain words. */
export function chanceText(
  run: Pick<DiscoveryRun, 'mover_null' | 'change_null'> | null | undefined,
): string {
  const parts: string[] = []
  const c = run?.change_null
  if (c && c.subs > 0) {
    parts.push(
      c.found === 0
        ? 'Comparing the night with itself found no false changes'
        : `Comparing the night with itself found ${c.found} false ${c.found === 1 ? 'change' : 'changes'}, the strongest ${c.max_snr.toFixed(1)}σ; a new variable must be stronger`,
    )
    const f = c.filter_found ?? 0
    if (f > 0) {
      parts.push(
        `Each filter compared alone found ${f} false ${f === 1 ? 'change' : 'changes'}, the strongest ${(c.filter_max_snr ?? 0).toFixed(1)}σ`,
      )
    }
  }
  const m = run?.mover_null
  if (m) {
    parts.push(
      m.max_hits === 0
        ? 'Shuffling the subs in time linked no false movers'
        : `Shuffling the subs in time linked false movers of up to ${m.max_hits} detections; a mover needs more`,
    )
  }
  return parts.length ? parts.join('. ') + '.' : 'not measured'
}

/** sourceWords turns the names of what was checked into plain words, once each. */
export function sourceWords(list: string[] | null | undefined): string[] {
  const out: string[] = []
  for (const s of list ?? []) {
    const w = CATALOG_WORDS[s] ?? s
    if (!out.includes(w)) out.push(w)
  }
  return out
}

export function sentence(words: string[]): string {
  if (!words.length) return ''
  const s = words.join(', ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** matchLines describes each catalogue match in plain words. */
export function matchLines(c: Pick<DiscoveryCandidate, 'matches'>): string[] {
  return (c.matches ?? []).map((m) => {
    const where = CATALOG_WORDS[m.catalog] ?? m.catalog
    const sep =
      Number.isFinite(m.sep_arcsec) && m.catalog !== 'track' && m.catalog !== 'filter'
        ? `, ${m.sep_arcsec.toFixed(1)}″ away`
        : ''
    const type = m.type ? ` (${m.type})` : ''
    return `${m.name}${type}, ${where}${sep}`
  })
}

export function presenceText(c: Pick<DiscoveryCandidate, 'present_in' | 'subs_tested'>): string {
  if (!c.subs_tested) return 'not measured'
  return `Present in ${c.present_in} of ${c.subs_tested} subs`
}

export function nextVetting(current: Vetting, clicked: Vetting): Vetting {
  return current === clicked ? '' : clicked
}

export const VET_BUTTONS: { state: Exclude<Vetting, ''>; label: string }[] = [
  { state: 'real', label: 'Real' },
  { state: 'artifact', label: 'Artifact' },
  { state: 'known', label: 'Already known' },
  { state: 'unsure', label: 'Not sure' },
]

export function vettingLabel(v: Vetting): string {
  return VET_BUTTONS.find((b) => b.state === v)?.label ?? ''
}

export function links(ra: number, dec: number): { aladin: string; vsx: string; simbad: string } {
  const r = String(ra)
  const d = String(dec)
  const dq = encodeURIComponent(d)
  return {
    aladin: `https://aladin.cds.unistra.fr/AladinLite/?target=${encodeURIComponent(r)}%20${dq}&fov=0.1`,
    vsx: `https://www.aavso.org/vsx/index.php?view=results.submit1&ql=1&coords=${encodeURIComponent(r)}+${dq}&format=d&size=10&unit=3`,
    simbad: `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${encodeURIComponent(r)}+${dq}&Radius=10&Radius.unit=arcsec`,
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** nightLabel turns "2025-02-28" into "Feb 28 2025". */
export function nightLabel(night: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(night)
  if (!m) return night
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])} ${m[1]}`
}

export function isNight(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export function statusText(s: DiscoveryStatus | null): string {
  if (!s || s.state !== 'running') return ''
  const what = [s.object, s.night ? nightLabel(s.night) : ''].filter(Boolean).join(' ')
  return `Comparing ${what}${s.stage ? `: ${s.stage}` : ''}`
}

export interface ChartPoint {
  x: number
  y: number
  lo: number
  hi: number
  colour: string
  title: string
}

export interface Chart {
  mode: 'delta' | 'flux'
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  points: ChartPoint[]
  refY: number
  topLabel: string
  bottomLabel: string
  firstLabel: string
  lastLabel: string
  axisLabel: string
  filters: { name: string; colour: string }[]
}

const CHART_W = 360
const CHART_H = 130
const PAD = { left: 52, right: 10, top: 10, bottom: 22 }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * chartOf maps the per-sub measurements to SVG points: the change in
 * magnitude with its error when measured, otherwise the flux difference.
 * Subs with no measurement are left out; nothing is interpolated.
 */
export function chartOf(light: LightPoint[] | null | undefined): Chart | null {
  const all = (light ?? []).filter((p) => !!p.time && !isNaN(new Date(p.time).getTime()))
  const delta = all.some((p) => num(p.delta_mag))
  const magPoint = (p: LightPoint) => ({
    p,
    v: p.delta_mag as number,
    e: num(p.mag_err) ? (p.mag_err as number) : 0,
  })
  const fluxPoint = (p: LightPoint) => ({ p, v: p.flux, e: num(p.flux_err) ? p.flux_err : 0 })
  const pts = delta
    ? all.filter((p) => num(p.delta_mag)).map(magPoint)
    : all.filter((p) => num(p.flux)).map(fluxPoint)
  if (!pts.length) return null

  const times = pts.map(({ p }) => new Date(p.time).getTime())
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  let lo = Math.min(0, ...pts.map(({ v, e }) => v - e))
  let hi = Math.max(0, ...pts.map(({ v, e }) => v + e))
  if (hi - lo === 0) {
    lo -= 1
    hi += 1
  }
  const span = hi - lo
  lo -= span * 0.08
  hi += span * 0.08

  const plotW = CHART_W - PAD.left - PAD.right
  const plotH = CHART_H - PAD.top - PAD.bottom
  const xOf = (t: number) => PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW)
  const yOf = delta
    ? (v: number) => PAD.top + ((v - lo) / (hi - lo)) * plotH
    : (v: number) => PAD.top + ((hi - v) / (hi - lo)) * plotH

  const names = [...new Set(pts.map(({ p }) => p.filter || ''))]
  const many = names.length > 1
  const colourOf = (f: string) => (many ? filterColor(f) : 'currentColor')
  const fmt = (v: number) => (delta ? `${signed(v, 2)} mag` : signed(v, Math.abs(v) >= 100 ? 0 : 1))

  return {
    mode: delta ? 'delta' : 'flux',
    width: CHART_W,
    height: CHART_H,
    left: PAD.left,
    right: CHART_W - PAD.right,
    top: PAD.top,
    bottom: CHART_H - PAD.bottom,
    points: pts.map(({ p, v, e }, i) => {
      const a = yOf(v - e)
      const b = yOf(v + e)
      return {
        x: xOf(times[i]!),
        y: yOf(v),
        lo: Math.min(a, b),
        hi: Math.max(a, b),
        colour: colourOf(p.filter || ''),
        title: `${hm(p.time)}${p.filter ? ' ' + p.filter : ''}: ${fmt(v)}${e ? ` ± ${delta ? e.toFixed(2) : e.toFixed(1)}` : ''}`,
      }
    }),
    refY: yOf(0),
    topLabel: fmt(delta ? lo : hi),
    bottomLabel: fmt(delta ? hi : lo),
    firstLabel: `first sub ${hm(t0)}`,
    lastLabel: `last sub ${hm(t1)}`,
    axisLabel: delta
      ? 'Change from the reference, brighter is up'
      : 'Flux difference from the reference',
    filters: many ? names.map((n) => ({ name: n || 'no filter', colour: filterColor(n) })) : [],
  }
}

export function rateText(v: number | null | undefined): string {
  return num(v) ? `${v.toFixed(2)}″/min` : 'not measured'
}

export function offsetText(v: number | null | undefined): string {
  return num(v) ? `${v.toFixed(1)}″` : 'not measured'
}

export function vmagText(v: number | null | undefined): string {
  return num(v) ? v.toFixed(1) : 'not measured'
}

export type ReportTab = 'tns' | 'mpc' | 'vsx'

export const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: 'tns', label: 'TNS (supernova or nova)' },
  { key: 'mpc', label: 'Minor Planet Center' },
  { key: 'vsx', label: 'Variable star (VSX)' },
]

/**
 * reportTab picks the tab a report opens on: the one the candidate's kind and
 * class point to when that draft applies, else the first draft that applies.
 */
export function reportTab(
  r: Pick<DiscoveryReport, 'kind' | 'class' | 'tns' | 'mpc' | 'vsx'>,
): ReportTab {
  const want: ReportTab =
    r.kind === 'mover' ? 'mpc' : r.class === 'new_variable_candidate' ? 'vsx' : 'tns'
  if (r[want].applies) return want
  return REPORT_TABS.find((t) => r[t.key].applies)?.key ?? want
}

export const CHECK_MARKS: Record<CheckState, string> = { ok: '✓', todo: '!', wait: '…', bad: '✕' }
