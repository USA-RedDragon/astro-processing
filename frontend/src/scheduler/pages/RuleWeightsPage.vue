<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHead from '../components/PageHead.vue'
import RuleWeightsConfirm from '../components/RuleWeightsConfirm.vue'
import MoonKeepCard from '../components/MoonKeepCard.vue'
import {
  applyRuleWeights,
  getRuleWeights,
  previewRuleWeights,
  type GlobalWeights,
  type ProjectWeights,
} from '../api/ruleweights'
import { onEvent } from '../api/events'
import { clock, longDate } from '../format'
import {
  applyOutcome,
  basisText,
  changedWeights,
  diffText,
  forText,
  plural,
  weightChanges,
  weightValue,
  weightsToQuery,
  type WeightChange,
} from '../ruleWeights'
import { errorToast, showToast, upsertWaiting } from '../shell'

const g = ref<GlobalWeights | null>(null)
const loadError = ref('')
const draft = reactive<Record<string, number>>({})

async function load() {
  try {
    g.value = await getRuleWeights()
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

const values = computed(() => ({ ...(g.value?.weights ?? {}), ...draft }))
const changed = computed(() => changedWeights(g.value?.weights ?? {}, draft))
const changes = computed<WeightChange[]>(() => (g.value ? weightChanges(g.value, draft) : []))
const dirty = computed(() => changes.value.length > 0)
const tryQuery = computed(() => ({ name: 'tonight', query: { w: weightsToQuery(changed.value) } }))
const when = (iso: string) => `${longDate(iso)} at ${clock(iso)}`

function setWeight(key: string, e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  draft[key] = Math.min(100, Math.max(0, v))
}

function setSwitch(key: string, e: Event) {
  draft[key] = (e.target as HTMLInputElement).checked ? 100 : 0
}

function discard() {
  Object.keys(draft).forEach((k) => delete draft[k])
}

const confirm = reactive<{
  open: boolean
  title: string
  action: string
  projectIds?: number[]
  changes: WeightChange[]
  projects: ProjectWeights[] | null
  loading: boolean
  error: string
}>({ open: false, title: '', action: '', changes: [], projects: null, loading: false, error: '' })
const busy = ref(false)

async function openSave() {
  if (!g.value) return
  Object.assign(confirm, {
    open: true,
    title: 'Save the global rule weights?',
    action: 'Save and update projects',
    projectIds: undefined,
    changes: changes.value,
    projects: null,
    loading: true,
    error: '',
  })
  try {
    const next = await previewRuleWeights(changed.value)
    confirm.projects = next.differing
  } catch (e) {
    confirm.error = e instanceof Error ? e.message : String(e)
  } finally {
    confirm.loading = false
  }
}

function openReset(projects: ProjectWeights[]) {
  Object.assign(confirm, {
    open: true,
    title:
      projects.length === 1
        ? `Reset ${projects[0]!.name} to the global weights?`
        : `Reset ${plural(projects.length, 'project')} to the global weights?`,
    action: projects.length === 1 ? 'Reset this project' : 'Reset these projects',
    projectIds: projects.length === 1 ? [projects[0]!.id] : undefined,
    changes: [],
    projects,
    loading: false,
    error: '',
  })
}

async function run() {
  busy.value = true
  try {
    const r = await applyRuleWeights(
      confirm.changes.length ? { weights: changed.value } : { projectIds: confirm.projectIds },
    )
    r.projects.forEach(upsertWaiting)
    showToast(applyOutcome(r))
    confirm.open = false
    discard()
    g.value = r.weights
  } catch (e) {
    errorToast(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="page">
    <PageHead context="Plan" title="Rule weights">
      One set of scoring weights for every project. Target Scheduler keeps weights per project, so
      saving here also updates every project's weights to match.
    </PageHead>
    <p v-if="loadError" class="empty" style="color: var(--bad)">
      Could not load the rule weights: {{ loadError }}
    </p>

    <section v-if="g" class="card" aria-labelledby="rw-h">
      <div>
        <h2 id="rw-h">Global rule weights</h2>
        <p class="small muted" style="margin: 0.25rem 0 0">
          Score = Σ weight × rule score at every re-plan. {{ basisText(g, when) }}
        </p>
      </div>
      <div>
        <div v-for="r in g.rules" :key="r.key" class="wrow small">
          <div style="min-width: 0">
            <div class="row" style="font-weight: 600">
              {{ r.label }}<span v-if="r.new" class="badge violet">New rule</span
              ><span v-if="r.for === 'mosaic'" class="badge">Mosaics</span
              ><span v-else-if="r.for === 'single'" class="badge">Single targets</span
              ><span v-else-if="r.mosaicOnly" class="badge">Scores mosaic panels only</span>
            </div>
            <div class="xsmall muted">{{ r.description }} {{ forText(r) }}</div>
          </div>
          <label v-if="r.switch" class="row" style="flex-wrap: nowrap">
            <input
              type="checkbox"
              :checked="(values[r.key] ?? 0) > 0"
              :aria-label="r.label"
              @change="setSwitch(r.key, $event)"
            />
            {{ (values[r.key] ?? 0) > 0 ? 'On' : 'Off' }}
          </label>
          <div v-else class="row" style="flex-wrap: nowrap">
            <input
              type="range"
              min="0"
              max="100"
              :value="values[r.key] ?? 0"
              :aria-label="r.label + ' weight'"
              style="flex: 1; min-width: 0"
              @input="setWeight(r.key, $event)"
            />
            <input
              type="number"
              min="0"
              max="100"
              class="input num"
              style="width: 4.5rem"
              :value="values[r.key] ?? 0"
              :aria-label="r.label + ' weight value'"
              @change="setWeight(r.key, $event)"
            />
          </div>
          <span class="xsmall muted num" style="text-align: right">
            <template v-if="r.key in changed">was {{ weightValue(r, g.weights[r.key]) }}</template>
          </span>
        </div>
      </div>
      <div class="row" style="justify-content: flex-end">
        <button type="button" class="btn" :disabled="!dirty" @click="discard">Discard</button>
        <RouterLink v-if="dirty" :to="tryQuery" class="btn">Try on Tonight first</RouterLink>
        <button type="button" class="btn primary" :disabled="!dirty || busy" @click="openSave">
          Save and update projects
        </button>
      </div>
    </section>

    <section v-if="g" class="card" aria-labelledby="drift-h">
      <div class="spread" style="align-items: flex-start">
        <div>
          <h2 id="drift-h">Projects that differ</h2>
          <p class="small muted" style="margin: 0.25rem 0 0">
            <template v-if="!g.differing.length"
              >All {{ plural(g.projects, 'project') }} have the global weights.</template
            >
            <template v-else
              >{{ plural(g.differing.length, 'project') }} of {{ g.projects }}
              {{ g.differing.length === 1 ? 'has' : 'have' }} weights that differ from the global
              set, for example after an edit in Target Scheduler. A missing weight counts as 0, as
              Target Scheduler scores it.</template
            >
          </p>
        </div>
        <button
          v-if="g.differing.length > 1"
          type="button"
          class="btn"
          :disabled="busy"
          @click="openReset(g.differing)"
        >
          Reset all {{ g.differing.length }}
        </button>
      </div>
      <ul v-if="g.differing.length" class="drift">
        <li v-for="p in g.differing" :key="p.id">
          <div style="min-width: 0">
            <RouterLink
              :to="{
                name: 'ProjectDetails',
                params: { id: String(p.id) },
                query: { tab: 'scoring' },
              }"
              class="underline"
              style="font-weight: 600"
              >{{ p.name }}</RouterLink
            >
            <span class="xsmall muted">
              · {{ p.isMosaic ? 'Mosaic' : 'Single target' }} · {{ p.state }}</span
            >
            <div class="xsmall muted">
              {{ p.diffs.map((d) => diffText(g!.rules, d)).join(' · ') }}
            </div>
          </div>
          <button type="button" class="btn" :disabled="busy" @click="openReset([p])">
            Reset to global
          </button>
        </li>
      </ul>
    </section>

    <MoonKeepCard />

    <RuleWeightsConfirm
      v-if="confirm.open"
      :title="confirm.title"
      :action="confirm.action"
      :changes="confirm.changes"
      :projects="confirm.projects"
      :loading="confirm.loading"
      :error="confirm.error"
      :busy="busy"
      @cancel="confirm.open = false"
      @confirm="run"
    />
  </main>
</template>

<style scoped>
.wrow {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(10rem, 1fr) 4.5rem;
  gap: 0.5rem 1rem;
  align-items: center;
  padding: 0.625rem 0;
  border-top: 1px solid var(--border);
}
.wrow .badge.violet {
  border: 0;
  background: var(--violet-bg);
  color: var(--violet);
}
.drift {
  list-style: none;
  margin: 0;
  padding: 0;
}
.drift li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.625rem 0;
  border-top: 1px solid var(--border);
}
@media (max-width: 640px) {
  .wrow {
    grid-template-columns: minmax(0, 1fr);
  }
  .drift li {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
