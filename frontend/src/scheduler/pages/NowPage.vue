<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { submitCommand, type CommandRecord } from '../api/commands'
import { onEvent } from '../api/events'
import { onChange } from '@/lib/events'
import { onUrlsAging, samePicture } from '@/lib/signedUrls'
import {
  getCameraHistory,
  getConditions,
  getMoon,
  getRecentCalibration,
  getPreview,
  getTonightSubs,
  postPreview,
  type CameraHistoryPoint,
  type Conditions,
  type MoonNight,
  type RecentCalibration,
  type Preview,
  type TonightSub,
  type TonightSubs,
} from '../api/scheduler'
import { clock, hm, longDate, mmss, nightOf } from '../format'
import {
  abortBlockedReason,
  abortPayload,
  angleText,
  capitalise,
  contribution,
  decDm,
  filterColor,
  filterName,
  isRejected,
  median,
  ms,
  nightRange,
  pausePayload,
  priorityName,
  raHms,
  runFilters,
  runs,
  skipOverride,
  skipOutcome,
  skipPayload,
  subChart,
  ticksBefore,
  verdictBadge,
  type AbortPayload,
  type ResumeMode,
} from '../plan'
import { errorToast, notifyCommand, queuedShort, shell, whenApplies } from '../shell'
import { activityLine } from '../activity'
import { latestOnly } from '../latest'
import PageHead from '../components/PageHead.vue'
import AutofocusPanel from '../components/AutofocusPanel.vue'
import NowCalibration from '../components/NowCalibration.vue'
import NowCalibrationLower from '../components/NowCalibrationLower.vue'
import { ApiError } from '../api/client'
import { getDarkBacklog, type DarkBacklog } from '../api/darks'
import {
  CALIBRATION_BLOCKED,
  calibBadge,
  calibCard,
  cameraPill,
  ninaPill,
  outsideScheduler,
  pauseApplies,
  showCalibLower,
} from '../nowcalib'
import MoonKeepNote from '../components/MoonKeepNote.vue'
import { getMoonKeep, type MoonKeepView } from '../api/moonkeep'
import { nowNote } from '../moonKeep'
import { getAutofocusRuns } from '../api/autofocus'
import { fromStatus, type AfRun } from '../autofocus'
import {
  conditionPills,
  hasData,
  filterRuns,
  hfrLimitFor,
  rejectLineText,
  hmDuration,
  latestImage,
  subTimes,
  moonLine,
  noSourceText,
  powerView,
  safetyBadge,
  weatherNote,
  weatherRows,
} from '../nowtonight'

const st = computed(() => shell.scheduler)
const online = computed(() => st.value.reachable === 'online')
const target = computed(() => st.value.target ?? null)
const exposure = computed(() => st.value.exposure ?? null)
const state = computed(() => (st.value.paused ? 'paused' : (st.value.state ?? '')))

const afLast = ref<AfRun | null>(null)
const afView = computed(() => {
  const af = st.value.autofocus
  return af ? fromStatus(af, afLast.value) : null
})

async function loadAfLast() {
  try {
    const r = await getAutofocusRuns(new Date(shell.now - 14 * 86400e3).toISOString(), 1)
    afLast.value = r.runs?.[0] ?? null
  } catch {
    afLast.value = null
  }
}

watch(
  () => (st.value.autofocus?.state === 'running' ? st.value.autofocus.run_id : ''),
  (id) => {
    if (id) loadAfLast()
  },
  { immediate: true },
)

const subs = ref<TonightSubs | null>(null)
const subsError = ref('')
const preview = ref<Preview | null>(null)
const previewError = ref('')

async function loadSubs() {
  try {
    subs.value = await getTonightSubs()
    subsError.value = ''
  } catch (e) {
    subsError.value = e instanceof Error ? e.message : String(e)
  }
}

const conditions = ref<Conditions | null>(null)
const conditionsError = ref('')
const moonNight = ref<MoonNight | null>(null)

async function loadConditions() {
  try {
    conditions.value = await getConditions()
    conditionsError.value = ''
  } catch (e) {
    conditionsError.value = e instanceof Error ? e.message : String(e)
  }
}

async function loadMoon() {
  const r = nightRange(preview.value)
  if (!r) return
  try {
    moonNight.value = await getMoon(new Date(r[0]).toISOString(), new Date(r[1]).toISOString())
  } catch {
    moonNight.value = null
  }
}

const calCard = computed(() => calibCard(st.value, conditions.value))
const calLower = computed(() => showCalibLower(calCard.value, st.value, conditions.value))
const calBadge = computed(() =>
  calibBadge(calCard.value, st.value.calibration, conditions.value, shell.now),
)
const calSide = computed(
  () =>
    !!calCard.value &&
    calCard.value !== 'unreported' &&
    !(calCard.value === 'cooling' && st.value.calibration?.purpose === 'imaging'),
)
const needHistory = computed(() => calCard.value === 'cooling' || calCard.value === 'unreported')

const history = ref<CameraHistoryPoint[] | null>(null)
const historyNote = ref('Loading.')
const backlog = ref<DarkBacklog | null>(null)
const backlogNote = ref('Loading.')
const recent = ref<RecentCalibration | null>(null)
const recentNote = ref('Loading.')

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const notThere = (e: unknown) => e instanceof ApiError && e.status === 404

async function loadHistory() {
  if (!needHistory.value) return
  try {
    const h = await getCameraHistory(60)
    history.value = h.points ?? []
    historyNote.value = history.value.length
      ? ''
      : 'No camera temperature readings in the last hour.'
  } catch (e) {
    history.value = null
    historyNote.value = notThere(e)
      ? "The camera's temperature history is not available yet."
      : "Could not read the camera's temperature history: " + errText(e)
  }
}

async function loadCalibration() {
  if (!calLower.value) return
  const [b, r] = await Promise.allSettled([getDarkBacklog(), getRecentCalibration(24)])
  if (b.status === 'fulfilled') {
    backlog.value = b.value
    backlogNote.value = ''
  } else {
    backlog.value = null
    backlogNote.value = 'Could not read the missing dark sets: ' + errText(b.reason)
  }
  if (r.status === 'fulfilled') {
    recent.value = r.value
    recentNote.value = ''
  } else {
    recent.value = null
    recentNote.value = notThere(r.reason)
      ? 'Recent calibration is not available from the server yet.'
      : 'Could not read recent calibration: ' + errText(r.reason)
  }
}

watch(needHistory, (v) => v && loadHistory(), { immediate: true })
watch(calLower, (v) => v && loadCalibration(), { immediate: true })

const moonKeep = ref<MoonKeepView | null>(null)

async function loadMoonKeep() {
  const t = Date.now()
  try {
    moonKeep.value = await getMoonKeep(
      new Date(t - 15 * 60e3).toISOString(),
      new Date(t + 15 * 60e3).toISOString(),
    )
  } catch {
    moonKeep.value = null
  }
}

const moonNow = computed(() => nowNote(moonKeep.value, st.value, shell.now))

async function loadPreview() {
  try {
    preview.value = await getPreview('tonight')
    previewError.value = ''
    loadMoon()
  } catch (e) {
    preview.value = null
    previewError.value = e instanceof Error ? e.message : String(e)
  }
}

let previewTimer: ReturnType<typeof setInterval> | undefined
let conditionsTimer: ReturnType<typeof setInterval> | undefined
let moonKeepTimer: ReturnType<typeof setInterval> | undefined
let historyTimer: ReturnType<typeof setInterval> | undefined
let calibrationTimer: ReturnType<typeof setInterval> | undefined
let debounce: ReturnType<typeof setTimeout> | undefined
const offs: (() => void)[] = []

// tonights reloads the subs when an event is about a target imaged
// tonight or the one being imaged; the stacker also works through older
// targets' lights.
function tonights(e: { object?: string }) {
  const names = new Set(allSubs.value.map((x) => x.target))
  if (target.value) names.add(target.value.target_name)
  if (!e.object || names.has(e.object)) soon()
}

function soon() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(loadSubs, 3000)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    skipOpen.value = false
    pauseOpen.value = false
    abortFor.value = null
  }
}

onMounted(() => {
  loadSubs()
  loadPreview()
  loadConditions()
  // Weather has no server events, and the plan moves with the clock; the
  // subs reload only when the stacker or the scheduler's tables say so.
  conditionsTimer = setInterval(loadConditions, 30000)
  previewTimer = setInterval(loadPreview, 300000)
  loadMoonKeep()
  moonKeepTimer = setInterval(loadMoonKeep, 300000)
  historyTimer = setInterval(loadHistory, 30000)
  calibrationTimer = setInterval(loadCalibration, 120000)
  offs.push(
    onEvent('frames', soon),
    onEvent('preview', tonights),
    onEvent('subs', tonights),
    onEvent('command', (e: { data?: CommandRecord }) => {
      if (e.data?.status === 'applied' || e.data?.status === 'pending') loadPreview()
    }),
    onChange(['acquiredimage'], soon),
    onChange(['project', 'target', 'exposureplan'], loadPreview, 10000),
    onUrlsAging(soon),
  )
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  if (previewTimer) clearInterval(previewTimer)
  if (conditionsTimer) clearInterval(conditionsTimer)
  if (moonKeepTimer) clearInterval(moonKeepTimer)
  if (historyTimer) clearInterval(historyTimer)
  if (calibrationTimer) clearInterval(calibrationTimer)
  if (debounce) clearTimeout(debounce)
  offs.forEach((f) => f())
  window.removeEventListener('keydown', onKey)
})

const tonightLine = computed(() => {
  const tw = preview.value?.twilight
  const base = 'Night of ' + longDate(nightOf(shell.now))
  if (tw?.astronomical_dusk && tw?.astronomical_dawn)
    return `${base} · astronomical dark ${hm(tw.astronomical_dusk)} to ${clock(tw.astronomical_dawn)}`
  return base
})

const blockedReason = computed(() => {
  switch (st.value.reachable) {
    case 'unconfigured':
      return 'No scheduler API is configured, so there is nothing to control.'
    case 'offline':
      return 'The observatory PC is not answering.'
    case 'unknown':
      return 'Checking the observatory.'
  }
  if (st.value.web_editing === false) return 'Web editing is off on the PC.'
  return ''
})

const skipBlocked = computed(() => {
  if (blockedReason.value) return blockedReason.value
  if (!target.value || state.value !== 'imaging') return 'Nothing is imaging right now.'
  return ''
})

const pauseBlocked = computed(() => {
  if (blockedReason.value) return blockedReason.value
  if (st.value.paused || st.value.pause_requested) return 'The scheduler is already paused.'
  if (state.value !== 'imaging' && state.value !== 'waiting' && !pauseApplies(st.value))
    return 'The scheduler is not running.'
  return ''
})

const abortBlocked = computed(() => {
  if (blockedReason.value) return blockedReason.value
  return abortBlockedReason(exposure.value)
})

const abortSyncClients = computed(() => !!exposure.value?.sync_clients)

const blockedLine = computed(() => {
  if (!skipBlocked.value) return ''
  if (!blockedReason.value && outsideScheduler(calCard.value, st.value)) return CALIBRATION_BLOCKED
  if (!pauseBlocked.value || skipBlocked.value === pauseBlocked.value) return skipBlocked.value
  return skipBlocked.value + ' ' + pauseBlocked.value
})

const waitingOf = (kind: string) => shell.waiting.filter((c) => c.kind === kind)
const pauseWaiting = computed<CommandRecord | undefined>(() => waitingOf('scheduler.pause')[0])

const pausedChip = computed(() => {
  const s = st.value
  if (s.paused) {
    let l = s.pause?.mount === 'park' ? 'Paused · mount parked' : 'Paused · mount tracking'
    if (s.pause?.resume_at) l += ' · resumes ' + clock(s.pause.resume_at)
    return l
  }
  if (s.pause_requested) return 'Pauses after this exposure'
  const w = pauseWaiting.value
  if (w) return w.status === 'queued' ? 'Pause ' + queuedShort() : 'Pause applies ' + whenApplies(w)
  return ''
})

const skipChips = computed(() => {
  const out: { label: string; tone: string }[] = []
  for (const c of waitingOf('scheduler.skip')) {
    out.push({
      label:
        c.status === 'queued'
          ? shell.scheduler.reachable === 'offline'
            ? 'Skip queued offline · sends when the PC answers'
            : 'Skip ' + queuedShort()
          : 'Skip queued · applies ' + whenApplies(c),
      tone: 'warn',
    })
  }
  for (const s of st.value.skips ?? []) {
    const name =
      s.name || (s.scope === 'project' ? 'project ' + s.project_id : 'target ' + s.target_id)
    out.push({ label: `Skipping ${name}${s.until ? ' until ' + clock(s.until) : ''}`, tone: 'ok' })
  }
  return out
})

const systems = computed(() => {
  const s = st.value
  const conn =
    s.reachable === 'online'
      ? s.live
        ? 'reachable · live'
        : 'reachable · polling'
      : s.reachable === 'offline'
        ? 'unreachable'
        : s.reachable === 'unconfigured'
          ? 'not set up'
          : 'checking'
  const nina =
    s.reachable === 'online'
      ? state.value || 'running'
      : s.reachable === 'offline'
        ? 'no answer'
        : s.reachable === 'unconfigured'
          ? 'unknown'
          : 'checking'
  const queued = shell.waiting.filter((c) => c.status === 'queued').length
  const pend = (s.pending?.length ?? 0) + queued
  const calNina =
    s.reachable === 'online' ? ninaPill(calCard.value, s.calibration, conditions.value) : null
  const cam = cameraPill(calCard.value, s.calibration, conditions.value)
  const items: { label: string; value: string; dot: string; title?: string }[] = [
    {
      label: 'NINA',
      value: nina,
      dot:
        s.reachable !== 'online'
          ? s.reachable === 'offline'
            ? 'var(--bad)'
            : 'var(--muted-foreground)'
          : state.value === 'imaging' || state.value === 'waiting'
            ? 'var(--ok)'
            : state.value === 'paused'
              ? 'var(--warn)'
              : 'var(--muted-foreground)',
      title: s.last_answer ? 'Last answered ' + clock(s.last_answer) : undefined,
    },
    {
      label: 'Scheduler API',
      value: conn,
      dot: s.reachable === 'online' ? 'var(--ok)' : 'var(--bad)',
      title: s.version ? 'Target Scheduler plugin ' + s.version : undefined,
    },
    {
      label: 'Last plan',
      value: s.last_plan_at ? clock(s.last_plan_at) : '—',
      dot: s.last_plan_at ? 'var(--ok)' : 'var(--muted-foreground)',
    },
    ...conditionPills(conditions.value),
    ...(cam ? [cam] : []),
    {
      label: 'Web editing',
      value: s.web_editing === undefined ? '—' : s.web_editing ? 'on' : 'off',
      dot:
        s.web_editing === false
          ? 'var(--bad)'
          : s.web_editing
            ? 'var(--ok)'
            : 'var(--muted-foreground)',
    },
  ]
  if (pend > 0) items.push({ label: 'Pending', value: String(pend), dot: 'var(--warn)' })
  if (calNina) Object.assign(items[0], calNina)
  return items
})

const stateBadge = computed(() => {
  switch (state.value) {
    case 'imaging':
      return { label: 'Imaging', tone: 'ok' }
    case 'waiting':
      return { label: 'Waiting', tone: 'warn' }
    case 'paused':
      return { label: 'Paused', tone: 'warn' }
    default:
      return { label: capitalise(state.value || 'unknown'), tone: '' }
  }
})

const allSubs = computed<TonightSub[]>(() => subs.value?.subs ?? [])
const targetSubs = computed(() => {
  const t = target.value
  return t ? allSubs.value.filter((s) => s.target_id === t.target_id) : []
})

const expProgress = computed(() => {
  const e = exposure.value
  const start = ms(e?.started_at)
  const end = ms(e?.ends_at)
  if (!e || isNaN(start) || isNaN(end) || end <= start) return null
  const len = (end - start) / 1000
  const elapsed = Math.min(len, Math.max(0, (shell.now - start) / 1000))
  return { pct: Math.round((elapsed / len) * 100), elapsed, len, end }
})

const facts = computed(() => {
  const t = target.value
  const e = exposure.value
  const c = conditions.value
  const out: { label: string; value: string; note: string }[] = []
  if (e) {
    out.push({
      label: 'Filter',
      value: filterName(e.filter),
      note: c?.camera?.gain !== undefined ? 'gain ' + Math.round(c.camera.gain) : '',
    })
    out.push({
      label: 'Exposure',
      value: Math.round(e.seconds) + ' s',
      note: [
        e.number ? 'number ' + e.number : '',
        e.started_at ? 'started ' + clock(e.started_at) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }
  const m = c?.mount
  if (m && hasData(m) && m.connected !== false && m.altitude !== undefined)
    out.push({
      label: 'Altitude',
      value: Math.round(m.altitude) + '°',
      note:
        m.flip_hours !== undefined && m.flip_hours > 0
          ? 'meridian flip in ' + hmDuration(m.flip_hours * 3600)
          : m.parked
            ? 'parked'
            : '',
    })
  const r = c?.rotator
  if (r && hasData(r) && r.connected !== false && r.position !== undefined)
    out.push({
      label: 'Rotator',
      value: angleText(r.position),
      note: t?.rotation !== undefined && t.rotation !== null ? 'target asks ' + angleText(t.rotation) : '',
    })
  else if (t?.rotation !== undefined && t.rotation !== null)
    out.push({ label: 'Rotation', value: angleText(t.rotation), note: 'from the target' })
  const cam = c?.camera
  if (cam && hasData(cam) && cam.connected !== false && cam.temperature !== undefined)
    out.push({
      label: 'Camera',
      value: cam.temperature.toFixed(1) + ' °C',
      note: [
        cam.target_temperature !== undefined
          ? 'set ' + cam.target_temperature.toFixed(1) + ' °C'
          : '',
        cam.cooler_power !== undefined ? 'cooler ' + Math.round(cam.cooler_power) + '%' : '',
      ]
        .filter(Boolean)
        .join(' · '),
    })
  return out
})

const rules = computed(() => {
  const t = target.value
  const out = (st.value.scores ?? []).map((s) => ({
    name:
      s.rule === 'Project Priority' && t?.priority !== undefined && t.priority !== null
        ? `${s.rule} (${priorityName(t.priority)})`
        : s.weight === 0
          ? `${s.rule} (weight 0)`
          : s.rule,
    score: contribution(s),
    title: `weight ${s.weight} × score ${s.score}`,
  }))
  const total = st.value.score_total
  if (total !== null && total !== undefined)
    out.push({ name: 'Total now', score: total, title: '' })
  return out
})

const latest = computed(() => subs.value?.latest ?? null)
const latestTargetSubs = computed(() => {
  const l = latest.value
  return l ? allSubs.value.filter((s) => s.target_id === l.target_id) : []
})
const latestHours = computed(
  () => latestTargetSubs.value.reduce((a, s) => a + (s.exposure ?? 0), 0) / 3600,
)
const latestShown = computed(() => latestImage(subs.value))

// A reload signs the latest sub's preview again; keeping the link it was
// first shown with lets the browser reuse its copy.
const latestKept = ref<{ id: number; url: string } | null>(null)
const latestSrc = computed(() => {
  const sub = latestShown.value?.sub
  if (!sub?.preview_url) return ''
  const kept = latestKept.value
  if (kept && samePicture(kept.url, String(kept.id), sub.preview_url, String(sub.id))) return kept.url
  return sub.preview_url
})
watch(latestSrc, (url) => {
  const sub = latestShown.value?.sub
  if (url && sub) latestKept.value = { id: sub.id, url }
})
const latestVerdict = computed(() => verdictBadge(latest.value?.verdict))

const chartRange = computed<[number, number]>(() => {
  const list = allSubs.value
  const first = list.length ? ms(list[0].time) : NaN
  const since = ms(subs.value?.since)
  const t0 = isNaN(first)
    ? isNaN(since)
      ? shell.now - 6 * 3600 * 1000
      : since
    : first - 10 * 60 * 1000
  const lastT = list.length ? ms(list[list.length - 1].time) : NaN
  const t1 = Math.max(shell.now, isNaN(lastT) ? 0 : lastT + 5 * 60 * 1000, t0 + 3600 * 1000)
  return [t0, t1]
})

const hfrBox = { x0: 56, x1: 1180, yTop: 20, yBottom: 190 }
const rmsBox = { x0: 56, x1: 1180, yTop: 8, yBottom: 70 }
const curId = computed(() => target.value?.target_id ?? latest.value?.target_id)
const graderView = computed(() => {
  const live = target.value && exposure.value && target.value.target_id === curId.value
  return hfrLimitFor(
    subs.value?.grader,
    allSubs.value,
    curId.value,
    live ? exposure.value?.filter : undefined,
    live ? exposure.value?.plan_id : undefined,
  )
})
const hfrLimit = computed(() => graderView.value.line)
const hfr = computed(() =>
  subChart(
    allSubs.value,
    (s) => s.hfr,
    curId.value,
    chartRange.value[0],
    chartRange.value[1],
    hfrBox,
    {
      minSpan: 1,
      include: hfrLimit.value ? [hfrLimit.value.limit] : [],
    },
  ),
)
const hfrXTicks = computed(() => ticksBefore(hfr.value.xTicks, hfrBox.x1 - 75))
const rejectY = computed(() => (hfrLimit.value ? hfr.value.y(hfrLimit.value.limit) : null))
const rejectSegments = computed(() => {
  const l = hfrLimit.value
  if (!l || curId.value === undefined) return []
  const [t0, t1] = chartRange.value
  const x = (t: number) => hfrBox.x0 + ((t - t0) / (t1 - t0)) * (hfrBox.x1 - hfrBox.x0)
  const list = allSubs.value
  const lastSub = list[list.length - 1]
  const shooting = exposure.value?.filter === l.filter && lastSub?.filter === l.filter
  return filterRuns(list, curId.value, l.filter).map(([a, b], i, runs) => ({
    x1: Math.max(hfrBox.x0, x(a) - 6),
    x2: Math.min(hfrBox.x1, i === runs.length - 1 && shooting ? nowX.value : x(b) + 6),
  }))
})
const rms = computed(() =>
  subChart(
    allSubs.value,
    (s) => s.guiding_rms,
    curId.value,
    chartRange.value[0],
    chartRange.value[1],
    rmsBox,
    {
      zero: true,
      minSpan: 1,
      unit: '″',
    },
  ),
)
const hasHfr = computed(() => allSubs.value.some((s) => s.hfr !== undefined))
const hasRms = computed(() => allSubs.value.some((s) => s.guiding_rms !== undefined))

const hfrStats = computed(() => {
  const list = allSubs.value
  const cur = curId.value
  const curName = list.find((s) => s.target_id === cur)?.target ?? target.value?.target_name ?? ''
  const hfrsOf = (id: number | undefined) =>
    list
      .filter((s) => s.target_id === id && !isRejected(s) && s.hfr !== undefined)
      .map((s) => s.hfr as number)
  const prev = [...list].reverse().find((s) => s.target_id !== cur)
  const last = [...list].reverse().find((s) => s.guiding_rms !== undefined)
  return {
    curName,
    curMed: median(hfrsOf(cur)),
    prevName: prev?.target ?? '',
    prevMed: prev ? median(hfrsOf(prev.target_id)) : null,
    last,
    rejected: list.filter(isRejected).length,
    total: list.length,
  }
})

const nowX = computed(() => {
  const [t0, t1] = chartRange.value
  return hfrBox.x0 + ((Math.min(shell.now, t1) - t0) / (t1 - t0)) * (hfrBox.x1 - hfrBox.x0)
})

const upcoming = computed(() => {
  const now = shell.now
  const cur = target.value?.target_id
  return runs(preview.value?.blocks).filter(
    (r) => r.end > now && !(r.start <= now && !r.wait && r.target_id === cur),
  )
})

const nextUp = computed(() =>
  upcoming.value.slice(0, 3).map((r) => {
    const names = [r.project_name, r.target_name].filter((x): x is string => !!x)
    const total = r.pick?.total
    return {
      start: hm(r.start),
      end: clock(r.end),
      name: r.wait ? 'Wait' : [...new Set(names)].join(' · '),
      filters: r.wait ? '' : runFilters(r),
      why: r.wait
        ? r.reason ?? ''
        : [
          total !== null && total !== undefined ? 'score ' + total.toFixed(2) : '',
          r.reason ? 'ends: ' + r.reason : '',
        ]
          .filter(Boolean)
          .join(' · '),
    }
  }),
)

const skipOpen = ref(false)
const skipFor = ref<'60' | 'night'>('60')
const skipWhole = ref(false)
const pauseOpen = ref(false)
const pauseMount = ref<'track' | 'park'>('track')
const resumeMode = ref<ResumeMode>('manual')
const resumeAt = ref('03:00')
const abortFor = ref<AbortPayload | null>(null)
const abortStaysPaused = computed(
  () => !!st.value.pause_requested || !!pauseWaiting.value || !!st.value.paused,
)
const busy = ref(false)

const applyWhen = computed(() => whenApplies())
const activityNow = computed(() =>
  state.value === 'imaging' && !exposure.value ? activityLine(st.value, shell.now) : '',
)

// afterSkip is the scheduler's own simulation with the skip applied where it
// applies, at the end of the current exposure, so it names the target the
// scheduler then picks rather than the next run in tonight's plan.
const afterSkip = ref<Preview | null>(null)
const afterSkipState = ref<'idle' | 'loading' | 'failed'>('idle')
const afterSkipReq = latestOnly()

async function simulateSkip() {
  const t = target.value
  if (!skipOpen.value || !t) return
  const current = afterSkipReq.next()
  afterSkip.value = null
  afterSkipState.value = 'loading'
  try {
    const minutes = skipFor.value === '60' ? 60 : 0
    const p = await postPreview('tonight', [skipOverride(t, skipWhole.value, minutes)])
    if (!current()) return
    afterSkip.value = p
    afterSkipState.value = 'idle'
  } catch {
    if (!current()) return
    afterSkipState.value = 'failed'
  }
}

watch([skipOpen, skipFor, skipWhole, () => target.value?.target_id], simulateSkip)

const skipNext = computed(() => {
  const t = target.value
  return t ? skipOutcome(afterSkip.value, t, skipWhole.value) : null
})
const skipNextScore = computed(() => {
  const n = skipNext.value
  const v = n && n.kind === 'pick' ? n.run.pick?.total : undefined
  return v !== null && v !== undefined ? v.toFixed(2) : ''
})

function openSkip() {
  skipFor.value = '60'
  skipWhole.value = false
  skipOpen.value = true
}

function openPause() {
  pauseMount.value = 'track'
  resumeMode.value = 'manual'
  pauseOpen.value = true
}

async function send(kind: string, payload: unknown) {
  busy.value = true
  try {
    notifyCommand(await submitCommand(kind, payload))
  } catch (e) {
    errorToast(e)
  } finally {
    busy.value = false
  }
}

async function confirmSkip() {
  const t = target.value
  skipOpen.value = false
  if (!t) return
  await send('scheduler.skip', skipPayload(t, skipWhole.value, skipFor.value === '60' ? 60 : 0))
}

async function confirmPause() {
  pauseOpen.value = false
  await send('scheduler.pause', pausePayload(pauseMount.value, resumeMode.value, resumeAt.value))
}

function openAbort() {
  abortFor.value = abortPayload(exposure.value, target.value?.target_name)
}

async function confirmAbort() {
  const p = abortFor.value
  abortFor.value = null
  if (!p) return
  busy.value = true
  try {
    const r = await submitCommand('exposure.abort', p)
    notifyCommand(r, r.title)
  } catch (e) {
    errorToast(e, 'The abort did not go through')
  } finally {
    busy.value = false
  }
}

async function resume() {
  await send('scheduler.resume', {})
}

const weather = computed(() => weatherRows(conditions.value?.weather))
const safety = computed(() => safetyBadge(conditions.value?.safety))
const moonText = computed(() => {
  const r = nightRange(preview.value)
  return r ? moonLine(moonNight.value, r[0], r[1]) : ''
})
const weatherFoot = computed(() => weatherNote(conditions.value?.weather, moonText.value))
const weatherEmpty = computed(() => {
  if (conditionsError.value) return 'Conditions are not available: ' + conditionsError.value
  if (!conditions.value) return 'Loading.'
  const w = conditions.value.weather
  if (!hasData(w)) return noSourceText(w, 'weather')
  if (w.connected === false)
    return 'The weather device is not connected in NINA, so there are no readings.'
  return weather.value.length ? '' : 'The weather device reported nothing.'
})
const power = computed(() => powerView(conditions.value?.power, conditions.value?.at))
const powerEmpty = computed(() => {
  if (conditionsError.value) return 'Conditions are not available: ' + conditionsError.value
  if (!conditions.value) return 'Loading.'
  return power.value ? '' : noSourceText(conditions.value.power, 'UPS')
})

const fmt = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? '—' : v.toFixed(d)
const cross = (x: number, y: number, r: number) =>
  `M${x - r} ${y - r} L${x + r} ${y + r} M${x + r} ${y - r} L${x - r} ${y + r}`
</script>

<template>
  <main id="now" class="page wide">
    <PageHead :context="tonightLine" title="Now">
      <template #title>
        <span class="clock num ml-2">{{ clock(shell.now) }}</span>
      </template>
      <template #actions>
        <span v-if="calBadge" role="status" class="badge" :class="calBadge.tone">{{
          calBadge.label
        }}</span>
        <span v-if="pausedChip" role="status" class="badge warn">
          {{ pausedChip }} ·
          <button type="button" class="inline-link" :disabled="busy" @click="resume">resume</button>
        </span>
        <span v-for="c in skipChips" :key="c.label" role="status" class="badge" :class="c.tone">{{
          c.label
        }}</span>
        <button
          type="button"
          class="btn pause-btn"
          aria-haspopup="dialog"
          :aria-expanded="pauseOpen ? 'true' : 'false'"
          :disabled="!!pauseBlocked || busy"
          :title="pauseBlocked"
          @click="openPause"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M8 5v14M16 5v14" />
          </svg>
          Pause scheduler
        </button>
        <button
          type="button"
          class="btn danger skip-btn"
          aria-haspopup="dialog"
          :aria-expanded="skipOpen ? 'true' : 'false'"
          :disabled="!!skipBlocked || busy"
          :title="skipBlocked"
          @click="openSkip"
        >
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
            <path d="M5 4l10 8-10 8V4zM19 5v14" />
          </svg>
          Skip this target
        </button>
      </template>
    </PageHead>
    <p v-if="blockedLine" class="muted small blocked">{{ blockedLine }}</p>

    <section aria-label="System status" class="row">
      <span v-for="s in systems" :key="s.label" class="pill" :title="s.title">
        <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true">
          <circle cx="4" cy="4" r="4" :fill="s.dot" />
        </svg>
        <span class="muted">{{ s.label }}</span>
        <span class="num" style="font-weight: 500">{{ s.value }}</span>
      </span>
    </section>

    <MoonKeepNote v-if="moonNow" headline="Bright Moon" :lines="[moonNow]" />

    <div class="cards">
      <NowCalibration
        v-if="calCard"
        :card="calCard"
        :status="st"
        :conditions="conditions"
        :history="history"
        :history-note="historyNote"
        :backlog="backlog"
        :recent="recent"
        :recent-note="recentNote"
        :twilight="preview?.twilight"
        :now="shell.now"
      />
      <section v-else aria-labelledby="current-h" class="card current">
        <template v-if="target">
          <div class="spread top">
            <div>
              <div class="row">
                <span class="badge" :class="stateBadge.tone">
                  <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true">
                    <circle cx="4" cy="4" r="4" fill="currentColor" />
                  </svg>
                  {{ stateBadge.label }}
                </span>
                <span v-if="!online" class="badge warn"
                  >Last known{{ st.last_answer ? ' · ' + clock(st.last_answer) : '' }}</span
                >
                <span v-if="target.priority !== undefined && target.priority !== null" class="badge"
                  >{{ priorityName(target.priority) }} priority</span
                >
                <span v-if="target.is_mosaic" class="badge">Mosaic</span>
              </div>
              <h2 id="current-h" class="target-h">
                <RouterLink
                  class="lnk"
                  :to="{ name: 'target', params: { projectId: String(target.project_id) } }"
                  >{{ target.project_name }}</RouterLink
                >
                <template v-if="target.target_name !== target.project_name"
                  ><span class="muted" style="font-weight: 400"> / </span
                  >{{ target.target_name }}</template
                >
              </h2>
              <p class="muted small coords num">
                <template v-if="target.ra_hours !== undefined && target.ra_hours !== null"
                  >RA {{ raHms(target.ra_hours) }} ·
                </template>
                <template v-if="target.dec_degrees !== undefined && target.dec_degrees !== null"
                  >Dec {{ decDm(target.dec_degrees) }} ·
                </template>
                <template v-if="target.rotation !== undefined && target.rotation !== null"
                  >rotation {{ angleText(target.rotation, 0) }}</template
                >
              </p>
            </div>
            <div style="text-align: right">
              <div class="xsmall muted">Subs tonight</div>
              <div class="big num">{{ targetSubs.length }}</div>
              <div class="xsmall muted">{{ allSubs.length }} in all tonight</div>
            </div>
          </div>

          <div v-if="facts.length" class="facts">
            <div v-for="f in facts" :key="f.label" class="fact">
              <div class="xsmall muted">{{ f.label }}</div>
              <div class="num" style="font-weight: 600">{{ f.value }}</div>
              <div class="xsmall muted">{{ f.note }}</div>
            </div>
          </div>

          <div v-if="exposure">
            <div class="spread small" style="margin-bottom: 0.375rem">
              <span>
                <span class="swatch" :style="{ background: filterColor(exposure.filter) }"></span>
                {{ exposure.number ? 'Exposure ' + exposure.number + ' · ' : ''
                }}{{ filterName(exposure.filter) }} {{ Math.round(exposure.seconds) }} s
              </span>
              <span v-if="expProgress && st.activity === 'downloading'" class="num muted"
                >{{ mmss(expProgress.len) }} · downloading</span
              >
              <span v-else-if="expProgress" class="num muted"
                >{{ mmss(expProgress.elapsed) }} of {{ mmss(expProgress.len) }} · finishes
                {{ clock(expProgress.end) }}</span
              >
            </div>
            <div
              role="progressbar"
              aria-label="Exposure progress"
              :aria-valuenow="expProgress?.pct ?? 0"
              aria-valuemin="0"
              aria-valuemax="100"
              class="bar"
            >
              <div :style="{ width: (expProgress?.pct ?? 0) + '%' }"></div>
            </div>
            <div class="spread xsmall muted" style="margin-top: 0.5rem">
              <span>{{
                target.minimum_time_end
                  ? 'Minimum-time window ends ' + clock(target.minimum_time_end)
                  : 'No minimum-time window'
              }}</span>
              <span v-if="target.hard_stop">Imaging window ends {{ clock(target.hard_stop) }}</span>
            </div>
          </div>
          <p v-else-if="state === 'paused'" class="muted small" style="margin: 0">
            Paused · no exposure running. Resume to start the next one.
          </p>
          <p v-else-if="activityNow" class="small num" style="margin: 0">
            {{ activityNow
            }}<span class="muted">
              · no exposure running, the countdown starts when the shutter opens</span
            >
          </p>
          <div class="abort-row">
            <span v-if="exposure?.abort_blocked" class="xsmall muted abort-why">{{
              exposure.abort_blocked
            }}</span>
            <button
              type="button"
              class="btn sm danger abort-btn"
              aria-haspopup="dialog"
              :aria-expanded="abortFor ? 'true' : 'false'"
              :disabled="!!abortBlocked || busy"
              :title="abortBlocked || 'Stop this exposure now and discard the partial frame'"
              @click="openAbort"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Abort now
            </button>
          </div>

          <div class="why">
            <div class="spread">
              <h3>Why this target</h3>
              <RouterLink :to="{ name: 'tonight' }" class="lnk small muted"
                >Open tonight's plan</RouterLink
              >
            </div>
            <p class="small muted" style="margin: 0.25rem 0 0.75rem">
              <template v-if="target.picked_at">Picked at {{ clock(target.picked_at) }}. </template
              >Score is the sum of rule weight × rule score.
            </p>
            <div v-if="rules.length" class="rules">
              <div v-for="r in rules" :key="r.name" class="rule small" :title="r.title">
                <span>{{ r.name }}</span
                ><span class="num" style="font-weight: 600">{{ r.score.toFixed(2) }}</span>
              </div>
            </div>
            <p v-else class="empty" style="padding: 0">The scheduler did not send its scores.</p>
            <p v-if="st.score_note" class="small" style="margin: 0.75rem 0 0">
              Kept at the last re-plan: {{ st.score_note }}.
            </p>
          </div>
        </template>
        <template v-else>
          <h2 id="current-h">Current target</h2>
          <p v-if="st.reachable === 'unconfigured'" class="empty">
            No scheduler API is configured, so the current target is unknown. Edits are still
            recorded and wait in History.
          </p>
          <p v-else-if="st.reachable === 'offline'" class="empty">
            The observatory PC is not answering{{ st.since ? ' since ' + clock(st.since) : '' }}. Edits
            wait in order and go out when it does.
          </p>
          <p v-else-if="st.reachable === 'unknown'" class="empty">Checking the observatory.</p>
          <p v-else-if="state === 'waiting'" class="empty">
            Waiting{{ st.wait?.target_name ? ' for ' + st.wait.target_name : ''
            }}{{ st.wait?.until ? ' until ' + clock(st.wait.until) : '' }}.
          </p>
          <p v-else-if="state === 'paused'" class="empty">The scheduler is paused.</p>
          <p v-else class="empty">
            The scheduler is {{ state || 'not running' }}. Nothing is being imaged.
          </p>
        </template>
        <AutofocusPanel v-if="afView" :view="afView" :now="shell.now" :last="afLast" history />
        <RouterLink v-else :to="{ name: 'autofocus' }" class="lnk xsmall muted af-only-link"
          >Autofocus history</RouterLink
        >
      </section>

      <section v-if="!calSide" aria-labelledby="sub-h" class="card latest">
        <div class="spread">
          <h2 id="sub-h">Latest sub</h2>
          <span v-if="latest" class="xsmall muted">
            {{ subTimes(latest)
            }}<template v-if="latest.preview_url"> · stretched preview</template>
          </span>
        </div>
        <template v-if="latest || latestShown">
          <img
            v-if="latestShown"
            :src="latestSrc"
            :alt="
              'Stretched preview of the ' +
              clock(latestShown.sub.time) +
              ' ' +
              filterName(latestShown.sub.filter) +
              ' sub of ' +
              latestShown.sub.target
            "
            class="sky"
          />
          <svg
            v-else
            viewBox="0 0 300 200"
            role="img"
            aria-label="No preview of the latest sub yet"
            class="sky"
          >
            <rect x="0" y="0" width="300" height="200" fill="var(--sky)" />
            <text
              x="150"
              y="104"
              text-anchor="middle"
              font-size="11"
              fill="var(--muted-foreground)"
            >
              No preview yet
            </text>
          </svg>
          <p v-if="latestShown?.note" class="small muted" style="margin: 0">
            {{ latestShown.note }}
          </p>
          <div v-if="latest" class="spread" style="align-items: flex-start; gap: 1rem 1.5rem">
            <div style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 0">
              <div style="font-weight: 600; font-size: 0.9375rem">
                {{ latest.target }}
                <span
                  v-if="latest.project && latest.project !== latest.target"
                  class="muted"
                  style="font-weight: 400"
                  >· {{ latest.project }}</span
                >
              </div>
              <div class="small muted num">
                {{ filterName(latest.filter)
                }}<template v-if="latest.exposure"> · {{ Math.round(latest.exposure) }} s</template
                ><template v-if="latest.gain !== undefined"> · gain {{ latest.gain }}</template
                ><template v-if="latest.ccd_temp !== undefined">
                  · {{ latest.ccd_temp.toFixed(1) }} °C</template
                ><template v-if="latest.hfr !== undefined">
                  · HFR {{ latest.hfr.toFixed(2) }}</template
                ><template v-if="latest.width && latest.height">
                  · {{ latest.width }} × {{ latest.height }}</template
                >
              </div>
              <RouterLink
                :to="{ name: 'target', params: { projectId: String(latest.project_id) } }"
                class="small underline"
                >This target's goal and subs</RouterLink
              >
            </div>
            <div class="row num" style="gap: 1.25rem; align-items: flex-start">
              <div>
                <div class="xsmall muted">Stacker verdict</div>
                <span class="badge" :class="latestVerdict.tone" style="margin-top: 0.125rem">{{
                  latestVerdict.label
                }}</span>
              </div>
              <div>
                <div class="xsmall muted">Score</div>
                <div class="stat">
                  {{ latest.score !== undefined ? fmt(latest.score) : 'Not scored yet' }}
                </div>
              </div>
              <div>
                <div class="xsmall muted" title="The stacker's score × the exposure time">
                  Effective s (score × exposure)
                </div>
                <div class="stat">
                  {{ latest.weight !== undefined ? Math.round(latest.weight) + ' s' : 'Not scored yet' }}
                </div>
              </div>
              <div>
                <div class="xsmall muted">Target tonight</div>
                <div class="stat">
                  {{ latestTargetSubs.length }} · {{ latestHours.toFixed(2) }} h
                </div>
              </div>
            </div>
          </div>
        </template>
        <p v-else-if="subsError" class="empty">Could not read tonight's subs: {{ subsError }}</p>
        <p v-else-if="subs" class="empty">No subs yet tonight.</p>
        <p v-else class="empty">Loading.</p>
      </section>
    </div>

    <section v-if="!calCard" aria-labelledby="hfr-h" class="card">
      <div class="spread" style="align-items: flex-end; gap: 1rem">
        <div>
          <h2 id="hfr-h">Star size and guiding tonight</h2>
          <p class="small muted" style="margin: 0.125rem 0 0">
            HFR of every sub since {{ subs ? clock(subs.since) : '…'
            }}<template v-if="subs?.since_basis">, {{ subs.since_basis }}</template>. The line
            restarts at each target change; the current target is drawn bold.
          </p>
        </div>
        <div class="row num" style="gap: 1.5rem; align-items: flex-start">
          <div v-if="hfrStats.curName">
            <div class="xsmall muted">{{ hfrStats.curName }} median HFR, all filters</div>
            <div class="stat-lg">
              {{ hfrStats.curMed !== null ? hfrStats.curMed.toFixed(2) + ' px' : '—' }}
            </div>
          </div>
          <div v-if="hfrStats.prevName">
            <div class="xsmall muted">{{ hfrStats.prevName }} median, all filters</div>
            <div class="stat-lg">
              {{ hfrStats.prevMed !== null ? hfrStats.prevMed.toFixed(2) + ' px' : '—' }}
            </div>
          </div>
          <div>
            <div class="xsmall muted">Guiding, last sub</div>
            <div class="stat-lg">
              {{
                hfrStats.last?.guiding_rms !== undefined
                  ? fmt(hfrStats.last.guiding_rms) + '″'
                  : '—'
              }}
              <span
                v-if="
                  hfrStats.last &&
                  (hfrStats.last.guiding_rms_ra !== undefined ||
                    hfrStats.last.guiding_rms_dec !== undefined)
                "
                class="small muted"
                style="font-weight: 400"
              >
                RA {{ fmt(hfrStats.last.guiding_rms_ra) }} · Dec
                {{ fmt(hfrStats.last.guiding_rms_dec) }}
              </span>
            </div>
          </div>
          <div>
            <div class="xsmall muted">Rejected tonight</div>
            <div class="stat-lg">{{ hfrStats.rejected }} of {{ hfrStats.total }}</div>
          </div>
        </div>
      </div>
      <p v-if="subsError" class="empty">Could not read tonight's subs: {{ subsError }}</p>
      <p v-else-if="subs && !allSubs.length" class="empty">
        No subs yet tonight. The charts fill in as the scheduler saves them.
      </p>
      <div v-else-if="subs" class="scroll-x">
        <div style="min-width: 44rem; display: flex; flex-direction: column; gap: 0.25rem">
          <div class="xsmall muted">HFR, px</div>
          <svg
            v-if="hasHfr"
            viewBox="0 0 1200 216"
            role="img"
            :aria-label="
              'HFR per sub since ' +
              clock(chartRange[0]) +
              ', ' +
              allSubs.length +
              ' subs, ' +
              hfrStats.rejected +
              ' rejected'
            "
            style="width: 100%; display: block"
          >
            <template v-for="(tk, i) in hfr.yTicks" :key="'y' + i">
              <line
                :x1="hfrBox.x0"
                :y1="tk.pos"
                :x2="hfrBox.x1"
                :y2="tk.pos"
                stroke="var(--border)"
                stroke-width="1"
                :stroke-dasharray="i === 0 ? undefined : '3 4'"
              />
              <text
                :x="hfrBox.x0 - 6"
                :y="tk.pos + 4"
                text-anchor="end"
                font-size="11"
                fill="var(--muted-foreground)"
              >
                {{ tk.label }}
              </text>
            </template>
            <text
              v-for="tk in hfrXTicks"
              :key="'x' + tk.pos"
              :x="tk.pos"
              y="210"
              text-anchor="middle"
              font-size="11"
              fill="var(--muted-foreground)"
            >
              {{ tk.label }}
            </text>
            <text :x="hfrBox.x1" y="210" text-anchor="end" font-size="11" fill="var(--foreground)">
              {{ clock(shell.now) }} now
            </text>
            <line
              v-if="nowX < hfrBox.x1 - 2"
              :x1="nowX"
              y1="12"
              :x2="nowX"
              y2="192"
              stroke="var(--foreground)"
              stroke-width="1"
              stroke-dasharray="2 3"
              opacity="0.6"
            />
            <template v-if="rejectY !== null && hfrLimit && rejectSegments.length">
              <line
                v-for="(r, i) in rejectSegments"
                :key="'rj' + i"
                :x1="r.x1"
                :y1="rejectY"
                :x2="r.x2"
                :y2="rejectY"
                stroke="var(--warn)"
                stroke-width="1.5"
                stroke-dasharray="6 4"
              />
              <text
                :x="rejectSegments[0].x1 + 6"
                :y="rejectY - 6"
                font-size="11"
                fill="var(--warn)"
              >
                reject above {{ hfrLimit.limit.toFixed(2) }} px
              </text>
            </template>
            <text
              v-if="hfr.firstLabel"
              :x="hfrBox.x0 + 8"
              y="14"
              font-size="11"
              fill="var(--muted-foreground)"
            >
              {{ hfr.firstLabel }}
            </text>
            <template v-for="(c, i) in hfr.changes" :key="'c' + i">
              <line
                :x1="c.x"
                y1="12"
                :x2="c.x"
                y2="192"
                stroke="var(--foreground)"
                stroke-width="1"
                stroke-dasharray="2 3"
              />
              <text
                v-if="i === hfr.changes.length - 1"
                :x="c.x - 6"
                y="14"
                text-anchor="end"
                font-size="11"
                font-weight="600"
                fill="var(--foreground)"
              >
                {{ c.label }} →
              </text>
            </template>
            <line
              v-for="(m, i) in hfr.medians"
              :key="'m' + i"
              :x1="m.x1"
              :y1="m.y"
              :x2="m.x2"
              :y2="m.y"
              :stroke="m.current ? 'var(--ok)' : 'var(--muted-foreground)'"
              :stroke-width="m.current ? 1.5 : 1"
              :stroke-dasharray="m.current ? '4 3' : '1 3'"
            />
            <path
              v-for="(p, i) in hfr.paths"
              :key="'p' + i"
              :d="p.d"
              fill="none"
              :stroke="p.current ? 'var(--foreground)' : 'var(--muted-foreground)'"
              :stroke-width="p.current ? 2.25 : 1.25"
              :opacity="p.current ? 1 : 0.8"
            />
            <template v-for="(pt, i) in hfr.points" :key="'pt' + i">
              <path
                v-if="pt.rejected"
                :d="cross(pt.x, pt.y, 4)"
                stroke="var(--bad)"
                stroke-width="2"
              />
              <circle
                v-else
                :cx="pt.x"
                :cy="pt.y"
                :r="pt.current ? 4 : 2.5"
                :fill="pt.current ? 'var(--foreground)' : 'var(--muted-foreground)'"
              />
            </template>
          </svg>
          <p v-else class="empty">The scheduler recorded no HFR for tonight's subs.</p>
          <div class="xsmall muted">Guiding total RMS per sub, same time axis</div>
          <svg
            v-if="hasRms"
            viewBox="0 0 1200 76"
            role="img"
            aria-label="Guiding total RMS per sub in arcseconds"
            style="width: 100%; display: block"
          >
            <template v-for="(tk, i) in rms.yTicks" :key="'ry' + i">
              <line
                :x1="rmsBox.x0"
                :y1="tk.pos"
                :x2="rmsBox.x1"
                :y2="tk.pos"
                stroke="var(--border)"
                :stroke-dasharray="i === 0 ? undefined : '3 4'"
              />
              <text
                :x="rmsBox.x0 - 6"
                :y="tk.pos + 4"
                text-anchor="end"
                font-size="11"
                fill="var(--muted-foreground)"
              >
                {{ tk.label }}
              </text>
            </template>
            <line
              v-for="(c, i) in rms.changes"
              :key="'rc' + i"
              :x1="c.x"
              y1="4"
              :x2="c.x"
              y2="72"
              stroke="var(--foreground)"
              stroke-width="1"
              stroke-dasharray="2 3"
            />
            <path
              v-for="(p, i) in rms.paths"
              :key="'rp' + i"
              :d="p.d"
              fill="none"
              stroke="var(--blue)"
              :stroke-width="p.current ? 2.25 : 1.75"
            />
            <template v-for="(pt, i) in rms.points" :key="'rpt' + i">
              <path
                v-if="pt.rejected"
                :d="cross(pt.x, pt.y, 3)"
                stroke="var(--bad)"
                stroke-width="1.5"
              />
            </template>
          </svg>
          <p v-else class="empty">The scheduler recorded no guiding RMS for tonight's subs.</p>
        </div>
      </div>
      <p v-else class="empty">Loading.</p>
      <div class="row xsmall muted" style="gap: 1rem">
        <span class="legend"
          ><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="4" fill="var(--foreground)" /></svg
          >Current target</span
        >
        <span class="legend"
          ><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="2.5" fill="var(--muted-foreground)" /></svg
          >Earlier target</span
        >
        <span class="legend"
          ><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3 L11 11 M11 3 L3 11" stroke="var(--bad)" stroke-width="2" /></svg
          >Rejected by the stacker or the grader</span
        >
        <span class="legend"
          ><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
            <path d="M1 7h16" stroke="var(--ok)" stroke-width="1.5" stroke-dasharray="4 3" /></svg
          >Median for this target</span
        >
        <span v-if="hfrLimit" class="legend"
          ><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
            <path d="M1 7h16" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="6 4" /></svg
          >{{ rejectLineText(hfrLimit) }}</span
        >
        <span v-else-if="graderView.note">{{ graderView.note }}</span>
      </div>
    </section>

    <div class="lower">
      <NowCalibrationLower
        v-if="calLower"
        :backlog="backlog"
        :backlog-note="backlogNote"
        :recent="recent"
        :recent-note="recentNote"
      />
      <section v-if="!calCard" aria-labelledby="next-h" class="card" style="gap: 0.75rem">
        <div class="spread">
          <h2 id="next-h">Next up</h2>
          <RouterLink :to="{ name: 'tonight' }" class="lnk small muted">{{
            preview?.generated_at ? 'Simulated ' + clock(preview.generated_at) : "Tonight's plan"
          }}</RouterLink>
        </div>
        <ol v-if="nextUp.length" class="next">
          <li v-for="(n, i) in nextUp" :key="i">
            <div class="num">
              <div style="font-weight: 600">{{ n.start }}</div>
              <div class="xsmall muted">to {{ n.end }}</div>
            </div>
            <div>
              <div style="font-weight: 600">{{ n.name }}</div>
              <div v-if="n.filters" class="small muted">{{ n.filters }}</div>
              <div v-if="n.why" class="xsmall muted">{{ n.why }}</div>
            </div>
          </li>
        </ol>
        <p v-else-if="previewError" class="empty">The plan is not available: {{ previewError }}</p>
        <p v-else-if="preview" class="empty">Nothing else is planned tonight.</p>
        <p v-else class="empty">Loading.</p>
      </section>

      <section aria-labelledby="safety-h" class="card" style="gap: 0.75rem">
        <div class="spread" style="align-items: center">
          <h2 id="safety-h">Weather and safety</h2>
          <span class="badge" :class="safety.tone">{{ safety.label }}</span>
        </div>
        <dl v-if="weather.length" class="wx num">
          <div v-for="w in weather" :key="w.label">
            <dt class="xsmall muted">{{ w.label }}</dt>
            <dd>{{ w.value }}</dd>
          </div>
        </dl>
        <p v-else class="empty" style="padding: 0">{{ weatherEmpty }}</p>
        <p v-if="weatherFoot" class="xsmall muted" style="margin: 0">{{ weatherFoot }}</p>
      </section>

      <section aria-labelledby="ups-h" class="card" style="gap: 0.75rem">
        <div class="spread" style="align-items: center">
          <h2 id="ups-h">Power</h2>
          <span v-if="power" class="badge" :class="power.tone">{{ power.label }}</span>
          <span v-else class="badge">No data</span>
        </div>
        <template v-if="power">
          <div class="row num" style="align-items: baseline; gap: 0.5rem">
            <span class="stat-lg">{{ power.charge }}</span>
            <span class="small muted">battery{{ power.model ? ' · ' + power.model : '' }}</span>
          </div>
          <div v-if="power.alert" role="status" class="battery-alert num">
            {{ power.alert }}
          </div>
          <dl class="wx num">
            <div>
              <dt class="xsmall muted">Input voltage</dt>
              <dd>{{ power.voltage }}</dd>
            </div>
            <div>
              <dt class="xsmall muted">On battery</dt>
              <dd>{{ power.onBattery }}</dd>
              <dd v-if="power.onBatteryNote" class="xsmall muted plain-dd">
                {{ power.onBatteryNote }}
              </dd>
            </div>
            <div>
              <dt class="xsmall muted">Runtime</dt>
              <dd>{{ power.runtime }}</dd>
            </div>
          </dl>
          <div class="shutdown">
            <div style="font-weight: 600">Auto-shutdown</div>
            <ol aria-label="Shutdown sequence" class="steps">
              <li v-for="(s, i) in power.steps" :key="i">
                <span v-if="s.when" class="xsmall muted num step-when">{{ s.when }}</span>
                {{ s.what }}
              </li>
            </ol>
            <p class="xsmall muted" style="margin: 0">
              The low-battery levels are what the UPS reports. The timers and steps are set in the
              observatory PC's ups-shutdown script, which NUT runs.
            </p>
          </div>
        </template>
        <p v-else class="empty" style="padding: 0">{{ powerEmpty }}</p>
      </section>
    </div>

    <div v-if="skipOpen && target" class="overlay">
      <div class="scrim" aria-hidden="true" @click="skipOpen = false"></div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skip-h"
        aria-describedby="skip-d"
        class="dialog"
      >
        <div class="row" style="gap: 0.625rem">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--destructive-foreground)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 4l10 8-10 8V4zM19 5v14" />
          </svg>
          <h2 id="skip-h">Skip {{ target.target_name }}?</h2>
        </div>
        <p id="skip-d" style="font-size: 0.9375rem; font-weight: 500">
          This finishes the current exposure, then re-plans. Applies {{ applyWhen }}.
        </p>
        <p class="small muted">
          <template v-if="exposure"
            >The {{ filterName(exposure.filter) }} sub in progress is kept.
          </template>
          Then the scheduler drops the {{ target.is_mosaic ? 'panel' : 'target' }} and picks again.
          <template v-if="afterSkipState === 'loading'">Simulating the pick after the skip.</template>
          <template v-else-if="afterSkipState === 'failed'">
            The pick after the skip could not be simulated.
          </template>
          <template v-else-if="skipNext?.kind === 'pick'">
            Simulated with this skip, it picks
            <strong class="fg">{{ skipNext.run.target_name }}</strong
            ><template v-if="skipNextScore"> (score {{ skipNextScore }})</template> at
            {{ hm(skipNext.run.start) }}.
          </template>
          <template v-else-if="skipNext?.kind === 'back'">
            Simulated with this skip, it picks nothing else and returns to
            {{ skipNext.run.target_name }} at {{ hm(skipNext.run.start) }}.
          </template>
          <template v-else-if="skipNext?.kind === 'nothing'">
            Simulated with this skip, it images nothing else tonight.
          </template>
          <template v-if="target.is_mosaic && !skipWhole">
            Skip the whole mosaic to move on from all its panels.</template
          >
        </p>
        <fieldset class="plain">
          <legend>Keep it skipped</legend>
          <label class="opt"
            ><input v-model="skipFor" type="radio" name="skip-for" value="60" /> For 60
            minutes</label
          >
          <label class="opt"
            ><input v-model="skipFor" type="radio" name="skip-for" value="night" /> For the rest of
            tonight</label
          >
          <label class="opt"
            ><input v-model="skipWhole" type="checkbox" /> Skip the whole {{ target.project_name }}
            {{ target.is_mosaic ? 'mosaic' : 'project' }}</label
          >
        </fieldset>
        <div class="actions">
          <button type="button" class="btn" @click="skipOpen = false">Cancel</button>
          <button type="button" class="btn danger" :disabled="busy" @click="confirmSkip">
            Skip after this exposure
          </button>
        </div>
      </div>
    </div>

    <div v-if="abortFor" class="overlay">
      <div class="scrim" aria-hidden="true" @click="abortFor = null"></div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="abort-h"
        aria-describedby="abort-d"
        class="dialog"
      >
        <div class="row" style="gap: 0.625rem">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--destructive-foreground)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
          <h2 id="abort-h">Abort this exposure?</h2>
        </div>
        <p id="abort-d" style="font-size: 0.9375rem; font-weight: 500">
          This stops the
          {{ abortFor.filter ? filterName(abortFor.filter) + ' ' : '' }}exposure<template
            v-if="abortFor.target_name"
          >
            on {{ abortFor.target_name }}</template
          >
          now. The partial frame is discarded. It is not saved and cannot be recovered.
        </p>
        <p class="small muted">
          <template v-if="abortStaysPaused"
            >A pause is waiting, so the scheduler stays paused after the abort.</template
          >
          <template v-else
            >Then the scheduler re-plans and picks the next target, which can be the same
            one.</template
          >
          The flat panel, roof and power are not touched. If this exposure ends before the abort
          arrives, the next one is left alone.
        </p>
        <p v-if="abortSyncClients" class="small muted">
          Sync clients take this exposure too. The abort does not stop their cameras, so the
          scheduler waits for them to finish their exposures before it moves on.
        </p>
        <div class="actions">
          <button type="button" class="btn" @click="abortFor = null">Cancel</button>
          <button type="button" class="btn danger" :disabled="busy" @click="confirmAbort">
            Abort and discard
          </button>
        </div>
      </div>
    </div>

    <div v-if="pauseOpen" class="overlay">
      <div class="scrim" aria-hidden="true" @click="pauseOpen = false"></div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-h"
        aria-describedby="pause-d"
        class="dialog"
      >
        <div class="row" style="gap: 0.625rem">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--warn)"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M8 5v14M16 5v14" />
          </svg>
          <h2 id="pause-h">Pause the scheduler?</h2>
        </div>
        <p id="pause-d" style="font-size: 0.9375rem; font-weight: 500">
          This finishes the current exposure, then stops picking targets.
        </p>
        <p v-if="exposure && target" class="small muted">
          The {{ filterName(exposure.filter) }} sub on {{ target.target_name }} is kept. The pause
          applies {{ applyWhen }}, then guiding stops.
        </p>
        <fieldset class="plain">
          <legend>While paused, the mount</legend>
          <label class="opt"
            ><input v-model="pauseMount" type="radio" name="pause-mount" value="track" /> Keeps
            tracking</label
          >
          <label class="opt"
            ><input v-model="pauseMount" type="radio" name="pause-mount" value="park" />
            Parks</label
          >
        </fieldset>
        <fieldset class="plain">
          <legend>Resume</legend>
          <label class="opt"
            ><input v-model="resumeMode" type="radio" name="pause-until" value="manual" /> When I
            resume</label
          >
          <label class="opt"
            ><input v-model="resumeMode" type="radio" name="pause-until" value="after" /> After 30
            minutes</label
          >
          <div class="row">
            <label class="opt"
              ><input v-model="resumeMode" type="radio" name="pause-until" value="at" /> At a set
              time</label
            >
            <label for="pause-at" class="sr-only">Resume time</label>
            <input
              id="pause-at"
              v-model="resumeAt"
              type="time"
              class="input time"
              @focus="resumeMode = 'at'"
            />
          </div>
        </fieldset>
        <div class="actions">
          <button type="button" class="btn" @click="pauseOpen = false">Cancel</button>
          <button
            type="button"
            class="btn primary"
            :disabled="busy || (resumeMode === 'at' && !resumeAt)"
            @click="confirmPause"
          >
            Pause after this exposure
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.clock {
  font-weight: 400;
  color: var(--muted-foreground);
  font-size: 1rem;
}
.blocked {
  margin: -1rem 0 0;
  text-align: right;
}
.af-only-link {
  align-self: flex-start;
}
.abort-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem 0.75rem;
  margin-top: 0.625rem;
}
.abort-why {
  flex: 1 1 14rem;
  text-align: right;
}
.pause-btn {
  background: color-mix(in oklch, var(--input) 30%, transparent);
}
.skip-btn {
  height: 2.5rem;
  padding: 0 1.25rem;
  font-size: 0.9375rem;
}
.inline-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.underline {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.fg {
  color: var(--foreground);
  font-weight: 600;
}
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: flex-start;
}
.current {
  flex: 1 1 26rem;
  gap: 1.25rem;
}
.latest {
  flex: 1.45 1 34rem;
}
.top {
  align-items: flex-start;
  gap: 0.75rem;
}
.card h2.target-h {
  margin: 0.5rem 0 0;
  font-size: 1.375rem;
  line-height: 1.3;
}
.coords {
  margin: 0.125rem 0 0;
}
.big {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.1;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
  gap: 0.75rem;
}
.fact {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
}
.swatch {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 2px;
  margin-right: 0.375rem;
}
.bar {
  height: 0.5rem;
  border-radius: 999px;
  background: var(--secondary);
  overflow: hidden;
}
.bar > div {
  height: 100%;
  background: var(--primary);
  transition: width 0.9s linear;
}
.why {
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}
.why h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}
.rules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
  gap: 0.5rem;
}
.rule {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  background: var(--secondary);
  border-radius: 0.375rem;
  padding: 0.375rem 0.625rem;
}
.sky {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 2;
  height: auto;
  border-radius: 0.5rem;
  background: var(--sky);
  object-fit: contain;
}
.stat {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.3;
}
.stat-lg {
  font-size: 1.375rem;
  font-weight: 600;
}
.wx {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 1rem;
  font-size: 0.8125rem;
}
.wx dd {
  margin: 0;
  font-weight: 600;
}
.wx .plain-dd {
  font-weight: 400;
}
.shutdown {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  font-size: 0.8125rem;
}
.steps {
  margin: 0;
  padding-left: 1.25rem;
  list-style: decimal;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.step-when {
  display: block;
}
.battery-alert {
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 0.875rem;
  font-weight: 600;
}
.legend {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.lower {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: 1.5rem;
  align-items: start;
}
.next {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.next li {
  display: grid;
  grid-template-columns: 4.25rem 1fr;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-top: 1px solid var(--border);
}
fieldset.plain {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
fieldset.plain legend {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--foreground);
  margin-bottom: 0.375rem;
  padding: 0;
}
.opt {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.input.time {
  height: 2rem;
  font-size: 0.8125rem;
}
</style>
