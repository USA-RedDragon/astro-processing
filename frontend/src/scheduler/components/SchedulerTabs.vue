<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import {
  basisText,
  filterColor,
  getProject,
  getStacks,
  goalTiming,
  measureText,
  pct,
  planCountText,
  r1,
  r2,
  seasonLabel,
  PRIORITY_INDEX,
  STATE_INDEX,
  type FilterGoal,
  type GoalKind,
  type Plan,
  type Point,
  type ProjectDetail,
  type StackMaster,
  type Target,
} from '../api/planning'
import { submitCommand } from '../api/commands'
import { errorToast, exposureEnd, notifyCommand, shell, whenApplies } from '../shell'
import { onEvent } from '../api/events'
import FaintSignalOverlay from './FaintSignalOverlay.vue'
import { api, query } from '../api/client'

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

async function load() {
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
    if (e.data?.status === 'applied') load()
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
const weakest = computed(() => {
  let w: FilterGoal | undefined
  for (const g of goals.value) if (!w || g.percentComplete < w.percentComplete) w = g
  return w
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
  return 'Measured ' + new Date(m.measuredAt).toLocaleString()
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

const planDraft = reactive<Record<number, { enabled?: boolean; desired?: number }>>({})
watch(panelIdx, () => Object.keys(planDraft).forEach((k) => delete planDraft[Number(k)]))
const planDirty = computed(() => Object.keys(planDraft).length > 0)

function planOn(id: number, base: boolean) {
  return planDraft[id]?.enabled ?? base
}

function planDesired(id: number, base: number) {
  return planDraft[id]?.desired ?? base
}

function planGoal(pl: Plan): FilterGoal | undefined {
  return target.value?.goals.find((g) => g.goalSet && g.filter === pl.filter)
}

async function savePlans() {
  const t = target.value
  if (!t) return
  const items = t.plans
    .map((pl) => {
      const d = planDraft[pl.id] ?? {}
      const changes: { field: string; before: unknown; after: unknown }[] = []
      if (d.enabled !== undefined && d.enabled !== pl.enabled)
        changes.push({ field: 'enabled', before: pl.enabled, after: d.enabled })
      if (d.desired !== undefined && d.desired !== pl.desired && d.desired >= 0)
        changes.push({ field: 'desired', before: pl.desired, after: d.desired })
      return { id: pl.id, guid: pl.guid, name: pl.template, parent: t.name, changes }
    })
    .filter((i) => i.changes.length)
  Object.keys(planDraft).forEach((k) => delete planDraft[Number(k)])
  if (!items.length) return
  try {
    const r = await submitCommand('exposureplan.batchedit', { items })
    notifyCommand(r)
    await load()
  } catch (e) {
    errorToast(e)
  }
}

const wDraft = reactive<Record<string, number>>({})
const weights = computed(() => {
  const out: Record<string, { weight: number; missing: boolean }> = {}
  for (const w of p.value?.ruleWeights ?? []) out[w.name] = { weight: w.weight, missing: w.missing }
  return out
})
const wDirty = computed(() =>
  Object.keys(wDraft).some(
    (k) => wDraft[k] !== weights.value[k]?.weight || weights.value[k]?.missing,
  ),
)

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
  (detail.value?.rules ?? []).map((r) => {
    const cur = weights.value[r.name]
    const w = wDraft[r.name] ?? (cur && !cur.missing ? cur.weight : 0)
    const s = ruleScore(r.name)
    return {
      ...r,
      w,
      missing: !cur || cur.missing,
      score: s,
      contrib: s === null ? null : (w / 100) * s,
    }
  }),
)
const knownTotal = computed(() => scoreRows.value.reduce((a, r) => a + (r.contrib ?? 0), 0))

const steeringRow = computed(
  () =>
    (p.value as { filterSteering?: { weight: number; missing: boolean } } | undefined)
      ?.filterSteering,
)
const steering = computed(
  () => !!steeringRow.value && !steeringRow.value.missing && steeringRow.value.weight > 0,
)

const steeringOn =
  'On: each target and panel shoots the filter furthest behind its goal that still gains most ' +
  'per hour, keeping broadband out of a bright moon.'

async function toggleSteering() {
  const pr = p.value
  if (!pr) return
  const cur = steeringRow.value
  try {
    const r = await submitCommand('ruleweight.edit', {
      project_id: pr.id,
      project_guid: pr.guid,
      project_name: pr.name,
      changes: [
        {
          rule: 'Filter Steering',
          before: cur && !cur.missing ? cur.weight : null,
          after: steering.value ? 0 : 100,
        },
      ],
    })
    notifyCommand(r)
    await load()
  } catch (e) {
    errorToast(e)
  }
}

async function saveWeights() {
  const pr = p.value
  if (!pr) return
  const changes = Object.keys(wDraft)
    .map((name) => {
      const cur = weights.value[name]
      const before = cur && !cur.missing ? cur.weight : null
      return { rule: name, before, after: wDraft[name] }
    })
    .filter((c) => c.before !== c.after)
  Object.keys(wDraft).forEach((k) => delete wDraft[k])
  if (!changes.length) return
  try {
    const r = await submitCommand('ruleweight.edit', {
      project_id: pr.id,
      project_guid: pr.guid,
      project_name: pr.name,
      changes,
    })
    notifyCommand(r)
    await load()
  } catch (e) {
    errorToast(e)
  }
}

const optDraft = reactive<{
  priority?: string
  state?: string
  minimumTime?: number
  minimumAltitude?: number
}>({})
const optDirty = computed(() => {
  const pr = p.value
  if (!pr) return false
  return (
    (optDraft.priority !== undefined && optDraft.priority !== pr.priority) ||
    (optDraft.state !== undefined && optDraft.state !== pr.state) ||
    (optDraft.minimumTime !== undefined && optDraft.minimumTime !== pr.minimumTime) ||
    (optDraft.minimumAltitude !== undefined && optDraft.minimumAltitude !== pr.minimumAltitude)
  )
})

function resetOpts() {
  delete optDraft.priority
  delete optDraft.state
  delete optDraft.minimumTime
  delete optDraft.minimumAltitude
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
  if (optDraft.minimumTime !== undefined && optDraft.minimumTime !== pr.minimumTime)
    changes.push({ field: 'minimumtime', before: pr.minimumTime, after: optDraft.minimumTime })
  if (optDraft.minimumAltitude !== undefined && optDraft.minimumAltitude !== pr.minimumAltitude)
    changes.push({
      field: 'minimumaltitude',
      before: pr.minimumAltitude,
      after: optDraft.minimumAltitude,
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
                {{ mode === 'snr' ? 'Faint-signal SNR per filter' : 'Depth per filter' }}
              </h2>
              <p class="small muted" style="margin: 0.25rem 0 0; max-width: 70ch">
                Bars show completion the way Target Scheduler counts it. A filter with a goal
                finishes on its goal and ignores its desired count; a filter without one finishes
                on its desired count.
              </p>
            </div>
            <div role="group" aria-label="Goal type" class="seg">
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
                <div class="bar tall" :title="pct(fg.percentComplete / 100) + ' ' + basisText(fg.completionBasis)">
                  <div
                    :style="{
                      width: pct(fg.percentComplete / 100),
                      background: filterColor(fg.stackFilter),
                    }"
                  />
                </div>
                <div class="spread xsmall muted num">
                  <span
                    >{{ pct(fg.percentComplete / 100) }} {{ basisText(fg.completionBasis) }} ·
                    {{
                      fg.measurement
                        ? r1(fg.measurement.effectiveHours) + ' h effective'
                        : r1(fg.acceptedHours) + ' h accepted'
                    }}
                    · {{ goalTiming(fg)
                    }}<span v-if="fg.measurement?.gainPerHourPct != null">
                      · +1 h gives {{ r1(fg.measurement.gainPerHourPct) }}%</span
                    ></span
                  >
                  <span v-if="fg.goalSet"
                    >Goal-driven{{ fg.readiness && !fg.readiness.open ? ' · scheduler stopped' : '' }}</span
                  >
                  <span v-else>Scheduler count {{ fg.accepted }}/{{ fg.desired }}</span>
                </div>
              </div>
              <span class="row num" style="justify-content: flex-end; flex-wrap: nowrap">
                <strong :title="measuredTitle(fg)">{{ measuredValue(fg) }}</strong>
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
                  >{{ fg.filter }} {{ mode === 'depth' ? 'depth goal' : 'faint SNR goal' }}</label
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
          <label class="row small">
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
              <template v-if="weakest && weakest.percentComplete >= 100"
                >Every filter is complete.</template
              >
              <template v-else-if="weakest"
                >Least complete: {{ weakest.filter }} at {{ pct(weakest.percentComplete / 100) }}
                {{ basisText(weakest.completionBasis) }}.</template
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

        <section class="card" style="flex: 2 1 26rem" aria-labelledby="band-h">
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
        <div class="scroll-x">
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
                  <td>{{ new Date(fg.measurement.measuredAt).toLocaleString() }}</td>
                </template>
                <td v-else colspan="6" class="muted">Not measured yet: {{ measureText(fg) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="xsmall muted" style="margin: 0">
          Values are 4×4-binned rates in full-scale units per second. σ is the stack's noise at
          its current hours from the fit σ² = a²/t + b² to the half-stack differences (A−B)/√2;
          SNR is the band's median above the sky over σ.
        </p>
      </section>

      <section v-if="tab === 'plans'" class="card" aria-labelledby="plans-h">
        <div class="spread" style="align-items: center">
          <div>
            <h2 id="plans-h">Exposure plans · {{ target?.exposureSet }}</h2>
            <p class="small muted" style="margin: 0.125rem 0 0">
              A plan whose filter has a goal is goal-driven: the goal decides when it is done and
              its desired count is not used. Desired counts apply only to plans without a goal.
            </p>
          </div>
          <div v-if="planDirty" class="row">
            <button
              type="button"
              class="btn"
              @click="Object.keys(planDraft).forEach((k) => delete planDraft[Number(k)])"
            >
              Reset
            </button>
            <button type="button" class="btn primary" @click="savePlans">Save plans</button>
          </div>
        </div>
        <div class="scroll-x" style="border: 1px solid var(--border); border-radius: 0.5rem">
          <table class="dgrid num">
            <thead>
              <tr>
                <th>On</th>
                <th>Template</th>
                <th style="text-align: right">Exposure</th>
                <th style="text-align: right">Desired or goal</th>
                <th style="text-align: right">Acquired</th>
                <th style="text-align: right">Accepted</th>
                <th>Gain · moon</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pl in target?.plans ?? []" :key="pl.id">
                <td>
                  <input
                    type="checkbox"
                    :checked="planOn(pl.id, pl.enabled)"
                    :aria-label="pl.template + ' plan enabled'"
                    @change="
                      planDraft[pl.id] = {
                        ...planDraft[pl.id],
                        enabled: ($event.target as HTMLInputElement).checked,
                      }
                    "
                  />
                </td>
                <td style="font-weight: 600; white-space: nowrap">{{ pl.template }}</td>
                <td style="text-align: right">{{ pl.exposure }} s</td>
                <td v-if="planGoal(pl)" class="muted" style="text-align: right; white-space: normal">
                  {{ planCountText(planGoal(pl)) }}
                </td>
                <td v-else style="text-align: right">
                  <input
                    class="input num"
                    type="number"
                    min="0"
                    :value="planDesired(pl.id, pl.desired)"
                    :aria-label="pl.template + ' desired'"
                    style="width: 5rem; height: 1.875rem; text-align: right"
                    @change="planDraft[pl.id] = { ...planDraft[pl.id], desired: numInput($event) }"
                  />
                </td>
                <td style="text-align: right">{{ pl.acquired }}</td>
                <td style="text-align: right">{{ pl.accepted }}</td>
                <td class="muted" style="white-space: nowrap">
                  gain {{ pl.gain ?? 'camera default' }} · moon {{ pl.moonSeparation }}° / {{ pl.moonWidth }} d
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="xsmall muted" style="margin: 0">
          To swap the whole set, select the project in
          <RouterLink to="/?view=list" class="lnk" style="text-decoration: underline"
            >Projects</RouterLink
          >
          and use Apply an exposure set.
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
        <div>
          <div v-for="r in scoreRows" :key="r.name" class="scorerow small num">
            <div style="min-width: 0">
              <div class="row" style="font-weight: 600">
                {{ r.name }}<span v-if="r.new" class="badge violet">New rule</span
                ><span v-if="r.missing" class="badge">not set, counts as 0</span>
              </div>
              <div class="xsmall muted">{{ r.description }}</div>
            </div>
            <label class="field">
              Weight
              <input
                type="range"
                min="0"
                max="100"
                :value="r.w"
                @input="wDraft[r.name] = numInput($event)"
              />
            </label>
            <span style="text-align: right; font-weight: 600">{{ r.w }}</span>
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
              Least complete plan at {{ pct(target?.progress ?? 0) }}, with
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
          <div class="tile small">
            <label class="row" style="font-weight: 600; flex-wrap: nowrap">
              <input type="checkbox" :checked="steering" @change="toggleSteering" />
              Steer filters by goal
            </label>
            <div class="muted">
              {{ steering ? steeringOn : "Off: filters follow the scheduler's exposure order." }}
              Targets without goals always follow the exposure order.
            </div>
          </div>
        </div>
        <div v-if="wDirty" class="row" style="justify-content: flex-end">
          <button
            type="button"
            class="btn"
            @click="Object.keys(wDraft).forEach((k) => delete wDraft[k])"
          >
            Reset
          </button>
          <button type="button" class="btn primary" @click="saveWeights">Save weights</button>
        </div>
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
          <label class="field">
            <span>Minimum time, min</span>
            <input
              class="input num"
              type="number"
              min="10"
              max="600"
              :value="optDraft.minimumTime ?? p.minimumTime"
              @change="optDraft.minimumTime = numInput($event)"
            />
          </label>
          <label class="field">
            <span>Minimum altitude, °</span>
            <input
              class="input num"
              type="number"
              min="0"
              max="80"
              :value="optDraft.minimumAltitude ?? p.minimumAltitude"
              @change="optDraft.minimumAltitude = numInput($event)"
            />
          </label>
        </div>
        <div v-if="optDirty" class="row" style="justify-content: flex-end">
          <button type="button" class="btn" @click="resetOpts">Reset</button>
          <button type="button" class="btn primary" @click="saveOpts">Save options</button>
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
.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem 1rem;
}
.facts dt {
  color: var(--muted-foreground);
  font-size: 0.75rem;
}
.facts dd {
  margin: 0;
  font-weight: 600;
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
.optgrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.75rem;
}
.scorerow .badge.violet {
  border: 0;
  background: var(--violet-bg);
  color: var(--violet);
}
@media (max-width: 640px) {
  .goalrow {
    grid-template-columns: 4rem minmax(0, 1fr);
  }
  .goalrow > :last-child {
    grid-column: 1 / -1;
  }
  .scorerow {
    grid-template-columns: minmax(0, 1fr) 3rem;
  }
}
</style>
