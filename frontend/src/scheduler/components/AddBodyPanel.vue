<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { submitCommand, type CommandRecord } from '../api/commands'
import type { BodyFraming } from '../api/comets'
import { withFraming } from '../framing'
import FramingEditor from './FramingEditor.vue'
import { draftProject, getPlanning, goalDrivenPlugin, type Snapshot } from '../api/planning'
import { DEFAULT_ASTEROID_SNR } from '../bodyGoals'
import { errorToast, notifyCommand, shell } from '../shell'
import { filterChoices } from '../filters'
import {
  LRGB,
  longestSub,
  lrgbFilters,
  missingText,
  withDesignation,
  type BodyKind,
  type CometDraft,
} from '../comets'

export interface AddBody {
  name: string
  designation: string
  ra: number
  dec: number
  rate_arcsec_per_min: number
  window?: { hours: number } | null
}

const props = defineProps<{
  body: AddBody | null
  noun: BodyKind
  kind?: BodyKind
}>()

const emit = defineEmits<{
  cancel: []
  added: [record: CommandRecord]
}>()

const snap = ref<Snapshot | null>(null)
const snapError = ref('')
const draft = ref<CometDraft | null>(null)
const draftError = ref('')
const drafting = ref(false)
const busy = ref(false)
const framing = ref<BodyFraming | null>(null)

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
const lrgb = computed(() =>
  snap.value
    ? lrgbFilters(
      filterChoices({
        filters: snap.value.filters,
        templates: snap.value.templates,
        plans: projects.value.flatMap((p) => p.targets?.flatMap((t) => t.plans) ?? []),
      }),
    )
    : null,
)
const missing = computed(() => missingText(lrgb.value?.missing ?? []))
const filterNames = LRGB.map((f) => f.label).join(', ')

let draftSeq = 0
watch(
  () => props.body,
  async (b) => {
    draft.value = null
    draftError.value = ''
    if (!b) {
      draftSeq++
      drafting.value = false
      return
    }
    if (!snap.value) {
      try {
        snap.value = await getPlanning()
        snapError.value = ''
      } catch (e) {
        snapError.value = e instanceof Error ? e.message : String(e)
        return
      }
    }
    if (props.body !== b) return
    makeDraft()
  },
  { immediate: true },
)

async function makeDraft() {
  const b = props.body
  const lrgbPick = lrgb.value
  if (!b || !lrgbPick || lrgbPick.missing.length) return
  const my = ++draftSeq
  drafting.value = true
  draftError.value = ''
  try {
    const goalDriven = goalDrivenPlugin(shell.scheduler.version)
    const raw = (await draftProject({
      name: b.name,
      priority: priority.value,
      minimumAltitude: -1,
      minimumTime: 0,
      filters: lrgbPick.filters,
      goalDriven,
      desired: 0,
      goal: { kind: 'snr', snr: props.kind === 'asteroid' ? DEFAULT_ASTEROID_SNR : 0, depth: 0 },
      panels: [{ name: b.name, raHours: b.ra / 15, dec: b.dec, rotation: 0 }],
    })) as CometDraft
    if (my !== draftSeq) return
    draft.value = withDesignation(raw, b.designation, props.kind)
  } catch (e) {
    if (my !== draftSeq) return
    draft.value = null
    draftError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (my === draftSeq) drafting.value = false
  }
}

const tooFast = computed(() => {
  const b = props.body
  if (!b) return false
  const s = longestSub(b.rate_arcsec_per_min)
  return s !== null && s < 1
})

const subsText = computed(() => {
  const b = props.body
  if (!b) return ''
  const s = longestSub(b.rate_arcsec_per_min)
  if (s === null) return `Subs: the system length. The ${props.noun}'s motion is not known.`
  return `Subs: up to ${s} s so the ${props.noun} stays sharp`
})

async function add() {
  const b = props.body
  if (!b || !draft.value || busy.value || tooFast.value) return
  busy.value = true
  try {
    const r = await submitCommand('project.create', withFraming(draft.value, framing.value))
    emit('added', r)
    const failed = ['rejected', 'failed', 'conflict', 'cancelled'].includes(r.status)
    notifyCommand(r, failed ? `${b.name} was not added` : 'Added ' + b.name)
    emit('cancel')
  } catch (e) {
    errorToast(e, `Could not add ${b.name}`)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="body" class="addpanel" role="region" aria-labelledby="add-h">
    <div class="spread">
      <h3 id="add-h">Add {{ body.name }} to the scheduler</h3>
      <button type="button" class="btn link xsmall" @click="emit('cancel')">Cancel</button>
    </div>
    <FramingEditor
      :key="body.designation"
      v-model="framing"
      :designation="body.designation"
      :name="body.name"
      :kind="kind ?? 'comet'"
    />
    <p class="small" style="margin: 0">{{ filterNames }}</p>
    <p v-if="!tooFast" class="small" style="margin: 0">{{ subsText }}</p>
    <p v-else class="small" style="margin: 0; color: var(--bad)">
      It moves more than one pixel per second, so no sub length keeps it sharp.
    </p>
    <p class="small muted" style="margin: 0">Priority {{ priority }}.</p>
    <p v-if="snapError" class="small" style="margin: 0; color: var(--bad)">
      Could not load the observatory's filters: {{ snapError }}
    </p>
    <p v-else-if="!snap" class="small muted" style="margin: 0">Loading the observatory's filters…</p>
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
        {{ busy ? 'Adding…' : `Add ${body.name}` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
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
