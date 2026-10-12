<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import BodyFramingCard from './BodyFramingCard.vue'
import BodySeasonCard from './BodySeasonCard.vue'
import BodyNightsCard from './BodyNightsCard.vue'
import {
  bodyFill,
  bodyHeading,
  bodyIntro,
  bodyMeasureText,
  bodyTonightText,
  bodyValue,
  bodyValueTitle,
} from '../bodyGoals'
import { formatDate } from '@/lib/formatters'
import {
  countsBadge,
  countsLine,
  filterColor,
  filterHeadline,
  filterOnCounts,
  filterPlateau,
  getProject,
  getStacks,
  goalTiming,
  goalDrivenPlugin,
  leastHeadline,
  leastText,
  legacyGoalNote,
  measureText,
  objectLinkText,
  ON_COUNTS_TITLE,
  pct,
  plateauTitle,
  plateauWhere,
  r1,
  r2,
  seasonLabel,
  PRIORITY_INDEX,
  STATE_INDEX,
  type FilterGoal,
  type GoalKind,
  type Point,
  type ProjectDetail,
  type StackMaster,
  type Target,
} from '../api/planning'
import { submitCommand } from '../api/commands'
import {
  errorToast,
  exposureEnd,
  notifyCommand,
  shell,
  showToast,
  upsertWaiting,
  whenApplies,
} from '../shell'
import {
  applyRuleWeights,
  getRuleWeights,
  type GlobalWeights,
  type ProjectWeights,
} from '../api/ruleweights'
import { applyOutcome, switchKeys, switchStates, type SwitchState } from '../ruleWeights'
import RuleWeightsConfirm from './RuleWeightsConfirm.vue'
import { onEvent } from '../api/events'
import FaintSignalOverlay from './FaintSignalOverlay.vue'
import PlateauLine from './PlateauLine.vue'
import FilterChips from './FilterChips.vue'
import { api, query } from '../api/client'
import { draftFilters } from '../api/planning'
import { canApplySet, submitApplySet } from '../applySet'
import {
  emptyHeadline,
  filterChoices,
  filterSubs,
  goalFact,
  groupFilters,
  hasFilter,
  keptFact,
  plateauFact,
  sameFilter,
  selectedFilters,
  stopText,
  timeFact,
  withFilter,
  type SubCount,
} from '../filters'

interface GoalMaskInfo {
  measured?: boolean
  reason?: string
  band_lo: number | null
  band_hi: number | null
  band_pct: number
  sky: number
  measured_at: string
}

const props = defineProps<{
  projectId: string | number
  targetId?: string | number
  headTo?: string
}>()
const route = useRoute()
const router = useRouter()

const detail = ref<ProjectDetail | null>(null)
const loadError = ref('')
const tab = ref<'goal' | 'plans' | 'scoring' | 'options'>((route.query.tab as 'goal') || 'goal')
const panelIdx = ref(0)
const pinned = computed(
  () => props.targetId !== undefined && props.targetId !== null && props.targetId !== '',
)
const missing = ref(false)

function pickPanel() {
  const ts = detail.value?.project.targets ?? []
  const want = Number(pinned.value ? props.targetId : route.query.target)
  const i = ts.findIndex((t) => t.id === want)
  if (i >= 0) panelIdx.value = i
  missing.value = pinned.value && i < 0
}

const globalWeights = ref<GlobalWeights | null>(null)

async function loadGlobalWeights() {
  try {
    globalWeights.value = await getRuleWeights()
  } catch {
    globalWeights.value = null
  }
}

async function load() {
  loadGlobalWeights()
  try {
    detail.value = await getProject(props.projectId)
    loadError.value = ''
    pickPanel()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

let off: (() => void) | undefined
onMounted(() => {
  load()
  off = onEvent('command', (e: { data?: { status?: string } }) => {
    const st = e.data?.status ?? ''
    if (['rejected', 'failed', 'conflict', 'cancelled'].includes(st))
      Object.keys(wantFilter).forEach((k) => delete wantFilter[k])
    if (st === 'applied' || st === 'rejected' || st === 'failed') load()
  })
})
onUnmounted(() => off?.())
watch(() => props.projectId, load)
watch(() => props.targetId, pickPanel)
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t } }))
watch(
  () => route.query.tab,
  (t) => {
    if (t && t !== tab.value && ['goal', 'plans', 'scoring', 'options'].includes(String(t)))
      tab.value = t as 'goal'
  },
)

const p = computed(() => detail.value?.project)
const target = computed<Target | undefined>(
  () => p.value?.targets[panelIdx.value] ?? p.value?.targets[0],
)
const projectTargets = computed(() => p.value?.targets ?? [])
const filterGroups = computed(() =>
  groupFilters(
    filterChoices({
      filters: detail.value?.filters,
      templates: detail.value?.templates,
      plans: projectTargets.value.flatMap((t) => t.plans),
    }),
  ),
)
const savedFilters = computed(() => selectedFilters(projectTargets.value))
const wantFilter = reactive<Record<string, boolean>>({})
watch(savedFilters, (saved) => {
  for (const k of Object.keys(wantFilter))
    if (hasFilter(saved, k) === wantFilter[k]) delete wantFilter[k]
})
const shownFilters = computed(() => {
  let out = savedFilters.value
  for (const [k, on] of Object.entries(wantFilter)) out = withFilter(out, k, on)
  return filterGroups.value
    .flatMap((g) => g.filters.map((f) => f.name))
    .filter((n) => hasFilter(out, n))
    .concat(out.filter((n) => !filterGroups.value.some((g) => g.filters.some((f) => sameFilter(f.name, n)))))
})
const filterBusy = ref(false)
const stopping = ref<{ name: string; subs: SubCount } | null>(null)

function toggleFilter(name: string) {
  const on = hasFilter(shownFilters.value, name)
  if (on) {
    const subs = filterSubs(projectTargets.value, name)
    if (subs.taken > 0) {
      stopping.value = { name, subs }
      return
    }
  }
  stopping.value = null
  setFilter(name, !on)
}

function confirmStop() {
  const s = stopping.value
  stopping.value = null
  if (s) setFilter(s.name, false)
}

async function setFilter(name: string, on: boolean) {
  const ids = projectTargets.value.map((t) => t.id)
  if (!ids.length || filterBusy.value) return
  const next = withFilter(shownFilters.value, name, on)
  wantFilter[name] = on
  filterBusy.value = true
  try {
    const d = await draftFilters({ targetIds: ids, filters: next })
    if (!canApplySet(d)) {
      delete wantFilter[name]
      return
    }
    if (!(await submitApplySet(d, submitCommand, (r) => notifyCommand(r)))) delete wantFilter[name]
    await load()
  } catch (e) {
    delete wantFilter[name]
    errorToast(e, on ? `Could not add ${name}` : `Could not stop imaging ${name}`)
  } finally {
    filterBusy.value = false
  }
}

const filterRows = computed(() => {
  const t = target.value
  return shownFilters.value.map((name) => {
    const fg = t?.goals.find((g) => sameFilter(g.filter, name))
    const subs = filterSubs(t ? [t] : [], name)
    return {
      name,
      fg,
      subs,
      facts: fg ? [goalFact(fg, mode.value), keptFact(subs), timeFact(fg), plateauFact(fg)] : [],
      headline: fg ? filterHeadline(fg) : emptyHeadline(subs),
      fill: fg ? fgFill(fg) : '0%',
    }
  })
})
const isMosaic = computed(() => !!p.value?.isMosaic && (p.value?.targets.length ?? 0) > 1)
const activeLabel = computed(() => (isMosaic.value ? 'Panel active' : 'Target active'))
const seasonClass = computed(() =>
  season.value.cls === 'violet'
    ? 'border-transparent bg-[var(--violet-bg)] text-[var(--violet)]'
    : '',
)
const season = computed(() => seasonLabel(target.value?.season ?? p.value?.season))

const applyNote = computed(() => {
  const s = shell.scheduler
  if (s.reachable === 'offline' || s.reachable === 'unconfigured')
    return {
      text: 'The PC is unreachable. Edits queue here and go out when it answers.',
      bad: true,
    }
  if (s.paused) return { text: 'The scheduler is paused, so edits apply at once.', bad: false }
  const at = exposureEnd()
  if (at)
    return {
      text: `Edits apply at ${at}, when the current exposure ends. Nothing waits for a minimum-time window.`,
      bad: false,
    }
  if (s.state === 'imaging')
    return {
      text: `No exposure is running, so edits apply ${whenApplies()}. Nothing waits for a minimum-time window.`,
      bad: false,
    }
  return { text: 'Edits apply at once while nothing is imaging.', bad: false }
})

const mode = computed<GoalKind>(() => {
  const set = p.value?.targets.flatMap((t) => t.goals).find((g) => g.goalSet && g.goal)
  return set?.goal?.kind ?? 'snr'
})

const goalDraft = reactive<Record<string, number>>({})
const plateauDraft = ref<boolean | null>(null)
watch([mode, panelIdx], () => {
  Object.keys(goalDraft).forEach((k) => delete goalDraft[k])
  plateauDraft.value = null
})

function goalOf(fg: FilterGoal) {
  return fg.goalSet && fg.goal ? fg.goal : fg.defaultGoal
}

function goalValue(fg: FilterGoal, m: GoalKind): number {
  return m === 'depth' ? goalOf(fg).depth : goalOf(fg).snr
}

const goals = computed(() => target.value?.goals ?? [])
const bodyKind = computed(() => target.value?.bodyKind)
const bodyObjects = computed(() => {
  const t = target.value
  if (!t) return []
  return [...new Set([t.name, ...(t.objectLinks ?? []).map((l) => l.object)])]
})
const weakest = computed(() => {
  const f = target.value?.least?.filter
  return goals.value.find((g) => g.filter === f) ?? goals.value[0]
})
const lowConf = computed(() =>
  goals.value.filter((g) => g.measurement?.lowConfidence),
)
const plateauSaved = computed(() => goals.value.every((g) => goalOf(g).plateauStop))
const plateauStop = computed(() => plateauDraft.value ?? plateauSaved.value)
const dirtyGoals = computed(
  () =>
    Object.keys(goalDraft).length > 0 ||
    (plateauDraft.value !== null && plateauDraft.value !== plateauSaved.value),
)

function regionString(pts?: Point[]): string {
  if (!pts || pts.length < 3) return ''
  return JSON.stringify(
    pts.map((q) => ({ x: Math.round(q.x * 10000) / 10000, y: Math.round(q.y * 10000) / 10000 })),
  )
}

interface Setting {
  kind: number
  snr_goal: number
  depth_goal?: number
  plateau_stop: boolean
  region?: string
}

function currentSetting(fg: FilterGoal): Setting | null {
  if (!fg.goalSet || !fg.goal) return null
  const s: Setting = {
    kind: fg.goal.kind === 'depth' ? 1 : 0,
    snr_goal: fg.goal.snr || fg.defaultGoal.snr,
    plateau_stop: fg.goal.plateauStop,
  }
  if (fg.goal.kind === 'depth') s.depth_goal = fg.goal.depth
  const r = regionString(fg.goal.region)
  if (r) s.region = r
  return s
}

function same(a: Setting | null, b: Setting | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function baseSetting(fg: FilterGoal): Setting {
  return (
    currentSetting(fg) ?? {
      kind: mode.value === 'depth' ? 1 : 0,
      snr_goal: fg.defaultGoal.snr,
      plateau_stop: fg.defaultGoal.plateauStop,
      ...(mode.value === 'depth' ? { depth_goal: goalValue(fg, 'depth') } : {}),
    }
  )
}

async function sendGoals(changes: { t: Target; fg: FilterGoal; after: Setting | null }[]) {
  const goalsPayload = changes
    .map(({ t, fg, after }) => ({
      target_id: t.id,
      target_guid: t.guid,
      target_name: t.name,
      filter: fg.filter,
      before: currentSetting(fg),
      after,
    }))
    .filter((g) => !same(g.before, g.after))
  if (!goalsPayload.length || !p.value) return
  try {
    const r = await submitCommand('goal.edit', {
      project_id: p.value.id,
      project_name: p.value.name,
      goals: goalsPayload,
    })
    notifyCommand(r)
    await load()
  } catch (e) {
    errorToast(e)
  }
}

function allTargets(): Target[] {
  return (p.value?.targets ?? []).filter((t) => t.guid)
}

function setMode(m: GoalKind) {
  if (m === mode.value) return
  const changes = allTargets().flatMap((t) =>
    t.goals.map((fg) => {
      const s = baseSetting(fg)
      s.kind = m === 'depth' ? 1 : 0
      if (m === 'depth') s.depth_goal = goalValue(fg, 'depth')
      else delete s.depth_goal
      return { t, fg, after: s }
    }),
  )
  sendGoals(changes)
}

function saveGoals() {
  const changes = allTargets().flatMap((t) =>
    t.goals
      .filter((fg) => goalDraft[fg.filter] !== undefined || plateauDraft.value !== null)
      .map((fg) => {
        const s = baseSetting(fg)
        const v = goalDraft[fg.filter]
        if (v !== undefined) {
          if (mode.value === 'depth') s.depth_goal = v
          else s.snr_goal = v
        }
        if (plateauDraft.value !== null) s.plateau_stop = plateauDraft.value
        return { t, fg, after: s }
      }),
  )
  Object.keys(goalDraft).forEach((k) => delete goalDraft[k])
  plateauDraft.value = null
  sendGoals(changes)
}

function resetGoals() {
  Object.keys(goalDraft).forEach((k) => delete goalDraft[k])
  plateauDraft.value = null
}

function startDraw() {
  drawing.value = true
  pts.value = []
}

function cancelDraw() {
  drawing.value = false
  pts.value = []
}

function stopGoals() {
  const changes = allTargets().flatMap((t) =>
    t.goals.filter((fg) => fg.goalSet).map((fg) => ({ t, fg, after: null })),
  )
  sendGoals(changes)
}

const goalDriven = computed(() => goals.value.some((g) => g.goalSet))
const maskInfo = reactive<Record<string, GoalMaskInfo | string>>({})
watch(
  () => goals.value.map((g) => (g.measurement ? g.measurement.object + '|' + g.measurement.filter : '')),
  async () => {
    Object.keys(maskInfo).forEach((k) => delete maskInfo[k])
    for (const g of goals.value) {
      const m = g.measurement
      if (!m) continue
      try {
        const got = await api.get<GoalMaskInfo>(
          '/goals/mask/info' + query({ object: m.object, filter: m.filter }),
        )
        maskInfo[g.filter] = got.measured === false ? 'not measured yet: ' + (got.reason ?? 'no reason given') : got
      } catch (e) {
        maskInfo[g.filter] = e instanceof Error ? e.message : String(e)
      }
    }
  },
  { immediate: true },
)

function sig(v: number): string {
  if (!Number.isFinite(v)) return 'not finite'
  return Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(2) : v.toPrecision(3)
}

function bandText(fg: FilterGoal): string {
  const m = fg.measurement
  if (!m) return ''
  const pctBand = (m.bandFraction * 100).toFixed(1) + '% of covered pixels'
  const info = maskInfo[fg.filter]
  if (m.region) return 'drawn region · ' + pctBand
  if (info && typeof info !== 'string' && info.band_lo != null && info.band_hi != null)
    return `${sig(info.band_lo)} to ${sig(info.band_hi)}, sky ${sig(info.sky)} · ${pctBand}`
  if (typeof info === 'string') return pctBand + ' · band thresholds not recorded: ' + info
  return pctBand
}

function noiseFrom(mask: string): string {
  if (mask === 'faint') return 'from the faint band'
  if (mask === 'region') return 'from the drawn region'
  if (mask === 'background') return 'from the background'
  return mask || 'source not recorded'
}

function noiseTitle(mask: string): string {
  return mask === 'background'
    ? 'The faint band had too few pixels for its own noise, so σ comes from the background pixels'
    : ''
}

const autoBand = computed(() => {
  const g = detail.value?.defaults?.goal
  return g
    ? `Automatic · ${g.bandLowPercentile}–${g.bandHighPercentile}th percentile of nebula pixels`
    : 'Automatic'
})

const PLATEAU_GAIN_PCT = computed(() => detail.value?.defaults?.goal.plateauGainPct ?? '…')

function measuredValue(fg: FilterGoal): string {
  const m = fg.measurement
  if (!m) return 'not measured'
  if (mode.value === 'depth') return m.depth == null ? 'no depth' : (m.depthApprox ? '≈ ' : '') + r1(m.depth)
  return 'SNR ' + r1(m.snr)
}

function measuredTitle(fg: FilterGoal): string {
  const m = fg.measurement
  if (!m) return measureText(fg)
  if (mode.value === 'depth' && m.depth == null) return m.depthReason ?? ''
  return 'Measured ' + formatDate(Date.parse(m.measuredAt) / 1000)
}

const masters = ref<StackMaster[]>([])
watch(
  () => target.value?.name,
  async (name) => {
    masters.value = []
    if (!name) return
    try {
      masters.value = (await getStacks(name)).filter((m) => m.preview_url)
    } catch {
      masters.value = []
    }
  },
  { immediate: true },
)
const master = computed(() => {
  const w = weakest.value?.stackFilter
  return masters.value.find((m) => m.filter === w) ?? masters.value[0]
})

const region = computed<Point[] | undefined>(
  () => goals.value.find((g) => (g.goal?.region?.length ?? 0) >= 3)?.goal?.region,
)
const drawing = ref(false)
const pts = ref<Point[]>([])

const shownPts = computed(() => (drawing.value ? pts.value : (region.value ?? [])))

function saveRegion() {
  const t = target.value
  if (!t || pts.value.length < 3) return
  const rs = regionString(pts.value)
  const changes = t.goals.map((fg) => ({ t, fg, after: { ...baseSetting(fg), region: rs } }))
  drawing.value = false
  pts.value = []
  sendGoals(changes)
}

function clearRegion() {
  const t = target.value
  if (!t) return
  const changes = t.goals
    .filter((fg) => fg.goalSet && fg.goal?.region?.length)
    .map((fg) => {
      const s = baseSetting(fg)
      delete s.region
      return { t, fg, after: s }
    })
  sendGoals(changes)
}

const pluginVersion = computed(() => shell.scheduler.version)
const pluginGoalDriven = computed(() => goalDrivenPlugin(pluginVersion.value))

function fgFill(fg: FilterGoal): string {
  if (fg.enough) return '100%'
  if (filterOnCounts(fg))
    return fg.desired > 0 ? Math.floor(Math.min(1, fg.accepted / fg.desired) * 100) + '%' : '0%'
  return Math.floor((fg.goalProgress ?? 0) * 100) + '%'
}

function fgLine(fg: FilterGoal): string {
  const parts = [filterOnCounts(fg) ? countsLine(fg) : filterHeadline(fg)]
  if (fg.measurement) parts.push(r1(fg.measurement.effectiveHours) + ' h effective')
  if (!fg.enough && fg.goalProgress !== null) parts.push(goalTiming(fg, pluginVersion.value))
  return parts.join(' · ')
}

const weights = computed(() => {
  const out: Record<string, { weight: number; missing: boolean }> = {}
  for (const w of p.value?.ruleWeights ?? []) out[w.name] = { weight: w.weight, missing: w.missing }
  return out
})
const weightDiffs = computed(() => p.value?.weightDiffs ?? [])
const globalOf = computed(() => {
  const out: Record<string, number> = {}
  for (const d of weightDiffs.value) out[d.rule] = d.global
  return out
})

function ruleScore(name: string): number | null {
  const pr = p.value
  const t = target.value
  if (!pr || !t) return null
  switch (name) {
    case 'Project Priority':
      return { High: 1, Normal: 0.5, Low: 0 }[pr.priority] ?? 0.5
    case 'Percent Complete':
      return t.percentComplete
    case 'Novelty':
      return t.novelty
    case 'Rarity':
      return t.rarity
  }
  return null
}

const scoreRows = computed(() =>
  (detail.value?.rules ?? []).filter((r) => !switchKeys(globalWeights.value).has(r.name)).map((r) => {
    const cur = weights.value[r.name]
    const w = cur && !cur.missing ? cur.weight : 0
    const s = ruleScore(r.name)
    return {
      ...r,
      w,
      missing: !cur || cur.missing,
      global: globalOf.value[r.name],
      score: s,
      contrib: s === null ? null : (w / 100) * s,
    }
  }),
)
const knownTotal = computed(() => scoreRows.value.reduce((a, r) => a + (r.contrib ?? 0), 0))

const steeringOn =
  'On: each target and panel shoots the filter furthest behind its goal that still gains most ' +
  'per hour, keeping broadband out of a bright moon. Targets without goals always follow the exposure order.'

const switchTiles = computed<SwitchState[]>(() => {
  const pr = p.value
  if (!pr) return []
  if (globalWeights.value) return switchStates(globalWeights.value, weightDiffs.value, pr.isMosaic)
  const row = pr.filterSteering
  if (!row) return []
  const g = globalOf.value[row.name]
  return [
    {
      key: row.name,
      label: 'Steer filters by goal',
      description: row.weight > 0 && !row.missing ? steeringOn : "Off: filters follow the scheduler's exposure order. Targets without goals always follow the exposure order.",
      on: !row.missing && row.weight > 0,
      set: !row.missing,
      global: g === undefined ? undefined : g > 0,
    },
  ]
})

const resetOpen = ref(false)
const resetBusy = ref(false)
const resetProjects = computed<ProjectWeights[]>(() =>
  p.value
    ? [
      {
        id: p.value.id,
        guid: p.value.guid,
        name: p.value.name,
        state: p.value.state,
        isMosaic: p.value.isMosaic,
        diffs: weightDiffs.value,
      },
    ]
    : [],
)

async function resetWeights() {
  const pr = p.value
  if (!pr) return
  resetBusy.value = true
  try {
    const r = await applyRuleWeights({ projectIds: [pr.id] })
    r.projects.forEach(upsertWaiting)
    showToast(applyOutcome(r))
    resetOpen.value = false
  } catch (e) {
    errorToast(e)
  } finally {
    resetBusy.value = false
  }
}

const optDraft = reactive<{
  priority?: string
  state?: string
}>({})

const optDirty = computed(() => {
  const pr = p.value
  if (!pr) return false
  return (
    (optDraft.priority !== undefined && optDraft.priority !== pr.priority) ||
    (optDraft.state !== undefined && optDraft.state !== pr.state)
  )
})

function resetOpts() {
  delete optDraft.priority
  delete optDraft.state
}

async function saveOpts() {
  const pr = p.value
  if (!pr) return
  const changes: { field: string; before: unknown; after: unknown }[] = []
  if (optDraft.priority !== undefined && optDraft.priority !== pr.priority)
    changes.push({
      field: 'priority',
      before: PRIORITY_INDEX[pr.priority],
      after: PRIORITY_INDEX[optDraft.priority],
    })
  if (optDraft.state !== undefined && optDraft.state !== pr.state)
    changes.push({
      field: 'state',
      before: STATE_INDEX[pr.state],
      after: STATE_INDEX[optDraft.state],
    })
  resetOpts()
  if (!changes.length) return
  try {
    const r = await submitCommand('project.edit', {
      id: pr.id,
      guid: pr.guid,
      name: pr.name,
      changes,
    })
    notifyCommand(r)
    await load()
  } catch (e) {
    errorToast(e)
  }
}

async function setActive(t: Target, active: boolean) {
  if (t.active === active) return
  try {
    const r = await submitCommand('target.edit', {
      id: t.id,
      guid: t.guid,
      name: t.name,
      parent: p.value?.name,
      changes: [{ field: 'active', before: t.active, after: active }],
    })
    t.active = active
    notifyCommand(r)
  } catch (e) {
    errorToast(e)
  }
}

const tabs = [
  ['goal', 'Goal'],
  ['plans', 'Exposure plans'],
  ['scoring', 'Scoring'],
  ['options', 'Options'],
] as const

function numInput(e: Event): number {
  return Number((e.target as HTMLInputElement).value)
}
</script>
<template>
  <div class="page sched">
    <p v-if="loadError" class="empty" style="color: var(--bad)">
      Could not load this project from the scheduler: {{ loadError }}
    </p>
    <p v-else-if="!p" class="empty">Loading the scheduler's view…</p>
    <p v-else-if="missing" class="empty">
      The scheduler has no target with this id in {{ p.name }}.
    </p>
    <template v-else>
      <Teleport v-if="headTo && target" defer :to="headTo">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <label class="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              class="size-4 accent-primary"
              :checked="target.active"
              @change="setActive(target, ($event.target as HTMLInputElement).checked)"
            />
            {{ activeLabel }}
          </label>
          <Badge variant="outline" :class="seasonClass">{{ season.label }}</Badge>
          <Badge variant="outline">{{ p.priority }} priority</Badge>
          <Badge variant="outline">{{ p.state }}</Badge>
        </div>
      </Teleport>

      <div v-if="!headTo || (isMosaic && !pinned)" class="spread" style="align-items: center">
        <div v-if="isMosaic && !pinned" role="group" aria-label="Panel" class="row">
          <span class="small muted" style="margin-right: 0.25rem"
            >Panel {{ panelIdx + 1 }} of {{ p.targets.length }}</span
          >
          <button
            v-for="(t, i) in p.targets"
            :key="t.id"
            type="button"
            class="btn sm num"
            :aria-pressed="i === panelIdx"
            :title="t.name"
            :style="{
              background: i === panelIdx ? 'var(--secondary)' : 'transparent',
              borderColor: i === panelIdx ? 'var(--foreground)' : 'var(--border)',
              minWidth: '2rem',
            }"
            @click="panelIdx = i"
          >
            {{ t.panel || i + 1 }}
          </button>
        </div>
        <span v-else />
        <div v-if="!headTo" class="row">
          <label v-if="target" class="row small" style="gap: 0.375rem">
            <input
              type="checkbox"
              class="size-4 accent-primary"
              :checked="target.active"
              @change="setActive(target, ($event.target as HTMLInputElement).checked)"
            />
            {{ activeLabel }}
          </label>
          <Badge variant="outline" :class="seasonClass">{{ season.label }}</Badge>
          <Badge variant="outline">{{ p.priority }} priority</Badge>
          <Badge variant="outline">{{ p.state }}</Badge>
        </div>
      </div>

      <div class="note" :style="{ borderColor: applyNote.bad ? 'var(--bad)' : 'var(--border)' }">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--muted-foreground)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          style="flex: none; margin-top: 2px"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l3 2" />
        </svg>
        <span>{{ applyNote.text }}</span>
      </div>

      <BodyFramingCard
        v-if="target?.guid"
        :key="target.guid"
        :target-guid="target.guid"
        :target-id="target.id"
        :target-name="target.name"
      />

      <BodySeasonCard
        v-if="target?.guid"
        :key="'season-' + target.guid"
        :target-guid="target.guid"
      />

      <div role="tablist" aria-label="Target sections" class="tabs">
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

      <div v-if="tab === 'goal'" class="row" style="gap: 1.5rem; align-items: flex-start">
        <section class="card" style="flex: 3 1 36rem" aria-labelledby="goal-h">
          <div class="spread" style="align-items: flex-start">
            <div style="flex: 1 1 20rem; min-width: 0">
              <h2 id="goal-h">
                {{
                  bodyKind
                    ? bodyHeading(bodyKind)
                    : mode === 'snr'
                      ? 'Faint-signal SNR per filter'
                      : 'Depth per filter'
                }}
              </h2>
              <p v-if="bodyKind" class="small muted" style="margin: 0.25rem 0 0; max-width: 70ch">
                {{ bodyIntro(bodyKind) }}
              </p>
              <p v-else class="small muted" style="margin: 0.25rem 0 0; max-width: 70ch">
                Bars show each filter's measured progress toward its goal. A filter with no goal
                measurement yet reads as not measured, never as a sub count. The target has enough
                data when every filter does.
              </p>
            </div>
            <div v-if="!bodyKind" role="group" aria-label="Goal type" class="seg">
              <button
                type="button"
                :aria-pressed="mode === 'snr'"
                :class="{ on: mode === 'snr' }"
                @click="setMode('snr')"
              >
                Faint SNR
              </button>
              <button
                type="button"
                :aria-pressed="mode === 'depth'"
                :class="{ on: mode === 'depth' }"
                @click="setMode('depth')"
              >
                Depth, mag/arcsec²
              </button>
            </div>
          </div>
          <div v-if="!goalDriven" class="note small">
            <span
              >No goal is set on this target, so the scheduler finishes each filter on its desired
              count. Saving a goal here makes the goal decide when each filter is done.</span
            >
          </div>
          <div v-if="goalDriven && !pluginGoalDriven" class="note small">
            <span>{{ legacyGoalNote(pluginVersion) }}</span>
          </div>
          <div v-for="g in lowConf" :key="'low-' + g.filter" class="warn small">
            <span
              >{{ g.filter }} is low confidence: {{ g.measurement?.lowReason || 'no reason recorded' }}.
              Draw a region if the band looks wrong.</span
            >
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.875rem">
            <div v-for="fg in goals" :key="fg.filter" class="goalrow small">
              <span class="row" style="font-weight: 600; flex-wrap: nowrap"
                ><span class="swatch" :style="{ background: filterColor(fg.stackFilter) }" />{{
                  fg.filter
                }}</span
              >
              <div style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 0">
                <div
                  class="bar tall"
                  style="flex: none"
                  :title="bodyKind ? bodyTonightText(fg) : filterHeadline(fg)"
                >
                  <div
                    :style="{
                      width: bodyKind ? bodyFill(fg) : fgFill(fg),
                      background: filterColor(fg.stackFilter),
                    }"
                  />
                </div>
                <PlateauLine
                  v-if="bodyKind !== 'asteroid'"
                  :plateau="filterPlateau(fg)"
                  :rollup="false"
                />
                <div class="spread xsmall muted num">
                  <span v-if="bodyKind" data-testid="body-tonight">{{ bodyTonightText(fg) }}</span>
                  <span v-else
                    >{{ fgLine(fg) }}<span v-if="fg.measurement?.gainPerHourPct != null">
                      · +1 h gives {{ r1(fg.measurement.gainPerHourPct) }}%</span
                    ></span
                  >
                  <span v-if="fg.goalSet && pluginGoalDriven"
                    >Goal-driven{{ fg.readiness && !fg.readiness.open ? ' · scheduler stopped' : '' }}</span
                  >
                  <span
                    v-else-if="filterOnCounts(fg)"
                    class="badge warn counts"
                    :title="ON_COUNTS_TITLE"
                    >Runs on counts: no goal set</span
                  >
                </div>
              </div>
              <span class="row num" style="justify-content: flex-end; flex-wrap: wrap; min-width: 0">
                <strong v-if="bodyKind" :title="bodyValueTitle(fg)">{{ bodyValue(fg) }}</strong>
                <strong v-else :title="measuredTitle(fg)">{{ measuredValue(fg) }}</strong>
                <span
                  v-if="mode === 'depth' && fg.measurement?.depth != null && fg.measurement.depthBand"
                  class="xsmall muted"
                  :title="
                    fg.measurement.depthApprox
                      ? 'Approximate: no Gaia XP photometry here, so this depth uses the Gaia G zero point'
                      : undefined
                  "
                  >{{ fg.measurement.depthBand }}</span
                >
                <span class="muted" style="white-space: nowrap">{{
                  fg.goalSet ? 'of' : fg.goal ? 'of default' : 'no goal · default'
                }}</span>
                <label :for="'goal-' + fg.filter" class="sr-only"
                  >{{ fg.filter }}
                  {{ bodyKind ? 'SNR goal' : mode === 'depth' ? 'depth goal' : 'faint SNR goal' }}</label
                >
                <input
                  :id="'goal-' + fg.filter"
                  class="input num"
                  type="number"
                  :step="mode === 'depth' ? 0.1 : 1"
                  :value="goalDraft[fg.filter] ?? (fg.goalSet ? goalValue(fg, mode) : '')"
                  :placeholder="String(goalValue(fg, mode))"
                  style="width: 5.5rem; height: 1.875rem; text-align: right"
                  @change="goalDraft[fg.filter] = numInput($event)"
                />
              </span>
            </div>
            <p v-if="!goals.length" class="empty">No enabled exposure plans on this target.</p>
          </div>
          <label v-if="bodyKind !== 'asteroid'" class="row small">
            <input
              type="checkbox"
              :checked="plateauStop"
              @change="plateauDraft = ($event.target as HTMLInputElement).checked"
            />
            Also stop a filter at its plateau, when one more hour improves the noise by less than
            {{ PLATEAU_GAIN_PCT }}%
          </label>
          <div
            class="spread"
            style="border-top: 1px solid var(--border); padding-top: 0.875rem; align-items: center"
          >
            <span class="small" style="max-width: 60ch">
              <template v-if="target && goals.length">{{ leastText(target.least) }}.</template>
              <span
                v-if="target && countsBadge(target.least)"
                class="badge warn counts"
                style="margin-left: 0.375rem"
                :title="ON_COUNTS_TITLE"
                >{{ countsBadge(target.least) }}</span
              >
              <template v-if="target?.least?.plateau && goals.length">
                <span :title="plateauTitle(target.least.plateau)" style="color: var(--plateau)">
                  Furthest from its plateau: {{ plateauWhere(target.least.plateau) }}.</span
                ></template
              >
            </span>
            <div class="row">
              <button
                v-if="goalDriven && !dirtyGoals"
                type="button"
                class="btn link small"
                @click="stopGoals"
              >
                Go back to the scheduler's counts
              </button>
              <template v-if="dirtyGoals">
                <button type="button" class="btn" @click="resetGoals">Reset</button>
                <button type="button" class="btn primary" @click="saveGoals">Save goals</button>
              </template>
              <button
                v-else-if="!goalDriven && goals.length"
                type="button"
                class="btn primary"
                @click="saveGoals"
              >
                Use these goals
              </button>
            </div>
          </div>
          <div v-if="isMosaic" class="note small" style="background: var(--secondary); border: 0">
            Each panel is measured on its own, and goals apply to every panel. The mosaic is done
            when its weakest panel is: now {{ p.weakestTarget ?? 'no panel with enabled plans' }}.
          </div>
        </section>

        <BodyNightsCard v-if="bodyKind" :kind="bodyKind" :goals="goals" :objects="bodyObjects" />
        <section v-else class="card" style="flex: 2 1 26rem" aria-labelledby="band-h">
          <div class="spread">
            <h2 id="band-h">Where the faint signal is measured</h2>
            <span class="xsmall muted">{{
              region
                ? 'Hand-drawn region · ' + region.length + ' points'
                : autoBand
            }}</span>
          </div>
          <FaintSignalOverlay
            :object="target?.name"
            :master="master"
            :polygon="shownPts"
            :drawing="drawing"
            :region-set="!!region"
            @point="(q) => pts.push(q)"
          />
          <p v-if="drawing" role="status" class="small" style="margin: 0; color: var(--warn)">
            {{
              pts.length < 3
                ? 'Click the preview to place at least 3 points around the faint signal.'
                : pts.length + ' points. Save to use this region.'
            }}
          </p>
          <div class="row">
            <button
              v-if="!drawing"
              type="button"
              class="btn"
              :disabled="!master || !target?.guid"
              @click="startDraw"
            >
              Draw a region
            </button>
            <template v-else>
              <button type="button" class="btn" @click="cancelDraw">Cancel</button>
              <button
                type="button"
                class="btn primary"
                :disabled="pts.length < 3"
                @click="saveRegion"
              >
                Use this region
              </button>
            </template>
            <button
              v-if="region && !drawing"
              type="button"
              class="btn link small"
              @click="clearRegion"
            >
              Back to the automatic band
            </button>
          </div>
        </section>
      </div>
      <section v-if="tab === 'goal'" class="card" aria-labelledby="meas-h">
        <h2 id="meas-h">What the stacker measured</h2>
        <p v-if="bodyKind" class="small" style="margin: 0">
          {{ bodyMeasureText(bodyKind) }}
        </p>
        <div v-else class="scroll-x">
          <table class="dgrid num xsmall">
            <thead>
              <tr>
                <th>Filter</th>
                <th>Faint band</th>
                <th>Noise σ</th>
                <th>Half-stack pairs</th>
                <th>Subs</th>
                <th>Depth</th>
                <th>Measured</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fg in goals" :key="'m-' + fg.filter">
                <td style="font-weight: 600">{{ fg.filter }}</td>
                <template v-if="fg.measurement">
                  <td>{{ bandText(fg) }}</td>
                  <td :title="noiseTitle(fg.measurement.noiseMask)">
                    {{ sig(fg.measurement.noise) }} · {{ noiseFrom(fg.measurement.noiseMask) }}
                  </td>
                  <td>{{ fg.measurement.pairs }} over {{ fg.measurement.levels }} levels</td>
                  <td>{{ fg.measurement.subs }} of {{ fg.measurement.subsTotal }}</td>
                  <td :title="fg.measurement.depthReason">
                    {{
                      fg.measurement.depth != null
                        ? (fg.measurement.depthApprox ? '≈ ' : '') +
                          r1(fg.measurement.depth) +
                          ' mag/arcsec² ' +
                          (fg.measurement.depthBand ?? '')
                        : fg.measurement.depthReason
                    }}
                  </td>
                  <td>{{ formatDate(Date.parse(fg.measurement.measuredAt) / 1000) }}</td>
                </template>
                <td v-else colspan="6" class="muted">Not measured yet: {{ measureText(fg) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!bodyKind" class="xsmall muted" style="margin: 0">
          Values are 4×4-binned rates in full-scale units per second. σ is the stack's noise at
          its current hours from the fit σ² = a²/t + b² to the half-stack differences (A−B)/√2;
          SNR is the band's median above the sky over σ.
        </p>
        <div v-if="target?.objectLinks?.length">
          <h3 class="small" style="margin: 0.5rem 0 0.25rem">Which frames count for this target</h3>
          <ul class="xsmall" style="margin: 0; padding-left: 1.125rem">
            <li v-for="l in target.objectLinks" :key="'link-' + l.object">
              <span style="font-weight: 600">{{ l.object }}</span>: {{ objectLinkText(l) }}
            </li>
          </ul>
        </div>
      </section>

      <section v-if="tab === 'plans'" class="card" aria-labelledby="plans-h">
        <div>
          <h2 id="plans-h">Filters</h2>
          <p class="small muted" style="margin: 0.125rem 0 0">
            Choose the filters this project images.
          </p>
        </div>

        <FilterChips
          :groups="filterGroups"
          :selected="shownFilters"
          :disabled="filterBusy"
          @toggle="toggleFilter"
        />

        <div v-if="stopping" class="confirm" role="alert">
          <p>
            <b>Stop imaging {{ stopping.name }}?</b> {{ stopText(stopping.name, stopping.subs) }}
          </p>
          <div class="row">
            <button type="button" class="btn sm2 danger" @click="confirmStop">
              Stop imaging {{ stopping.name }}
            </button>
            <button type="button" class="btn sm2" @click="stopping = null">Keep it</button>
          </div>
        </div>

        <div class="note">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted-foreground)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            style="flex: none; margin-top: 2px"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
          </svg>
          <span
            >Sub length, number of subs, gain and how dark the sky must be are chosen automatically
            for each filter. There is nothing to set per filter.</span
          >
        </div>

        <div class="flist">
          <div v-for="r in filterRows" :key="r.name" class="frow" :data-filter="r.name">
            <div class="fname">
              <span class="swatch" :style="{ background: filterColor(r.fg?.stackFilter ?? r.name) }" />{{
                r.name
              }}
            </div>
            <div class="fmain">
              <div class="headline">
                <span>{{ r.headline }}</span
                ><span v-if="r.fg?.measurement?.lowConfidence" class="badge warn">low confidence</span>
              </div>
              <div class="bar"><div :style="{ width: r.fill }" /></div>
              <dl v-if="r.facts.length" class="facts">
                <div v-for="f in r.facts" :key="f.label">
                  <dt>{{ f.label }}</dt>
                  <dd :class="f.measured ? 'num' : 'nm'">{{ f.value }}</dd>
                </div>
              </dl>
            </div>
            <span />
          </div>
          <p v-if="!filterRows.length" class="empty small muted" style="margin: 0">
            No filters chosen. This project images nothing until you choose one.
          </p>
        </div>
        <p class="xsmall muted" style="margin: 0">
          Progress and times come from the latest stack of each filter. "Low confidence" means the
          stack is too small to measure well yet.
        </p>
      </section>

      <section v-if="tab === 'scoring'" class="card" aria-labelledby="score-h">
        <div class="spread" style="align-items: flex-start">
          <div style="max-width: 72ch">
            <h2 id="score-h">How the planner scores this target</h2>
            <p class="small muted" style="margin: 0.25rem 0 0">
              Score = Σ weight × rule score at every re-plan. The four rules below that don't depend
              on the time of night are worked out here with Target Scheduler's formulas; the rest
              are scored by the planner when it runs.
            </p>
          </div>
          <div style="text-align: right">
            <div class="xsmall muted">Known part now</div>
            <div class="num" style="font-size: 1.75rem; font-weight: 600; line-height: 1.1">
              {{ r2(knownTotal) }}
            </div>
          </div>
        </div>
        <div :class="['wnote', 'small', weightDiffs.length ? 'differs' : '']" role="status">
          <span v-if="!weightDiffs.length"
            >This project uses the global rule weights, set on
            <RouterLink :to="{ name: 'rule-weights' }" class="underline">Rule weights</RouterLink>
            for every project.</span
          >
          <span v-else
            >This project's weights differ from the global set on
            {{ weightDiffs.length === 1 ? 'one rule' : weightDiffs.length + ' rules' }}, for
            example after an edit in Target Scheduler. The planner uses the project's own weights
            shown below.
            <RouterLink :to="{ name: 'rule-weights' }" class="underline"
              >Edit the global weights</RouterLink
            ></span
          >
          <button
            v-if="weightDiffs.length"
            type="button"
            class="btn"
            :disabled="resetBusy"
            @click="resetOpen = true"
          >
            Reset to global
          </button>
        </div>
        <div>
          <div v-for="r in scoreRows" :key="r.name" class="scorerow small num">
            <div style="min-width: 0">
              <div class="row" style="font-weight: 600">
                {{ r.name }}<span v-if="r.new" class="badge violet">New rule</span
                ><span v-if="r.missing" class="badge">not set, counts as 0</span
                ><span v-if="r.global !== undefined" class="badge bad"
                  >global {{ r.global }}</span
                >
              </div>
              <div class="xsmall muted">{{ r.description }}</div>
            </div>
            <div class="bar" aria-hidden="true"><div :style="{ width: r.w + '%' }" /></div>
            <span style="text-align: right; font-weight: 600" :aria-label="r.name + ' weight'">{{
              r.w
            }}</span>
            <span class="muted" style="text-align: right"
              >× {{ r.score === null ? 'at plan' : r2(r.score) }}</span
            >
            <div class="row" style="flex-wrap: nowrap">
              <div class="bar"><div :style="{ width: pct(r.contrib ?? 0) }" /></div>
              <span style="width: 2.5rem; text-align: right; font-weight: 600">{{
                r.contrib === null ? '—' : r2(r.contrib)
              }}</span>
            </div>
          </div>
        </div>
        <div class="row" style="gap: 0.75rem; align-items: stretch">
          <div class="tile small">
            <div style="font-weight: 600">Novelty for this target</div>
            <div class="muted">
              Least complete filter: {{ leastHeadline(target?.least) }}, with
              {{ r1(target?.effectiveHours ?? 0) }} h ({{ target?.effectiveHoursBasis }}), so
              Novelty scores {{ r2(target?.novelty ?? 0) }}.
            </div>
          </div>
          <div class="tile small">
            <div style="font-weight: 600">Rarity for this target</div>
            <div class="muted">
              <template v-if="!target?.season"
                >The scheduler has not worked out this target's season yet.</template
              >
              <template v-else-if="target.season.outOfSeason"
                >Out of season, so Rarity scores 0 until it rises again.</template
              >
              <template v-else
                >{{
                  target.season.nightsLeft >= 365
                    ? 'Usable on every night the scheduler scanned (365)'
                    : target.season.nightsLeft + ' usable nights left this season'
                }}
                as of {{ target.season.computedFor }}, so Rarity scores {{ r2(target.rarity) }}.</template
              >
            </div>
          </div>
          <div v-for="sw in switchTiles" :key="sw.key" class="tile small">
            <div style="font-weight: 600">
              {{ sw.label }}: {{ sw.on ? 'on' : sw.set ? 'off' : 'off, not set'
              }}<span v-if="sw.global !== undefined" class="badge bad" style="margin-left: 0.375rem"
                >global {{ sw.global ? 'on' : 'off' }}</span
              >
            </div>
            <div class="muted">
              {{ sw.description }} It is part of the global rule weights.
            </div>
          </div>
        </div>
        <RuleWeightsConfirm
          v-if="resetOpen"
          :title="`Reset ${p.name} to the global weights?`"
          action="Reset this project"
          :changes="[]"
          :projects="resetProjects"
          :busy="resetBusy"
          @cancel="resetOpen = false"
          @confirm="resetWeights"
        />
      </section>

      <section v-if="tab === 'options'" class="card" aria-labelledby="opt-h">
        <div>
          <h2 id="opt-h">Scheduler options</h2>
          <p class="small muted" style="margin: 0.125rem 0 0">
            {{
              isMosaic
                ? `Project settings apply to all ${p.targets.length} panels of ${p.name}.`
                : `Project settings for ${p.name}.`
            }}
          </p>
        </div>
        <div class="optgrid">
          <label class="field">
            <span>Priority</span>
            <select
              class="input"
              :value="optDraft.priority ?? p.priority"
              @change="optDraft.priority = ($event.target as HTMLSelectElement).value"
            >
              <option>High</option>
              <option>Normal</option>
              <option>Low</option>
            </select>
          </label>
          <label class="field">
            <span>State</span>
            <select
              class="input"
              :value="optDraft.state ?? p.state"
              @change="optDraft.state = ($event.target as HTMLSelectElement).value"
            >
              <option>Active</option>
              <option>Inactive</option>
              <option>Closed</option>
              <option v-if="p.state === 'Draft'">Draft</option>
            </select>
          </label>
        </div>
        <div v-if="optDirty" class="row" style="justify-content: flex-end">
          <button type="button" class="btn" @click="resetOpts">Reset</button>
          <button type="button" class="btn primary" @click="saveOpts">
            Save options
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page.sched {
  max-width: none;
  margin-inline: 0;
  padding: 0;
  gap: 1rem;
}
.note {
  display: flex;
  gap: 0.625rem;
  align-items: flex-start;
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
}
.warn {
  display: flex;
  gap: 0.5rem;
  background: var(--warn-bg);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
}
.badge.warn {
  display: inline-flex;
  gap: 0.375rem;
  padding: 0.125rem 0.5rem;
}
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
.seg {
  display: inline-flex;
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
.goalrow {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr) 11rem;
  gap: 0.75rem;
  align-items: center;
}
.swatch {
  flex: none;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 2px;
  margin-right: 0.375rem;
}
.bar {
  flex: 1;
  height: 0.4375rem;
  border-radius: 999px;
  background: var(--secondary);
  overflow: hidden;
  min-width: 4rem;
}
.bar.tall {
  height: 0.625rem;
}
.bar > div {
  height: 100%;
  background: var(--foreground);
}
.flist {
  display: flex;
  flex-direction: column;
}
.frow {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr) auto;
  gap: 0.375rem 1rem;
  align-items: start;
  padding: 0.875rem 0;
  border-top: 1px solid var(--border);
}
.frow:first-child {
  border-top: 0;
  padding-top: 0;
}
.fname {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  white-space: nowrap;
}
.fname .swatch {
  margin-right: 0;
}
.fmain {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}
.headline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  font-size: 0.8125rem;
}
.fmain .bar {
  flex: none;
  min-width: 0;
}
.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
  gap: 0.25rem 1rem;
}
.facts div {
  min-width: 0;
}
.facts dt {
  color: var(--muted-foreground);
  font-size: 0.75rem;
}
.facts dd {
  margin: 0;
  font-weight: 600;
  font-size: 0.8125rem;
}
.facts dd.nm {
  font-weight: 400;
  color: var(--muted-foreground);
}
.confirm {
  border: 1px solid var(--warn);
  background: var(--warn-bg);
  border-radius: 0.625rem;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.8125rem;
}
.confirm p {
  margin: 0;
}
.btn.sm2 {
  height: 1.875rem;
  padding: 0 0.75rem;
  font-size: 0.8125rem;
}
.scorerow {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(8rem, 1fr) 3rem 4.5rem minmax(6rem, 0.8fr);
  gap: 0.5rem 1rem;
  align-items: center;
  padding: 0.625rem 0;
  border-top: 1px solid var(--border);
}
.tile {
  flex: 1 1 20rem;
  background: var(--secondary);
  border-radius: 0.5rem;
  padding: 0.75rem;
}
.sched {
  border-top: 1px solid var(--border);
  padding-top: 0.875rem;
}
.optgrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.75rem;
}
.wnote {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  background: var(--secondary);
}
.wnote.differs {
  border: 1px solid var(--warn);
}
.scorerow .badge.violet {
  border: 0;
  background: var(--violet-bg);
  color: var(--violet);
}
@media (max-width: 640px) {
  .frow {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .frow .fmain {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .goalrow {
    grid-template-columns: 5.75rem minmax(0, 1fr);
  }
  .goalrow > :last-child {
    grid-column: 1 / -1;
  }
  .scorerow {
    grid-template-columns: minmax(0, 1fr) 3rem;
  }
}
</style>
