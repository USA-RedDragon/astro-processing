<script setup lang="ts">
import PageHead from '../components/PageHead.vue'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  adopt,
  getHistory,
  getMosaic,
  getSeasons,
  listAdoptions,
  listMosaics,
  mosaicPreviews,
  runAdoption,
  setBalancing,
  BALANCING_WEIGHT,
  type Adoption,
  type MosaicDetail,
  type MosaicHistory,
  type MosaicPanel,
  type MosaicSummary,
  type PanelFilter,
  type SeasonPlan,
} from '../api/mosaics'
import { onEvent } from '../api/events'
import { errorToast, notifyCommand } from '../shell'
import { filterColor, pct, r1 } from '../api/planning'
import { filterShort } from '../plan'

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
    adoptions.value = await listAdoptions()
    for (const a of adoptions.value) {
      if (!(a.id in draft) && a.status === 'proposed' && a.clean) draft[a.id] = 'accepted'
    }
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

function metric(x?: PanelFilter): string {
  if (!x) return 'no data'
  if (x.source === 'goal' && x.snr) return 'SNR ' + r1(x.snr)
  if (x.source === 'ts') return `${x.accepted ?? 0}/${x.desired ?? 0}`
  return r1(x.effectiveHours) + ' h'
}

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
    const weakest = p.number === d.weakestPanel
    return {
      p,
      x,
      style: {
        gridRow: String(p.row + 1),
        gridColumn: String(p.col + 1),
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

const gridCols = computed(() => `repeat(${Math.max(1, detail.value?.cols ?? 1)}, minmax(0, 1fr))`)

function openPanel(p: MosaicPanel) {
  const d = detail.value
  if (!d?.ts.id) return
  router.push({
    name: 'target',
    params: { projectId: String(d.ts.id) },
    query: { target: p.targetId ? String(p.targetId) : undefined, tab: 'goal' },
  })
}

const stats = computed(() => {
  const d = detail.value
  if (!d) return null
  const w = panels.value.find((p) => p.number === d.weakestPanel)
  const wf = w ? pf(w, d.weakestFilter) : undefined
  return {
    complete: pct(d.complete),
    completeNote: w
      ? `Set by the weakest panel: Panel ${w.number} ${d.weakestFilter || ''}${wf ? ', ' + metric(wf) : ''}`
      : 'No panel has data yet',
    average: pct(d.average),
    effective: r1(d.effectiveHours) + ' h effective so far',
    left: (d.hoursUnknown ? '≥ ' : '≈ ') + Math.round(d.hoursLeft) + ' h',
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
  const cols = Math.max(1, d.cols)
  const rows = Math.max(1, d.rows)
  const pw = 460 / cols
  const ph = 300 / rows
  const at = (n: number) => {
    const hp = h?.panels.find((x) => x.number === n)
    if (!hp || !hp.hours.length) return 0
    return hp.hours[Math.max(0, Math.min(hp.hours.length - 1, night.value))] ?? 0
  }
  const max = Math.max(0.0001, ...panels.value.map((p) => at(p.number)))
  return panels.value.map((p) => ({
    n: p.number,
    x: (10 + p.col * pw).toFixed(1),
    y: (10 + p.row * ph).toFixed(1),
    w: (pw - 4).toFixed(1),
    h: (ph - 4).toFixed(1),
    op: (0.08 + 0.75 * (at(p.number) / max)).toFixed(2),
    lx: (16 + p.col * pw).toFixed(1),
    ly: (26 + p.row * ph).toFixed(1),
    label: `${p.number} · ${r1(at(p.number))} h`,
    weakest: p.number === d.weakestPanel,
  }))
})

const balancing = computed(() => detail.value?.balancing)
const balancingText = computed(() =>
  balancing.value?.on
    ? `The scheduler steers time to the panel that is furthest behind and gives panels past their goal no priority, so Panel ${detail.value?.weakestPanel} gets the next clear nights.`
    : `Panel Deficit is weighted 0, so the scheduler never steers time to the panel that is behind. Turning it on sets it to ${BALANCING_WEIGHT}; Mosaic Completion stays at ${balancing.value?.mosaicCompletion ?? 0}.`,
)
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

const seamRows = computed<SeamRow[]>(() => {
  const d = detail.value
  if (!d) return []
  const fx = (v: number | null | undefined, digits: number, unit = '') =>
    v === null || v === undefined ? '' : v.toFixed(digits) + unit
  return (d.seams ?? [])
    .map((s) => ({
      pair: `Panel ${s.panelA} ↔ Panel ${s.panelB} · ${s.filter}`,
      severity: Math.max(
        s.noiseRatio / 1.5,
        s.level / 0.2,
        s.step / 0.3,
        s.samples < 400 ? 1.5 : 0,
      ),
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
          ? `colour mismatch ${fx(s.colourMismatch, 3)}${s.colourReference ? ' against ' + s.colourReference : ''}`
          : '',
        s.measuredAt ? 'measured ' + new Date(s.measuredAt).toLocaleDateString('en-GB') : '',
      ]
        .filter(Boolean)
        .join(' · '),
      note: s.ok ? 'Within limits. The seam should blend.' : s.problems,
      ok: s.ok,
    }))
    .sort((a, b) => b.severity - a.severity)
})
const unmeasured = computed(() => {
  const d = detail.value
  if (!d) return []
  const st = d.seamStatus ?? []
  if (st.length) return st.filter((x) => !x.measured).map((x) => x.filter)
  const measured = new Set((d.seams ?? []).map((x) => x.filter))
  return (d.filters ?? []).filter((f) => !measured.has(f))
})
const noiseRows = computed(() => (detail.value?.noise ?? []).filter((n) => n.median !== null))
const seamNote =
  "Measured by the stacker on the matched overlaps: level and gradient step in units of the background noise σ, and the two panels' noise ratio. Warnings above 0.2σ level, 0.3σ step or 1.5× noise."
const seamWarnings = computed(() => seamRows.value.filter((s) => !s.ok).length)
const showAllSeams = ref(false)
const seamsShown = computed(() =>
  showAllSeams.value ? seamRows.value : seamRows.value.slice(0, 5),
)
const gaps = computed(() => (detail.value?.health ?? []).filter((h) => h.gapFraction > 0.02))

const strategy = ref('weakest')
const pace = ref('measured')
const seasons = ref<SeasonPlan | null>(null)

async function loadSeasons() {
  if (!key.value) return
  try {
    seasons.value = await getSeasons(key.value, strategy.value, pace.value)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}
watch([strategy, pace], loadSeasons)

const strategyText: Record<string, string> = {
  weakest:
    'Weakest panel first: each night goes to the panel and filter furthest behind, so seams stay matched. This is the Panel Deficit rule.',
  even: 'Even: every panel gets the same time. Panels that start behind stay behind. A projection only; the scheduler has no even-split rule.',
  off: 'Balancing off, as today: the scheduler ignores panels, so the weakest panel barely moves.',
}

const finishLabel = computed(() => {
  const s = seasons.value
  if (!s) return '…'
  if (s.hoursPerSeason === null) return 'Unknown'
  if (!s.finishSeason) return `> ${s.rows.length} seasons`
  return `≈ ${s.finishSeason} ${s.finishSeason === 1 ? 'season' : 'seasons'}`
})

const finishNote = computed(() => {
  const s = seasons.value
  if (!s) return ''
  if (s.hoursPerSeason === null) return 'not enough imaging history to project'
  const how =
    strategy.value === 'weakest'
      ? 'weakest first'
      : strategy.value === 'even'
        ? 'even split'
        : 'balancing off'
  return `At ${Math.round(s.hoursPerSeason)} h a season, ${how}`
})

function finishIn(n?: number): string {
  if (!n) return `after more than ${seasons.value?.rows.length ?? 0} seasons`
  return n === 1 ? 'this season' : `in season ${n}`
}

function monthYear(s: string): string {
  return new Date(s).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const paceText = computed(() => {
  const l = seasons.value?.lastSeason
  if (!l) return 'no full season yet'
  return `${Math.round(l.hours)} h over ${l.nights} nights${l.from && l.to ? `, ${monthYear(l.from)} to ${monthYear(l.to)}` : ''}`
})

const basisText = computed(() => {
  const s = seasons.value
  const b = s?.basis
  if (!s) return ''
  if (s.hoursPerSeason !== null && !b) return ''
  if (s.hoursPerSeason === null || !b)
    return (
      'Not enough history to project seasons' +
      (b?.reason ? `: ${b.reason}` : '.') +
      (b && b.historyNights ? ` ${b.historyNights} imaging nights on record so far.` : '')
    )
  const parts: string[] = []
  if (b.hoursPerClearNight !== null && b.clearNightsPerSeason !== null)
    parts.push(
      `${r1(b.hoursPerClearNight)} h per clear night × ${Math.round(b.clearNightsPerSeason)} clear nights a season`,
    )
  if (b.historyFrom && b.historyTo)
    parts.push(
      `from ${b.historyNights} imaging nights, ${monthYear(b.historyFrom)} to ${monthYear(b.historyTo)}`,
    )
  if (b.projectNights) parts.push(`${b.projectNights} of them on this mosaic`)
  if (b.usableMonths !== null) parts.push(`${b.usableMonths} usable months`)
  return (
    'Based on ' +
    parts.join(', ') +
    '.' +
    (b.insufficientHistory ? ' History is thin, so treat this as rough.' : '') +
    (b.reason && b.insufficientHistory ? ' ' + b.reason : '')
  )
})

const seasonText = computed(() => {
  const s = seasons.value
  if (!s) return ''
  if (!s.siteKnown) return 'Site unknown, so visibility is not modelled'
  return s.inSeason ? `In season · ≈ ${s.nightsLeft} nights left` : 'Out of season'
})

const clearNights = computed(() =>
  (seasons.value?.basis?.clearNightsPerMonth ?? []).filter((m) => m.nights !== null),
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
  if (!d || strategy.value === 'even') return
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

const draft = reactive<Record<number, 'accepted' | 'rejected'>>({})
const openAdoptions = computed(() => adoptions.value.filter((a) => a.status === 'proposed').length)
const cleanOpen = computed(() => adoptions.value.filter((a) => a.status === 'proposed' && a.clean))
const changes = computed(() =>
  adoptions.value
    .filter((a) => draft[a.id] && draft[a.id] !== a.status)
    .map((a) => ({
      id: a.id,
      subject: a.subject,
      title: a.project,
      before: a.status as string,
      after: draft[a.id] as string,
    })),
)

function decision(a: Adoption): string {
  return draft[a.id] ?? a.status
}

function setDraft(a: Adoption, v: 'accepted' | 'rejected') {
  if (draft[a.id] === v) delete draft[a.id]
  else draft[a.id] = v
}

async function applyAdoption(only?: Adoption[]) {
  const ds = only
    ? only.map((a) => ({
        id: a.id,
        subject: a.subject,
        title: a.project,
        before: a.status as string,
        after: 'accepted',
      }))
    : changes.value
  if (!ds.length) return
  busy.value = true
  try {
    notifyCommand(await adopt(ds))
    for (const d of ds) delete draft[d.id]
    await loadAll()
  } catch (e) {
    errorToast(e)
  } finally {
    busy.value = false
  }
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
        {{ panels.length }} panels, {{ detail.layout }}.
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
        <label v-if="list.length" class="field" style="min-width: 14rem">
          <span>Mosaic</span>
          <select
            class="input"
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
          <div class="big num">{{ stats.left }}</div>
          <div class="xsmall muted">effective, to bring every panel and filter to its goal</div>
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
                North up, east left, as framed. Each panel is measured on its own. Click one for its
                Goal tab.
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
            <span class="row" style="gap: 0.375rem"
              ><span class="swatch" /> Holds the mosaic back</span
            >
          </div>
        </section>
        <div class="side">
          <section class="card" aria-labelledby="prev-h">
            <div class="spread">
              <h2 id="prev-h">Live mosaic</h2>
              <span class="xsmall muted">{{
                latestNight && previewUrl
                  ? "the stacker's latest build"
                  : 'brighter = more effective hours'
              }}</span>
            </div>
            <img
              v-if="previewUrl && latestNight"
              :src="previewUrl"
              alt="The latest mosaic preview from the stacker"
              class="preview"
            />
            <svg
              v-else
              viewBox="0 0 480 320"
              role="img"
              aria-label="Panels shaded by effective hours up to the chosen night; the weakest is outlined"
              class="preview"
            >
              <rect x="0" y="0" width="480" height="320" fill="var(--sky)" />
              <g v-for="r in schematic" :key="r.n">
                <rect
                  :x="r.x"
                  :y="r.y"
                  :width="r.w"
                  :height="r.h"
                  fill="oklch(0.75 0.06 260)"
                  :fill-opacity="r.op"
                  :stroke="r.weakest ? 'var(--warn)' : 'oklch(1 0 0 / 0.35)'"
                  :stroke-width="r.weakest ? 2 : 1"
                />
                <text :x="r.lx" :y="r.ly" font-size="11" fill="#ecebf3">{{ r.label }}</text>
              </g>
            </svg>
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
          Seam health · {{ showAllSeams ? 'every overlap' : 'worst five overlaps' }}
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
      <p v-if="!seamRows.length" class="empty">Not measured yet.</p>
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
                <th scope="col">Measured</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in noiseRows" :key="n.filter">
                <td>{{ n.filter }}</td>
                <td style="text-align: right">{{ n.median?.toFixed(4) ?? '—' }}</td>
                <td style="text-align: right">{{ n.p90?.toFixed(4) ?? '—' }}</td>
                <td style="text-align: right">
                  {{ n.max?.toFixed(4) ?? '—'
                  }}<template v-if="n.maxPanel !== null"> · Panel {{ n.maxPanel }}</template>
                </td>
                <td style="text-align: right">{{ n.tiles }}</td>
                <td class="muted">
                  {{ n.measuredAt ? new Date(n.measuredAt).toLocaleDateString('en-GB') : '—' }}
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
            planned frame, {{ g.gapDeg2.toFixed(2) }} deg², at the {{ g.gapWhere || 'edge' }}
          </li>
        </ul>
      </div>
      <p class="xsmall muted" style="margin: 0">
        {{ seamNote }}
        Balancing fixes noise mismatches over time: switch it on under Panels and goal.
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
              <option value="weakest">Weakest panel first</option>
              <option value="even">Even across panels</option>
              <option value="off">Balancing off, as today</option>
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
            :disabled="busy || strategy === 'even'"
            @click="applyStrategy"
          >
            Use this plan
          </button>
        </div>
        <p class="small" style="margin: 0">{{ strategyText[strategy] }}</p>
        <p v-if="seasons" class="xsmall muted" style="margin: 0">{{ basisText }}</p>
        <p v-if="seasons && seasons.hoursPerSeason !== null" class="xsmall muted" style="margin: 0">
          At {{ Math.round(seasons.hoursPerSeason) }} h a season it finishes
          {{ finishIn(seasons.compare.weakest) }} weakest first,
          {{ finishIn(seasons.compare.even) }} even, and {{ finishIn(seasons.compare.off) }} with
          balancing off.
          {{
            seasons.goalHoursSource === 'ts'
              ? 'Where the stacker has no goal yet, the goal is the scheduler plan in hours.'
              : ''
          }}
        </p>
        <div class="seasons">
          <div class="srow xsmall muted">
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
              m.hours ? '≈' + r1(m.hours) : '–'
            }}</span>
          </div>
        </div>
        <p v-else class="empty">
          The observatory site isn't known yet; it is read from a light's FITS header.
        </p>
        <template v-if="clearNights.length">
          <h2 style="font-size: 0.875rem; margin: 0">Clear nights a month, from history</h2>
          <div class="months num">
            <div v-for="m in clearNights" :key="m.month" class="month">
              <span style="font-weight: 500">{{ m.name }}</span>
              <span :title="m.years + (m.years === 1 ? ' year' : ' years') + ' of records'">{{
                m.nights !== null ? r1(m.nights) : '–'
              }}</span>
            </div>
          </div>
        </template>
        <template v-if="pushPanels.length">
          <h2 style="font-size: 0.875rem; margin: 0">Panels to push this season</h2>
          <ul class="small" style="margin: 0; padding-left: 1.125rem">
            <li v-for="p in pushPanels" :key="p.panel">
              Panel {{ p.panel }}: {{ r1(p.hoursLeft) }} h left, {{ p.monthsLeft }}
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
            Mosaics and subs from before this page existed. The clean cases, panels named after
            their project and numbered 1 to N, are ticked for you. Adoption only writes the app's
            own tables; no scheduler row is changed or deleted, and every decision can be undone
            from History.
          </p>
        </div>
        <div class="row">
          <span class="badge warn"
            >{{ openAdoptions }} {{ openAdoptions === 1 ? 'decision' : 'decisions' }} open</span
          >
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
          </div>
          <div role="group" :aria-label="'Decision for ' + a.project" class="row">
            <button
              type="button"
              class="btn"
              :class="{ on: decision(a) === 'accepted' }"
              :aria-pressed="decision(a) === 'accepted'"
              @click="setDraft(a, 'accepted')"
            >
              Accept
            </button>
            <button
              type="button"
              class="btn"
              :class="{ on: decision(a) === 'rejected' }"
              :aria-pressed="decision(a) === 'rejected'"
              @click="setDraft(a, 'rejected')"
            >
              Reject
            </button>
          </div>
        </li>
      </ul>
      <p v-if="!adoptions.length" class="empty">
        Nothing to review. Press Check again to look for mosaics and unmatched subs.
      </p>
      <div
        class="row"
        style="
          justify-content: flex-end;
          border-top: 1px solid var(--border);
          padding-top: 0.875rem;
        "
      >
        <button
          v-if="cleanOpen.length"
          type="button"
          class="btn"
          :disabled="busy"
          @click="applyAdoption(cleanOpen)"
        >
          Accept all clean · {{ cleanOpen.length }}
        </button>
        <span v-if="!changes.length" class="small muted">Choose Accept or Reject on any row.</span>
        <button
          type="button"
          class="btn primary"
          :disabled="busy || !changes.length"
          @click="applyAdoption()"
        >
          Apply {{ changes.length }} {{ changes.length === 1 ? 'decision' : 'decisions' }}
        </button>
      </div>
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
.adopt .btn.on {
  border-color: var(--foreground);
  background: var(--secondary);
  font-weight: 600;
}
</style>
