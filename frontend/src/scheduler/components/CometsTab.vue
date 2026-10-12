<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Orbit } from 'lucide-vue-next'
import { getBodies, getComets, type BodyTable, type Comet, type CometView } from '../api/comets'
import { listCommands, submitCommand, type CommandRecord } from '../api/commands'
import { onEvent } from '../api/events'
import { draftProject, getPlanning, goalDrivenPlugin, type Snapshot } from '../api/planning'
import { defaultValues } from '../projectSettings'
import { clock, shortDate } from '../format'
import { errorToast, notifyCommand, shell } from '../shell'
import {
  LRGB,
  PIXEL_SCALE_ARCSEC,
  addStates,
  brightest,
  designationKey,
  emptyState,
  longestSub,
  lrgbPlans,
  magText,
  missingText,
  peakText,
  rateText,
  shortSubs,
  sortComets,
  windowText,
  withDesignation,
  type CometDraft,
} from '../comets'

const view = ref<CometView | null>(null)
const loadError = ref<unknown>(null)
const loading = ref(true)
const records = ref<CommandRecord[]>([])
const tables = ref<BodyTable[]>([])

async function load() {
  loading.value = true
  try {
    view.value = await getComets()
    loadError.value = null
  } catch (e) {
    view.value = null
    loadError.value = e
  } finally {
    loading.value = false
  }
}

async function loadAdded() {
  const [cmds, bodies] = await Promise.allSettled([
    listCommands({ category: 'created', limit: 500 }),
    getBodies(),
  ])
  if (cmds.status === 'fulfilled') records.value = cmds.value
  if (bodies.status === 'fulfilled') tables.value = bodies.value.tables ?? []
}

let off: (() => void) | undefined
onMounted(() => {
  load()
  loadAdded()
  off = onEvent('command', (e: { data?: CommandRecord }) => {
    const r = e.data
    if (r && (r.kind === 'project.create' || r.kind === 'project.delete')) upsert(r)
  })
})
onUnmounted(() => off?.())

function upsert(r: CommandRecord) {
  const i = records.value.findIndex((x) => x.id === r.id)
  if (i >= 0) records.value[i] = r
  else records.value = [r, ...records.value]
}

const comets = computed(() => sortComets(view.value?.comets ?? []))
const empty = computed(() => (loading.value ? null : emptyState(loadError.value, view.value)))
const minAlt = computed(() => view.value?.min_altitude ?? 0)
const states = computed(() => addStates(records.value, tables.value))
const stateOf = (c: Comet) => states.value.get(designationKey(c.designation))
function failure(c: Comet): string {
  const st = stateOf(c)
  return st?.state === 'failed' ? st.message : ''
}

const heading = computed(() => {
  if (loading.value) return 'Loading…'
  if (loadError.value) return 'Comets tonight'
  const n = comets.value.length
  return `${n} ${n === 1 ? 'comet' : 'comets'} up tonight`
})

function isBrighter(c: Comet, which: 'mpc' | 'jpl'): boolean {
  const b = brightest(c)
  const m = which === 'mpc' ? c.magnitude_mpc : c.magnitude_jpl
  return b !== null && m === b && c.magnitude_mpc !== null && c.magnitude_jpl !== null
}

function subTitle(c: Comet): string {
  const parts = [`${c.delta_au.toFixed(2)} au from Earth`, `${c.r_au.toFixed(2)} au from the Sun`]
  if (c.designation && c.designation !== c.name) parts.unshift(c.designation)
  return parts.join(' · ')
}

function longestText(c: Comet): string {
  const s = longestSub(c.rate_arcsec_per_min)
  if (s === null) return '—'
  return s < 1 ? 'under 1 s' : `${s} s`
}

const sourceText = computed(() => {
  const v = view.value
  if (!v) return ''
  const parts = [`Computed ${shortDate(v.computed_at)} ${clock(v.computed_at)}`]
  if (v.elements.fetched_at)
    parts.push(`${v.elements.source} elements fetched ${shortDate(v.elements.fetched_at)}`)
  return parts.join(' · ')
})

const picked = ref<Comet | null>(null)
const snap = ref<Snapshot | null>(null)
const snapError = ref('')
const draft = ref<CometDraft | null>(null)
const draftError = ref('')
const drafting = ref(false)
const busy = ref(false)

function usual<T>(vals: T[]): T | null {
  const counts = new Map<T, number>()
  let best: T | null = null
  let n = 0
  for (const v of vals) {
    const c = (counts.get(v) ?? 0) + 1
    counts.set(v, c)
    if (c > n) {
      n = c
      best = v
    }
  }
  return best
}

const projects = computed(() => snap.value?.projects ?? [])
const priority = computed(() => usual(projects.value.map((p) => p.priority)) ?? 'Normal')
const minTime = computed(() => usual(projects.value.map((p) => p.minimumTime)) ?? 30)
const lrgb = computed(() =>
  snap.value ? lrgbPlans(snap.value.templates ?? [], snap.value.sets ?? []) : null,
)
const missing = computed(() => missingText(lrgb.value?.missing ?? []))
const filterNames = LRGB.map((f) => f.label).join(', ')

async function pick(c: Comet) {
  picked.value = c
  draft.value = null
  draftError.value = ''
  if (!snap.value) {
    try {
      snap.value = await getPlanning()
      snapError.value = ''
    } catch (e) {
      snapError.value = e instanceof Error ? e.message : String(e)
      return
    }
  }
  makeDraft()
}

let draftSeq = 0
async function makeDraft() {
  const c = picked.value
  const plans = lrgb.value
  if (!c || !plans || plans.missing.length) return
  const my = ++draftSeq
  drafting.value = true
  draftError.value = ''
  try {
    const ps = snap.value?.defaults?.projectSettings
    const goalDriven = goalDrivenPlugin(shell.scheduler.version)
    const raw = (await draftProject({
      name: c.name,
      priority: priority.value,
      minimumAltitude: minAlt.value,
      minimumTime: minTime.value,
      setId: '',
      plans: plans.plans,
      goalDriven,
      desired: 0,
      goal: { kind: 'snr', snr: 0, depth: 0 },
      panels: [{ name: c.name, raHours: c.ra / 15, dec: c.dec, rotation: 0 }],
      ...(ps ? defaultValues(ps) : {}),
    })) as CometDraft
    if (my !== draftSeq) return
    draft.value = withDesignation(raw, c.designation)
  } catch (e) {
    if (my !== draftSeq) return
    draft.value = null
    draftError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (my === draftSeq) drafting.value = false
  }
}

function cancel() {
  picked.value = null
  draft.value = null
  draftError.value = ''
}

const tooFast = computed(() => {
  const c = picked.value
  if (!c) return false
  const s = longestSub(c.rate_arcsec_per_min)
  return s !== null && s < 1
})

const subsText = computed(() => {
  const c = picked.value
  if (!c) return ''
  const s = longestSub(c.rate_arcsec_per_min)
  if (s === null) return "Subs: the system length. The comet's motion is not known."
  return `Subs: up to ${s} s so the comet stays sharp`
})

async function add() {
  const c = picked.value
  if (!c || !draft.value || busy.value || tooFast.value) return
  busy.value = true
  try {
    const r = await submitCommand('project.create', draft.value)
    upsert(r)
    const failed = ['rejected', 'failed', 'conflict', 'cancelled'].includes(r.status)
    notifyCommand(r, failed ? `${c.name} was not added` : 'Added ' + c.name)
    cancel()
  } catch (e) {
    errorToast(e, `Could not add ${c.name}`)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section aria-labelledby="comets-h" class="card" style="gap: 0.875rem">
    <div class="spread">
      <h2 id="comets-h">{{ heading }}</h2>
      <span v-if="sourceText" class="xsmall muted">{{ sourceText }}</span>
    </div>
    <p class="small muted" style="margin: 0; max-width: 72ch">
      Comets up tonight, brightest first. You pick what goes into the scheduler. Sub length is
      capped so the comet moves less than one pixel ({{ PIXEL_SCALE_ARCSEC }}″) per sub.
    </p>

    <div v-if="empty" class="blank" role="status">
      <Orbit class="blank-icon" aria-hidden="true" />
      <div>
        <p class="blank-title">{{ empty.title }}</p>
        <p class="small muted" style="margin: 0">{{ empty.text }}</p>
      </div>
    </div>

    <div
      v-else-if="comets.length"
      class="scroll-x"
      style="border: 1px solid var(--border); border-radius: 0.5rem"
    >
      <table class="dgrid num" style="min-width: 48rem">
        <thead>
          <tr>
            <th scope="col">Comet</th>
            <th scope="col" style="text-align: right">Mag · MPC / JPL</th>
            <th scope="col">Up tonight</th>
            <th scope="col" style="text-align: right">Highest</th>
            <th scope="col" style="text-align: right">Moving</th>
            <th scope="col" style="text-align: right">Longest sub</th>
            <th scope="col"><span class="sr-only">Add</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in comets" :key="c.designation || c.name">
            <td style="min-width: 14rem">
              <div style="font-weight: 600; white-space: nowrap">{{ c.name }}</div>
              <div class="xsmall muted">{{ subTitle(c) }}</div>
              <div v-if="failure(c)" class="xsmall" style="color: var(--bad)">
                Not added: {{ failure(c) }}
              </div>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <span :class="{ strong: isBrighter(c, 'mpc') }">{{ magText(c.magnitude_mpc) }}</span>
              <span class="muted"> / </span>
              <span :class="{ strong: isBrighter(c, 'jpl') }">{{ magText(c.magnitude_jpl) }}</span>
            </td>
            <td style="white-space: nowrap">
              <div>{{ windowText(c.window, minAlt).main }}</div>
              <div class="xsmall muted">{{ windowText(c.window, minAlt).sub }}</div>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <div>{{ peakText(c.window).main }}</div>
              <div class="xsmall muted">{{ peakText(c.window).sub }}</div>
            </td>
            <td style="text-align: right; white-space: nowrap">
              {{ rateText(c.rate_arcsec_per_min) }}
            </td>
            <td
              style="text-align: right; white-space: nowrap"
              :class="{ cap: shortSubs(c.rate_arcsec_per_min) }"
            >
              <div>{{ longestText(c) }}</div>
              <div v-if="shortSubs(c.rate_arcsec_per_min)" class="xsmall">short subs</div>
            </td>
            <td style="text-align: right">
              <span v-if="stateOf(c)?.state === 'added'" class="badge ok">Added</span>
              <span v-else-if="stateOf(c)?.state === 'adding'" class="badge info">Adding</span>
              <template v-else>
                <button
                  type="button"
                  class="btn sm"
                  :aria-expanded="picked?.designation === c.designation"
                  :aria-label="`Add ${c.name} to the scheduler`"
                  @click="pick(c)"
                >
                  {{ stateOf(c)?.state === 'failed' ? 'Try again' : 'Add to scheduler' }}
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="picked" class="addpanel" role="region" aria-labelledby="add-h">
      <div class="spread">
        <h3 id="add-h">Add {{ picked.name }} to the scheduler</h3>
        <button type="button" class="btn link xsmall" @click="cancel">Cancel</button>
      </div>
      <p class="small" style="margin: 0">{{ filterNames }}</p>
      <p v-if="!tooFast" class="small" style="margin: 0">{{ subsText }}</p>
      <p v-else class="small" style="margin: 0; color: var(--bad)">
        It moves more than one pixel per second, so no sub length keeps it sharp.
      </p>
      <p class="small muted" style="margin: 0">
        Priority {{ priority }}, minimum altitude {{ minAlt }}°, minimum time {{ minTime }} min.
      </p>
      <p v-if="snapError" class="small" style="margin: 0; color: var(--bad)">
        Could not load your exposure templates: {{ snapError }}
      </p>
      <p v-else-if="!snap" class="small muted" style="margin: 0">
        Loading your exposure templates…
      </p>
      <p v-else-if="missing" class="small" style="margin: 0; color: var(--bad)">{{ missing }}</p>
      <p v-else-if="draftError" class="small" style="margin: 0; color: var(--bad)">
        Not drafted: {{ draftError }}
      </p>
      <div class="row">
        <button
          type="button"
          class="btn primary"
          :disabled="!draft || busy || drafting || tooFast"
          @click="add"
        >
          {{ busy ? 'Adding…' : `Add ${picked.name}` }}
        </button>
      </div>
    </div>

    <div v-if="view" class="xsmall muted" style="display: grid; gap: 0.25rem">
      <p style="margin: 0">
        Both magnitudes are model predictions: MPC from the Minor Planet Center's elements, JPL from
        the JPL Small-Body Database. They can differ by several magnitudes for active comets. The
        list is sorted by the brighter of the two and keeps comets where either is
        {{ view.max_magnitude }} or brighter.
      </p>
      <p v-if="view.elements.error" style="margin: 0; color: var(--warn)">
        Comet elements: {{ view.elements.error }}
      </p>
      <p v-if="view.jpl_magnitudes.error" style="margin: 0; color: var(--warn)">
        JPL magnitudes: {{ view.jpl_magnitudes.error }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.strong {
  font-weight: 600;
}
.cap {
  color: var(--warn);
}
.blank {
  display: flex;
  gap: 0.875rem;
  align-items: flex-start;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  padding: 1.25rem;
}
.blank-icon {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  color: var(--muted-foreground);
}
.blank-title {
  margin: 0 0 0.25rem;
  font-weight: 600;
}
.addpanel {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 1rem;
}
.addpanel h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}
</style>
