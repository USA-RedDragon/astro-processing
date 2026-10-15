import type {
  DiscoveryCandidate,
  DiscoveryRun,
  DiscoverySource,
  SourceCounts,
  SourceView,
} from './api/discoveries'
import { filterColor } from './api/planning'
import { deltaText, matchText, moverName, rateText, starText } from './discoveries'

export const VIEWS: { key: SourceView; label: string }[] = [
  { key: 'look', label: 'Needs a look' },
  { key: 'known', label: 'Known variables' },
  { key: 'movers', label: 'Moving objects' },
  { key: 'low', label: 'Low confidence' },
  { key: 'vetted', label: 'Vetted' },
]

export function isView(v: unknown): v is SourceView {
  return VIEWS.some((x) => x.key === v)
}

export type Range = '7' | '30' | '90' | 'all'

export const RANGES: { key: Range; label: string }[] = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'all', label: 'All nights' },
]

export function isRange(v: unknown): v is Range {
  return RANGES.some((x) => x.key === v)
}

/** sinceOf is the first night a range covers, as the API takes it. */
export function sinceOf(range: Range, now = new Date()): string {
  if (range === 'all') return 'all'
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - Number(range))
  return d.toISOString().slice(0, 10)
}

/** countText is a view's count on its chip; moving objects say how many matched nothing. */
export function countText(view: SourceView, c: SourceCounts): string {
  const n = (v: number) => v.toLocaleString('en-US')
  switch (view) {
    case 'look':
      return n(c.look)
    case 'known':
      return n(c.known)
    case 'movers': {
      const known = c.movers - c.new_movers
      if (!c.movers) return '0'
      if (!c.new_movers) return `${n(known)} known`
      return `${n(c.new_movers)} new · ${n(known)} known`
    }
    case 'low':
      return n(c.low)
    case 'vetted':
      return n(c.vetted)
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parts(night: string): { y: number; m: number; d: number } | null {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(night)
  return x ? { y: Number(x[1]), m: Number(x[2]), d: Number(x[3]) } : null
}

/** shortNight turns "2026-10-05" into "Oct 5". */
export function shortNight(night: string): string {
  const p = parts(night)
  return p ? `${MONTHS[p.m - 1]} ${p.d}` : night
}

/** nightList names nights in order, the month once per run of the same month: "Oct 5, 6, 7". */
export function nightList(nights: string[]): string {
  const sorted = [...nights].sort()
  if (sorted.length > 4)
    return `${shortNight(sorted[0]!)} to ${shortNight(sorted[sorted.length - 1]!)}`
  const out: string[] = []
  let month = -1
  for (const n of sorted) {
    const p = parts(n)
    if (!p) {
      out.push(n)
      continue
    }
    out.push(p.m === month ? String(p.d) : shortNight(n))
    month = p.m
  }
  return out.join(', ')
}

export function groupLabel(g: string): string {
  return g === 'broadband' ? 'Broadband' : g
}

function groupColor(g: string): string {
  return filterColor(g === 'broadband' ? 'Luminance' : g)
}

export interface NightRow {
  night: string
  best: DiscoveryCandidate
  groups: string[]
  lowOnly: boolean
}

/**
 * nightRows gives each night of a source with the candidate that matters
 * most and the filter groups that saw it; low-confidence groups are left out
 * of a night that has a confident one.
 */
export function nightRows(s: Pick<DiscoverySource, 'nights'>): NightRow[] {
  return s.nights
    .filter((n) => n.candidates.length)
    .map((n) => {
      const sure = n.candidates.filter((c) => c.class !== 'low_confidence')
      const shown = sure.length ? sure : n.candidates
      return {
        night: n.night,
        best: shown[0]!,
        groups: [...new Set(shown.map((c) => c.group))],
        lowOnly: !sure.length,
      }
    })
}

export function groupsText(groups: string[]): string {
  const g = groups.map(groupLabel)
  if (g.length <= 1) return g[0] ?? ''
  return g.slice(0, -1).join(', ') + ' and ' + g[g.length - 1]
}

export function subsText(c: Pick<DiscoveryCandidate, 'present_in' | 'subs_tested'>): string {
  if (!c.subs_tested) return 'subs not measured'
  return `${c.present_in} of ${c.subs_tested} subs`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const measured = (c: DiscoveryCandidate) =>
  c.ref_mag !== null && c.ref_mag !== undefined && c.delta_mag !== null && c.delta_mag !== undefined

/** changeText says in one line how the spot changed across its nights. */
export function changeText(s: DiscoverySource): string {
  if (s.kind === 'mover') {
    const rate = rateText(s.best.rate_arcsec_per_min)
    const name =
      s.class === 'unknown_mover' ? 'Moves across the subs' : `Known asteroid ${moverName(s.best)}`
    return rate === 'not measured' ? name : `${name}, ${rate}`
  }
  const rows = nightRows(s).reverse()
  if (!rows.length) return 'not measured'
  if (rows.length === 1) return `${cap(deltaText(rows[0]!.best))} on ${shortNight(rows[0]!.night)}`
  const all = rows.map((r) => r.best)
  if (all.every(measured)) {
    const d = all.map((c) => c.delta_mag as number)
    const fainter = d.every((v) => v > 0)
    const brighter = d.every((v) => v < 0)
    if (fainter || brighter) {
      const lo = Math.min(...d.map(Math.abs)).toFixed(2)
      const hi = Math.max(...d.map(Math.abs)).toFixed(2)
      const word = fainter ? 'fainter' : 'brighter'
      const size = lo === hi ? `${lo} mag ${word}` : `${cap(word)} by ${lo} to ${hi} mag`
      return `${lo === hi ? cap(size) : size} on ${rows.length} nights`
    }
  }
  if (rows.length <= 3) {
    return cap(rows.map((r) => `${deltaText(r.best)} on ${shortNight(r.night)}`).join(', '))
  }
  const up = all.filter((c) => (c.delta_mag ?? -c.sign) < 0).length
  return `Changed on ${rows.length} nights: brighter on ${up}, fainter on ${rows.length - up}`
}

/** catalogText says what the catalogues know of the spot, in plain words. */
export function catalogText(
  s: Pick<DiscoverySource, 'class' | 'best' | 'checked' | 'kind'>,
): string {
  const m = s.best.matches ?? []
  if (s.kind === 'mover') return matchText(s.best)
  const galaxy = m.find((x) => x.catalog === 'galaxy')
  if (s.class.startsWith('known_')) {
    const named = m.find((x) => x.catalog !== 'galaxy')
    return named ? `${matchText(s.best)}: ${named.name}` : matchText(s.best)
  }
  const out: string[] = []
  if (galaxy) {
    const sep = Number.isFinite(galaxy.sep_arcsec)
      ? `, ${(galaxy.sep_arcsec / 60).toFixed(1)}′ from its center`
      : ''
    out.push(`Inside ${galaxy.name}${sep}`)
  }
  out.push(
    s.checked.includes('VSX')
      ? 'not in any variable-star catalog'
      : 'variable-star catalog not checked',
  )
  return cap(out.join(' · '))
}

/** starLine is the card's line on the star at the spot and what the catalogues say. */
export function starLine(s: DiscoverySource): string {
  if (s.kind === 'mover') return matchText(s.best)
  const star =
    s.best.gaia_g === null || s.best.gaia_g === undefined
      ? 'No cataloged star there'
      : `Star there: ${starText(s.best)}`
  const cat = catalogText(s)
  return `${star} · ${cat.charAt(0).toLowerCase()}${cat.slice(1)}`
}

/** seenText says on how many of the nights the field was compared the spot changed. */
export function seenText(s: Pick<DiscoverySource, 'nights_seen' | 'nights_compared'>): string {
  const { nights_seen: seen, nights_compared: compared } = s
  if (compared <= 1) return 'not compared again since'
  if (seen >= compared) return `seen on all ${compared} nights it was compared`
  return `seen on ${seen} of the ${compared} nights it was compared`
}

export function nightsLine(s: DiscoverySource): string {
  return `${nightList(s.nights.map((n) => n.night))} · ${seenText(s)}`
}

export interface SparkPoint {
  x: number
  y: number
  color: string
  title: string
}

export interface Spark {
  points: SparkPoint[]
  labels: { x: number; text: string }[]
}

const SPARK_MID = 45
const SPARK_SPAN = 30
const SPARK_X0 = 62
const SPARK_X1 = 238

/**
 * sparkOf plots each night's change from the reference, brighter up, one
 * dot per filter group in its color. Low-confidence groups are left out on
 * a night with a confident one, and a change with no measured size is not
 * drawn.
 */
export function sparkOf(s: DiscoverySource): Spark | null {
  const rows = nightRows(s)
  const pts: { night: string; c: DiscoveryCandidate }[] = []
  for (const r of rows) {
    const n = s.nights.find((x) => x.night === r.night)!
    for (const c of n.candidates) {
      if (r.lowOnly || c.class !== 'low_confidence') {
        if (typeof c.delta_mag === 'number' && Number.isFinite(c.delta_mag))
          pts.push({ night: r.night, c })
      }
    }
  }
  if (!pts.length) return null
  const time = (n: string) => new Date(n + 'T00:00:00Z').getTime()
  const nights = [...new Set(pts.map((p) => p.night))].sort()
  const t0 = time(nights[0]!)
  const t1 = time(nights[nights.length - 1]!)
  const xOf = (n: string) =>
    t1 === t0
      ? (SPARK_X0 + SPARK_X1) / 2
      : SPARK_X0 + ((time(n) - t0) / (t1 - t0)) * (SPARK_X1 - SPARK_X0)
  const top = Math.max(0.2, ...pts.map((p) => Math.abs(p.c.delta_mag as number)))
  const perNight = new Map<string, number>()
  const points = pts.map(({ night, c }) => {
    const i = perNight.get(night) ?? 0
    perNight.set(night, i + 1)
    const d = c.delta_mag as number
    return {
      x: xOf(night) + i * 7,
      y: SPARK_MID + (d / top) * SPARK_SPAN,
      color: groupColor(c.group),
      title: `${shortNight(night)}, ${groupLabel(c.group)}: ${deltaText(c)}`,
    }
  })
  const shown = nights.length > 4 ? [nights[0]!, nights[nights.length - 1]!] : nights
  return { points, labels: shown.map((n) => ({ x: xOf(n), text: shortNight(n) })) }
}

/** runResult sums up what one comparison found, or why it found nothing. */
export function runResult(r: DiscoveryRun): string {
  switch (r.state) {
    case 'queued':
      return 'Waiting to be compared'
    case 'running':
      return 'Comparing now'
    case 'skipped':
      return `Skipped: ${r.error || r.stage || 'no reason given'}`
    case 'failed':
      return `Failed: ${r.error || 'no reason given'}`
  }
  const c = r.classes ?? {}
  const out: string[] = []
  const look = r.needs_look ?? 0
  if (look) out.push(`${look} ${look === 1 ? 'needs' : 'need'} a look`)
  const known = (c.known_variable ?? 0) + (c.known_transient ?? 0)
  if (known) out.push(`${known} known ${known === 1 ? 'variable' : 'variables'}`)
  const moving = r.tracks
  if (moving) out.push(`${moving} moving ${moving === 1 ? 'object' : 'objects'}`)
  const low = c.low_confidence ?? 0
  if (low) out.push(`${low} low confidence`)
  return out.length ? out.join(' · ') : 'No changes'
}

export function subsVsRef(r: DiscoveryRun): string {
  return r.state === 'done' ? `${r.night_subs} vs ${r.ref_subs}` : 'not compared'
}

export function depthText(r: DiscoveryRun): string {
  return typeof r.depth === 'number' && Number.isFinite(r.depth)
    ? r.depth.toFixed(1)
    : 'not measured'
}

export function targetsOf(runs: Pick<DiscoveryRun, 'object'>[], keep = ''): string[] {
  const list = [...new Set(runs.map((r) => r.object))]
  if (keep && !list.includes(keep)) list.push(keep)
  return list.sort((a, b) => a.localeCompare(b))
}
