import type { WeightDiff } from './ruleweights'
import { api, query } from './client'

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

export interface Plateau {
  hours: number | null
  progress: number | null
  unmeasured?: string
  gainPct: number
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
  plateauAt?: Plateau
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
  plateauAt?: Plateau
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
  enough: boolean
  goalProgress: number | null
  notMeasured?: string
  plateauAt?: Plateau
}

export interface LeastPlateau {
  progress: number | null
  hours: number | null
  effectiveHours?: number
  gainPerHourPct?: number | null
  target?: string
  filter?: string
  panel?: number
  notMeasured?: string
  unmeasured?: number
  filters?: number
  gainPct: number
}

export interface Least {
  enough: boolean
  progress: number | null
  target?: string
  filter?: string
  notMeasured?: string
  unmeasured: number
  filters: number
  plateau?: LeastPlateau
  countBased?: string[] | null
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
  rotation: number | null
  panel?: number
  plans: Plan[]
  goals: FilterGoal[]
  weakest?: FilterGoal
  least: Least
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
  objectLinks?: ObjectLink[]
}

export interface ObjectLinkMethod {
  method: string
  frames: number
}

export interface ObjectLink {
  object: string
  frames: number
  methods: ObjectLinkMethod[]
}

const LINK_METHOD_TEXT: Record<string, string> = {
  header: 'target GUID in the FITS header',
  acquiredimage: "Target Scheduler's acquired-image record",
  name: 'FITS OBJECT matches the target name',
  'target-name': 'same name as the target only, no frames linked',
}

export function linkMethodText(m: string): string {
  return LINK_METHOD_TEXT[m] ?? m
}

export function objectLinkText(l: ObjectLink): string {
  if (!l.frames) return l.methods.map((m) => linkMethodText(m.method)).join(', ')
  const by = l.methods.map((m) => `${m.frames} by ${linkMethodText(m.method)}`).join(', ')
  return `${l.frames} frame${l.frames === 1 ? '' : 's'}: ${by}`
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
  least: Least
  season?: Season
  novelty: number
  rarity: number
  lastSub?: string
  ruleWeights: RuleWeight[]
  filterSteering?: RuleWeight
  weightDiffs?: WeightDiff[]
  goalDriven: boolean
  grader: boolean
  ditherEvery?: number | null
  filterSwitchFrequency?: number | null
  flatsHandling?: number | null
  smartExposureOrder?: boolean | null
  meridianWindow?: number | null
  useCustomHorizon?: boolean | null
  horizonOffset?: number | null
  maximumAltitude?: number | null
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
  twilight: string | null
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

export interface ProjectSettingValues {
  ditherEvery: number
  filterSwitchFrequency: number
  flatsHandling: number
  smartExposureOrder: boolean
  meridianWindow: number
  useCustomHorizon: boolean
  horizonOffset: number
  maximumAltitude: number
  enableGrader: boolean
}

export interface ProjectSettingDefaults extends ProjectSettingValues {
  basis: 'profile' | 'target-scheduler'
  projects: number
  profileId: string
}

export interface PlanningDefaults {
  goal: GoalDefaults
  panelDeficitWeight: number
  projectSettings?: ProjectSettingDefaults
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

export interface GoalSetting {
  kind: 0 | 1
  snr_goal: number
  depth_goal?: number
  plateau_stop: boolean
  region?: string
}

export interface GoalChange {
  target_id: number
  target_guid: string
  target_name: string
  filter: string
  before: GoalSetting | null
  after: GoalSetting | null
}

export interface GoalEditPayload {
  project_id: number
  project_name: string
  goals: GoalChange[]
}

export interface ApplySetDraft {
  payload?: unknown
  effects: TargetEffect[]
  missing?: string[]
  goals?: GoalEditPayload[] | null
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
  ditherEvery?: number
  filterSwitchFrequency?: number
  flatsHandling?: number
  smartExposureOrder?: boolean
  meridianWindow?: number
  useCustomHorizon?: boolean
  horizonOffset?: number
  maximumAltitude?: number
  enableGrader?: boolean
}

export interface PickHours {
  hours: number | null
  low: number | null
  high: number | null
  points: number
  goal: string
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
  goal?: PickGoal
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
export interface PickGoal {
  kind: GoalKind
  snr: number
  depth: number
}

export const getPick = (objectId: string, goal?: Partial<PickGoal>, signal?: AbortSignal) =>
  api.get<ExposurePick>(
    '/catalog/objects/' +
      encodeURIComponent(objectId) +
      '/pick' +
      query({ goal: goal?.kind, snr: goal?.snr || undefined, depth: goal?.depth || undefined }),
    signal,
  )

export function pickGoalText(g: PickGoal | undefined): string {
  if (!g) return 'goal'
  if (g.kind === 'depth')
    return g.depth > 0 ? `depth ${g.depth} mag/arcsec²` : 'the default depth per filter'
  return `faint-signal SNR ${g.snr}`
}
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
  if (s.nightsLeft >= 365)
    return { label: 'In season · usable on every night scanned (365)', cls: 'muted' }
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

export function floorPct(v: number): string {
  return Math.floor(Math.max(0, Math.min(1, v)) * 100) + '%'
}

export const NO_GOAL_REASON = 'no goal set'
export const ON_COUNTS_TEXT = 'runs on counts: no goal set'
export const ON_COUNTS_TITLE =
  'These filters have no goal, so Target Scheduler stops them at their desired sub count. Give them a goal to make them goal-driven.'

export function countBasedFilters(l: Pick<Least, 'countBased'> | null | undefined): string[] {
  return l?.countBased ?? []
}

export function countsBadge(l: Pick<Least, 'countBased'> | null | undefined): string {
  const fs = countBasedFilters(l)
  return fs.length ? 'Runs on counts: ' + fs.join(', ') : ''
}

export function leastOnCounts(l: Least | null | undefined): boolean {
  if (!l || !l.filters || l.enough || l.progress !== null || !l.filter) return false
  if (l.notMeasured) return l.notMeasured === NO_GOAL_REASON
  return countBasedFilters(l).includes(l.filter)
}

export function filterOnCounts(fg: Pick<FilterGoal, 'goalSet'>): boolean {
  return !fg.goalSet
}

export function countsLine(fg: Pick<FilterGoal, 'accepted' | 'desired'>): string {
  return `${fg.accepted} of ${fg.desired} subs accepted`
}

export function leastValue(l: Least | undefined): number | null {
  if (!l || !l.filters) return null
  return l.enough ? 1 : l.progress
}

export function leastRank(l: Least | undefined): number {
  if (!l || !l.filters) return -2
  if (l.enough) return 1
  return l.progress ?? -1
}

export function leastHeadline(l: Least | undefined): string {
  if (!l || !l.filters) return 'no enabled exposure plans'
  if (l.enough) return 'enough data'
  if (leastOnCounts(l)) return `needs more · ${l.filter} ${ON_COUNTS_TEXT}`
  if (l.progress === null) return `needs more · ${l.filter} not measured yet`
  return `${floorPct(l.progress)} · ${l.filter} least complete`
}

export function leastPanel(l: Least | undefined): string {
  const m = l?.target ? /(Panel\s*\d+)\s*$/i.exec(l.target) : null
  return m ? m[1]! : ''
}

export function leastText(l: Least | undefined, mosaic = false): string {
  if (!l || !l.filters) return 'No enabled exposure plans'
  if (l.enough) return 'Enough data in every filter'
  const panel = mosaic ? leastPanel(l) : ''
  const f = panel ? `${panel} ${l.filter}` : l.filter
  if (leastOnCounts(l)) return `Needs more data: ${f} ${ON_COUNTS_TEXT}`
  if (l.progress === null)
    return `Needs more data: ${f} not measured yet${l.notMeasured ? ` (${l.notMeasured})` : ''}`
  return `Needs more data: ${f} is least complete at ${floorPct(l.progress)} of its goal`
}

export function filterHeadline(fg: FilterGoal): string {
  if (filterOnCounts(fg))
    return `${fg.enough ? 'enough data · ' : ''}${ON_COUNTS_TEXT} · ${countsLine(fg)}`
  if (fg.enough) {
    if (fg.goalProgress === null) return 'enough data · ' + (fg.notMeasured || 'stopped')
    if (fg.progress?.done && fg.progress.progress < 1) return 'enough data · plateau reached'
    return 'enough data · goal met'
  }
  if (fg.goalProgress === null)
    return 'not measured yet' + (fg.notMeasured ? ' · ' + fg.notMeasured : '')
  return `needs more · ${floorPct(fg.goalProgress)} of its goal`
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
  if (fg.progress?.done)
    return 'goal-driven · ' + (fg.progress.progress >= 1 ? 'goal met' : 'plateau reached')
  if (fg.progress) return `goal-driven · ${floorPct(fg.progress.progress)} of its goal`
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

export function plateauLabel(p: Pick<LeastPlateau, 'progress' | 'hours'> | null | undefined): string {
  if (!p || p.progress === null || p.progress === undefined) return 'plateau not measured yet'
  if (p.progress >= 1) return 'plateau reached'
  if (p.hours === null || p.hours === undefined) return 'plateau not measured yet'
  return `plateau at ~${r1(p.hours)} h, ${floorPct(p.progress)} there`
}

export function plateauWho(p: Pick<LeastPlateau, 'filter' | 'target' | 'panel'>, mosaic = false): string {
  const panel = p.panel
    ? `Panel ${p.panel}`
    : mosaic && p.target
      ? (/(Panel\s*\d+)\s*$/i.exec(p.target)?.[1] ?? '')
      : ''
  return [panel, p.filter].filter(Boolean).join(' ')
}

export function plateauRollupLabel(p: LeastPlateau | null | undefined, mosaic = false): string {
  if (!p || (!p.filters && p.progress === null && !p.filter)) return ''
  const who = plateauWho(p, mosaic)
  return who ? `${who} ${plateauLabel(p)}` : plateauLabel(p)
}

export function sqrtLimitHours(gainPct: number): number {
  const q = (1 - gainPct / 100) ** 2
  return q / (1 - q)
}

export function plateauWhere(p: LeastPlateau | null | undefined, mosaic = false): string {
  if (!p) return ''
  const who = plateauWho(p, mosaic)
  const what =
    p.progress === null || p.progress === undefined || p.hours === null || p.hours === undefined
      ? p.progress !== null && p.progress !== undefined && p.progress >= 1
        ? 'reached'
        : 'not measured yet'
      : p.progress >= 1
        ? 'reached'
        : `at ~${r1(p.hours)} h, ${floorPct(p.progress)} there`
  return who ? `${who} ${what}` : what
}

export function plateauRule(gainPct: number): string {
  return (
    `The plateau is where one more hour lowers the measured noise by under ${gainPct}%, the rule the plateau stop uses. ` +
    'It is estimated from the noise fit σ(t) = √(a²/t + b²) over the stack\'s draw levels: ' +
    `with no noise floor (b = 0) it falls at ${r1(sqrtLimitHours(gainPct))} h, and a floor brings it earlier. ` +
    'The line is effective hours over the estimated plateau hours.'
  )
}

export function plateauTitle(p: LeastPlateau | null | undefined, mosaic = false, rollup = true): string {
  if (!p) return ''
  const who = plateauWho(p, mosaic)
  const rule = plateauRule(p.gainPct)
  if (p.progress === null || p.progress === undefined) {
    const why = p.notMeasured ? `: ${p.notMeasured}` : ''
    return `Plateau not measured yet${who ? ' for ' + who : ''}${why}. ${rule}`
  }
  const parts: string[] = []
  const lead = rollup && who ? `${who} is furthest from its plateau` : who ? `${who} plateau` : 'Plateau'
  if (p.progress >= 1) parts.push(`${lead}: reached.`)
  else if (p.hours !== null && p.hours !== undefined)
    parts.push(`${lead}: estimated at ~${r1(p.hours)} h effective, ${floorPct(p.progress)} of the way there.`)
  const now: string[] = []
  if (p.effectiveHours) now.push(`${r1(p.effectiveHours)} h effective now`)
  if (p.gainPerHourPct !== null && p.gainPerHourPct !== undefined)
    now.push(`one more hour lowers the noise by ${r1(p.gainPerHourPct)}%`)
  if (now.length) parts.push(now.join('; ') + '.')
  if (rollup && p.unmeasured) parts.push(`${p.unmeasured} filter${p.unmeasured === 1 ? '' : 's'} not measured.`)
  parts.push(rule)
  return parts.join(' ')
}

export function filterPlateau(fg: FilterGoal): LeastPlateau | null {
  const p = fg.plateauAt
  if (!p) return null
  return {
    progress: p.progress,
    hours: p.hours,
    effectiveHours: fg.measurement?.effectiveHours,
    gainPerHourPct: fg.measurement?.gainPerHourPct ?? null,
    filter: fg.filter,
    notMeasured: p.unmeasured,
    gainPct: p.gainPct,
  }
}
