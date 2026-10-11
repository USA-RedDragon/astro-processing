<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { editEntity } from '../api/commands'
import {
  getMoon,
  getPreview,
  getProjects,
  postPreview,
  type MoonNight,
  type Night,
  type OverrideField,
  type Preview,
  type SchedProject,
} from '../api/scheduler'
import { clock, hm, longDate, nightOf } from '../format'
import {
  FIELD_LABELS,
  addChange,
  duration,
  editsFor,
  fieldValue,
  filterColor,
  fitLabel,
  hourTicks,
  ms,
  nightRange,
  overrides,
  LEFT_OUT_KINDS,
  leftOutGroups,
  pickTable,
  planDiff,
  planSummary,
  runs,
  scale,
  twilightBands,
  valueChoices,
  valueLabel,
  weightText,
  type Run,
  type WhatIfChange,
} from '../plan'
import { errorToast, notifyCommand, shell, showToast, upsertWaiting } from '../shell'
import PageHead from '../components/PageHead.vue'
import RuleWeightsConfirm from '../components/RuleWeightsConfirm.vue'
import {
  applyRuleWeights,
  getRuleWeights,
  previewRuleWeights,
  type GlobalWeights,
  type ProjectWeights,
} from '../api/ruleweights'
import {
  applyOutcome,
  ruleFor,
  supportsWeightOverrides,
  weightChanges,
  weightValue,
  weightsFromQuery,
} from '../ruleWeights'
import { latestOnly } from '../latest'
import {
  moonLine,
  moonPhaseText,
  mosaicBalance,
  nightSpan,
  timelineScrollLeft,
} from '../nowtonight'
import { getPlanning, type Snapshot } from '../api/planning'
import { onEvent } from '../api/events'
import { onChange } from '@/lib/events'
import { flatsTile, moonTile, mosaicTile } from '../tonightTiles'

const night = ref<Night>('tonight')
const preview = ref<Preview | null>(null)
const error = ref('')
const loading = ref(false)
const previewReq = latestOnly()

async function load(fresh = false, live = false) {
  const current = previewReq.next()
  loading.value = true
  try {
    const p = await getPreview(night.value, fresh)
    if (!current()) return
    preview.value = p
    error.value = ''
    loadMoon()
    if (fresh)
      showToast({
        text: 'Re-simulated at ' + clock(Date.now()),
        sub: "The plan now reflects the scheduler's current state.",
      })
  } catch (e) {
    if (!current() || live) return
    preview.value = null
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (current()) loading.value = false
  }
}

const moonNight = ref<MoonNight | null>(null)
const moonError = ref('')
const moonReq = latestOnly()

async function loadMoon() {
  const r = nightRange(preview.value)
  if (!r) return
  const current = moonReq.next()
  try {
    const m = await getMoon(new Date(r[0]).toISOString(), new Date(r[1]).toISOString())
    if (!current()) return
    moonNight.value = m
    moonError.value = ''
  } catch (e) {
    if (!current()) return
    moonNight.value = null
    moonError.value = e instanceof Error ? e.message : String(e)
  }
}

const projects = ref<SchedProject[]>([])
const projectsError = ref('')

async function loadProjects() {
  try {
    projects.value = await getProjects()
    projectsError.value = ''
  } catch (e) {
    projects.value = []
    projectsError.value = e instanceof Error ? e.message : String(e)
  }
}

const planning = ref<Snapshot | null>(null)
const planningError = ref('')

async function loadPlanning() {
  try {
    planning.value = await getPlanning()
    planningError.value = ''
  } catch (e) {
    planning.value = null
    planningError.value = e instanceof Error ? e.message : String(e)
  }
}

const route = useRoute()
const gw = ref<GlobalWeights | null>(null)
const gwError = ref('')

async function loadWeights() {
  try {
    gw.value = await getRuleWeights()
    gwError.value = ''
    const fromQuery = weightsFromQuery(route.query.w, gw.value.rules)
    if (Object.keys(fromQuery).length) {
      weightDraft.value = { ...weightDraft.value, ...fromQuery }
      runWhatIf()
    }
  } catch (e) {
    gw.value = null
    gwError.value = e instanceof Error ? e.message : String(e)
  }
}

// The plan follows the scheduler's tables and applied commands; a failed
// live reload keeps the plan on screen.
function reloadLive() {
  load(false, true)
  loadProjects()
  loadPlanning()
}

const offLive: (() => void)[] = []

onMounted(() => {
  load()
  loadProjects()
  loadPlanning()
  loadWeights()
  offLive.push(
    onChange(['project', 'target', 'exposureplan', 'acquiredimage'], reloadLive, 15000),
    onEvent('command', (e: { data?: { status?: string } }) => {
      if (e.data?.status === 'applied') reloadLive()
    }),
  )
})

onUnmounted(() => offLive.forEach((f) => f()))

watch(night, () => {
  preview.value = null
  moonNight.value = null
  whatIf.value = null
  load()
  if (hasChanges.value) runWhatIf()
})

const nightDate = computed(() => {
  const base = nightOf(shell.now)
  return night.value === 'tonight' ? base : new Date(base.getTime() + 24 * 3600 * 1000)
})

const nightLabel = computed(() => {
  const d = 'Night of ' + longDate(nightDate.value)
  if (preview.value?.generated_at)
    return `${d} · simulated ${clock(preview.value.generated_at)} on the scheduler's own planner`
  return d
})

const summary = computed(() => planSummary(preview.value))
const tiles = computed(() => {
  const s = summary.value
  const from = isNaN(s.start) ? '' : ` from ${clock(s.start)}`
  return [
    {
      label: 'Astronomical dark',
      value:
        !isNaN(s.darkStart) && !isNaN(s.darkEnd) ? `${hm(s.darkStart)} – ${clock(s.darkEnd)}` : 'None',
      note: isNaN(s.darkSeconds) ? 'the sun never gets 18° down' : duration(s.darkSeconds),
    },
    {
      label: 'Planned imaging' + from,
      value: duration(s.imagingSeconds),
      note: `${s.targets} ${s.targets === 1 ? 'target' : 'targets'}, ${s.projects} ${s.projects === 1 ? 'project' : 'projects'}`,
    },
    moonTile(moonNight.value, preview.value, range.value, moonError.value),
    mosaicTile(preview.value, projects.value, projectsError.value),
    flatsTile(preview.value, planning.value, planningError.value),
    {
      label: 'Subs planned',
      value: String(s.subs),
      note: s.filters.map((f) => `${f.name} ${f.subs}`).join(' · '),
    },
    {
      label: 'Waits',
      value: String(s.waits),
      note: s.waits
        ? duration(s.waitSeconds) + ' in all'
        : from
          ? `No waits${from.replace(' from', ' after')}`
          : 'No waits',
    },
  ]
})

const W = 1200
const LABEL_W = 150
const range = computed(() => nightRange(preview.value))
const sc = computed(() => (range.value ? scale(range.value[0], range.value[1], LABEL_W, W) : null))
const bands = computed(() => (sc.value ? twilightBands(preview.value?.twilight, sc.value) : []))
const tickAnchor = (x: number, size: number) => (x > W - size * 1.6 ? 'end' : 'middle')
const ticks = computed(() =>
  sc.value
    ? hourTicks(sc.value.t0, sc.value.t1).map((t) => ({ x: sc.value!.x(t), label: hm(t) }))
    : [],
)
const nowX = computed(() => {
  const s = sc.value
  if (!s || night.value !== 'tonight' || shell.now < s.t0 || shell.now > s.t1) return null
  return s.x(shell.now)
})

const MOON_Y = 170
const moonY = (alt: number) => MOON_Y - Math.max(-44, Math.min(44, alt)) * 0.5
const moonPaths = computed(() => {
  const s = sc.value
  const m = moonNight.value
  if (!s || !m)
    return {
      below: '',
      above: [] as string[],
      marks: [] as { x: number; label: string; anchor: string }[],
    }
  const pts = m.samples
    .map((p) => ({ t: ms(p.t), alt: p.alt }))
    .filter((p) => p.t >= s.t0 && p.t <= s.t1)
  const below = pts
    .map((p, i) => `${i ? 'L' : 'M'}${s.x(p.t).toFixed(1)} ${moonY(Math.min(0, p.alt)).toFixed(1)}`)
    .join(' ')
  const above: string[] = []
  let seg: string[] = []
  for (const p of pts) {
    if (p.alt >= 0)
      seg.push(`${seg.length ? 'L' : 'M'}${s.x(p.t).toFixed(1)} ${moonY(p.alt).toFixed(1)}`)
    else if (seg.length) {
      above.push(seg.join(' '))
      seg = []
    }
  }
  if (seg.length) above.push(seg.join(' '))
  const marks: { x: number; label: string; anchor: string }[] = []
  const add = (v: string, word: string) => {
    const t = ms(v)
    if (t < s.t0 || t > s.t1) return
    const x = s.x(t)
    marks.push({ x, label: `${word} ${clock(t)}`, anchor: x > W - 120 ? 'end' : 'start' })
  }
  m.rises.forEach((v) => add(v, 'rises'))
  m.sets.forEach((v) => add(v, 'sets'))
  return { below, above, marks }
})
const moonCaption = computed(() => {
  const r = range.value
  return r ? moonLine(moonNight.value, r[0], r[1]) : ''
})
const moonPhase = computed(() => moonPhaseText(moonNight.value))
const phaseText = computed(() => {
  const bar = Math.max(2, (W - LABEL_W) * (moonNight.value?.illumination ?? 0))
  return bar > (W - LABEL_W) * 0.6
    ? { x: LABEL_W + 8, fill: 'var(--background)' }
    : { x: LABEL_W + bar + 8, fill: 'var(--muted-foreground)' }
})
const moonAllDown = computed(() => /below the horizon all night/.test(moonCaption.value))
const svgH = computed(() => (moonNight.value ? 270 : 150))
const bandH = computed(() => svgH.value - 36)

const PALETTE = ['var(--c1)', 'var(--c4)', 'var(--c2)', 'var(--c3)']

function colourFor(r: Run, order: Map<number, number>): string {
  const key = r.project_id ?? r.target_id ?? 0
  if (!order.has(key)) order.set(key, order.size)
  return PALETTE[order.get(key)! % PALETTE.length]
}

interface Bar {
  x: number
  w: number
  colour: string
  wait: boolean
  name: string
  sub: string
  title: string
  targetId?: number
  start: number
  end: number
  reason: string
}

function bars(p: Preview | null, order: Map<number, number>): Bar[] {
  const s = sc.value
  if (!s || !p) return []
  return runs(p.blocks).map((r) => {
    const x = s.x(r.start)
    const w = Math.max(1, s.x(r.end) - x)
    const total = r.pick?.total
    const score = total !== null && total !== undefined ? total.toFixed(2) : ''
    const project = r.project_name && r.project_name !== r.target_name ? r.project_name : ''
    return {
      x,
      w,
      colour: r.wait ? 'var(--muted-foreground)' : colourFor(r, order),
      wait: r.wait,
      name: r.wait ? 'Wait' : (r.target_name ?? ''),
      sub: r.wait ? '' : [project, score].filter(Boolean).join(' · '),
      title: r.wait
        ? `Wait ${hm(r.start)}–${clock(r.end)}`
        : `${r.target_name} ${hm(r.start)}–${clock(r.end)}${r.reason ? ' · ' + r.reason : ''}`,
      targetId: r.wait ? undefined : r.target_id,
      start: r.start,
      end: r.end,
      reason: r.reason ?? '',
    }
  })
}

const colourOrder = computed(() => new Map<number, number>())
const targetBars = computed(() => bars(preview.value, colourOrder.value))

const filterBars = computed(() => {
  const s = sc.value
  if (!s) return []
  return (preview.value?.blocks ?? [])
    .filter((b) => !b.wait)
    .map((b) => {
      const x = s.x(ms(b.start))
      return {
        x,
        w: Math.max(0.5, s.x(ms(b.end)) - x),
        fill: filterColor(b.filter),
        title: `${b.filter ?? ''} · ${b.count ?? 0} × ${b.exposure_seconds ?? 0} s`,
      }
    })
    .filter((b) => !isNaN(b.x) && !isNaN(b.w))
})

const timelineEl = ref<HTMLElement | null>(null)
let scrolledFor = ''
watch(
  [timelineEl, filterBars],
  async () => {
    const el = timelineEl.value
    const s = sc.value
    if (!el || !s) return
    const key = `${night.value}:${s.t0}`
    if (key === scrolledFor) return
    const focus = nowX.value ?? filterBars.value[0]?.x
    if (focus === undefined) return
    await nextTick()
    const svg = el.querySelector('svg')
    if (!svg) return
    scrolledFor = key
    el.scrollLeft = timelineScrollLeft(focus, W, svg.getBoundingClientRect().width, el.clientWidth)
  },
  { flush: 'post' },
)

const legend = computed(() =>
  summary.value.filters.map((f) => ({ label: f.name, fill: f.color })),
)

const timelineLabel = computed(() => {
  const r = runs(preview.value?.blocks).filter((x) => !x.wait)
  const moon = moonCaption.value ? ' ' + moonCaption.value : ''
  if (!r.length) return 'Tonight has nothing planned.' + moon
  return (
    "Tonight's plan: " +
    r.map((x) => `${x.target_name} from ${hm(x.start)} to ${clock(x.end)}`).join(', ') +
    '.' +
    moon
  )
})

const picks = computed(() => pickTable(preview.value?.blocks))
const fmtScore = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(2))
const leftOut = computed(() => leftOutGroups(preview.value?.left_out))
const kindStyle = Object.fromEntries(LEFT_OUT_KINDS.map((k) => [k.kind, k]))
const leftOutLegend = computed(() => {
  const seen = new Set(leftOut.value.main.map((l) => l.kind))
  if (leftOut.value.hidden.length) seen.add('hidden')
  return LEFT_OUT_KINDS.filter((k) => seen.has(k.kind))
})
const targetRoute = (id: number) => ({ name: 'TargetDetails', params: { id: String(id) } })

const fields: OverrideField[] = ['priority', 'state', 'minimumtime']
const WEIGHT = 'weight'
const wiProject = ref<number | null>(null)
const wiField = ref<OverrideField | typeof WEIGHT>('priority')
const wiValue = ref<number | null>(null)
const wiRule = ref('')
const wiWeight = ref<number | null>(null)
const changes = ref<WhatIfChange[]>([])
const weightDraft = ref<Record<string, number>>({})
const weighting = computed(() => wiField.value === WEIGHT)
const projectField = computed<OverrideField>(() =>
  wiField.value === WEIGHT ? 'priority' : wiField.value,
)
const wiRuleInfo = computed(() => (gw.value ? ruleFor(gw.value.rules, wiRule.value) : undefined))
const wiRuleNow = computed(() => gw.value?.weights[wiRule.value] ?? null)
const weightPicks = computed(() => (gw.value ? weightChanges(gw.value, weightDraft.value) : []))
const hasChanges = computed(() => changes.value.length > 0 || weightPicks.value.length > 0)
const weightsIgnored = computed(
  () => weightPicks.value.length > 0 && !!whatIf.value && !supportsWeightOverrides(whatIf.value),
)
const weightNote = computed(() => {
  const g = gw.value
  let t = 'A rule weight change runs with the new value on every project that takes it.'
  if (g?.differing.length)
    t += ` ${g.differing.length} of ${g.projects} projects differ from the global weights now; the simulation keeps their other weights as they are.`
  return t
})
const pluginVersion = computed(() => shell.scheduler.version || 'unknown')
const whatIf = ref<Preview | null>(null)
const whatIfError = ref('')
const whatIfBusy = ref(false)
const applying = ref(false)
const whatIfReq = latestOnly()

const projectOpts = computed(() =>
  [...projects.value].sort(
    (a, b) => (a.state === 1 ? 0 : 1) - (b.state === 1 ? 0 : 1) || a.name.localeCompare(b.name),
  ),
)
const wiProj = computed(() => projects.value.find((p) => p.id === wiProject.value) ?? null)
const currentValue = computed(() =>
  wiProj.value && wiField.value !== WEIGHT ? fieldValue(wiProj.value, wiField.value) : null,
)
const choices = computed(() =>
  wiProj.value && wiField.value !== WEIGHT ? valueChoices(wiField.value, currentValue.value) : [],
)

watch(
  () => gw.value?.rules,
  (rules) => {
    if (rules?.length && !rules.some((r) => r.key === wiRule.value)) wiRule.value = rules[0]!.key
  },
)
watch(
  wiRule,
  () => {
    const now = wiRuleNow.value
    wiWeight.value = wiRuleInfo.value?.switch ? (now && now > 0 ? 0 : 100) : now
  },
)

watch(
  projectOpts,
  (opts) => {
    if (wiProject.value === null && opts.length) wiProject.value = opts[0].id
  },
  { immediate: true },
)

watch(
  choices,
  (c) => {
    if (wiValue.value === null || !c.includes(wiValue.value)) wiValue.value = c.length ? c[0] : null
  },
  { immediate: true },
)

const chips = computed(() =>
  weightChips.value.concat(projectChips.value),
)
const weightChips = computed(() =>
  weightPicks.value.map((c) => ({
    key: 'w:' + c.key,
    label: `Every project · ${c.label} ${c.from} → ${c.to}`,
  })),
)
const projectChips = computed(() =>
  changes.value.map((c) => {
    const p = projects.value.find((x) => x.id === c.projectId)
    const from = p
      ? valueLabel(c.field, fieldValue(p, c.field))
      : 'unknown (project not in the list)'
    return {
      key: `${c.projectId}:${c.field}`,
      label: `${p?.name ?? 'Project ' + c.projectId} · ${FIELD_LABELS[c.field].toLowerCase()} ${from} → ${valueLabel(c.field, c.value)}`,
    }
  }),
)

async function runWhatIf() {
  if (!hasChanges.value) {
    whatIfReq.cancel()
    whatIf.value = null
    whatIfError.value = ''
    whatIfBusy.value = false
    return
  }
  const current = whatIfReq.next()
  whatIfBusy.value = true
  try {
    const weights: Record<string, number> = {}
    for (const c of weightPicks.value) weights[c.key] = weightDraft.value[c.key]!
    const p = await postPreview(night.value, overrides(changes.value), weights)
    if (!current()) return
    whatIf.value = p
    whatIfError.value = ''
  } catch (e) {
    if (!current()) return
    whatIf.value = null
    whatIfError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (current()) whatIfBusy.value = false
  }
}

const canAdd = computed(() =>
  weighting.value
    ? !!wiRule.value &&
      wiWeight.value !== null &&
      Number.isFinite(wiWeight.value) &&
      wiWeight.value >= 0 &&
      wiWeight.value <= 100 &&
      wiWeight.value !== wiRuleNow.value
    : wiValue.value !== null,
)

function add() {
  if (weighting.value) {
    if (!canAdd.value) return
    weightDraft.value = { ...weightDraft.value, [wiRule.value]: wiWeight.value! }
    runWhatIf()
    return
  }
  if (wiProject.value === null || wiValue.value === null) return
  changes.value = addChange(changes.value, {
    projectId: wiProject.value,
    field: projectField.value,
    value: wiValue.value,
  })
  runWhatIf()
}

function remove(key: string) {
  if (key.startsWith('w:')) {
    const rest = { ...weightDraft.value }
    delete rest[key.slice(2)]
    weightDraft.value = rest
  } else changes.value = changes.value.filter((c) => `${c.projectId}:${c.field}` !== key)
  runWhatIf()
}

function discard() {
  whatIfReq.cancel()
  whatIfBusy.value = false
  changes.value = []
  weightDraft.value = {}
  whatIf.value = null
  whatIfError.value = ''
}

const confirmOpen = ref(false)
const confirmProjects = ref<ProjectWeights[] | null>(null)
const confirmLoading = ref(false)
const confirmError = ref('')

function pickedWeights(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of weightPicks.value) out[c.key] = weightDraft.value[c.key]!
  return out
}

async function apply() {
  if (!weightPicks.value.length) return applyEdits()
  confirmOpen.value = true
  confirmProjects.value = null
  confirmError.value = ''
  confirmLoading.value = true
  try {
    confirmProjects.value = (await previewRuleWeights(pickedWeights())).differing
  } catch (e) {
    confirmError.value = e instanceof Error ? e.message : String(e)
  } finally {
    confirmLoading.value = false
  }
}

async function applyEdits() {
  const edits = editsFor(changes.value, projects.value)
  const weights = pickedWeights()
  if (!edits.length && !Object.keys(weights).length) return
  applying.value = true
  try {
    if (Object.keys(weights).length) {
      const r = await applyRuleWeights({ weights })
      r.projects.forEach(upsertWaiting)
      showToast(applyOutcome(r))
      gw.value = r.weights
    }
    for (const e of edits) {
      const r = await editEntity('project.edit', e)
      notifyCommand(r)
      const p = projects.value.find((x) => x.id === e.id)
      if (p) {
        for (const c of e.changes) {
          if (c.field === 'priority') p.priority = c.after as number
          if (c.field === 'state') p.state = c.after as number
          if (c.field === 'minimumtime') p.minimumtime = c.after as number
        }
      }
    }
    confirmOpen.value = false
    discard()
  } catch (e) {
    errorToast(e)
  } finally {
    applying.value = false
  }
}

const diff = computed(() => (whatIf.value ? planDiff(preview.value, whatIf.value) : []))
const compareOrder = computed(() => {
  void whatIf.value
  return new Map<number, number>()
})

function overlap(b: Bar, list: Bar[]): number {
  let o = 0
  for (const x of list) {
    if (x.wait !== b.wait || x.targetId !== b.targetId) continue
    o += Math.max(0, Math.min(b.end, x.end) - Math.max(b.start, x.start))
  }
  return o / Math.max(1, b.end - b.start)
}

interface CompareBar extends Bar {
  changed: boolean
  label: string
}


const compare = computed(() => {
  const order = compareOrder.value
  const cur = bars(preview.value, order)
  const wi = bars(whatIf.value, order)
  const mark = (list: Bar[], other: Bar[], after: boolean): CompareBar[] =>
    list.map((b) => {
      const changed = overlap(b, other) < 0.9
      const why = after && changed && b.reason ? ' · ' + b.reason : ''
      return { ...b, changed, label: b.wait ? '' : fitLabel(b.name + why, b.w, 20, changed ? 600 : 400) }
    })
  return { current: mark(cur, wi, false), whatIf: mark(wi, cur, true) }
})
const compareTicks = computed(() => ticks.value.filter((_, i) => i % 4 === 1))
const compareLabel = computed(() => {
  const say = (list: CompareBar[]) =>
    list
      .filter((b) => !b.wait)
      .map((b) => `${b.name} ${hm(b.start)} to ${clock(b.end)}`)
      .join(', ') || 'nothing'
  const moved = diff.value.filter((d) => d.change !== 'no change')
  return (
    `Current plan: ${say(compare.value.current)}. What-if plan: ${say(compare.value.whatIf)}.` +
    (moved.length
      ? ' Changes: ' + moved.map((d) => `${d.name} ${d.change}`).join(', ') + '.'
      : ' No target gains or loses time.')
  )
})
const sameAsNow = computed(
  () => !!whatIf.value && diff.value.every((d) => d.change === 'no change'),
)
const unreachable = computed(() => !!error.value)
const balance = computed(() => mosaicBalance(preview.value, whatIf.value, projects.value))
</script>

<template>
  <main class="page wide">
    <PageHead :context="nightLabel" title="Tonight">
      <template #actions>
        <label for="night" class="small muted">Night</label>
        <select id="night" v-model="night" class="input">
          <option value="tonight">Tonight, {{ nightSpan(nightOf(shell.now)) }}</option>
          <option value="tomorrow">
            Tomorrow, {{ nightSpan(new Date(nightOf(shell.now).getTime() + 24 * 3600 * 1000)) }}
          </option>
        </select>
        <button type="button" class="btn" :disabled="loading" @click="load(true)">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
          </svg>
          Re-run simulation
        </button>
      </template>
    </PageHead>

    <section v-if="unreachable" class="card" role="status">
      <h2>The plan is not available</h2>
      <p class="empty" style="padding: 0">
        {{
          shell.scheduler.reachable === 'unconfigured'
            ? 'No scheduler API is configured, so the night cannot be simulated.'
            : error
        }}
        The planner runs on the observatory PC; this page fills in when it answers.
      </p>
    </section>

    <template v-else>
      <div class="tiles">
        <div v-for="t in tiles" :key="t.label" class="tile">
          <div class="xsmall muted">{{ t.label }}</div>
          <div class="num tile-value">{{ preview ? t.value : '…' }}</div>
          <div class="xsmall muted">{{ preview ? t.note : '' }}</div>
          <ul v-if="preview && 'lines' in t && t.lines?.length" class="tile-lines xsmall muted">
            <li v-for="(l, i) in t.lines" :key="i">{{ l }}</li>
          </ul>
        </div>
      </div>
      <p v-if="preview" class="xsmall muted" style="margin: 0">
        Moon rise, set and altitude are computed for the observatory site. Mosaic time and the
        moon-up hours count the imaging blocks of this simulated plan. Flats follow each project's
        Target Scheduler flats handling: daily projects get one set per filter, rotation and gain
        at dawn; longer cadences wait for a later dawn. Target Scheduler matches flats on the
        rotator's mechanical angle at capture; the angles shown are each target's rotation.
      </p>

      <section aria-labelledby="tl-h" class="card">
        <div class="spread">
          <h2 id="tl-h">Timeline</h2>
          <div class="row xsmall muted" style="gap: 0.875rem">
            <span
              ><span class="key" style="background: var(--day); opacity: 0.45"></span>Day and civil
              twilight</span
            >
            <span
              ><span class="key" style="background: var(--day); opacity: 0.22"></span>Nautical</span
            >
            <span
              ><span class="key" style="background: var(--day); opacity: 0.1"></span
              >Astronomical</span
            >
            <span v-if="nowX !== null"><span class="key line"></span>Now {{ clock(shell.now) }}</span>
          </div>
        </div>
        <p v-if="!preview" class="empty">{{ loading ? 'Simulating.' : 'No plan yet.' }}</p>
        <div v-else-if="sc" ref="timelineEl" class="scroll-x">
          <svg
            :viewBox="`0 0 ${W} ${svgH}`"
            style="width: 100%; min-width: 56rem; display: block"
            role="img"
            :aria-label="timelineLabel"
          >
            <rect
              v-for="(b, i) in bands"
              :key="'b' + i"
              :x="b.x"
              y="22"
              :width="b.w"
              :height="bandH"
              fill="var(--day)"
              :opacity="b.opacity"
            />
            <g font-size="11" fill="var(--muted-foreground)" text-anchor="middle">
              <text
                v-for="t in ticks"
                :key="'t' + t.x"
                :x="t.x"
                y="14"
                :text-anchor="tickAnchor(t.x, 11)"
              >
                {{ t.label }}
              </text>
            </g>
            <g stroke="var(--border)" stroke-width="1">
              <line
                v-for="t in ticks"
                :key="'l' + t.x"
                :x1="t.x"
                y1="22"
                :x2="t.x"
                :y2="22 + bandH"
              />
            </g>
            <g font-size="12" fill="var(--muted-foreground)">
              <text x="0" y="72">Target</text>
              <text x="0" y="116">Filter</text>
              <template v-if="moonNight">
                <text x="0" y="170">Moon altitude</text>
                <text x="0" y="238">Moon phase</text>
              </template>
            </g>
            <g v-if="moonNight && sc">
              <line
                :x1="LABEL_W"
                :y1="MOON_Y"
                :x2="W"
                :y2="MOON_Y"
                stroke="var(--muted-foreground)"
                stroke-width="1"
              />
              <text :x="LABEL_W + 6" :y="MOON_Y - 6" font-size="10" fill="var(--muted-foreground)">
                horizon
              </text>
              <path
                :d="moonPaths.below"
                fill="none"
                stroke="var(--muted-foreground)"
                stroke-width="1.5"
                stroke-dasharray="4 4"
              />
              <path
                v-for="(d, i) in moonPaths.above"
                :key="'ma' + i"
                :d="d"
                fill="none"
                stroke="var(--foreground)"
                stroke-width="2"
              />
              <template v-for="(mk, i) in moonPaths.marks" :key="'mk' + i">
                <circle :cx="mk.x" :cy="MOON_Y" r="3.5" fill="var(--foreground)" />
                <text
                  :x="mk.anchor === 'end' ? mk.x - 6 : mk.x + 6"
                  :y="MOON_Y - 14"
                  font-size="10"
                  :text-anchor="mk.anchor"
                  fill="var(--foreground)"
                >
                  {{ mk.label }}
                </text>
              </template>
              <text
                v-if="moonAllDown"
                :x="(LABEL_W + W) / 2"
                y="208"
                font-size="10"
                text-anchor="middle"
                fill="var(--muted-foreground)"
              >
                below horizon all night
              </text>
              <rect
                :x="LABEL_W"
                y="226"
                :width="W - LABEL_W"
                height="16"
                rx="3"
                fill="var(--secondary)"
              />
              <rect
                :x="LABEL_W"
                y="226"
                :width="Math.max(2, (W - LABEL_W) * moonNight.illumination)"
                height="16"
                rx="3"
                fill="var(--foreground)"
                opacity="0.85"
              />
              <text :x="phaseText.x" y="238" font-size="10" :fill="phaseText.fill">
                {{ moonPhase }}
              </text>
            </g>
            <template v-for="(b, i) in targetBars" :key="'tb' + i">
              <RouterLink
                v-if="b.targetId !== undefined"
                v-slot="{ href, navigate }"
                :to="targetRoute(b.targetId)"
                custom
              >
                <a :href="href" class="tl-link" :aria-label="b.title" @click="navigate">
                  <title>{{ b.title }}</title>
                  <rect
                    :x="b.x"
                    y="40"
                    :width="b.w"
                    height="56"
                    rx="6"
                    :fill="b.colour"
                    fill-opacity="0.3"
                    :stroke="b.colour"
                  />
                  <template v-if="b.w > 36">
                    <text
                      :x="b.x + 8"
                      y="63"
                      :font-size="b.w > 90 ? 13 : 11"
                      font-weight="600"
                      fill="var(--foreground)"
                    >
                      {{ fitLabel(b.name, b.w, b.w > 90 ? 13 : 11, 600) }}
                    </text>
                    <text
                      v-if="b.sub && b.w > 70"
                      :x="b.x + 8"
                      y="82"
                      font-size="11"
                      fill="var(--muted-foreground)"
                    >
                      {{ fitLabel(b.sub, b.w, 11) }}
                    </text>
                  </template>
                </a>
              </RouterLink>
              <g v-else>
                <title>{{ b.title }}</title>
                <rect
                  :x="b.x"
                  y="40"
                  :width="b.w"
                  height="56"
                  rx="6"
                  :fill="b.wait ? 'none' : b.colour"
                  :fill-opacity="b.wait ? undefined : 0.3"
                  :stroke="b.colour"
                  :stroke-dasharray="b.wait ? '3 3' : undefined"
                />
                <template v-if="b.w > 36">
                  <text
                    :x="b.x + 8"
                    y="63"
                    :font-size="b.w > 90 ? 13 : 11"
                    font-weight="600"
                    :fill="b.wait ? 'var(--muted-foreground)' : 'var(--foreground)'"
                  >
                    {{ fitLabel(b.name, b.w, b.w > 90 ? 13 : 11, 600) }}
                  </text>
                  <text
                    v-if="b.sub && b.w > 70"
                    :x="b.x + 8"
                    y="82"
                    font-size="11"
                    fill="var(--muted-foreground)"
                  >
                    {{ fitLabel(b.sub, b.w, 11) }}
                  </text>
                </template>
              </g>
            </template>
            <g>
              <rect
                v-for="(f, i) in filterBars"
                :key="'f' + i"
                :x="f.x"
                y="104"
                :width="f.w"
                height="16"
                :fill="f.fill"
              >
                <title>{{ f.title }}</title>
              </rect>
            </g>
            <template v-if="nowX !== null">
              <line
                :x1="nowX"
                y1="22"
                :x2="nowX"
                :y2="22 + bandH"
                stroke="var(--foreground)"
                stroke-width="2"
              />
              <text :x="nowX + 4" y="34" font-size="11" font-weight="600" fill="var(--foreground)">
                now
              </text>
            </template>
          </svg>
        </div>
        <p v-else class="empty">The plan has no times to draw.</p>
        <div class="row xsmall muted" style="gap: 0.875rem">
          <span v-for="l in legend" :key="l.label"
            ><span class="key" :style="{ background: l.fill, borderRadius: 0 }"></span
            >{{ l.label }}</span
          >
          <span>Twilight times come from the scheduler's preview.</span>
          <span v-if="moonError">The Moon is not drawn: {{ moonError }}</span>
        </div>
      </section>
    </template>

    <div class="split">
      <section v-if="!unreachable" aria-labelledby="why-h" class="card why">
        <div>
          <h2 id="why-h">Why each target was picked</h2>
          <p class="small muted" style="margin: 0.25rem 0 0; max-width: 75ch">
            Score = Σ rule weight × rule score at each simulated pick.
          </p>
        </div>
        <div v-if="picks.rows.length" class="scroll-x framed">
          <table class="dgrid num">
            <thead>
              <tr>
                <th scope="col">Simulated pick</th>
                <th scope="col">Target</th>
                <th v-for="c in picks.columns" :key="c.rule" scope="col" class="rule">
                  {{ c.rule }} ×{{ weightText(c.weight) }}
                </th>
                <th scope="col" style="text-align: right">Total</th>
                <th scope="col" class="wrap">Runner-up</th>
                <th scope="col" class="wrap">Gives way because</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in picks.rows" :key="i">
                <td style="white-space: nowrap">{{ p.time }}</td>
                <td style="white-space: nowrap; font-weight: 600">{{ p.target }}</td>
                <td
                  v-for="c in picks.columns"
                  :key="c.rule"
                  style="text-align: right"
                  class="rule"
                  :class="{ muted: !c.weight }"
                >
                  {{ fmtScore(p.scores[c.rule]) }}
                </td>
                <td style="text-align: right; font-weight: 600">
                  {{ p.totalText }}
                </td>
                <td class="muted runner">{{ p.runner }}</td>
                <td class="muted ends">{{ p.ends }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty">{{ preview ? 'No picks in this plan.' : 'Loading.' }}</p>
        <div>
          <div class="spread">
            <h3 class="h3">Left out tonight</h3>
            <div v-if="leftOutLegend.length" class="row xsmall muted" style="gap: 0.875rem">
              <span v-for="k in leftOutLegend" :key="k.kind"
                ><span class="key" :style="{ background: k.colour }"></span>{{ k.label }}</span
              >
            </div>
          </div>
          <ul v-if="leftOut.main.length" class="left-out">
            <li
              v-for="(l, i) in leftOut.main"
              :key="i"
              :style="{ borderLeftColor: kindStyle[l.kind].colour }"
            >
              <div class="xsmall reason-tag" :style="{ color: kindStyle[l.kind].colour }">
                {{ kindStyle[l.kind].label }}
              </div>
              <div style="font-weight: 600">
                <RouterLink
                  v-if="l.targetId !== undefined"
                  :to="targetRoute(l.targetId)"
                  class="lnk"
                  >{{ l.name }}</RouterLink
                >
                <template v-else>{{ l.name }}</template>
              </div>
              <div class="muted">{{ l.why }}</div>
              <div v-if="l.other" class="xsmall muted">Also: {{ l.other }}</div>
            </li>
          </ul>
          <p v-else-if="!leftOut.hidden.length" class="empty" style="padding: 0">
            {{ preview ? 'The preview leaves no project out.' : '' }}
          </p>
          <details v-if="leftOut.hidden.length" class="hidden-group">
            <summary class="small">
              Not visible ({{ leftOut.hidden.length }})
              <span class="xsmall muted">
                · no visible window long enough at any planner pass tonight</span
              >
            </summary>
            <ul class="left-out">
              <li
                v-for="(l, i) in leftOut.hidden"
                :key="i"
                :style="{ borderLeftColor: kindStyle.hidden.colour }"
              >
                <div style="font-weight: 600">
                  <RouterLink
                    v-if="l.targetId !== undefined"
                    :to="targetRoute(l.targetId)"
                    class="lnk"
                    >{{ l.name }}</RouterLink
                  >
                  <template v-else>{{ l.name }}</template>
                </div>
                <div class="muted">{{ l.why }}</div>
                <div v-if="l.other" class="xsmall muted">Also: {{ l.other }}</div>
              </li>
            </ul>
          </details>
        </div>
        <div v-if="preview?.stop_reason || preview?.assumptions?.length">
          <h3 class="h3">How this was simulated</h3>
          <p v-if="preview.error" class="small" style="margin: 0; color: var(--bad)">
            The simulation failed: {{ preview.error }}
          </p>
          <p v-if="preview.stop_reason" class="small muted" style="margin: 0">
            It stopped because {{ preview.stop_reason }}.
          </p>
          <ul class="small muted" style="margin: 0.25rem 0 0; padding-left: 1.25rem">
            <li v-for="a in preview.assumptions ?? []" :key="a.key">{{ a.text }}</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="whatif-h" class="card whatif">
        <div>
          <h2 id="whatif-h">What if</h2>
          <p class="small muted" style="margin: 0.25rem 0 0">
            Changes here run on a copy of tonight. Nothing reaches the observatory until you apply
            them.
          </p>
        </div>
        <p v-if="projectsError" class="empty" style="padding: 0">
          The project list is not available: {{ projectsError }}
        </p>
        <p v-else-if="!projects.length" class="empty" style="padding: 0">
          The scheduler database has no projects.
        </p>
        <template v-else>
          <div class="wi-grid">
            <label v-if="!weighting" for="wi-project" class="field">
              <span>Project</span>
              <select id="wi-project" v-model="wiProject" class="input">
                <option v-for="p in projectOpts" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </label>
            <label v-else for="wi-rule" class="field">
              <span>Rule, for every project</span>
              <select id="wi-rule" v-model="wiRule" class="input" :disabled="!gw">
                <option v-for="r in gw?.rules ?? []" :key="r.key" :value="r.key">
                  {{ r.label }}
                </option>
              </select>
            </label>
            <label for="wi-field" class="field">
              <span>Change</span>
              <select id="wi-field" v-model="wiField" class="input">
                <option v-for="f in fields" :key="f" :value="f">{{ FIELD_LABELS[f] }}</option>
                <option :value="WEIGHT">Rule weight</option>
              </select>
            </label>
            <label v-if="weighting" for="wi-weight" class="field">
              <span>From {{ gw ? weightValue(wiRuleInfo, wiRuleNow) : 'unknown' }} to</span>
              <select
                v-if="wiRuleInfo?.switch"
                id="wi-weight"
                v-model.number="wiWeight"
                class="input"
              >
                <option :value="100">on</option>
                <option :value="0">off</option>
              </select>
              <input
                v-else
                id="wi-weight"
                v-model.number="wiWeight"
                type="number"
                min="0"
                max="100"
                class="input num"
                :disabled="!gw"
              />
            </label>
            <label v-else for="wi-value" class="field">
              <span
                >From {{ wiProj ? valueLabel(projectField, currentValue) : 'no project picked' }} to</span
              >
              <select id="wi-value" v-model="wiValue" class="input">
                <option v-for="v in choices" :key="v" :value="v">
                  {{ valueLabel(projectField, v) }}
                </option>
              </select>
            </label>
          </div>
          <div class="row">
            <span v-for="c in chips" :key="c.key" class="badge">
              {{ c.label }}
              <button
                type="button"
                class="chip-x"
                aria-label="Remove this change"
                @click="remove(c.key)"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
            <span v-if="!chips.length" class="xsmall muted"
              >No changes yet. Pick one above and add it.</span
            >
            <button
              type="button"
              class="add-chip"
              :disabled="!canAdd || unreachable"
              @click="add"
            >
              Add this change
            </button>
          </div>
          <p v-if="unreachable" class="xsmall muted" style="margin: 0">
            What if needs the planner on the observatory PC, which is not answering.
          </p>
          <p v-if="weighting && gwError" class="xsmall" style="margin: 0; color: var(--bad)">
            The global rule weights are not available: {{ gwError }}
          </p>
          <p v-else-if="weighting && gw" class="xsmall muted" style="margin: 0">
            {{ weightNote }}
            <RouterLink :to="{ name: 'rule-weights' }" class="underline">Rule weights</RouterLink>
          </p>
          <div v-if="weightsIgnored" role="status" class="balance">
            <span
              >The plugin on the observatory PC (version {{ pluginVersion }}) does not simulate rule
              weight changes, so the what-if plan below leaves them out and shows only the other
              changes. Rule weights in What if need the first plugin release after
              5.8.2.212.</span
            >
          </div>
          <p v-if="whatIfError" class="empty" style="padding: 0">
            The what-if plan failed: {{ whatIfError }}
          </p>
          <p v-else-if="whatIfBusy" class="xsmall muted" style="margin: 0">
            Simulating the change.
          </p>
          <div v-if="whatIf && sc" class="scroll-x">
            <svg
              :viewBox="`0 0 ${W} 150`"
              style="width: 100%; min-width: 34rem; display: block"
              role="img"
              :aria-label="compareLabel"
            >
              <g font-size="22" fill="var(--muted-foreground)" text-anchor="middle">
                <text
                  v-for="t in compareTicks"
                  :key="'ct' + t.x"
                  :x="t.x"
                  y="20"
                  :text-anchor="tickAnchor(t.x, 22)"
                >
                  {{ t.label }}
                </text>
              </g>
              <text x="0" y="62" font-size="22" fill="var(--muted-foreground)">Current</text>
              <text x="0" y="122" font-size="22" fill="var(--foreground)" font-weight="600">
                What if
              </text>
              <g v-for="(b, i) in compare.current" :key="'cc' + i">
                <title>{{ b.title }}</title>
                <rect
                  :x="b.x"
                  y="34"
                  :width="b.w"
                  height="44"
                  rx="6"
                  :fill="b.wait ? 'none' : b.colour"
                  :fill-opacity="b.wait ? undefined : b.changed ? 0.14 : 0.3"
                  :stroke="b.colour"
                  :stroke-dasharray="b.wait || b.changed ? '4 3' : undefined"
                />
                <text v-if="b.label" :x="b.x + 8" y="63" font-size="20" fill="var(--foreground)">
                  {{ b.label }}
                </text>
              </g>
              <g v-for="(b, i) in compare.whatIf" :key="'cw' + i">
                <title>{{ b.title }}</title>
                <rect
                  :x="b.x"
                  y="94"
                  :width="b.w"
                  height="44"
                  rx="6"
                  :fill="b.wait ? 'none' : b.colour"
                  :fill-opacity="b.wait ? undefined : 0.3"
                  :stroke="b.colour"
                  :stroke-width="b.changed ? 3 : 1"
                  :stroke-dasharray="b.wait ? '3 3' : undefined"
                />
                <text
                  v-if="b.label"
                  :x="b.x + 8"
                  y="123"
                  font-size="20"
                  :font-weight="b.changed ? 600 : 400"
                  fill="var(--foreground)"
                >
                  {{ b.label }}
                </text>
              </g>
            </svg>
          </div>
          <p v-if="sameAsNow" class="xsmall muted" style="margin: 0">
            The what-if plan gives every target the same time as tonight's plan.
          </p>
          <div v-if="whatIf && sc" class="row xsmall muted" style="gap: 0.875rem">
            <span
              ><span
                class="key"
                style="border: 2px solid var(--foreground); background: none"
              ></span
              >Changed in the what-if</span
            >
            <span
              ><span
                class="key"
                style="border: 1px dashed var(--foreground); background: none"
              ></span
              >Gives way in the what-if</span
            >
          </div>
          <ul v-if="diff.length" class="diff num">
            <li v-for="(d, i) in diff" :key="i">
              <span>{{ d.name }}</span
              ><span style="font-weight: 600">{{ d.change }}</span>
            </li>
          </ul>
          <div v-for="b in balance" :key="b.projectGuid" role="status" class="balance">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--warn)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              style="flex: none; margin-top: 2px"
            >
              <path
                d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
              />
            </svg>
            <span
              >{{ b.text }}
              <RouterLink
                :to="{
                  name: 'mosaic',
                  params: { projectId: b.projectGuid },
                  query: { tab: 'panels' },
                }"
                class="underline"
                >Review balancing</RouterLink
              ></span
            >
          </div>
          <div class="actions">
            <button type="button" class="btn" :disabled="!hasChanges" @click="discard">
              Discard
            </button>
            <button
              type="button"
              class="btn primary"
              :disabled="!hasChanges || applying"
              @click="apply"
            >
              Apply after this exposure
            </button>
          </div>
          <RuleWeightsConfirm
            v-if="confirmOpen && gw"
            title="Apply these what-if changes for real?"
            action="Apply for real"
            :changes="weightPicks"
            :extra="projectChips.map((c) => c.label)"
            :projects="confirmProjects"
            :loading="confirmLoading"
            :error="confirmError"
            :busy="applying"
            @cancel="confirmOpen = false"
            @confirm="applyEdits"
          />
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: 0.75rem;
}
.tile {
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  padding: 0.75rem 1rem;
}
.tile-lines {
  margin: 0.125rem 0 0;
  padding: 0;
  list-style: none;
}
.tile-value {
  font-size: 1.125rem;
  font-weight: 600;
}
.key {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  vertical-align: -2px;
  margin-right: 0.25rem;
}
.key.line {
  height: 2px;
  background: var(--foreground);
  vertical-align: 3px;
}
.split {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: flex-start;
}
.why,
.whatif {
  flex: 1 1 100%;
  min-width: 0;
}
.why table.dgrid th {
  white-space: normal;
  vertical-align: bottom;
}
.why table.dgrid th.rule {
  text-align: right;
  min-width: 3.5rem;
}
.why table.dgrid th.rule,
.why table.dgrid td.rule {
  padding-inline: 0.25rem;
}
.why td.runner {
  min-width: 8rem;
}
.why td.ends {
  min-width: 11rem;
}
.framed {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}
.framed table.grid tr:last-child td {
  border-bottom: 0;
}
.h3 {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
}
.left-out {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: 0.5rem;
}
.left-out li {
  background: var(--secondary);
  border-radius: 0.5rem;
  border-left: 4px solid var(--border);
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
}
.reason-tag {
  font-weight: 600;
}
.lnk:focus-visible {
  text-decoration: underline;
}
.hidden-group {
  margin-top: 0.75rem;
}
.hidden-group summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.tl-link {
  cursor: pointer;
}
.tl-link rect {
  transition: fill-opacity 0.1s;
}
.tl-link:hover rect,
.tl-link:focus-visible rect {
  fill-opacity: 0.55;
  stroke-width: 2;
}
.tl-link:focus {
  outline: none;
}
.tl-link:focus-visible rect {
  stroke: var(--foreground);
  stroke-width: 3;
}
.wi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
  gap: 0.75rem;
}
.wi-grid .field {
  font-size: 0.8125rem;
}
.chip-x {
  border: 0;
  background: transparent;
  padding: 0;
  display: inline-flex;
}
.add-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px dashed var(--border);
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  background: transparent;
}
.diff {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: 0.8125rem;
}
.diff li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.375rem;
}
.balance {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  background: var(--warn-bg);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  font-size: 0.8125rem;
}
.underline {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}
</style>
