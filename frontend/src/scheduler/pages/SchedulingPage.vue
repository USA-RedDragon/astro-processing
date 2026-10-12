<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import PageHead from '../components/PageHead.vue'
import { getScheduling, saveScheduling, type GlobalSettings, type SchedulingView } from '../api/scheduling'
import { onEvent } from '../api/events'
import { flatsLabel, flatsOptions, settingText } from '../projectSettings'
import { GLOBAL_SETTINGS, globalChanged, globalErrors, type GlobalKey } from '../scheduling'
import { errorToast, notifyCommand } from '../shell'

const HELP: Record<GlobalKey, string> = {
  ditherEvery: 'Move the mount a little after this many subs, so noise does not line up in the stack.',
  filterSwitchFrequency:
    'Subs of one filter before moving on to the next. Each target picks up where it left off.',
  smartExposureOrder: 'Let the Moon decide the filter order. Filter steering already does this.',
  flatsHandling: 'When flats are taken for the targets imaged that night.',
  meridianWindow: 'Only image this many minutes either side of the meridian. 0 is off.',
  maximumAltitude: 'Do not image above this altitude. 0 is off.',
  enableGrader: 'Check each sub as it comes in and turn away bad ones.',
}

const view = ref<SchedulingView | null>(null)
const loadError = ref('')
const draft = reactive<Partial<GlobalSettings>>({})
const saving = ref(false)

async function load() {
  try {
    view.value = await getScheduling()
    loadError.value = ''
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

const values = computed<GlobalSettings | null>(() =>
  view.value ? { ...view.value.global, ...draft } : null,
)
const errors = computed(() =>
  values.value && view.value ? globalErrors(values.value, view.value.rules.hardMinAltitude) : {},
)
const dirty = computed(() => (view.value ? globalChanged(view.value.global, draft) : false))
const invalid = computed(() => Object.keys(errors.value).length > 0)

function set(key: GlobalKey, v: number | boolean) {
  ;(draft as Record<GlobalKey, number | boolean>)[key] = v
}

function num(e: Event): number {
  const v = (e.target as HTMLInputElement).value.trim()
  return v === '' ? NaN : Number(v)
}

function reset() {
  Object.keys(draft).forEach((k) => delete draft[k as GlobalKey])
}

async function save() {
  if (!values.value || invalid.value || !dirty.value) return
  saving.value = true
  try {
    const r = await saveScheduling(values.value)
    notifyCommand(r.command)
    reset()
    await load()
  } catch (e) {
    errorToast(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="page">
    <PageHead context="Plan" title="Scheduling">
      Settings every project uses. Saving changes them on every project.
    </PageHead>
    <p v-if="loadError" class="empty" style="color: var(--bad)">
      Could not load the scheduling settings: {{ loadError }}
    </p>
    <p v-else-if="!view" class="empty">Loading…</p>
    <section v-else-if="values" class="card" aria-labelledby="sched-h">
      <h2 id="sched-h">Settings</h2>
      <div class="sgrid">
        <div v-for="s in GLOBAL_SETTINGS" :key="s.key" class="field">
          <label v-if="s.kind === 'bool'" class="field">
            <span>{{ s.label }}</span>
            <span class="row small" style="height: 2.25rem; flex-wrap: nowrap">
              <input
                type="checkbox"
                class="size-4 accent-primary"
                :checked="!!values[s.key]"
                @change="set(s.key, ($event.target as HTMLInputElement).checked)"
              />
              {{ settingText(s, values[s.key]) }}
            </span>
          </label>
          <label v-else-if="s.kind === 'flats'" class="field">
            <span>{{ s.label }}</span>
            <select
              class="input"
              :value="values.flatsHandling"
              @change="set(s.key, Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="v in flatsOptions(view.global.flatsHandling)" :key="v" :value="v">
                {{ flatsLabel(v) }}
              </option>
            </select>
          </label>
          <label v-else class="field">
            <span>{{ s.label }}{{ s.unit ? ', ' + s.unit : '' }}</span>
            <input
              class="input num"
              type="number"
              :min="s.min"
              :max="s.max"
              :step="s.kind === 'int' ? 1 : 0.1"
              :value="Number.isNaN(values[s.key]) ? '' : values[s.key]"
              :aria-invalid="!!errors[s.key]"
              @change="set(s.key, num($event))"
            />
          </label>
          <span v-if="errors[s.key]" class="xsmall" style="color: var(--bad)">{{ errors[s.key] }}</span>
          <span v-else class="xsmall muted">{{ HELP[s.key] }}</span>
        </div>
      </div>
      <div class="row" style="justify-content: flex-end">
        <button type="button" class="btn" :disabled="!dirty || saving" @click="reset">Reset</button>
        <button type="button" class="btn primary" :disabled="!dirty || invalid || saving" @click="save">
          Save
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sgrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: 1rem;
}
</style>
