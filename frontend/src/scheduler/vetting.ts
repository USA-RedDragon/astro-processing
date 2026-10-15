import type {
  CheckStatus,
  Confidence,
  DiscoverySource,
  SourceChecks,
  VetChart,
  VetCheck,
  VetSuggestion,
  Vetting,
} from './api/discoveries'
import { vettingLabel } from './discoveries'
import { clock, shortDate } from './format'

export const STATUS_ICON: Record<CheckStatus, string> = { pass: '✓', fail: '✕', skip: '–' }
export const STATUS_WORD: Record<CheckStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  skip: 'Not run',
}

const CONFIDENCE_WORD: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}

export function confidenceText(c: Confidence | string): string {
  return CONFIDENCE_WORD[c as Confidence] ?? ''
}

export function verdictLabel(s: VetSuggestion | null | undefined): string {
  if (!s) return 'Your verdict'
  const conf = confidenceText(s.confidence)
  return conf ? `Suggested verdict · ${conf}` : 'Suggested verdict'
}

const TONES: Record<string, string> = {
  real: 'new',
  artifact: 'nova',
  known: 'known',
  unsure: 'low',
}

export function toneOf(s: VetSuggestion | null | undefined): string {
  return s ? (TONES[s.state] ?? '') : ''
}

/** tallyText counts a group's checks, "3 pass · 1 fail · 2 not run", leaving out zeros. */
export function tallyText(checks: VetCheck[] | null | undefined): string {
  const list = checks ?? []
  const n = (s: CheckStatus) => list.filter((c) => c.status === s).length
  const pass = n('pass')
  const fail = n('fail')
  const skip = list.length - pass - fail
  return [pass ? `${pass} pass` : '', fail ? `${fail} fail` : '', skip ? `${skip} not run` : '']
    .filter(Boolean)
    .join(' · ')
}

/** statusOf falls back to "not run" for a status this page does not know. */
export function statusOf(s: string): CheckStatus {
  return s === 'pass' || s === 'fail' ? s : 'skip'
}

export function savedText(vetting: Vetting, suggested: boolean): string {
  if (vetting) return `Saved as ${vettingLabel(vetting)}.`
  return suggested
    ? 'Not vetted yet. The suggestion is not saved until you pick one.'
    : 'Not vetted yet.'
}

export type ReportOffer = { link: string } | { off: string } | null

function formName(s: Pick<DiscoverySource, 'kind' | 'class'>): string {
  if (s.kind === 'mover') return 'MPC'
  if (s.class === 'nova_candidate' || s.class === 'supernova_candidate') return 'TNS'
  if (s.class === 'new_variable_candidate') return 'VSX'
  return ''
}

/**
 * reportOffer says whether the links row offers a report draft: only when
 * the checks suggest the change is real, and a plain line when they call it
 * an artifact.
 */
export function reportOffer(
  s: VetSuggestion | null | undefined,
  src: Pick<DiscoverySource, 'kind' | 'class'>,
): ReportOffer {
  if (s?.state === 'real') {
    const form = formName(src)
    return { link: form ? `Report draft (${form} form)` : 'Report draft' }
  }
  if (s?.state === 'artifact') return { off: 'Report draft: not offered for artifacts' }
  return null
}

export function pendingText(list: string[] | null | undefined): string {
  return list?.length ? `Still fetching: ${list.join(', ')}.` : ''
}

export function checkedText(at: string | null | undefined): string {
  const d = shortDate(at)
  return d ? `Checked ${d} at ${clock(at)}.` : ''
}

export interface RunLine {
  kind: 'none' | 'running' | 'rerunning' | 'failed' | 'done'
  text: string
}

/** runLine is the one line above the checks that says where the run stands. */
export function runLine(c: SourceChecks): RunLine {
  switch (c.state) {
    case 'none':
      return { kind: 'none', text: 'Automatic checks have not run yet.' }
    case 'queued':
    case 'running':
      return c.report
        ? { kind: 'rerunning', text: 'Running the checks again.' }
        : { kind: 'running', text: 'Checks are running.' }
    case 'failed':
      return {
        kind: 'failed',
        text: c.error ? `The checks did not finish: ${c.error}` : 'The checks did not finish.',
      }
    default:
      return { kind: 'done', text: checkedText(c.finished_at ?? c.report?.ran_at) }
  }
}

export const isActive = (c: SourceChecks | null | undefined) =>
  c?.state === 'queued' || c?.state === 'running'

export const PLOT = { W: 460, H: 210, L: 40, R: 10, T: 8, B: 30 }

export interface PlotPoint {
  cx: number
  cy: number
  e1: number | null
  e2: number | null
  tip: string
}

export interface Plot {
  xTicks: { x: number; label: string }[]
  yTicks: { y: number; label: string }[]
  points: PlotPoint[]
  r: number
  path: string
  refs: { y: number; style: 'base' | 'fade' }[]
  vref: number | null
  xLabel: string
  yLabel: string
}

/** decimalsOf is the fewest decimals (up to 3) that show every tick exactly. */
export function decimalsOf(ticks: number[]): number {
  for (let d = 0; d < 3; d++) {
    const f = 10 ** d
    if (ticks.every((t) => Math.abs(Math.round(t * f) - t * f) < 1e-6)) return d
  }
  return 3
}

const minus = (s: string) => s.replace(/^-/, '−')

function trimmed(v: number, d: number): string {
  return minus(String(Number(v.toFixed(d))))
}

export function xTickText(unit: VetChart['x_unit'], t: number, d: number): string {
  if (unit === 'hours') return `${t > 0 ? '+' : ''}${trimmed(t, d)} h`
  if (unit === 'year') return String(Math.round(t))
  return trimmed(t, d)
}

/** bandOf reads the survey band from a chart title like "ZTF r over seven years". */
export function bandOf(title: string): string {
  const m = /\b(?:ZTF|ATLAS|ASAS-SN|Gaia|TESS|NEOWISE)\s+([A-Za-z0-9]{1,2})\b/.exec(title)
  return m ? m[1]! : ''
}

/** tipText is the hover text of one point, in the units the chart says. */
export function tipText(
  c: Pick<VetChart, 'x_unit' | 'y_unit' | 'title'>,
  p: { x: number; y: number; err?: number },
): string {
  let x: string
  if (c.x_unit === 'hours') {
    const m = Math.round(p.x * 60)
    x = `${m > 0 ? '+' : m < 0 ? '−' : ''}${Math.abs(m)} min`
  } else if (c.x_unit === 'phase') {
    x = `cycle ${minus(p.x.toFixed(3))}`
  } else {
    x = p.x.toFixed(2)
  }
  const err = p.err && p.err > 0 ? p.err : 0
  let y: string
  if (c.y_unit === 'dmag') {
    const word = p.y < 0 ? 'brighter' : 'fainter'
    y = `${Math.abs(p.y).toFixed(3)} mag ${word}${err ? `, ±${err.toFixed(3)}` : ''}`
  } else {
    const band = bandOf(c.title)
    y = `${band ? band + ' ' : ''}${p.y.toFixed(2)}${band ? '' : ' mag'}${err ? `, ±${err.toFixed(2)}` : ''}`
  }
  return `${x}: ${y}`
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * plotOf maps a chart from the report to SVG coordinates. Y grows downward
 * on screen, so y0 sits at the top and fainter is lower. Points, lines and
 * ticks with no finite value are left out.
 */
export function plotOf(c: VetChart): Plot | null {
  const { W, H, L, R, T, B } = PLOT
  if (!fin(c.x0) || !fin(c.x1) || !fin(c.y0) || !fin(c.y1) || c.x0 === c.x1 || c.y0 === c.y1)
    return null
  const pts = (c.points ?? []).filter((p) => fin(p.x) && fin(p.y))
  if (!pts.length) return null
  const sx = (x: number) => L + ((x - c.x0) / (c.x1 - c.x0)) * (W - L - R)
  const sy = (y: number) => T + ((y - c.y0) / (c.y1 - c.y0)) * (H - T - B)
  const xt = (c.x_ticks ?? []).filter(fin)
  const yt = (c.y_ticks ?? []).filter(fin)
  const xd = decimalsOf(xt)
  const yd = decimalsOf(yt)
  const line = (c.line ?? []).filter((p) => fin(p[0]) && fin(p[1]))
  return {
    xTicks: xt.map((t) => ({ x: sx(t), label: xTickText(c.x_unit, t, xd) })),
    yTicks: yt.map((t) => ({ y: sy(t), label: minus(t.toFixed(yd)) })),
    points: pts.map((p) => {
      const e = fin(p.err) && p.err > 0 ? p.err : 0
      return {
        cx: sx(p.x),
        cy: sy(p.y),
        e1: e ? sy(p.y - e) : null,
        e2: e ? sy(p.y + e) : null,
        tip: tipText(c, p),
      }
    }),
    r: pts.length > 100 ? 2 : 3.5,
    path: line
      .map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`)
      .join(''),
    refs: (c.refs ?? []).filter((r) => fin(r.y)).map((r) => ({ y: sy(r.y), style: r.style })),
    vref: fin(c.vref) ? sx(c.vref) : null,
    xLabel: c.x_label,
    yLabel: c.y_label,
  }
}

/** nearest is the index of the point closest to (px, py) within max units, or -1. */
export function nearest(points: { cx: number; cy: number }[], px: number, py: number, max = 30) {
  let best = -1
  let bd = max * max
  points.forEach((p, i) => {
    const d = (p.cx - px) ** 2 + (p.cy - py) ** 2
    if (d <= bd) {
      bd = d
      best = i
    }
  })
  return best
}
