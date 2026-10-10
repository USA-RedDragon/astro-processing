import { api, query } from './client'
import { submitCommand } from './commands'
import type { Rig as DiscoverRig } from './discover'

export interface SkyPoint {
  ra: number
  dec: number
}

export type Footprint = [SkyPoint, SkyPoint, SkyPoint, SkyPoint]

export interface Rig {
  widthDeg: number
  heightDeg: number
  scaleArcsec: number
}

export interface PlannedPanel {
  n: number
  row: number
  col: number
  centre: SkyPoint
  rotationDeg: number
  footprint: Footprint | null
  covers: number
}

export interface FramingOption {
  id: string
  kind: string
  name: string
  detail: string
  rows: number
  cols: number
  rotationDeg: number
  overlapPct: number
  coverage: number
  panels: PlannedPanel[]
  hours: number | null
  nights: number | null
  seasons: number | null
  cost: string
  recommended: boolean
}

export interface FramingBasis {
  hoursPerPanel: number | null
  hoursPerPanelSource: string | null
  targets: number
  hoursPerClearNight: number | null
  clearNightsPerSeason: number | null
  historyNights: number
  reason: string | null
}

export interface Framing {
  rig: Rig
  rigInfo?: DiscoverRig | null
  rotation: number
  suggestedRotation: number
  overlap: number
  overlapDefault: number
  overlapSource: 'default' | 'request'
  minAltitude: number
  minAltitudeSource: 'default' | 'request'
  nightHours: number | null
  basis: FramingBasis
  bestMonths: string[]
  siteKnown: boolean
  options: FramingOption[]
  chosen?: FramingOption
}

export interface FramingRequest {
  ra: number
  dec: number
  majorArcmin: number
  minorArcmin: number | null
  pa: number | null
  rotation?: number
  overlap?: number
  rows?: number
  cols?: number
  brick?: boolean
  hoursPerPanel?: number
  minAltitude?: number
}

export interface PanelFilter {
  filter: string
  object?: string
  source: 'goal' | 'ts' | 'none'
  kind?: string
  goal?: number
  achieved?: number
  snr?: number
  progress: number
  effectiveHours: number
  hoursNeeded: number
  hoursBasis?: 'effective' | 'raw'
  plannedHours?: number
  desired?: number
  accepted?: number
  plateau?: boolean
  done?: boolean
  doneReason?: 'goal' | 'plateau' | 'plan'
  lowConfidence?: boolean
}

export interface MosaicPanel {
  number: number
  targetId: number
  targetGuid: string
  target: string
  objects: string[]
  row: number | null
  col: number | null
  ra: number
  dec: number
  rotation: number
  footprint: Footprint | null
  filters: PanelFilter[] | null
  progress: number
  weakest: string
  pastGoal: boolean
}

export interface Seam {
  project: string
  filter: string
  panelA: number
  panelB: number
  level: number
  difference: number
  slopeX: number
  slopeY: number
  step: number
  profile: string
  noiseA: number
  noiseB: number
  noiseRatio: number
  samples: number
  ok: boolean
  problems: string
  measuredAt: string
  starMatches?: number | null
  registrationMedianPx?: number | null
  registrationP90Px?: number | null
  starFluxRatio?: number | null
  colourMismatch?: number | null
  colourReference?: string | null
}

export interface FilterNoise {
  filter: string
  median: number | null
  p90: number | null
  max: number | null
  maxPanel: number | null
  tiles: number
  measuredAt: string | null
}

export interface SeamStatus {
  filter: string
  measured: boolean
  measuredAt: string | null
  pairs: number
}

export interface PanelHealth {
  filter: string
  panel: number
  noise: number
  gapFraction: number
  gapDeg2: number
  gapWhere: string
  fluxScale?: number | null
}

export interface MosaicBuild {
  Filter: string
  Panels: number
  PanelsTotal: number
  UpdatedAt: string
}

export interface SeamLimits {
  levelSigma: number
  stepSigma: number
  noiseRatio: number
  minBlocks: number
  registrationP90Px: number
  minStarMatches: number
  colourMismatch: number
  gapFraction: number
}

export interface HoursLeft {
  effective: number
  effectiveFilters: number
  raw: number
  rawFilters: number
  unknownFilters: number
}

export interface MosaicDetail {
  project: string
  projectGuid: string
  ts: { id: number; priority: number; state: number; minimumTime: number; minimumAltitude: number }
  adopted: boolean
  rows: number
  cols: number
  rotation: number
  layout: string | null
  rigKnown: boolean
  filters: string[] | null
  panels: MosaicPanel[] | null
  complete: number
  average: number
  weakestPanel: number
  weakestFilter: string
  effectiveHours: number
  hoursLeft: HoursLeft
  balancing: {
    panelDeficit: number
    panelDeficitSet: boolean
    mosaicCompletion: number
    on: boolean
    onWeight: number
  }
  seams: Seam[]
  health: PanelHealth[]
  needs: string[]
  seamLimits: SeamLimits
  mosaics?: MosaicBuild[] | null
  noise?: FilterNoise[] | null
  seamStatus?: SeamStatus[] | null
}

export interface MosaicSummary {
  project: string
  projectGuid: string
  panels: number
  adopted: boolean
  complete: number
  average: number
  weakestPanel: number
  weakestFilter: string
  seamWarnings: number
  balancing: boolean
}

export interface SeasonPace {
  hours: number
  nights: number
  from?: string
  to?: string
  seasonStart: string
  seasonEnd: string
}

export interface SeasonBasis {
  hoursPerImagingNight: number | null
  imagingNightsPerSeason: number | null
  imagingNightsPerMonth: {
    month: number
    name: string
    nights: number | null
    years: number
    spanYears: number
  }[]
  usableMonths: number[] | null
  historyFrom: string | null
  historyTo: string | null
  historyNights: number
  projectNights: number
  insufficientHistory: boolean
  reason: string | null
}

export interface EffectiveRatio {
  value: number
  subs: number
  scope: 'project' | 'all'
}

export interface ProjectionInputs {
  hoursPerSeason: number
  pace: string
  items: number
  stepHours: number
  maxSeasons: number
  goalHoursSource: string
  effectivePerRaw: EffectiveRatio | null
}

export interface SeasonPlan {
  project: string
  strategy: string
  strategyInForce: string
  projection: ProjectionInputs | null
  pace: string | null
  hoursPerSeason: number | null
  basis?: SeasonBasis | null
  lastSeason?: SeasonPace
  currentSeason?: SeasonPace
  inSeason: boolean
  nightsLeft: number
  darkHoursThreshold: number
  rows: { index: number; name: string; weakest: number; average: number; done: boolean }[]
  finishSeason: number
  compare: Record<string, number>
  months: { month: number; name: string; hours: number }[]
  siteKnown: boolean
  goalHoursSource: string
  effectivePerRaw: EffectiveRatio | null
  panelPriority: {
    panel: number
    hoursLeft: number
    rawHoursLeft: number
    monthsLeft: number
    priority: number
    lastUsableMonth?: string
    thisSeason: boolean
  }[]
}

export interface MosaicHistory {
  nights: string[]
  panels: { number: number; hours: number[] }[]
}

export interface AdoptedPanel {
  targetGuid: string
  target: string
  panel: number
  row: number
  col: number
}

export interface Adoption {
  id: number
  subject: string
  projectGuid?: string
  project: string
  kind: 'mosaic' | 'not_mosaic' | 'frames'
  confidence: string
  rule: string
  issue: string
  suggestion: string
  status: 'proposed' | 'auto' | 'accepted' | 'rejected'
  clean: boolean
  decidedBy?: string
  decidedAt?: string
  foundAt?: string
  wordedAt?: string
  panels?: AdoptedPanel[] | null
  frames?: {
    object: string
    count: number
    target?: string
    separationDeg: number | null
    nearest?: string
    coords?: boolean
    nameMatch?: boolean
    projectNamed?: string
  }
}

export interface AdoptionReport {
  dryRun: boolean
  clean: number
  new: number
  review: number
  unchanged: number
  changed: number
  items: Adoption[]
}

export const RULE_PANEL_DEFICIT = 'Panel Deficit'

export const listMosaics = () => api.get<MosaicSummary[]>('/mosaics/projects')
export const getMosaic = (key: string) =>
  api.get<MosaicDetail>('/mosaics/projects/' + encodeURIComponent(key))
export const getSeasons = (key: string, strategy: string, pace: string) =>
  api.get<SeasonPlan>(
    '/mosaics/projects/' + encodeURIComponent(key) + '/seasons' + query({ strategy, pace }),
  )
export const getHistory = (key: string) =>
  api.get<MosaicHistory>('/mosaics/projects/' + encodeURIComponent(key) + '/history')
export const listAdoptions = () => api.get<Adoption[]>('/mosaics/adoption')
export const runAdoption = (dryRun: boolean) =>
  api.post<AdoptionReport>('/mosaics/adoption/run', { dryRun })
export const frame = (req: FramingRequest, signal?: AbortSignal) =>
  api.post<Framing>('/mosaics/framing', req, signal)
export const mosaicPreviews = (project: string) =>
  api.get<{ filter: string; preview_url?: string; panels: number; panels_total: number }[]>(
    '/mosaics' + query({ project }),
  )

export function setBalancing(d: MosaicDetail, on: boolean) {
  const before = d.balancing.panelDeficitSet ? d.balancing.panelDeficit : null
  return submitCommand('ruleweight.edit', {
    project_id: d.ts.id,
    project_guid: d.projectGuid,
    project_name: d.project,
    changes: [{ rule: RULE_PANEL_DEFICIT, before, after: on ? d.balancing.onWeight : 0 }],
  })
}

export interface AdoptionDecision {
  id: number
  subject: string
  title: string
  before: Adoption['status']
  after: Adoption['status']
}

export function adoptionDecision(a: Adoption, choice: 'accepted' | 'rejected'): AdoptionDecision {
  return {
    id: a.id,
    subject: a.subject,
    title: a.project,
    before: a.status,
    after: a.status === choice ? 'proposed' : choice,
  }
}

export function keepOrder(before: Adoption[], after: Adoption[]): Adoption[] {
  const at = new Map(before.map((a, i) => [a.id, i]))
  return after
    .map((a, i) => ({ a, k: at.get(a.id) ?? before.length + i }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.a)
}

export function adopt(decisions: AdoptionDecision[]) {
  return submitCommand('mosaic.adopt', { decisions })
}

const deg = Math.PI / 180

export function project(centre: SkyPoint, p: SkyPoint): [number, number] {
  const d0 = centre.dec * deg
  const d = p.dec * deg
  const da = (p.ra - centre.ra) * deg
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(da)
  const xi = (Math.cos(d) * Math.sin(da)) / cosc / deg
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(da)) / cosc / deg
  return [xi, eta]
}

export function meanCentre(points: SkyPoint[]): SkyPoint {
  let x = 0
  let y = 0
  let z = 0
  for (const p of points) {
    x += Math.cos(p.dec * deg) * Math.cos(p.ra * deg)
    y += Math.cos(p.dec * deg) * Math.sin(p.ra * deg)
    z += Math.sin(p.dec * deg)
  }
  const ra = (Math.atan2(y, x) / deg + 360) % 360
  const dec = Math.atan2(z, Math.hypot(x, y)) / deg
  return { ra, dec }
}
