import type { BodyKind, BodyNightView, FilterGoal } from './api/planning'

function r1(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1)
}

export const DEFAULT_ASTEROID_SNR = 50

export function bodyNoun(kind: BodyKind): string {
  return kind === 'asteroid' ? 'asteroid' : 'comet'
}

export function bodyHeading(kind: BodyKind): string {
  return kind === 'asteroid' ? 'Asteroid SNR per filter' : "Tonight's coma SNR per filter"
}

export function bodyIntro(kind: BodyKind): string {
  if (kind === 'asteroid')
    return 'Each filter needs one night where the asteroid reaches its SNR goal in a stack aligned on it, with a trail long enough to show in the star-aligned stack. After that night the filter is done for good.'
  return "Each night is its own image. Every night the comet's head and inner tail are measured in that night's stack aligned on the comet. A filter stops for the night once it reaches its goal or stops improving. When every filter has stopped, the comet waits for the next night and other targets get the time. It gets nights for as long as it is in season."
}

export function bodyMeasureText(kind: BodyKind): string {
  if (kind === 'asteroid')
    return "The asteroid's SNR is its flux in a 6-pixel aperture over how much that flux varies from sub to sub, after each sub is aligned on the asteroid and its stars are taken out."
  return "The comet's SNR is the mean of two medians, its head within 30 arcseconds and its inner tail out to 3 arcminutes within 20 degrees of the anti-Sun direction, each above the sky, over the noise of that night's stack aligned on the comet."
}

function snrOf(n: BodyNightView): string {
  return n.snr == null ? 'not measured' : r1(n.snr)
}

export function bodyTonightText(fg: FilterGoal): string {
  const b = fg.body
  if (!b) return ''
  const noun = bodyNoun(b.kind)
  if (b.kind === 'asteroid' && b.done) {
    const n = b.nights.find((x) => x.night === b.doneNight)
    if (n?.saturated) return `Done on the night of ${b.doneNight}: the asteroid saturates, so it is brighter than the goal needs`
    return `SNR ${n ? snrOf(n) : 'not measured'} of ${b.goal}, done on the night of ${b.doneNight}`
  }
  const c = b.current
  if (!c) {
    if (b.tonightSubs === 0) return 'Tonight: no subs yet'
    return `Tonight: ${b.tonightSubs} ${b.tonightSubs === 1 ? 'sub' : 'subs'}, measured once tonight's ${noun}-aligned stack is built`
  }
  if (c.snr == null && !c.saturated) return `Tonight: ${c.note ?? 'not measured yet'}`
  const what = b.kind === 'asteroid' ? 'SNR' : 'coma SNR'
  const parts = [`Tonight: ${what} ${snrOf(c)} of ${b.goal}`]
  if (c.plateau && c.progress < 1) parts.push('no longer improving tonight')
  else if (c.done) parts.push(b.kind === 'asteroid' ? 'goal met' : 'goal met for tonight')
  if (b.kind === 'asteroid' && c.trailShort && c.trailPx != null)
    parts.push(`trail ${Math.round(c.trailPx)} of ${b.minTrailPx} pixels so far`)
  return parts.join(' · ')
}

export function bodyValue(fg: FilterGoal): string {
  const b = fg.body
  if (!b) return ''
  const n = b.kind === 'asteroid' && b.done ? b.nights.find((x) => x.night === b.doneNight) : b.current
  if (!n) return 'not measured'
  if (n.saturated) return 'saturated'
  return n.snr == null ? 'not measured' : 'SNR ' + r1(n.snr)
}

export function bodyValueTitle(fg: FilterGoal): string {
  const c = fg.body?.current
  if (!c || c.headSnr == null) return ''
  const tail = c.tailSnr == null ? 'no tail measured' : `inner tail ${r1(c.tailSnr)}`
  return `Head ${r1(c.headSnr)}, ${tail}; the SNR is their mean`
}

export function bodyFill(fg: FilterGoal): string {
  const b = fg.body
  if (!b) return '0%'
  if (fg.enough || (b.kind === 'asteroid' && b.done)) return '100%'
  const p = fg.progress?.progress ?? 0
  return Math.floor(Math.max(0, Math.min(1, p)) * 100) + '%'
}

export function nightsImaged(goals: FilterGoal[]): number {
  const nights = new Set<string>()
  for (const g of goals) for (const n of g.body?.nights ?? []) if (n.subs > 0) nights.add(n.night)
  return nights.size
}

export interface NightRow {
  night: string
  tonight: boolean
  cells: { filter: string; stackFilter: string; night?: BodyNightView }[]
}

export function nightRows(goals: FilterGoal[]): NightRow[] {
  const tonight = goals.find((g) => g.body)?.body?.tonight ?? ''
  const nights = new Set<string>()
  for (const g of goals) for (const n of g.body?.nights ?? []) nights.add(n.night)
  return [...nights]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((night) => ({
      night,
      tonight: night === tonight,
      cells: goals.map((g) => ({
        filter: g.filter,
        stackFilter: g.stackFilter,
        night: g.body?.nights.find((n) => n.night === night),
      })),
    }))
}

export function nightCellText(n: BodyNightView | undefined, kind: BodyKind): string {
  if (!n) return 'not imaged'
  if (n.saturated) return 'saturated'
  if (n.snr == null) return 'not measured'
  const parts = ['SNR ' + r1(n.snr)]
  if (n.plateau && n.progress < 1) parts.push('stopped improving')
  else if (n.done) parts.push(kind === 'asteroid' ? 'done' : 'goal met')
  if (kind === 'asteroid' && n.trailShort) parts.push('trail too short')
  return parts.join(', ')
}

export function nightCellTitle(n: BodyNightView | undefined): string {
  if (!n) return ''
  const parts = [`${n.subs} ${n.subs === 1 ? 'sub' : 'subs'}`]
  if (n.note) parts.push(n.note)
  return parts.join(' · ')
}

export function bodyNightsSummary(goals: FilterGoal[], kind: BodyKind): string {
  const n = nightsImaged(goals)
  if (kind === 'asteroid') {
    const left = goals.filter((g) => g.body && !g.body.done).map((g) => g.filter)
    const done = left.length === 0 && goals.some((g) => g.body)
    if (done) return `Done: every filter had its good night. ${n} ${n === 1 ? 'night' : 'nights'} imaged.`
    return `${n} ${n === 1 ? 'night' : 'nights'} imaged. Still needs a good night in ${left.join(', ')}.`
  }
  return `${n} ${n === 1 ? 'night' : 'nights'} imaged so far.`
}
