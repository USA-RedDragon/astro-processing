<script setup lang="ts">
import PageHead from '../components/PageHead.vue'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  adopt,
  adoptionDecision,
  keepOrder,
  getHistory,
  getMosaic,
  getSeasons,
  listAdoptions,
  listMosaics,
  mosaicPreviews,
  runAdoption,
  setBalancing,
  project,
  meanCentre,
  type Adoption,
  type AdoptionDecision,
  type MosaicDetail,
  type MosaicHistory,
  type MosaicPanel,
  type MosaicSummary,
  type PanelFilter,
  type Seam,
  type SeamLimits,
  type SeasonPlan,
  type SkyPoint,
} from '../api/mosaics'
import { onEvent } from '../api/events'
import { errorToast, notifyCommand } from '../shell'
import { filterColor, pct, r1 } from '../api/planning'
import { filterShort } from '../plan'
import { MONTHS } from '../api/discover'
import { shortDate } from '../format'

const props = defineProps<{ projectId?: string }>()
const route = useRoute()
const router = useRouter()

type Tab = 'panels' | 'seams' | 'seasons' | 'adopt'
const tab = ref<Tab>((route.query.tab as Tab) || 'panels')
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t } }))

const list = ref<MosaicSummary[]>([])
const detail = ref<MosaicDetail | null>(null)
const history = ref<MosaicHistory | null>(null)
const previews = ref<
  { filter: string; preview_url?: string; panels: number; panels_total: number }[]
>([])
const adoptions = ref<Adoption[]>([])
const loadError = ref('')
const filter = ref('weakest')
const night = ref(-1)
let skipReload = false

const key = computed(() => props.projectId || list.value[0]?.projectGuid || '')

async function loadList() {
  try {
    list.value = await listMosaics()
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function loadDetail() {
  if (!key.value) {
    detail.value = null
    return
  }
  try {
    const d = await getMosaic(key.value)
    if (props.projectId && props.projectId !== d.projectGuid) {
      router.replace({ name: 'mosaic', params: { projectId: d.projectGuid }, query: route.query })
      return
    }
    detail.value = d
    if (filter.value !== 'weakest' && !(d.filters ?? []).includes(filter.value))
      filter.value = 'weakest'
    const [h, p] = await Promise.all([
      getHistory(key.value),
      mosaicPreviews(d.project).catch(() => []),
    ])
    history.value = h
    previews.value = p
    night.value = h.nights.length - 1
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function loadAdoptions() {
  try {
    adoptions.value = keepOrder(adoptions.value, await listAdoptions())
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function loadAll() {
  await loadList()
  await Promise.all([loadDetail(), loadAdoptions(), loadSeasons()])
}

let off: (() => void) | undefined
let offMosaic: (() => void) | undefined
onMounted(() => {
  loadAll()
  off = onEvent('command', (e: { data?: { status?: string } }) => {
    if (e.data?.status === 'applied' || e.data?.status === 'saved') loadAll()
  })
  offMosaic = onEvent('mosaic', () => loadDetail())
})
onUnmounted(() => {
  off?.()
  offMosaic?.()
})
watch(key, () => {
  loadDetail()
  if (strategy.value) {
    skipReload = true
    strategy.value = ''
  }
  loadSeasons()
})

function pick(guid: string) {
  router.push({ name: 'mosaic', params: { projectId: guid }, query: { tab: tab.value } })
}

const PRIORITY = ['Low', 'Normal', 'High']
const panels = computed<MosaicPanel[]>(() => detail.value?.panels ?? [])
const filters = computed(() => detail.value?.filters ?? [])

function pf(p: MosaicPanel, f: string): PanelFilter | undefined {
  return (p.filters ?? []).find((x) => x.filter === f)
}

function shown(p: MosaicPanel): PanelFilter | undefined {
  if (filter.value === 'weakest') return pf(p, p.weakest)
  return pf(p, filter.value)
}

function placeholder(x?: PanelFilter): boolean {
  return !!x && x.source === 'ts' && (x.desired ?? 0) <= 1
}

function metric(x?: PanelFilter): string {
  if (!x) return 'no data'
  if (x.source === 'goal' && x.snr) return 'SNR ' + r1(x.snr)
  if (x.source === 'ts') return `${x.accepted ?? 0}/${x.desired ?? 0}${placeholder(x) ? '*' : ''}`
  return r1(x.effectiveHours) + ' h'
}

const EPS = 1e-9

const weakestPairs = computed(() => {
  const d = detail.value
  if (!d) return []
  const out: { panel: number; filter: string }[] = []
  for (const p of panels.value)
    for (const f of p.filters ?? [])
      if (Math.abs(Math.min(1, f.progress) - d.complete) < EPS)
        out.push({ panel: p.number, filter: f.filter })
  return out
})

const pairCount = computed(() =>
  panels.value.reduce((n, p) => n + (p.filters ?? []).length, 0),
)

const weakestPanels = computed(() => {
  const d = detail.value
  if (!d) return new Set<number>()
  const set = new Set(
    panels.value.filter((p) => Math.abs(p.progress - d.complete) < EPS).map((p) => p.number),
  )
  return set.size < panels.value.length ? set : new Set<number>()
})

function joinList(xs: string[], max = 6): string {
  if (xs.length > max) return xs.slice(0, max).join(', ') + `, and ${xs.length - max} more`
  if (xs.length <= 1) return xs[0] ?? ''
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]
}

const placeholders = computed(() =>
  panels.value.flatMap((p) =>
    (p.filters ?? [])
      .filter((f) => placeholder(f))
      .map((f) => `Panel ${p.number} ${f.filter}`),
  ),
)

const plateaus = computed(() =>
  panels.value.flatMap((p) =>
    (p.filters ?? [])
      .filter((f) => f.doneReason === 'plateau')
      .map((f) => `Panel ${p.number} ${f.filter} at ${pct(f.progress)}`),
  ),
)

function shade(v: number): string {
  return `oklch(${(0.32 + 0.45 * Math.max(0, Math.min(1, v))).toFixed(2)} 0.09 250)`
}

const tiles = computed(() => {
  const d = detail.value
  if (!d) return []
  const maxP = Math.max(0.0001, ...panels.value.map((p) => Math.min(1, shown(p)?.progress ?? 0)))
  return panels.value.map((p) => {
    const x = shown(p)
    const v = Math.min(1, x?.progress ?? 0)
    const rel = v / maxP
    const weakest = weakestPanels.value.has(p.number)
    return {
      p,
      x,
      style: {
        gridRow: p.row === null ? 'auto' : String(p.row + 1),
        gridColumn: p.col === null ? 'auto' : String(p.col + 1),
        background: shade(rel),
        color: rel > 0.55 ? 'var(--ink-dark)' : 'var(--ink-light)',
        outline: weakest ? '2px solid var(--warn)' : 'none',
      },
      label:
        (filter.value === 'weakest' ? 'Weakest: ' + (p.weakest || '—') : filter.value) +
        (weakest ? ' · holds the mosaic back' : p.pastGoal ? ' · past its goal' : ''),
      bars: (p.filters ?? []).map((f) => ({
        f: f.filter,
        w: pct(Math.min(1, f.progress)),
        v: metric(f),
        color: filterColor(f.filter),
      })),
    }
  })
})

const gridCols = computed(() =>
  detail.value?.rigKnown
    ? `repeat(${Math.max(1, detail.value?.cols ?? 1)}, minmax(0, 1fr))`
    : 'repeat(auto-fill, minmax(12rem, 1fr))',
)

function openPanel(p: MosaicPanel) {
  const d = detail.value
  if (!d?.ts.id) return
  router.push({
    name: 'target',
    params: { projectId: String(d.ts.id) },
    query: { target: p.targetId ? String(p.targetId) : undefined, tab: 'goal' },
  })
}

function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}

function hoursText(h: number): string {
  return h >= 10 ? String(Math.round(h)) : r1(h)
}

const leftParts = computed(() => {
  const h = detail.value?.hoursLeft
  if (!h) return null
  const parts: { value: string; note: string }[] = []
  if (h.effectiveFilters)
    parts.push({
      value: `${hoursText(h.effective)} h effective`,
      note: `from the goal model for ${plural(h.effectiveFilters, 'panel filter')}`,
    })
  if (h.rawFilters)
    parts.push({
      value: `${hoursText(h.raw)} h raw`,
      note: `of exposure left in the scheduler plans of ${plural(h.rawFilters, 'panel filter')} with no goal measurement`,
    })
  const unknown = h.unknownFilters
    ? `${plural(h.unknownFilters, 'panel filter')} with no estimate`
    : ''
  if (!parts.length)
    return { big: unknown ? 'Unknown' : '0 h', note: unknown || 'every panel and filter is done' }
  const rest = parts.slice(1).map((p) => 'plus ' + p.value + ', ' + p.note)
  return {
    big: parts[0]!.value,
    note: [parts[0]!.note, ...rest, unknown ? 'plus ' + unknown : ''].filter(Boolean).join('; '),
  }
})

const stats = computed(() => {
  const d = detail.value
  if (!d) return null
  const pairs = weakestPairs.value
  let completeNote = 'No panel has data yet'
  if (pairs.length && pairs.length === pairCount.value && pairCount.value > 1)
    completeNote = `Every panel and filter is at ${pct(d.complete)}`
  else if (pairs.length === 1) {
    const w = panels.value.find((p) => p.number === pairs[0]!.panel)
    const wf = w ? pf(w, pairs[0]!.filter) : undefined
    completeNote = `Set by the weakest panel: Panel ${pairs[0]!.panel} ${pairs[0]!.filter}${wf ? ', ' + metric(wf) : ''}`
  } else if (pairs.length > 1)
    completeNote = `Tied at ${pct(d.complete)}: ${joinList(pairs.map((x) => `Panel ${x.panel} ${x.filter}`))}`
  return {
    complete: pct(d.complete),
    completeNote,
    average: pct(d.average),
    effective: r1(d.effectiveHours) + ' h effective so far',
  }
})

const previewUrl = computed(() => {
  const f = filter.value === 'weakest' ? detail.value?.weakestFilter : filter.value
  return (
    previews.value.find((p) => p.filter === f)?.preview_url || previews.value[0]?.preview_url || ''
  )
})

const latestNight = computed(() => night.value >= (history.value?.nights.length ?? 0) - 1)

const nightLabel = computed(() => {
  const h = history.value
  if (!h || !h.nights.length) return 'no nights yet'
  const i = Math.max(0, Math.min(h.nights.length - 1, night.value))
  return i === h.nights.length - 1 ? 'latest · ' + h.nights[i] : h.nights[i]
})

const schematic = computed(() => {
  const d = detail.value
  const h = history.value
  if (!d) return []
  const withFp = panels.value.filter((p) => p.footprint)
  if (!withFp.length) return []
  const all: SkyPoint[] = withFp.flatMap((p) => p.footprint!)
  const c = meanCentre(all)
  const xy = (pt: SkyPoint): [number, number] => {
    const [xi, eta] = project(c, pt)
    return [-xi, -eta]
  }
  const pts = all.map(xy)
  const minX = Math.min(...pts.map((p) => p[0]))
  const maxX = Math.max(...pts.map((p) => p[0]))
  const minY = Math.min(...pts.map((p) => p[1]))
  const maxY = Math.max(...pts.map((p) => p[1]))
  const scale = Math.min(456 / Math.max(1e-6, maxX - minX), 296 / Math.max(1e-6, maxY - minY))
  const ox = 240 - ((minX + maxX) / 2) * scale
  const oy = 160 - ((minY + maxY) / 2) * scale
  const at = (n: number) => {
    const hp = h?.panels.find((x) => x.number === n)
    if (!hp || !hp.hours.length) return 0
    return hp.hours[Math.max(0, Math.min(hp.hours.length - 1, night.value))] ?? 0
  }
  const max = Math.max(0.0001, ...panels.value.map((p) => at(p.number)))
  return withFp.map((p) => {
    const corners = p.footprint!.map(xy).map(([x, y]) => [x * scale + ox, y * scale + oy])
    const cx = corners.reduce((a, q) => a + q[0]!, 0) / corners.length
    const cy = corners.reduce((a, q) => a + q[1]!, 0) / corners.length
    return {
      n: p.number,
      points: corners.map((q) => `${q[0]!.toFixed(1)},${q[1]!.toFixed(1)}`).join(' '),
      op: (0.08 + 0.75 * (at(p.number) / max)).toFixed(2),
      lx: cx.toFixed(1),
      ly: cy.toFixed(1),
      label: `${p.number} · ${r1(at(p.number))} h`,
      weakest: weakestPanels.value.has(p.number),
    }
  })
})

const balancing = computed(() => detail.value?.balancing)
const behindText = computed(() => {
  const set = weakestPanels.value
  if (!set.size) return 'No single panel is behind the others now.'
  const names = [...set].sort((a, b) => a - b).map((n) => 'Panel ' + n)
  return `${joinList(names)} ${set.size === 1 ? 'is' : 'are'} furthest behind now.`
})
const balancingText = computed(() => {
  const b = balancing.value
  if (!b) return ''
  return b.on
    ? `Panel Deficit is weighted ${b.panelDeficit}, so the scheduler adds weight to the panel furthest behind its goal and none to panels past it. ${behindText.value}`
    : `Panel Deficit is ${b.panelDeficitSet ? 'weighted 0' : 'not set'}, so the scheduler does not steer time to the panel that is behind. Turning it on sets it to ${b.onWeight}; Mosaic Completion stays at ${b.mosaicCompletion}.`
})
const busy = ref(false)

async function toggleBalancing() {
  const d = detail.value
  if (!d || busy.value) return
  busy.value = true
  try {
    notifyCommand(await setBalancing(d, !d.balancing.on))
    await loadDetail()
  } catch (e) {
    errorToast(e)
  } finally {
    busy.value = false
  }
}

interface SeamRow {
  pair: string
  severity: number
  value: string
  detail: string
  note: string
  ok: boolean
}

const limits = computed<SeamLimits | null>(() => detail.value?.seamLimits ?? null)

function severity(s: Seam, L: SeamLimits | null): number {
  if (!L) return s.ok ? 0 : 1
  const parts = [
    s.noiseRatio / L.noiseRatio,
    s.level / L.levelSigma,
    s.step / L.stepSigma,
    s.samples < L.minBlocks ? L.minBlocks / Math.max(1, s.samples) : 0,
  ]
  if ((s.starMatches ?? 0) >= L.minStarMatches && s.registrationP90Px != null)
    parts.push(s.registrationP90Px / L.registrationP90Px)
  if (s.colourMismatch != null) parts.push(Math.abs(s.colourMismatch) / L.colourMismatch)
  return Math.max(...parts)
}

const seamRows = computed<SeamRow[]>(() => {
  const d = detail.value
  if (!d) return []
  const L = limits.value
  const fx = (v: number | null | undefined, digits: number, unit = '') =>
    v === null || v === undefined ? '' : v.toFixed(digits) + unit
  return (d.seams ?? [])
    .map((s) => ({
      pair: `Panel ${s.panelA} ↔ Panel ${s.panelB} · ${s.filter}`,
      severity: severity(s, L),
      value: s.noiseRatio ? r1(s.noiseRatio) + '×' : '—',
      detail: [
        `level ${s.level.toFixed(2)}σ`,
        `step ${s.step.toFixed(2)}σ`,
        `${s.samples} blocks`,
        s.starMatches !== null && s.starMatches !== undefined
          ? `${s.starMatches} star matches`
          : '',
        s.registrationMedianPx !== null && s.registrationMedianPx !== undefined
          ? `registration ${fx(s.registrationMedianPx, 2, ' px')} median, ${fx(s.registrationP90Px, 2, ' px')} p90`
          : '',
        s.starFluxRatio !== null && s.starFluxRatio !== undefined
          ? `star flux ratio ${fx(s.starFluxRatio, 2)}`
          : '',
        s.colourMismatch !== null && s.colourMismatch !== undefined
          ? `colour mismatch ${Math.round(s.colourMismatch * 100)}%${s.colourReference ? ' against ' + s.colourReference.split(',').join(', ') : ''}`
          : '',
        s.measuredAt ? 'measured ' + shortDate(s.measuredAt) : '',
      ]
        .filter(Boolean)
        .join(' · '),
      note: s.ok ? 'Within limits. The seam should blend.' : s.problems,
      ok: s.ok,
    }))
    .sort((a, b) => b.severity - a.severity)
})
const builds = computed(() => detail.value?.mosaics ?? [])
const unmeasured = computed(() => {
  const d = detail.value
  if (!d) return []
  const st = d.seamStatus ?? []
  const missing = st.length
    ? st.filter((x) => !x.measured).map((x) => x.filter)
    : (d.filters ?? []).filter((f) => !new Set((d.seams ?? []).map((x) => x.filter)).has(f))
  return missing.map((f) => {
    const b = builds.value.find((x) => x.Filter === f)
    if (!b) return `${f} (no stacker build yet)`
    if (b.Panels < 2) return `${f} (only ${b.Panels} of ${b.PanelsTotal} panels built)`
    return `${f} (built ${shortDate(b.UpdatedAt)}, seams not measured yet)`
  })
})
const seamEmpty = computed(() => {
  if (!builds.value.length)
    return "The stacker hasn't built a mosaic of this project yet, so there are no seams to measure."
  const names = builds.value.map((b) => `${b.Filter} (${b.Panels} of ${b.PanelsTotal} panels)`)
  return `The stacker has built ${joinList(names)}, but no seam has been measured yet.`
})
function sig(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'not measured'
  return v.toPrecision(3)
}
const noiseRows = computed(() => (detail.value?.noise ?? []).filter((n) => n.median !== null))
function fluxScales(f: string): string {
  return (detail.value?.health ?? [])
    .filter((h) => h.filter === f && h.fluxScale !== null && h.fluxScale !== undefined)
    .sort((a, b) => a.panel - b.panel)
    .map((h) => `P${h.panel} ${h.fluxScale!.toFixed(2)}`)
    .join(' · ')
}
const seamNote = computed(() => {
  const L = limits.value
  const base =
    "Measured by the stacker on the matched overlaps: level and gradient step in units of the background noise σ, the two panels' noise ratio, star registration and star colour."
  if (!L) return base
  return `${base} A seam warns when the level differs by more than ${L.levelSigma}σ, the gradient step is over ${L.stepSigma}σ, one panel is over ${L.noiseRatio}× noisier, the overlap is under ${L.minBlocks} blocks, stars are misregistered by more than ${L.registrationP90Px} px at p90 (checked with ${L.minStarMatches} or more star matches), or star colour differs by more than ${Math.round(L.colourMismatch * 100)}% from the other filters. A coverage gap warns above ${Math.round(L.gapFraction * 100)}% of a panel's planned frame.`
})
const seamWarnings = computed(() => seamRows.value.filter((s) => !s.ok).length)
const showAllSeams = ref(false)
const seamsShown = computed(() =>
  showAllSeams.value ? seamRows.value : seamRows.value.slice(0, 5),
)
const gaps = computed(() => {
  const L = limits.value
  if (!L) return []
  return (detail.value?.health ?? []).filter((h) => h.gapFraction > L.gapFraction)
})

const strategy = ref('')
const pace = ref('measured')
const seasons = ref<SeasonPlan | null>(null)

async function loadSeasons() {
  if (!key.value) return
  try {
    const s = await getSeasons(key.value, strategy.value, pace.value)
    seasons.value = s
    if (!strategy.value) {
      skipReload = true
      strategy.value = s.strategy
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}
watch([strategy, pace], () => {
  if (skipReload) {
    skipReload = false
    return
  }
  loadSeasons()
})

const STRATEGY_NAME: Record<string, string> = {
  weakest: 'Weakest panel first',
  even: 'Even across panels',
  off: 'Balancing off',
}

const STRATEGY_METHOD: Record<string, string> = {
  weakest: 'each step of the season goes to the panel and filter furthest behind its goal, as Panel Deficit steers it',
  even: 'steps go round the unfinished panels and filters in turn; the scheduler has no rule for this',
  off: 'each season is split in proportion to the hours each panel and filter already has, the split seen so far; ones with no hours yet get time only after the others finish',
}

const PACE_NAME: Record<string, string> = {
  measured: 'measured from history',
  last: 'like last season',
  best: 'like the best season',
  worst: 'like the worst season',
}

function strategyLabel(st: string): string {
  return STRATEGY_NAME[st] ?? st
}

const strategyText = computed(() => {
  const s = seasons.value
  const st = strategy.value
  if (!s || !st) return ''
  const method = `${strategyLabel(st)}: ${STRATEGY_METHOD[st] ?? ''}.`
  if (s.hoursPerSeason === null || !s.projection) return method
  return `${method} Projected to finish ${finishIn(s.compare[st])}.`
})

const finishLabel = computed(() => {
  const s = seasons.value
  if (!s) return '…'
  if (s.hoursPerSeason === null || !s.projection) return 'Unknown'
  const f = s.compare[s.strategyInForce]
  if (!f) return `> ${s.projection.maxSeasons} seasons`
  return `≈ ${f} ${f === 1 ? 'season' : 'seasons'}`
})

const finishNote = computed(() => {
  const s = seasons.value
  if (!s) return ''
  if (s.hoursPerSeason === null || !s.projection)
    return s.basis?.reason ? 'No projection: ' + s.basis.reason : 'No projection yet'
  const pr = s.projection
  return `Projection at ${r1(pr.hoursPerSeason)} h effective a season (${PACE_NAME[pr.pace] ?? pr.pace}), with ${strategyLabel(s.strategyInForce).toLowerCase()} as set now`
})

function finishIn(n?: number): string {
  if (!n) return `after more than ${seasons.value?.projection?.maxSeasons ?? 0} seasons`
  return n === 1 ? 'this season' : `in season ${n}`
}

function monthYear(s: string): string {
  return new Date(s).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const paceText = computed(() => {
  const s = seasons.value
  const l = s?.lastSeason
  if (l)
    return `${r1(l.hours)} h effective over ${plural(l.nights, 'night')}${l.from && l.to ? `, ${monthYear(l.from)} to ${monthYear(l.to)}` : ''}`
  if (!s?.basis?.projectNights) return 'none, no nights of this project on record yet'
  const c = s.currentSeason
  return `none finished yet${c?.nights ? `; this season has ${plural(c.nights, 'night')} so far` : ''}`
})

const basisText = computed(() => {
  const s = seasons.value
  const b = s?.basis
  if (!s || !b) return ''
  if (s.hoursPerSeason === null)
    return (
      'Not enough history to project seasons' +
      (b.reason ? `: ${b.reason}.` : '.') +
      (b.historyNights ? ` ${plural(b.historyNights, 'imaging night')} on record so far.` : '')
    )
  const parts: string[] = []
  if (s.pace === 'measured' && b.hoursPerImagingNight !== null && b.imagingNightsPerSeason !== null)
    parts.push(
      `${b.hoursPerImagingNight < 1 ? b.hoursPerImagingNight.toFixed(2) : r1(b.hoursPerImagingNight)} h of this project per imaging night × ${r1(b.imagingNightsPerSeason)} imaging nights a season`,
    )
  else if (s.pace) parts.push(`${r1(s.hoursPerSeason)} h a season, ${PACE_NAME[s.pace] ?? s.pace}`)
  if (b.historyFrom && b.historyTo)
    parts.push(
      `from ${plural(b.historyNights, 'imaging night')}, ${monthYear(b.historyFrom)} to ${monthYear(b.historyTo)}`,
    )
  if (b.projectNights) parts.push(`${b.projectNights} of them on this mosaic`)
  if (b.usableMonths?.length)
    parts.push(`usable in ${b.usableMonths.map((m) => MONTHS[m - 1] ?? String(m)).join(', ')}`)
  const ratio = s.effectivePerRaw
  const conv =
    s.goalHoursSource === 'ts' && ratio
      ? ` Where a panel filter has no goal measurement, its scheduler plan in raw hours is converted at ${ratio.value} effective hours per raw hour, measured over ${plural(ratio.subs, 'accepted sub')} ${ratio.scope === 'project' ? 'of this mosaic' : 'of all targets'}.`
      : ''
  return 'Projection based on ' + parts.join(', ') + '.' + conv
})

const seasonText = computed(() => {
  const s = seasons.value
  if (!s) return ''
  if (!s.siteKnown) return 'Site unknown, so visibility is not modelled'
  return s.inSeason
    ? `In season · ${plural(s.nightsLeft, 'night')} left with at least ${s.darkHoursThreshold} h of usable dark time, before weather`
    : `Out of season · tonight has under ${s.darkHoursThreshold} h of usable dark time`
})

const imagingNights = computed(() =>
  (seasons.value?.basis?.imagingNightsPerMonth ?? []).filter((m) => m.nights !== null),
)

const monthCells = computed(() =>
  (seasons.value?.months ?? []).map((m) => ({
    ...m,
    bg: `oklch(${(0.34 + Math.min(1, m.hours / 8) * 0.42).toFixed(2)} 0.09 250)`,
    ink: m.hours >= 5 ? 'var(--ink-dark)' : 'var(--ink-light)',
  })),
)

const pushPanels = computed(() =>
  (seasons.value?.panelPriority ?? []).filter((x) => x.thisSeason).slice(0, 5),
)

async function applyStrategy() {
  const d = detail.value
  if (!d || strategy.value === 'even' || !strategy.value) return
  const want = strategy.value === 'weakest'
  if (d.balancing.on === want) {
    errorToast(new Error('Balancing already matches this plan.'), 'Already set')
    return
  }
  busy.value = true
  try {
    notifyCommand(await setBalancing(d, want))
    await loadDetail()
  } catch (e) {
    errorToast(e)
  } finally {
    busy.value = false
  }
}

const openAdoptions = computed(() => adoptions.value.filter((a) => a.status === 'proposed').length)
const cleanOpen = computed(() => adoptions.value.filter((a) => a.status === 'proposed' && a.clean))
const deciding = reactive(new Set<number>())

async function sendAdoption(ds: AdoptionDecision[]) {
  if (!ds.length || ds.some((d) => deciding.has(d.id))) return
  for (const d of ds) deciding.add(d.id)
  try {
    notifyCommand(await adopt(ds))
    for (const d of ds) {
      const a = adoptions.value.find((x) => x.id === d.id)
      if (a) a.status = d.after
    }
    await loadAdoptions()
  } catch (e) {
    errorToast(e)
    await loadAdoptions()
  } finally {
    for (const d of ds) deciding.delete(d.id)
  }
}

function decide(a: Adoption, choice: 'accepted' | 'rejected') {
  return sendAdoption([adoptionDecision(a, choice)])
}

function acceptAllClean() {
  return sendAdoption(cleanOpen.value.map((a) => adoptionDecision(a, 'accepted')))
}

const adoptRunning = ref(false)
async function rerunAdoption() {
  adoptRunning.value = true
  try {
    await runAdoption(false)
    await loadAdoptions()
  } catch (e) {
    errorToast(e)
  } finally {
    adoptRunning.value = false
  }
}

function adoptionTimes(a: Adoption): string {
  const parts: string[] = []
  if (a.foundAt) parts.push('found ' + shortDate(a.foundAt))
  if (a.wordedAt && a.wordedAt !== a.foundAt) parts.push('wording last changed ' + shortDate(a.wordedAt))
  if (a.decidedAt)
    parts.push(`decided ${shortDate(a.decidedAt)}${a.decidedBy ? ' by ' + a.decidedBy : ''}`)
  return parts.join(' · ')
}

function adoptionTitle(a: Adoption): string {
  return a.kind === 'frames' ? a.project + ' · unmatched subs' : a.project
}

function statusBadge(a: Adoption): { text: string; cls: string } | null {
  switch (a.status) {
    case 'accepted':
      return { text: 'Accepted', cls: 'ok' }
    case 'rejected':
      return { text: 'Rejected', cls: '' }
    case 'auto':
      return { text: 'Adopted', cls: 'ok' }
  }
  return a.clean ? { text: 'Clean', cls: 'info' } : null
}

const tabs = computed<[Tab, string][]>(() => [
  ['panels', 'Panels and goal'],
  ['seams', 'Seam health'],
  ['seasons', 'Seasons'],
  ['adopt', 'Adoption review' + (openAdoptions.value ? ' · ' + openAdoptions.value : '')],
])
</script>

<template>
  <main class="page wide">
    <PageHead context="Plan" :title="detail?.project ?? 'Mosaics'">
      <span v-if="detail">
        {{ panels.length }} panels,
        {{ detail.layout ?? "rig unknown, so the panels can't be placed on a grid" }}.
        {{ PRIORITY[detail.ts.priority] ?? 'Unknown' }} priority, minimum time
        {{ detail.ts.minimumTime }} min.
        {{ detail.adopted ? 'Linked by scheduler guid.' : 'Grouped by panel names until adopted.' }}
        <RouterLink
          v-if="detail.ts.id"
          :to="{ name: 'ProjectDetails', params: { id: String(detail.ts.id) } }"
          class="lnk"
          style="text-decoration: underline; text-underline-offset: 3px"
          >Project details and mosaic images</RouterLink
        >
      </span>
      <span v-else-if="!list.length && !loadError">
        No mosaics yet. Add one from Add target, or adopt your existing ones under Adoption review.
      </span>
      <template #actions>
        <label
          v-if="list.length"
          class="field"
          style="min-width: min(14rem, 100%); max-width: 100%"
        >
          <span>Mosaic</span>
          <select
            class="input"
            style="max-width: 100%"
            :value="key"
            @change="pick(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="m in list" :key="m.projectGuid" :value="m.projectGuid">
              {{ m.project }} · {{ m.panels }} panels · {{ pct(m.complete)
              }}{{ m.seamWarnings ? ' · ' + m.seamWarnings + ' seam warnings' : '' }}
            </option>
          </select>
        </label>
      </template>
    </PageHead>

    <p v-if="loadError" class="small" style="margin: 0; color: var(--bad)">{{ loadError }}</p>

    <div role="tablist" aria-label="Mosaic sections" class="tabs">
      <button
        v-for="[id, label] in tabs"
        :key="id"
        type="button"
        role="tab"
        :aria-selected="tab === id"
        :class="{ on: tab === id }"
        @click="tab = id"
      >
        {{ label }}
      </button>
    </div>

    <template v-if="tab === 'panels' && detail && stats">
      <div class="stats">
        <div class="stat warn">
          <div class="xsmall muted">Mosaic complete</div>
          <div class="big num">{{ stats.complete }}</div>
          <div class="xsmall">{{ stats.completeNote }}</div>
        </div>
        <div class="stat">
          <div class="xsmall muted">Average panel</div>
          <div class="big num">{{ stats.average }}</div>
          <div class="xsmall muted">{{ stats.effective }}</div>
        </div>
        <div class="stat">
          <div class="xsmall muted">Left to do</div>
          <div class="big num">{{ leftParts?.big }}</div>
          <div class="xsmall muted">{{ leftParts?.note }}</div>
        </div>
        <div class="stat">
          <div class="xsmall muted">To finish</div>
          <div class="big num">{{ finishLabel }}</div>
          <div class="xsmall muted">
            {{ finishNote }}
          </div>
        </div>
      </div>
      <div class="row" style="gap: 1.5rem; align-items: flex-start">
        <section class="card" style="flex: 3 1 36rem" aria-labelledby="grid-h">
          <div class="spread" style="align-items: center">
            <div>
              <h2 id="grid-h">Progress per panel</h2>
              <p class="small muted" style="margin: 0.125rem 0 0">
                {{
                  detail.rigKnown
                    ? `By grid row and column in the mosaic's own frame, rotated ${Math.round(detail.rotation)}°.`
                    : "The rig is unknown, so panels are listed by number, not placed on a grid."
                }}
                Each panel is measured on its own. Click one for its Goal tab.
              </p>
            </div>
            <div role="group" aria-label="Filter shown" class="seg">
              <button
                type="button"
                :aria-pressed="filter === 'weakest'"
                :class="{ on: filter === 'weakest' }"
                @click="filter = 'weakest'"
              >
                Weakest
              </button>
              <button
                v-for="f in filters"
                :key="f"
                type="button"
                :aria-pressed="filter === f"
                :class="{ on: filter === f }"
                @click="filter = f"
              >
                {{ f }}
              </button>
            </div>
          </div>
          <div class="tiles" :style="{ gridTemplateColumns: gridCols }">
            <button
              v-for="t in tiles"
              :key="t.p.number"
              type="button"
              class="tile"
              :style="t.style"
              :aria-label="`Panel ${t.p.number}, ${t.label}, ${metric(t.x)}`"
              @click="openPanel(t.p)"
            >
              <span class="spread" style="width: 100%"
                ><span style="font-weight: 600; font-size: 0.8125rem">Panel {{ t.p.number }}</span
                ><span class="num" style="font-size: 0.75rem; font-weight: 600">{{
                  metric(t.x)
                }}</span></span
              >
              <span style="font-size: 0.6875rem; opacity: 0.9">{{ t.label }}</span>
              <span class="bars">
                <template v-for="b in t.bars" :key="b.f">
                  <span :title="b.f">{{ filterShort(b.f) }}</span>
                  <span class="track"><span :style="{ width: b.w }" /></span>
                  <span style="text-align: right">{{ b.v }}</span>
                </template>
              </span>
            </button>
          </div>
          <div class="row xsmall muted" style="gap: 0.75rem">
            <span
              >Progress is the goal model's value where the stacker has measured the panel,
              otherwise accepted ÷ desired from the scheduler.</span
            >
            <span v-if="weakestPanels.size" class="row" style="gap: 0.375rem"
              ><span class="swatch" /> Holds the mosaic back</span
            >
          </div>
          <p v-if="placeholders.length" class="xsmall muted" style="margin: 0">
            * The scheduler plan for {{ joinList(placeholders) }} asks for only 1 sub, which looks
            like a placeholder plan, so its 100% means one accepted sub.
          </p>
          <p v-if="plateaus.length" class="xsmall muted" style="margin: 0">
            Stopped at a plateau, where more time barely improves the result:
            {{ joinList(plateaus) }} of the goal.
          </p>
        </section>
        <div class="side">
          <section class="card" aria-labelledby="prev-h">
            <div class="spread">
              <h2 id="prev-h">Live mosaic</h2>
              <span class="xsmall muted">{{
                latestNight && previewUrl
                  ? "the stacker's latest build"
                  : !previews.length
                    ? 'No stacker build yet'
                    : 'Effective hours to the chosen night'
              }}</span>
            </div>
            <img
              v-if="previewUrl && latestNight"
              :src="previewUrl"
              alt="The latest mosaic preview from the stacker"
              class="preview"
            />
            <template v-else>
              <svg
                v-if="schematic.length"
                viewBox="0 0 480 320"
                role="img"
                aria-label="Panel footprints, north up and east left, shaded by effective hours up to the chosen night"
                class="preview"
              >
                <rect x="0" y="0" width="480" height="320" fill="var(--sky)" />
                <g v-for="r in schematic" :key="r.n">
                  <polygon
                    :points="r.points"
                    fill="oklch(0.75 0.06 260)"
                    :fill-opacity="r.op"
                    :stroke="r.weakest ? 'var(--warn)' : 'oklch(1 0 0 / 0.35)'"
                    :stroke-width="r.weakest ? 2 : 1"
                  />
                  <text :x="r.lx" :y="r.ly" font-size="11" fill="#ecebf3" text-anchor="middle">
                    {{ r.label }}
                  </text>
                </g>
              </svg>
              <p v-else class="empty">
                {{
                  previews.length
                    ? 'No panel footprints to draw: the rig is unknown and no panel has a planned footprint.'
                    : "The stacker hasn't built this mosaic yet, and no panel footprint is known to draw."
                }}
              </p>
              <p v-if="schematic.length" class="xsmall muted" style="margin: 0">
                Panel footprints, north up and east left, shaded by effective hours up to the
                chosen night.
              </p>
            </template>
            <div class="row" style="gap: 0.75rem; flex-wrap: nowrap">
              <label for="mo-night" class="xsmall muted" style="white-space: nowrap"
                >Progress over nights</label
              >
              <input
                id="mo-night"
                v-model.number="night"
                type="range"
                min="0"
                :max="Math.max(0, (history?.nights.length ?? 1) - 1)"
                style="flex: 1; min-width: 0"
              />
              <span class="xsmall num" style="white-space: nowrap">{{ nightLabel }}</span>
            </div>
          </section>
          <section class="card" aria-labelledby="bal-h">
            <div class="spread" style="align-items: center">
              <h2 id="bal-h">Panel balancing</h2>
              <span class="badge" :class="balancing?.on ? 'ok' : 'bad'">{{
                balancing?.on ? 'On · Panel Deficit ' + balancing.panelDeficit : 'Off'
              }}</span>
            </div>
            <p class="small" style="margin: 0">
              {{ balancingText }}
            </p>
            <div class="row" style="justify-content: flex-end">
              <button
                type="button"
                class="btn primary"
                :disabled="busy || !detail.ts.id"
                @click="toggleBalancing"
              >
                {{ balancing?.on ? 'Turn off balancing' : 'Turn on balancing' }}
              </button>
            </div>
          </section>
          <section v-if="detail.needs.length" class="card" aria-labelledby="needs-h">
            <h2 id="needs-h">What the panels need</h2>
            <ul class="small" style="margin: 0; padding-left: 1.125rem">
              <li v-for="n in detail.needs" :key="n">{{ n }}</li>
            </ul>
          </section>
        </div>
      </div>
    </template>

    <section
      v-if="tab === 'seams' && detail"
      class="card"
      style="max-width: 56rem"
      aria-labelledby="seam-h"
    >
      <div class="spread" style="align-items: center">
        <h2 id="seam-h">
          Seam health{{
            !seamRows.length
              ? ''
              : showAllSeams || seamRows.length <= 5
                ? ' · every overlap'
                : ' · worst five overlaps'
          }}
        </h2>
        <span class="badge" :class="!seamRows.length ? '' : seamWarnings ? 'warn' : 'ok'">{{
          !seamRows.length
            ? 'Not measured yet'
            : seamWarnings
              ? seamWarnings + (seamWarnings === 1 ? ' warning' : ' warnings')
              : 'No warnings'
        }}</span>
      </div>
      <ul v-if="seamRows.length" class="seams">
        <li v-for="s in seamsShown" :key="s.pair">
          <span style="font-weight: 600">{{ s.pair }}</span>
          <span
            class="num"
            style="font-weight: 600"
            :style="{ color: s.ok ? 'var(--ok)' : 'var(--warn)' }"
            >{{ s.value }}</span
          >
          <span class="muted" style="grid-column: 1 / -1">{{ s.note }} · {{ s.detail }}</span>
        </li>
      </ul>
      <p v-if="!seamRows.length" class="empty">{{ seamEmpty }}</p>
      <p v-else-if="unmeasured.length" class="small muted" style="margin: 0">
        Not measured yet: {{ unmeasured.join(', ') }}.
      </p>
      <button
        v-if="seamRows.length > 5"
        type="button"
        class="btn link small"
        style="align-self: flex-start"
        @click="showAllSeams = !showAllSeams"
      >
        {{ showAllSeams ? 'Show the worst five' : `Show all ${seamRows.length}` }}
      </button>
      <div v-if="noiseRows.length">
        <h2 style="font-size: 0.875rem; margin: 0 0 0.375rem">Background noise by filter</h2>
        <div class="scroll-x">
          <table class="dgrid num small">
            <thead>
              <tr>
                <th scope="col">Filter</th>
                <th scope="col" style="text-align: right">Median</th>
                <th scope="col" style="text-align: right">p90</th>
                <th scope="col" style="text-align: right">Worst</th>
                <th scope="col" style="text-align: right">Tiles</th>
                <th scope="col">Flux scale by panel</th>
                <th scope="col">Measured</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in noiseRows" :key="n.filter">
                <td>{{ n.filter }}</td>
                <td style="text-align: right">{{ sig(n.median) }}</td>
                <td style="text-align: right">{{ sig(n.p90) }}</td>
                <td style="text-align: right">
                  {{ sig(n.max)
                  }}<template v-if="n.maxPanel !== null"> · Panel {{ n.maxPanel }}</template>
                </td>
                <td style="text-align: right">{{ n.tiles }}</td>
                <td>{{ fluxScales(n.filter) || 'not measured' }}</td>
                <td class="muted">
                  {{ n.measuredAt ? shortDate(n.measuredAt) : 'not recorded' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="gaps.length">
        <h2 style="font-size: 0.875rem; margin: 0 0 0.375rem">Coverage gaps</h2>
        <ul class="small" style="margin: 0; padding-left: 1.125rem">
          <li v-for="g in gaps" :key="g.filter + g.panel">
            Panel {{ g.panel }} ({{ g.filter }}): {{ Math.round(g.gapFraction * 100) }}% of its
            planned frame, {{ g.gapDeg2.toFixed(2) }} deg²,
            {{ g.gapWhere ? 'at the ' + g.gapWhere : 'location not measured' }}
          </li>
        </ul>
      </div>
      <p class="xsmall muted" style="margin: 0">
        {{ seamNote }}
      </p>
    </section>

    <div
      v-if="tab === 'seasons' && detail"
      class="row"
      style="gap: 1.5rem; align-items: flex-start"
    >
      <section class="card" style="flex: 3 1 34rem" aria-labelledby="season-h">
        <div>
          <h2 id="season-h">Plan across seasons</h2>
          <p class="small muted" style="margin: 0.125rem 0 0">
            {{ seasonText }}. Last season: {{ paceText }}.
          </p>
        </div>
        <div class="row" style="gap: 0.75rem; align-items: flex-end">
          <label class="field"
            ><span>How nights are shared</span>
            <select v-model="strategy" class="input">
              <option v-for="st in ['weakest', 'even', 'off']" :key="st" :value="st">
                {{ strategyLabel(st)
                }}{{ seasons?.strategyInForce === st ? ' (set now)' : '' }}
              </option>
            </select>
          </label>
          <label class="field"
            ><span>Hours a season</span>
            <select v-model="pace" class="input">
              <option value="measured">Measured from history</option>
              <option value="last">Like last season</option>
              <option value="best">Like the best season</option>
              <option value="worst">Like the worst season</option>
            </select>
          </label>
          <button
            type="button"
            class="btn primary"
            :disabled="busy || strategy === 'even' || strategy === seasons?.strategyInForce"
            @click="applyStrategy"
          >
            Use this plan
          </button>
        </div>
        <p class="small" style="margin: 0">{{ strategyText }}</p>
        <p v-if="seasons" class="xsmall muted" style="margin: 0">{{ basisText }}</p>
        <p v-if="seasons?.projection" class="xsmall muted" style="margin: 0">
          Projected at {{ r1(seasons.projection.hoursPerSeason) }} h effective a season, in
          {{ seasons.projection.stepHours }} h steps over
          {{ plural(seasons.projection.items, 'panel filter') }}, up to
          {{ seasons.projection.maxSeasons }} seasons: it finishes
          {{ finishIn(seasons.compare.weakest) }} weakest panel first,
          {{ finishIn(seasons.compare.even) }} even across panels, and
          {{ finishIn(seasons.compare.off) }} with balancing off.
        </p>
        <div class="seasons">
          <div v-if="seasons?.rows.length" class="srow xsmall muted">
            <span>Season</span><span>Weakest panel (bold) and average panel (thin)</span><span />
          </div>
          <div v-for="r in seasons?.rows ?? []" :key="r.index" class="srow num small">
            <span style="font-weight: 600">{{ r.name }}</span>
            <span style="display: flex; flex-direction: column; gap: 3px">
              <span class="strack thick"><span :style="{ width: pct(r.weakest) }" /></span>
              <span class="strack thin"><span :style="{ width: pct(r.average) }" /></span>
            </span>
            <span style="text-align: right; font-weight: 600">{{ pct(r.weakest) }}</span>
          </div>
        </div>
      </section>
      <section class="card" style="flex: 2 1 22rem" aria-labelledby="months-h">
        <h2 id="months-h">Usable dark hours a night</h2>
        <p class="xsmall muted" style="margin: 0">
          All panels above the project's minimum altitude in astronomical darkness
        </p>
        <div v-if="monthCells.length" class="months num">
          <div v-for="m in monthCells" :key="m.month" class="month">
            <span style="font-weight: 500">{{ m.name }}</span>
            <span :style="{ background: m.bg, color: m.ink }">{{
              m.hours ? '≈' + r1(m.hours) : '0'
            }}</span>
          </div>
        </div>
        <p v-else class="empty">
          The observatory site isn't known yet; it is read from a light's FITS header.
        </p>
        <template v-if="imagingNights.length">
          <h2 style="font-size: 0.875rem; margin: 0">Imaging nights a month, from history</h2>
          <p class="xsmall muted" style="margin: 0">
            Nights with at least one accepted sub on any target, averaged over the years with
            imaging. Weather history isn't kept long enough to count clear nights.
          </p>
          <div class="months num">
            <div v-for="m in imagingNights" :key="m.month" class="month">
              <span style="font-weight: 500">{{ m.name }}</span>
              <span :title="`over ${m.years} of ${m.spanYears} years on record that had imaging`">{{
                m.nights !== null ? r1(m.nights) : 'no data'
              }}</span>
            </div>
          </div>
        </template>
        <template v-if="pushPanels.length">
          <h2 style="font-size: 0.875rem; margin: 0">Panels to push this season</h2>
          <ul class="small" style="margin: 0; padding-left: 1.125rem">
            <li v-for="p in pushPanels" :key="p.panel">
              Panel {{ p.panel }}:
              {{
                [
                  p.hoursLeft ? r1(p.hoursLeft) + ' h effective' : '',
                  p.rawHoursLeft ? r1(p.rawHoursLeft) + ' h raw planned' : '',
                ]
                  .filter(Boolean)
                  .join(' and ')
              }}
              left, {{ p.monthsLeft }}
              {{ p.monthsLeft === 1 ? 'month' : 'months' }} of window{{
                p.lastUsableMonth ? ' (to ' + p.lastUsableMonth + ')' : ''
              }}
            </li>
          </ul>
        </template>
      </section>
    </div>

    <section v-if="tab === 'adopt'" class="card" aria-labelledby="adopt-h">
      <div class="spread" style="align-items: flex-start">
        <div style="max-width: 72ch">
          <h2 id="adopt-h">Adoption review</h2>
          <p class="small muted" style="margin: 0.25rem 0 0">
            Mosaics and subs from before this page existed. Accept or Reject saves that row at once;
            press it again to make the row undecided. Clean cases are panels named after their
            project and numbered 1 to N. Adoption only writes the app's own tables; no scheduler
            row is changed or deleted, and every decision can be undone from the toast or History.
          </p>
        </div>
        <div class="row">
          <span class="badge warn"
            >{{ openAdoptions }} {{ openAdoptions === 1 ? 'decision' : 'decisions' }} open</span
          >
          <button
            v-if="cleanOpen.length"
            type="button"
            class="btn sm primary"
            :disabled="cleanOpen.some((a) => deciding.has(a.id))"
            @click="acceptAllClean"
          >
            Accept all clean · {{ cleanOpen.length }}
          </button>
          <button type="button" class="btn sm" :disabled="adoptRunning" @click="rerunAdoption">
            {{ adoptRunning ? 'Checking…' : 'Check again' }}
          </button>
        </div>
      </div>
      <ul class="adopt">
        <li v-for="a in adoptions" :key="a.id">
          <div
            style="min-width: 0; display: flex; flex-direction: column; gap: 0.125rem"
            class="small"
          >
            <div class="row" style="align-items: baseline">
              <span style="font-weight: 600; font-size: 0.875rem">{{ adoptionTitle(a) }}</span>
              <span class="xsmall muted">confidence {{ a.confidence }}</span>
              <span v-if="statusBadge(a)" class="badge" :class="statusBadge(a)?.cls">{{
                statusBadge(a)?.text
              }}</span>
            </div>
            <span v-if="a.issue">{{ a.issue }}</span>
            <span class="muted">Suggested: {{ a.suggestion }}</span>
            <span v-if="a.panels?.length" class="xsmall muted"
              >Panels: {{ a.panels.map((p) => p.target).join(', ') }}</span
            >
            <span v-if="a.rule" class="xsmall muted">Why: {{ a.rule }}</span>
            <span v-if="adoptionTimes(a)" class="xsmall muted">{{ adoptionTimes(a) }}</span>
          </div>
          <div role="group" :aria-label="'Decision for ' + a.project" class="row">
            <button
              type="button"
              class="btn"
              :class="{ on: a.status === 'accepted' }"
              :aria-pressed="a.status === 'accepted'"
              :disabled="deciding.has(a.id)"
              :title="a.status === 'accepted' ? 'Press again to make it undecided' : undefined"
              @click="decide(a, 'accepted')"
            >
              {{ a.status === 'accepted' ? 'Accepted' : 'Accept' }}
            </button>
            <button
              type="button"
              class="btn"
              :class="{ on: a.status === 'rejected' }"
              :aria-pressed="a.status === 'rejected'"
              :disabled="deciding.has(a.id)"
              :title="a.status === 'rejected' ? 'Press again to make it undecided' : undefined"
              @click="decide(a, 'rejected')"
            >
              {{ a.status === 'rejected' ? 'Rejected' : 'Reject' }}
            </button>
          </div>
        </li>
      </ul>
      <p v-if="!adoptions.length" class="empty">
        Nothing to review. Press Check again to look for mosaics and unmatched subs.
      </p>
    </section>
  </main>
</template>

<style scoped>
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  height: 2.5rem;
  padding: 0 1rem;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-size: 0.875rem;
  margin-bottom: -1px;
}
.tabs button.on {
  border-bottom-color: var(--foreground);
  font-weight: 600;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
  gap: 0.75rem;
}
.stat {
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  padding: 0.875rem 1rem;
}
.stat.warn {
  border-color: var(--warn);
  background: var(--warn-bg);
}
.big {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
}
.side {
  flex: 2 1 24rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}
.seg {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.125rem;
  gap: 0.125rem;
}
.seg button {
  height: 1.875rem;
  padding: 0 0.75rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  font-size: 0.8125rem;
}
.seg button.on {
  background: var(--secondary);
  font-weight: 600;
}
.tiles {
  display: grid;
  gap: 0.375rem;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 6.5rem;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.5rem 0.625rem;
  outline-offset: 2px;
  text-align: left;
  min-width: 0;
  overflow: hidden;
}
.bars {
  margin-top: auto;
  display: grid;
  grid-template-columns: 2rem 1fr 3rem;
  gap: 0.125rem 0.375rem;
  align-items: center;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  width: 100%;
}
.track {
  height: 0.375rem;
  border-radius: 999px;
  background: oklch(1 0 0 / 0.25);
  overflow: hidden;
}
.track > span {
  display: block;
  height: 100%;
  background: currentColor;
}
.swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  outline: 2px solid var(--warn);
  outline-offset: 1px;
}
.preview {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 3 / 2;
  border-radius: 0.5rem;
  background: var(--sky);
  display: block;
  object-fit: contain;
}
.seams {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.seams li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.125rem 0.75rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
  font-size: 0.8125rem;
}
.seasons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.srow {
  display: grid;
  grid-template-columns: 5rem 1fr 3rem;
  gap: 0.75rem;
  align-items: center;
}
.strack {
  border-radius: 999px;
  background: var(--secondary);
  overflow: hidden;
  display: block;
}
.strack.thick {
  height: 0.625rem;
}
.strack.thin {
  height: 0.25rem;
}
.strack > span {
  display: block;
  height: 100%;
  background: var(--foreground);
}
.strack.thin > span {
  background: var(--muted-foreground);
}
.months {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 2px;
  font-size: 0.75rem;
  text-align: center;
}
.month {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.month > span:last-child {
  padding: 0.375rem 0;
}
.adopt {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.adopt li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.375rem 1rem;
  align-items: center;
  padding: 0.875rem 0;
  border-top: 1px solid var(--border);
}
@media (max-width: 640px) {
  .adopt li {
    grid-template-columns: minmax(0, 1fr);
  }
}
.adopt .btn.on {
  border-color: var(--foreground);
  background: var(--secondary);
  font-weight: 600;
}
</style>
