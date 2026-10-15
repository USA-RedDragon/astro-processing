import type {
  CandidateClass,
  DiscoveryCandidate,
  CheckState,
  DiscoveryNight,
  DiscoveryReport,
  DiscoveryRun,
  DiscoveryStatus,
  LightPoint,
  Vetting,
} from './api/discoveries'
import { filterColor } from './api/planning'
import { hm } from './format'

export type Edge = 'known' | 'low' | 'new'
export type Chip = 'all' | 'look' | 'known' | 'low' | 'vetted'

export const CHIPS: { key: Chip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'look', label: 'Needs a look' },
  { key: 'known', label: 'Known variables' },
  { key: 'low', label: 'Low confidence' },
  { key: 'vetted', label: 'Vetted' },
]

export function isChip(v: unknown): v is Chip {
  return CHIPS.some((c) => c.key === v)
}

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

export function needsLook(c: Pick<DiscoveryCandidate, 'class' | 'vetting'>): boolean {
  return NEW_CLASSES.has(c.class) && !c.vetting
}

export function inChip(c: Pick<DiscoveryCandidate, 'class' | 'vetting'>, chip: Chip): boolean {
  switch (chip) {
    case 'look':
      return needsLook(c)
    case 'known':
      return c.class === 'known_variable'
    case 'low':
      return c.class === 'low_confidence'
    case 'vetted':
      return !!c.vetting
  }
  return true
}

export function chipCounts(list: Pick<DiscoveryCandidate, 'class' | 'vetting'>[]): Record<Chip, number> {
  const out: Record<Chip, number> = { all: 0, look: 0, known: 0, low: 0, vetted: 0 }
  for (const c of list) for (const k of CHIPS) if (inChip(c, k.key)) out[k.key]++
  return out
}

function rank(c: DiscoveryCandidate): number {
  if (needsLook(c)) return 0
  if (c.class === 'low_confidence') return 2
  return 1
}

/** cards are the changes plus the movers that matched no known asteroid, most urgent first. */
export function cards(list: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return list
    .filter((c) => c.kind === 'change' || c.class === 'unknown_mover')
    .sort((a, b) => rank(a) - rank(b) || b.snr - a.snr)
}

/** movers lists the moving objects, unknown ones first, then the brightest. */
export function movers(list: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const v = (c: DiscoveryCandidate) => c.body_v ?? Infinity
  return list
    .filter((c) => c.kind === 'mover')
    .sort(
      (a, b) =>
        Number(b.class === 'unknown_mover') - Number(a.class === 'unknown_mover') ||
        v(a) - v(b) ||
        b.snr - a.snr,
    )
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
    if (Number(Math.abs(d).toFixed(2)) === 0) return long ? 'no change from the reference' : 'no change'
    const word = d < 0 ? 'brighter' : 'fainter'
    return `${Math.abs(d).toFixed(2)} mag ${word}${long ? ' than the reference' : ''}`
  }
  if (c.sign < 0) return 'faded source'
  if (c.night_mag !== null && c.night_mag !== undefined) return `new source, G≈${c.night_mag.toFixed(1)}`
  return onSource ? 'not measured' : 'new source'
}

export function starText(c: Pick<DiscoveryCandidate, 'gaia_g'>): string {
  return c.gaia_g === null || c.gaia_g === undefined ? 'no catalogued star' : `Gaia G ${c.gaia_g.toFixed(2)}`
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** raText formats right ascension in degrees as "12h 37m 14.1s". */
export function raText(deg: number): string {
  const tenths = Math.round((((deg % 360) + 360) % 360) / 15 * 36000) % (24 * 36000)
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

/** matchText is the one line on a card that says what the candidate matched. */
export function matchText(c: Pick<DiscoveryCandidate, 'class' | 'matches'>): string {
  const m = c.matches ?? []
  const of = (cat: string) => m.find((x) => x.catalog === cat)
  switch (c.class) {
    case 'known_variable':
      return 'Matches a catalogued variable star'
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
      return g ? `No catalogued star, inside ${g.name}` : 'No catalogued star, inside a galaxy'
    }
    case 'new_variable_candidate':
      return 'Matches nothing known'
    case 'unknown_mover':
      return 'Moves across the subs; matches no known asteroid'
    case 'low_confidence':
      return 'Faint; at the noise floor'
  }
  return ''
}

const CATALOG_WORDS: Record<string, string> = {
  VSX: 'variable-star catalog',
  SIMBAD: 'star database',
  SkyBoT: 'known asteroids',
  ALeRCE: 'alert feeds',
  Fink: 'alert feeds',
  TNS: 'alert feeds',
  galaxies: 'galaxy catalog',
  galaxy: 'galaxy catalog',
  track: 'moving objects in the subs',
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
    const sep = Number.isFinite(m.sep_arcsec) && m.catalog !== 'track' ? `, ${m.sep_arcsec.toFixed(1)}″ away` : ''
    const type = m.type ? ` (${m.type})` : ''
    return `${m.name}${type}, ${where}${sep}`
  })
}

export function presenceText(c: Pick<DiscoveryCandidate, 'present_in' | 'subs_tested'>): string {
  if (!c.subs_tested) return 'not measured'
  return `Present in ${c.present_in} of ${c.subs_tested} subs`
}

export interface Summary {
  look: number
  knownVariables: number
  low: number
  knownAsteroids: number
  unknownMovers: number
  nightSubs: number
  refSubs: number
  depth: number | null
}

export function summarize(runs: DiscoveryRun[], list: DiscoveryCandidate[]): Summary {
  const done = runs.filter((r) => r.state === 'done')
  const depths = done.map((r) => r.depth).filter((d): d is number => d !== null && d !== undefined)
  return {
    look: list.filter(needsLook).length,
    knownVariables: list.filter((c) => c.class === 'known_variable').length,
    low: list.filter((c) => c.class === 'low_confidence').length,
    knownAsteroids: list.filter((c) => c.class === 'known_asteroid').length,
    unknownMovers: list.filter((c) => c.class === 'unknown_mover').length,
    nightSubs: done.reduce((n, r) => n + r.night_subs, 0),
    refSubs: done.reduce((n, r) => n + r.ref_subs, 0),
    depth: depths.length ? Math.max(...depths) : null,
  }
}

export function nextVetting(current: Vetting, clicked: Vetting): Vetting {
  return current === clicked ? '' : clicked
}

export const VET_BUTTONS: { state: Exclude<Vetting, ''>; label: string }[] = [
  { state: 'real', label: 'Real change' },
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

/** nightChoices keeps the asked-for night in the list even when nothing finished on it yet. */
export function nightChoices(nights: DiscoveryNight[], wanted: string): string[] {
  const list = nights.map((n) => n.night)
  if (wanted && !list.includes(wanted)) {
    list.push(wanted)
    list.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  }
  return list
}

export function targets(runs: Pick<DiscoveryRun, 'object'>[]): string[] {
  return [...new Set(runs.map((r) => r.object))].sort((a, b) => a.localeCompare(b))
}

export function statusText(s: DiscoveryStatus | null): string {
  if (!s || s.state !== 'running') return ''
  const what = [s.object, s.night ? nightLabel(s.night) : ''].filter(Boolean).join(' ')
  return `Comparing ${what}${s.stage ? `: ${s.stage}` : ''}`
}

export interface RunNotes {
  pending: number
  failed: { label: string; reason: string }[]
  skipped: { label: string; reason: string }[]
}

export function runNotes(runs: DiscoveryRun[]): RunNotes {
  const label = (r: DiscoveryRun) => `${r.object}, ${r.group}`
  return {
    pending: runs.filter((r) => r.state === 'queued' || r.state === 'running').length,
    failed: runs
      .filter((r) => r.state === 'failed')
      .map((r) => ({ label: label(r), reason: r.error || 'no reason given' })),
    skipped: runs
      .filter((r) => r.state === 'skipped')
      .map((r) => ({ label: label(r), reason: r.error || r.stage || 'no reason given' })),
  }
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
    axisLabel: delta ? 'Change from the reference, brighter is up' : 'Flux difference from the reference',
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
export function reportTab(r: Pick<DiscoveryReport, 'kind' | 'class' | 'tns' | 'mpc' | 'vsx'>): ReportTab {
  const want: ReportTab =
    r.kind === 'mover' ? 'mpc' : r.class === 'new_variable_candidate' ? 'vsx' : 'tns'
  if (r[want].applies) return want
  return REPORT_TABS.find((t) => r[t.key].applies)?.key ?? want
}

export const CHECK_MARKS: Record<CheckState, string> = { ok: '✓', todo: '!', wait: '…', bad: '✕' }
