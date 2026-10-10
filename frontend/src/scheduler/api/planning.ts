import { api } from './client'

export type GoalKind = 'snr' | 'depth'

export interface Point {
  x: number
  y: number
}

export interface Goal {
  targetGuid: string
  filter: string
  kind: GoalKind
  snr: number
  depth: number
  plateauStop: boolean
  region?: Point[]
}

export interface Progress {
  object: string
  filter: string
  targetGuid?: string
  kind: GoalKind
  goal: number
  achieved: number
  progress: number
  snr: number
  depth: number
  effectiveHours: number
  hoursNeeded: number
  gainPerHourPct: number
  plateau: boolean
  lowConfidence: boolean
  lowReason?: string
  unmeasured?: string
  region: boolean
  done: boolean
  measuredAt: string
  depthSystem?: 'gaia-g' | 'xp-ab'
  depthBand?: string
  depthApprox?: boolean
}

export interface DrawPoint {
  n: number
  t: number
  sigma: number
}

export interface Measurement {
  object: string
  filter: string
  snr: number
  signal: number
  noise: number
  noiseMask: string
  pairs: number
  levels: number
  subs: number
  subsTotal: number
  effectiveHours: number
  bandFraction: number
  nebFraction: number
  heldOutErrPct: number | null
  gainPerHourPct: number | null
  plateau: boolean
  depth: number | null
  depthBand?: string
  depthApprox: boolean
  depthReason?: string
  zeroPointStars: number
  lowConfidence: boolean
  lowReason?: string
  region: boolean
  measuredAt: string
  points: DrawPoint[]
}

export type MeasureStatus = 'measured' | 'failed' | 'no-master' | 'not-measured'

export interface FilterGoal {
  filter: string
  stackFilter: string
  goal: Goal | null
  goalSet: boolean
  defaultGoal: Goal
  measured: boolean
  status: MeasureStatus
  measurement?: Measurement
  progress?: Progress
  readiness?: Readiness
  error?: string
  percentComplete: number
  completionBasis: string
  accepted: number
  desired: number
  acceptedHours: number
}

export interface Plan {
  id: number
  guid: string
  templateId: number
  template: string
  filter: string
  exposure: number
  exposureRaw: number
  desired: number
  acquired: number
  accepted: number
  enabled: boolean
  gain: number | null
  moonSeparation: number
  moonWidth: number
  percentComplete?: number
  completionBasis?: string
  goalDriven?: boolean
  complete?: boolean
  countPercent?: number
  countBasis?: string
}

export interface Readiness {
  state: 'measured' | 'collecting' | 'unmeasurable'
  reason?: string
  stackSubs: number
  minSubs: number
  subLimit: number
  open: boolean
}

export interface Season {
  nightsLeft: number
  outOfSeason: boolean
  seasonEnd?: string
  computedFor?: string
}

export interface Target {
  id: number
  guid: string
  name: string
  active: boolean
  raHours: number | null
  dec: number | null
  rotation: number
  panel?: number
  plans: Plan[]
  goals: FilterGoal[]
  weakest?: FilterGoal
  progress: number
  percentComplete: number
  effectiveHours: number
  effectiveHoursBasis: string
  goalDriven: boolean
  season?: Season
  novelty: number
  rarity: number
  lastSub?: string
  exposureSet: string
  goalMode: GoalKind
}

export interface RuleWeight {
  name: string
  weight: number
  missing: boolean
}

export interface Project {
  id: number
  guid: string
  name: string
  description: string
  state: string
  priority: string
  minimumTime: number
  minimumAltitude: number
  isMosaic: boolean
  targets: Target[]
  exposureSet: string
  progress: number
  weakestTarget?: string
  weakest?: FilterGoal
  season?: Season
  novelty: number
  rarity: number
  lastSub?: string
  ruleWeights: RuleWeight[]
  goalDriven: boolean
  grader: boolean
  completion: { delayGrading: number; exposureThrottle: number; source: string }
}

export interface Template {
  id: number
  guid: string
  name: string
  filter: string
  defaultExposure: number
  gain: number | null
  offset: number | null
  bin: number | null
  twilight: string
  moonEnabled: boolean
  moonSeparation: number
  moonWidth: number
  moonDown: boolean
  maximumHumidity: number
  usedByPlans: number
  usedByTargets: number
}

export interface SetItem {
  template: string
  exposure: number
  desired: number
}

export interface ExposureSet {
  id: string
  name: string
  hint: string
  items: SetItem[]
  projects: number
  projectIds: number[]
  examples: string[]
}

export interface RigBasis {
  source: string
  frames: number
  from: string | null
  to: string | null
  camera: string | null
  telescope: string | null
}

export interface PlanningFrame {
  widthDeg: number | null
  heightDeg: number | null
  scale: number | null
  focalLength: number | null
  pixelSize: number | null
  widthPx: number | null
  heightPx: number | null
  basis: RigBasis
  reason: string | null
}

export interface GoalDefaults {
  kind: GoalKind
  snr: number
  depthSnr: number
  depths: { filter: string; depth: number }[]
  plateauStop: boolean
  plateauGainPct: number
  bandLowPercentile: number
  bandHighPercentile: number
}

export interface PlanningDefaults {
  goal: GoalDefaults
  panelDeficitWeight: number
}

export interface Rule {
  name: string
  defaultWeight: number
  new: boolean
  description: string
}

export interface Snapshot {
  frame: PlanningFrame
  projects: Project[]
  templates: Template[]
  sets: ExposureSet[]
  rules: Rule[]
  defaults: PlanningDefaults
}

export interface ProjectDetail {
  project: Project
  rules: Rule[]
  sets: ExposureSet[]
  templates: Template[]
  defaults?: {
    goal: {
      snr: number
      depthSnr: number
      plateauGainPct: number
      bandLowPercentile: number
      bandHighPercentile: number
    }
  }
}

export interface TargetEffect {
  targetId: number
  name: string
  project: string
  current: string
  effect: string
  changes: boolean
}

export interface ApplySetDraft {
  payload?: unknown
  effects: TargetEffect[]
  missing?: string[]
}

export interface PanelDraft {
  name?: string
  raHours: number
  dec: number
  rotation: number
}

export interface ProjectDraft {
  mosaic?: { layout: string; rotation: number; overlap: number; cols: number; rows: number }
  name: string
  catalog?: string
  match?: string
  matchWith?: string
  priority: string
  minimumAltitude: number
  minimumTime: number
  setId: string
  plans?: { templateId: number; exposure: number }[]
  goalDriven?: boolean
  desired?: number
  goal: { kind: GoalKind; snr: number; depth: number; plateauStop?: boolean }
  panels: PanelDraft[]
}

export interface PickHours {
  hours: number | null
  low: number | null
  high: number | null
  points: number
  basis: string
  unknown?: string
}

export interface PickFilter {
  filter: string
  template: { id: number; name: string; filter: string } | null
  templateBasis: string
  exposure: number | null
  exposureBasis: string
  subs: number
  hours: PickHours
}

export interface PickRule {
  key: string
  filter: string
  label: string
  threshold: number | null
  derived: boolean
  basis: string
  measured: number | null
  strict: boolean
  met: boolean
  points: { name: string; object: string; rayleigh: number; shot: boolean }[]
}

export interface ExposurePick {
  class: string
  classLabel: string
  palette: string
  reason: string
  noPick?: string
  halpha: { rayleigh: number; peak: number; radiusDeg: number } | null
  halphaMap: { state: string; source: string; fetchedAt: string | null; error: string | null }
  rules: PickRule[]
  filters: PickFilter[]
  set: { id: string; name: string; projects: number } | null
  missing: string[]
  goalSnr: number
  skyBrightness: number | null
  skyBrightnessBasis: { source: string; band: string; nights: number; reason: string | null }
}

export interface StackMaster {
  filter: string
  subs: number
  width: number
  height: number
  preview_url: string
  crop?: { x: number; y: number; w: number; h: number }
}

export const getPlanning = () => api.get<Snapshot>('/planning')
export const getProject = (id: number | string) =>
  api.get<ProjectDetail>(`/planning/projects/${id}`)
export const draftApplySet = (body: {
  setId: string
  mode: string
  targetIds: number[]
  desired?: number
}) => api.post<ApplySetDraft>('/planning/applyset/draft', body)
export const getPick = (objectId: string) =>
  api.get<ExposurePick>('/catalog/objects/' + encodeURIComponent(objectId) + '/pick')
export const draftProject = (d: ProjectDraft) => api.post<unknown>('/planning/projects/draft', d)
export const getStacks = (object: string) =>
  api.get<StackMaster[]>('/stacks?object=' + encodeURIComponent(object))

export const RULE_KEYS = [
  'Project Priority',
  'Setting Soonest',
  'Percent Complete',
  'Target Switch Penalty',
  'Mosaic Completion',
  'Novelty',
  'Rarity',
]

export function uuid(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const PRIORITY_INDEX: Record<string, number> = { Low: 0, Normal: 1, High: 2 }
export const STATE_INDEX: Record<string, number> = { Draft: 0, Active: 1, Inactive: 2, Closed: 3 }

const FILTER_COLORS: Record<string, string> = {
  'H-a': 'var(--ha)',
  'O-III': 'var(--oiii)',
  'S-II': 'var(--sii)',
  Luminance: 'var(--lum)',
  Red: 'var(--red)',
  Green: 'var(--green)',
  Blue: 'var(--blue)',
}

export function filterColor(stackFilter: string): string {
  return FILTER_COLORS[stackFilter] ?? 'var(--muted-foreground)'
}

export function r1(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1)
}

export function r2(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2)
}

export function pct(v: number): string {
  return Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'
}

export function raText(h: number | null): string {
  if (h === null || h === undefined) return '—'
  const t = Math.round(h * 3600)
  const hh = Math.floor(t / 3600)
  const mm = Math.floor((t % 3600) / 60)
  const ss = t % 60
  return `${hh}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`
}

export function decText(d: number | null): string {
  if (d === null || d === undefined) return '—'
  const s = d < 0 ? '−' : '+'
  const a = Math.abs(d)
  const deg = Math.floor(a)
  const min = Math.round((a - deg) * 60)
  return `${s}${deg}° ${String(min).padStart(2, '0')}′`
}

export function seasonLabel(s?: Season): { label: string; cls: string } {
  if (!s) return { label: 'Season unknown', cls: '' }
  if (s.outOfSeason) return { label: 'Out of season', cls: 'muted' }
  if (s.nightsLeft >= 365) return { label: 'In season · usable on every night scanned (365)', cls: 'muted' }
  if (s.nightsLeft <= 60) return { label: `Closing · ${s.nightsLeft} usable nights`, cls: 'violet' }
  return { label: `In season · ${s.nightsLeft} usable nights`, cls: 'muted' }
}

export function measureText(fg: FilterGoal): string {
  switch (fg.status) {
    case 'failed':
      return 'measurement failed: ' + (fg.error || 'no reason recorded')
    case 'no-master':
      return 'no stacked master yet'
    case 'not-measured':
      return 'master stacked, not measured yet'
  }
  return ''
}

export function basisText(basis: string): string {
  switch (basis) {
    case 'goal':
      return 'of its goal'
    case 'accepted':
      return 'accepted of desired'
    case 'acquired, grading delayed':
      return 'acquired of desired, grading delayed'
    case 'acquired, no grading':
      return 'acquired of desired × throttle'
    case 'collecting subs to measure':
      return 'of its goal, not measured yet'
  }
  return basis
}

export const GOAL_DRIVEN_PLUGIN = '5.8.2.204'

export function versionAtLeast(version: string | undefined, min: string): boolean {
  if (!version) return false
  const a = version.split('.').map((x) => parseInt(x, 10))
  const b = min.split('.').map((x) => parseInt(x, 10))
  if (a.some((x) => isNaN(x))) return false
  for (let i = 0; i < b.length; i++) {
    const x = a[i] ?? 0
    if (x !== b[i]) return x > b[i]
  }
  return true
}

export function goalDrivenPlugin(version: string | undefined): boolean {
  return versionAtLeast(version, GOAL_DRIVEN_PLUGIN)
}

export function legacyGoalNote(version: string | undefined): string {
  return (
    `Target Scheduler plugin ${version ?? 'of unknown version'} finishes a filter with a goal on its ` +
    'desired count until the stacker has measured the goal, and on the goal after that. ' +
    `From plugin ${GOAL_DRIVEN_PLUGIN} the desired count is not used for a filter with a goal.`
  )
}

function onCountsNow(pl: Plan, version: string | undefined): boolean {
  return !goalDrivenPlugin(version) && pl.completionBasis === 'collecting subs to measure'
}

export function planPercentFor(pl: Plan, version: string | undefined): number {
  return onCountsNow(pl, version) ? (pl.countPercent ?? 0) : (pl.percentComplete ?? 0)
}

export function planBasisFor(pl: Plan, version: string | undefined): string {
  return onCountsNow(pl, version) ? (pl.countBasis ?? '') : (pl.completionBasis ?? '')
}

export function filterPercentFor(
  t: Target,
  fg: FilterGoal,
  version: string | undefined,
): { percent: number; basis: string } {
  if (goalDrivenPlugin(version) || fg.completionBasis !== 'collecting subs to measure')
    return { percent: fg.percentComplete, basis: fg.completionBasis }
  let best: { percent: number; basis: string } | null = null
  for (const pl of t.plans) {
    if (!pl.enabled || pl.filter !== fg.filter) continue
    const percent = planPercentFor(pl, version)
    if (!best || percent < best.percent) best = { percent, basis: planBasisFor(pl, version) }
  }
  return best ?? { percent: fg.percentComplete, basis: fg.completionBasis }
}

export function projectProgressFor(p: Project, version: string | undefined): number {
  if (goalDrivenPlugin(version)) return p.progress
  const plans = p.targets.filter((t) => t.active).flatMap((t) => t.plans.filter((pl) => pl.enabled))
  if (!plans.some((pl) => onCountsNow(pl, version))) return p.progress
  let min = 1
  for (const t of p.targets) {
    if (!t.active) continue
    const enabled = t.plans.filter((pl) => pl.enabled)
    if (!enabled.length) return 0
    for (const pl of enabled) min = Math.min(min, planPercentFor(pl, version) / 100)
  }
  return min
}

export function readinessText(fg: FilterGoal, version?: string): string {
  const r = fg.readiness
  if (!r || !goalDrivenPlugin(version)) return ''
  if (r.state === 'collecting') {
    if (r.stackSubs < r.minSubs)
      return `collecting the first ${r.minSubs} subs to measure (${r.stackSubs} of ${r.minSubs})`
    return `${r.stackSubs} subs stacked, waiting for the first measurement`
  }
  if (r.state === 'unmeasurable') {
    const why = r.reason || 'the goal cannot be measured'
    return r.open
      ? `${why}; imaging stops at ${r.subLimit} subs (${r.stackSubs} so far)`
      : `${why}; stopped at ${r.stackSubs} subs`
  }
  return ''
}

export function planCountText(fg: FilterGoal | undefined, version?: string): string {
  if (!fg?.goalSet || !goalDrivenPlugin(version)) return ''
  const ready = readinessText(fg, version)
  if (ready) return 'goal-driven · ' + ready
  if (fg.progress?.done) return 'goal-driven · ' + (fg.progress.progress >= 1 ? 'goal met' : 'plateau reached')
  if (fg.progress) return `goal-driven · ${pct(fg.progress.progress)} of its goal`
  return 'goal-driven'
}

export function goalTiming(fg: FilterGoal, version?: string): string {
  const p = fg.progress
  const ready = readinessText(fg, version)
  if (ready) return ready
  if (!p) return measureText(fg) || 'finishes on counts'
  if (p.unmeasured) return p.unmeasured
  if (p.done) return p.progress >= 1 ? 'goal met' : 'plateau reached'
  if (p.hoursNeeded < 0) return 'time needed unknown'
  return `≈ ${r1(p.hoursNeeded)} h more at √t`
}
