import { api, query } from './client'
import { submitCommand, type CommandRecord } from './commands'

export interface CatalogObject {
  id: string
  designation: string
  name: string
  type: string
  aliases: string[] | null
  ra: number
  dec: number
  majorArcmin: number
  minorArcmin: number
  pa: number
  source: string
  magnitude?: number
  surfaceBrightness?: number
  brightness?: string
  brightScore?: number
  lists?: string[]
}

export interface CatalogMatch {
  object: CatalogObject
  score: number
  how: string
}

export type LinkStatus = 'auto' | 'in-frame' | 'suggested' | 'confirmed' | 'rejected'

export interface Link {
  subject: string
  subjectName: string
  object: CatalogObject
  method: string
  confidence: number
  why: string
  separation: number
  status: LinkStatus
}

export interface ReviewItem extends Link {
  decided: boolean
  state?: string
}

export interface SubjectRef {
  key: string
  name: string
  projectId?: number
  state?: string
  status: LinkStatus
  method: string
  done: boolean
  hours: number
}

export interface Tonight {
  up: boolean
  hours: number
  start?: string
  end?: string
  peakAlt: number | null
  peakAt?: string
  moonSeparation: number | null
  moonIllumination: number
  siteResolved: boolean
}

export type Completion = 'done' | 'in-progress' | 'not-started'

export interface CatalogueEntry {
  index: number
  label: string
  object: CatalogObject
  status: Completion
  hours: Record<string, number>
  subjects: SubjectRef[]
  tonight?: Tonight
  fit: Fit | null
}

export interface CatalogueSummary {
  key: string
  name: string
  total: number
  done: number
  inProgress: number
  notStarted: number
  upTonight: number
}

export interface NightInfo {
  start: string
  dusk?: string
  dawn?: string
  darkHours: number
  moonIllumination: number
  minAltitude: number
}

export interface Source {
  id: string
  name: string
  citation: string
  url: string
  licence: string
}

export interface Overview {
  catalogues: CatalogueSummary[]
  openMatches: number
  night?: NightInfo
  siteError?: string
  sources: Source[]
}

export interface Fit {
  fill: number
  panels: number
  columns: number
  rows: number
  category: 'one' | 'few' | 'many'
}

export interface ObjectDetail extends CatalogueEntry {
  links: Link[]
  months: number[]
  lists: { key: string; name: string; total: number }[] | null
}

export interface RigBasis {
  source: 'fits-headers' | 'none'
  frames: number
  from: string | null
  to: string | null
  camera: string | null
  telescope: string | null
  guideFrames: number
  hfrFrames: number
}

export interface Rig {
  focalLength: number | null
  pixelSize: number | null
  widthPx: number | null
  heightPx: number | null
  scale: number | null
  widthDeg: number | null
  heightDeg: number | null
  colour: boolean | null
  filters: string[]
  typicalHfr: number | null
  typicalGuideRms: number | null
  exposures: Record<string, number>
  basis: RigBasis
}

export interface SkyNight {
  night: string
  mag: number
  frames: number
  filter: string
}

export interface SkyBasis {
  source: 'measured' | 'config' | 'none'
  method?: string | null
  filter: string | null
  band?: string | null
  nights: number
  frames: number
  from: string | null
  to: string | null
  perNight: SkyNight[]
  reason: string | null
  stale?: boolean
  error?: string | null
}

export interface HalphaMap {
  state: 'ready' | 'loading' | 'failed' | 'off'
  source: string | null
  fetchedAt: string | null
  error: string | null
}

export interface FinderRow {
  object: CatalogObject
  group: string
  fit: Fit
  brightness: string
  brightScore: number | null
  narrowband: string
  halpha?: { rayleigh: number; peak: number; radiusDeg: number } | null
  months: number[]
  bestMonths: number[] | null
  tonightHours: number
  score: number
  imaged: boolean
  subjects: SubjectRef[] | null
  rotation: number
  catalogueGap: boolean
}

export interface FinderResult {
  total: number
  rows: FinderRow[]
  siteError?: string
  frame?: { widthDeg: number | null; heightDeg: number | null; scale: number | null } | null
  rig?: Rig | null
  rigError?: string | null
  skyBrightness: number | null
  skyBrightnessBasis?: SkyBasis | null
  halphaMap?: HalphaMap | null
}

export interface FinderQuery {
  fit?: string[]
  types?: string[]
  months?: number[]
  minFill?: number
  imaged?: boolean
  sort?: string
  limit?: number
}

export interface Criterion {
  name: string
  rule: string
  you: string
  result: 'pass' | 'fail' | 'open'
}

export interface Region {
  ra: number
  dec: number
  width: number
  height: number
  rotation: number
}

export interface Collab {
  id: string
  name: string
  coordinator: string
  status: string
  kind: string
  created: string
  notes?: string
  region: Region
  near?: string
  goals: Record<string, number>
  progress: Record<string, number>
  summary?: {
    joined: number
    declined: number
    reporters: number
    contributions: number
    firstNight?: string
    lastNight?: string
  }
  fits: boolean
  criteria: Criterion[]
  panels: number
  columns: number
  rows: number
  coverage: number | null
  tonight?: Tonight
  curve?: { at: string; alt: number }[]
  months: number[]
  have: {
    subject: string
    name: string
    projectId?: number
    hours: Record<string, number>
    lastNight?: string
    subs: number
  }[]
}

export interface CollabsView {
  enabled: boolean
  fetchedAt?: string
  error?: string
  sky?: { telescopes: number; online: number; imaging: number }
  open: Collab[]
  closed: Collab[]
  closedTotal: number
  rig: Rig | null
  rigError?: string | null
  skyBrightness?: number | null
  skyBrightnessBasis?: SkyBasis | null
  night?: NightInfo
  siteError?: string
}

export const searchCatalog = (q: string, limit = 20) =>
  api.get<CatalogMatch[]>('/catalog/search' + query({ q, limit }))

export const getOverview = () => api.get<Overview>('/catalogues')

export const getCatalogue = (key: string) =>
  api.get<CatalogueEntry[]>('/catalogues/' + encodeURIComponent(key))

export const getObject = (id: string) =>
  api.get<ObjectDetail>('/catalog/objects/' + encodeURIComponent(id))

export const getMatches = (decided = true) =>
  api.get<ReviewItem[]>('/catalog/matches' + query({ decided: decided ? 1 : undefined }))

export const getFinder = (q: FinderQuery) =>
  api.get<FinderResult>(
    '/finder' +
      query({
        fit: q.fit?.join(','),
        types: q.types?.join(','),
        months: q.months?.join(','),
        minFill: q.minFill,
        imaged: q.imaged ? 'show' : undefined,
        sort: q.sort,
        limit: q.limit,
      }),
  )

export const getCollabs = () => api.get<CollabsView>('/collabs')

export type Decision = '' | 'confirmed' | 'rejected'

export function decideMatch(l: Link, before: Decision, after: Decision): Promise<CommandRecord> {
  return submitCommand('catalog.match', {
    subject: l.subject,
    subject_name: l.subjectName,
    object_id: l.object.id,
    object_name: label(l.object),
    method: l.method,
    confidence: l.confidence,
    before,
    after,
  })
}

export function label(o: CatalogObject): string {
  return o.name ? `${o.designation} ${o.name}` : o.designation
}

export function addLink(
  o: CatalogObject,
  step: 'frame' | 'mosaic',
  extra: Record<string, string | number | undefined> = {},
) {
  const q: Record<string, string> = { object: o.id, step }
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== '') q[k] = String(v)
  }
  return { name: 'add', query: q }
}

export const TYPE_LABELS: Record<string, string> = {
  galaxy: 'Galaxy',
  'galaxy-group': 'Galaxy group',
  emission: 'Emission nebula',
  reflection: 'Reflection nebula',
  nebula: 'Nebula',
  dark: 'Dark nebula',
  pn: 'Planetary nebula',
  snr: 'Supernova remnant',
  'open-cluster': 'Open cluster',
  globular: 'Globular cluster',
  'cluster-nebula': 'Cluster and nebula',
  star: 'Star',
  other: 'Other',
}

export function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t
}

export function size(o: Pick<CatalogObject, 'majorArcmin' | 'minorArcmin'>): string {
  const fmt = (m: number) =>
    m >= 60
      ? `${(m / 60).toFixed(m >= 600 ? 0 : 1)}°`
      : `${m >= 10 ? Math.round(m) : m.toFixed(1)}′`
  if (!o.majorArcmin) return 'size unknown'
  if (!o.minorArcmin || Math.abs(o.minorArcmin - o.majorArcmin) < 0.05)
    return '≈ ' + fmt(o.majorArcmin)
  return `${fmt(o.majorArcmin)} × ${fmt(o.minorArcmin)}`
}

export function hours(h: number): string {
  if (!h) return '0 h'
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`
}

export function filterColour(f: string): string {
  const k = f.toUpperCase().replace(/[^A-Z]/g, '')
  if (k.startsWith('HA') || k === 'H') return 'var(--ha)'
  if (k.startsWith('OIII') || k === 'O') return 'var(--oiii)'
  if (k.startsWith('SII') || k === 'S') return 'var(--sii)'
  if (k.startsWith('R')) return 'var(--red)'
  if (k.startsWith('G')) return 'var(--green)'
  if (k.startsWith('B')) return 'var(--blue)'
  return 'var(--lum)'
}

export function filterOrder(a: string, b: string): number {
  const order = ['L', 'R', 'G', 'B', 'H', 'O', 'S']
  const key = (f: string) => {
    const k = f.toUpperCase().replace(/[^A-Z]/g, '')
    const c = k.startsWith('HA')
      ? 'H'
      : k.startsWith('OIII')
        ? 'O'
        : k.startsWith('SII')
          ? 'S'
          : (k[0] ?? '')
    const i = order.indexOf(c)
    return i < 0 ? 99 : i
  }
  return key(a) - key(b) || a.localeCompare(b)
}

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function raText(deg: number): string {
  const h = (((deg / 15) % 24) + 24) % 24
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  const ss = Math.round(((h - hh) * 60 - mm) * 60)
  return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m ${String(ss % 60).padStart(2, '0')}s`
}

export function decText(deg: number): string {
  const s = deg < 0 ? '−' : '+'
  const a = Math.abs(deg)
  const d = Math.floor(a)
  const m = Math.round((a - d) * 60)
  return `${s}${String(d).padStart(2, '0')}° ${String(m % 60).padStart(2, '0')}′`
}

export function rigFrame(r: Rig | null | undefined): { w: number; h: number } | null {
  if (!r || r.widthDeg === null || r.heightDeg === null) return null
  return { w: r.widthDeg, h: r.heightDeg }
}

function monthYear(v: string | null): string {
  if (!v) return ''
  return new Date(v).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function rigSource(r: Rig | null | undefined): string {
  const b = r?.basis
  if (!r || !b || b.source === 'none' || !b.frames)
    return 'Rig unknown: no light frames with FITS headers yet.'
  const kit = [b.camera, b.telescope].filter(Boolean).join(' on ')
  const span = b.from && b.to ? `, ${monthYear(b.from)} to ${monthYear(b.to)}` : ''
  return `From the FITS headers of ${b.frames} light ${b.frames === 1 ? 'frame' : 'frames'}${span}${kit ? ' (' + kit + ')' : ''}.`
}

export function skySource(mag: number | null | undefined, b: SkyBasis | null | undefined): string {
  if (!b) return 'Sky brightness not measured yet: the API sent no basis for it.'
  if (b.source === 'none' || mag === null || mag === undefined)
    return `Sky brightness not measured yet: ${b.reason ?? 'the API gave no reason'}.`
  const band = b.band ? b.band + ' ' : ''
  if (b.source === 'config')
    return `Sky ${mag.toFixed(2)} ${band}mag/arcsec², set in discover.sky-brightness, not measured.`
  const span = b.from && b.to ? `, ${b.from} to ${b.to}` : ''
  const nights = b.perNight
    .map((n) => `${n.night} ${n.mag.toFixed(2)} (${n.frames} ${n.filter})`)
    .join(', ')
  const parts = [
    `Sky ${mag.toFixed(2)} ${band}mag/arcsec², measured from ${b.filter ? b.filter + ' ' : ''}subs: ${b.frames} ${b.frames === 1 ? 'frame' : 'frames'} over ${b.nights} ${b.nights === 1 ? 'night' : 'nights'}${span}.`,
  ]
  if (nights) parts.push(`Per night: ${nights}.`)
  if (b.method) parts.push(`Method: ${b.method}.`)
  if (b.stale) parts.push(`Stale: ${b.error ?? 'the last re-measure failed'}.`)
  return parts.join(' ')
}

export function halphaSource(m: HalphaMap | null | undefined): string {
  if (!m) return 'H-α unknown: no H-α map.'
  switch (m.state) {
    case 'ready':
      return `H-α from ${m.source ?? 'an all-sky H-α map'}${m.fetchedAt ? ', fetched ' + new Date(m.fetchedAt).toLocaleDateString('en-GB') : ''}.`
    case 'loading':
      return 'H-α map still loading, so H-α shows unknown for now.'
    case 'failed':
      return `H-α map failed to load${m.error ? ': ' + m.error : ''}, so H-α shows unknown.`
    default:
      return 'H-α lookup is off, so H-α shows unknown.'
  }
}
