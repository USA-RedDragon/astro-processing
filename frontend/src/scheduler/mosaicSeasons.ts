import type { MosaicDetail, SeasonHorizon } from './api/mosaics'

export const STRATEGIES = ['weakest', 'even', 'off'] as const

export const STRATEGY_NAME: Record<string, string> = {
  weakest: 'Weakest panel first',
  even: 'Even across panels',
  off: 'Balancing off',
}

export const STRATEGY_METHOD: Record<string, string> = {
  weakest:
    'each step of the season goes to the panel and filter furthest behind its goal, as Panel Deficit steers it with Even Panels off',
  even: "each unfinished panel gets a share of the season's imaging hours in proportion to its unfinished filters, and Panel Deficit steers time to the panel furthest below its share this season (Even Panels on)",
  off: 'each season is split in proportion to the hours each panel and filter already has, the split seen so far; ones with no hours yet get time only after the others finish',
}

const STRATEGY_NEEDS: Record<string, string> = {
  weakest: 'Panel Deficit above 0 and Even Panels off',
  even: 'Panel Deficit above 0 and Even Panels on',
  off: 'Panel Deficit at 0',
}

export function strategyLabel(st: string): string {
  return STRATEGY_NAME[st] ?? st
}

export function strategyNeedsText(st: string, inForce?: string | null): string {
  if (!st || st === inForce) return ''
  const need = STRATEGY_NEEDS[st]
  return need ? `This plan needs ${need}, set for every project in Rule weights.` : ''
}

export function degrees(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(1)}°`
}

function sentence(s: string): string {
  return s.trim().replace(/\.+$/, '')
}

export function hoursNotWorkedOut(h?: SeasonHorizon | null): boolean {
  return !!h && h.minimumAltitude === null && !h.known
}

export const NO_MIN_ALT_HOURS =
  'Dark hours are not worked out because the project has no minimum altitude set'

export function horizonText(h?: SeasonHorizon | null): string {
  if (!h) return "All panels above the project's minimum altitude in astronomical darkness"
  const why = h.reason ? sentence(h.reason) : ''
  if (hoursNotWorkedOut(h)) return why ? `${NO_MIN_ALT_HOURS}. ${why}` : NO_MIN_ALT_HOURS
  const floor = h.minimumAltitude === null ? null : degrees(h.minimumAltitude)
  if (h.kind === 'custom' && h.known) {
    const off =
      h.offset === 0 ? '' : ` ${h.offset > 0 ? 'plus' : 'minus'} ${degrees(Math.abs(h.offset))}`
    const never = floor ? `, never below the project's minimum altitude of ${floor},` : ''
    const base = `All panels above the profile's custom horizon${off}${never} in astronomical darkness`
    return why ? `${base}. ${why}` : base
  }
  const flat = floor
    ? `All panels above ${floor}, the project's minimum altitude, in astronomical darkness`
    : 'All panels in astronomical darkness; the project has no minimum altitude set'
  if (h.kind !== 'custom') return why ? `${flat}. ${why}` : flat
  return `${flat}. The project uses the profile's custom horizon, but the observatory scheduler has not reported it, so these hours use the flat minimum altitude instead${why ? ': ' + why : ''}`
}

export type Balancing = MosaicDetail['balancing']

export function balancingBadge(b?: Balancing | null): string {
  if (!b?.on) return 'Off'
  const mode =
    b.evenPanels === true ? ' · even this season' : b.evenPanels === false ? ' · weakest first' : ''
  return `On · Panel Deficit ${b.panelDeficit}${mode}`
}

export function balancingText(b: Balancing | null | undefined, behind: string, globalDeficit: number | null): string {
  if (!b) return ''
  let now: string
  if (b.on && b.evenPanels === true)
    now = `Panel Deficit is weighted ${b.panelDeficit} on this mosaic with Even Panels on, so the panels are kept even this season: each unfinished panel gets a share of the season's imaging hours in proportion to its unfinished filters, and the scheduler adds weight to the panel furthest below its share.`
  else if (b.on && b.evenPanels === false)
    now = `Panel Deficit is weighted ${b.panelDeficit} on this mosaic with Even Panels off, so the weakest panel goes first: the scheduler adds weight to the panel furthest behind its goal and none to panels past it. ${behind}`
  else if (b.on)
    now = `Panel Deficit is weighted ${b.panelDeficit} on this mosaic, so the scheduler adds weight to the panel furthest behind its goal and none to panels past it. ${behind}`
  else {
    now = `Panel Deficit is ${b.panelDeficitSet ? 'weighted 0' : 'not set'} on this mosaic, so the scheduler does not steer time to the panel that is behind. Mosaic Completion is ${b.mosaicCompletion}.`
    if (b.evenPanels) now += ' Even Panels is on, but it has no effect while Panel Deficit is 0.'
  }
  if (globalDeficit === null) return now
  const differs = Math.abs(globalDeficit - (b.panelDeficitSet ? b.panelDeficit : 0)) > 1e-9
  return `${now} Panel Deficit is a global rule weight, ${globalDeficit} for every project${differs ? '; this mosaic differs from it until its weights are reset to the global set' : ''}.`
}
