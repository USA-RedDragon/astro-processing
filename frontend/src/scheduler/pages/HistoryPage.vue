<script setup lang="ts">
import PageHead from '../components/PageHead.vue'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { listCommands, type CommandRecord } from '../api/commands'
import { onEvent, onReconnect } from '../api/events'
import { clock, shortDate, show } from '../format'
import { historyBadge, undoState } from '../plan'
import { cancel, shell, undo, whenApplies } from '../shell'
import {
  HISTORY_PAGE,
  appendOlder,
  historyMatches,
  historyQuery,
  type HistoryFilters,
} from '../history'

const filters = reactive<HistoryFilters>({ who: 'all', when: '14d', category: '', q: '' })
const records = ref<CommandRecord[]>([])
const loading = ref(false)
const loadingOlder = ref(false)
const more = ref(false)
const error = ref('')
const olderError = ref('')
const busy = ref<string | null>(null)

const categories = [
  { value: '', label: 'All kinds' },
  { value: 'control', label: 'Skips and pauses' },
  { value: 'priority', label: 'Priority, state, active' },
  { value: 'goals', label: 'Goals' },
  { value: 'rules', label: 'Rule weights' },
  { value: 'plans', label: 'Exposure plans' },
  { value: 'templates', label: 'Templates' },
  { value: 'created', label: 'Created' },
  { value: 'matching', label: 'Name matches' },
  { value: 'adoption', label: 'Mosaic adoption' },
]

let seq = 0
let queriedAt = Date.now()
async function load() {
  const mine = ++seq
  loading.value = true
  loadingOlder.value = false
  olderError.value = ''
  queriedAt = Date.now()
  try {
    const out = await listCommands(historyQuery(filters, queriedAt))
    if (mine !== seq) return
    records.value = out
    more.value = out.length === HISTORY_PAGE
    error.value = ''
  } catch (e) {
    if (mine !== seq) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (mine === seq) loading.value = false
  }
}

async function loadOlder() {
  const last = records.value[records.value.length - 1]
  if (!last || loadingOlder.value) return
  const mine = seq
  loadingOlder.value = true
  try {
    const out = await listCommands(historyQuery(filters, queriedAt, last))
    if (mine !== seq) return
    records.value = appendOlder(records.value, out)
    more.value = out.length === HISTORY_PAGE
    olderError.value = ''
  } catch (e) {
    if (mine !== seq) return
    olderError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (mine === seq) loadingOlder.value = false
  }
}

let qTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [filters.who, filters.when, filters.category], load)
watch(
  () => filters.q,
  () => {
    if (qTimer) clearTimeout(qTimer)
    qTimer = setTimeout(load, 300)
  },
)

let off: (() => void) | undefined
let offReconnect: (() => void) | undefined
onMounted(() => {
  load()
  offReconnect = onReconnect(load)
  off = onEvent('command', (e: { data?: CommandRecord }) => {
    const r = e.data
    if (!r) return
    const i = records.value.findIndex((x) => x.id === r.id)
    if (i >= 0) records.value[i] = r
    else if (historyMatches(r, filters, Date.now())) records.value.unshift(r)
  })
})
onUnmounted(() => {
  if (off) off()
  if (offReconnect) offReconnect()
  if (qTimer) clearTimeout(qTimer)
})

function clear() {
  filters.who = 'all'
  filters.when = '14d'
  filters.category = ''
  filters.q = ''
}

function whoLine(r: CommandRecord): string {
  const parts = [r.author || 'unknown user']
  if (r.destination === 'app') parts.push('app only')
  else if (r.transport === 'api') parts.push('sent over the API')
  else if (r.transport === 'queue') parts.push('sent through the database queue')
  if (r.attempts > 1) parts.push(`${r.attempts} attempts`)
  return parts.join(' · ')
}

function badgeOf(r: CommandRecord) {
  return historyBadge(r, r.status === 'pending' ? whenApplies(r) : '', shell.scheduler.reachable)
}

const entries = computed(() =>
  records.value.map((r) => {
    const multi = new Set((r.diffs ?? []).map((d) => d.object.name)).size > 1
    const undo = undoState(r)
    return {
      r,
      badge: badgeOf(r),
      undo,
      diffs: (r.diffs ?? []).map((d) => ({
        field: multi ? `${d.object.name} · ${d.field}` : d.field,
        before: d.before === null || d.before === undefined ? 'not recorded' : show(d.before),
        after: show(d.after),
      })),
      note: [r.message === undo.note ? '' : r.message, r.note].filter(Boolean).join(' · '),
    }
  }),
)

async function act(r: CommandRecord, isCancel: boolean) {
  busy.value = r.id
  try {
    const out = isCancel ? await cancel(r.id) : await undo(r.id)
    const i = records.value.findIndex((x) => x.id === out.id)
    if (i >= 0) records.value[i] = out
    else records.value.unshift(out)
  } catch {
    return
  } finally {
    busy.value = null
  }
}

const editingText = computed(() => {
  const w = shell.scheduler.web_editing
  if (w === true)
    return 'Web editing is on, so the Target Scheduler editor on the observatory PC is read-only.'
  if (w === false)
    return 'Web editing is off, so edits made in Target Scheduler on the observatory PC do not show here.'
  return ''
})

const pendingN = computed(() => shell.waiting.filter((c) => c.status === 'pending').length)
const queuedN = computed(() => shell.waiting.filter((c) => c.status === 'queued').length)
const waitingLabel = computed(() => {
  const parts: string[] = []
  if (pendingN.value) {
    parts.push(
      `${pendingN.value} ${pendingN.value === 1 ? 'change applies' : 'changes apply'} ${whenApplies()}`,
    )
  }
  if (queuedN.value)
    parts.push(
      shell.scheduler.reachable === 'offline'
        ? `${queuedN.value} queued until the PC answers`
        : `${queuedN.value} sent via the backup queue`,
    )
  return parts.join(' · ')
})
</script>

<template>
  <main class="page wide">
    <PageHead context="Plan" title="History">
      Every change to the scheduler made from here. {{ editingText }} Undo sends the reverse change;
      it never rewrites the past.
    </PageHead>

    <div v-if="waitingLabel" role="status" class="waiting">
      <span>{{ waitingLabel }}</span>
      <button type="button" class="btn sm" @click="shell.statusOpen = true">
        Show what is waiting
      </button>
    </div>

    <div class="filters">
      <label for="h-who" class="field">
        <span>Who</span>
        <select id="h-who" v-model="filters.who" class="input">
          <option value="all">Everyone</option>
          <option value="web">Web: sent to the scheduler</option>
          <option value="app">App only: matches and adoption</option>
        </select>
      </label>
      <label for="h-what" class="field">
        <span>Change</span>
        <select id="h-what" v-model="filters.category" class="input">
          <option v-for="c in categories" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </label>
      <label for="h-obj" class="field grow">
        <span>Project, target or template</span>
        <input
          id="h-obj"
          v-model="filters.q"
          type="search"
          class="input"
          placeholder="Search changes"
        />
      </label>
      <label for="h-when" class="field">
        <span>When</span>
        <select id="h-when" v-model="filters.when" class="input">
          <option value="14d">Last 14 days</option>
          <option value="24h">Last 24 hours</option>
          <option value="all">All time</option>
        </select>
      </label>
      <button type="button" class="btn link small" style="height: 2.25rem" @click="clear">
        Clear filters
      </button>
    </div>

    <section aria-labelledby="hist-h" class="card list">
      <h2 id="hist-h" class="sr-only">Changes</h2>
      <p v-if="error" class="empty">Could not load history: {{ error }}</p>
      <ol v-else class="entries">
        <li v-for="e in entries" :key="e.r.id">
          <div class="small num">
            <div style="font-weight: 600">{{ clock(e.r.created_at) }}</div>
            <div class="muted">{{ shortDate(e.r.created_at) }}</div>
            <div class="muted xsmall">#{{ e.r.id.slice(0, 8) }}</div>
          </div>
          <div class="body">
            <div class="row" style="font-size: 0.875rem">
              <span style="font-weight: 600">{{ e.r.title }}</span>
              <span class="badge" :class="e.badge.tone">{{ e.badge.label }}</span>
            </div>
            <div class="xsmall muted">{{ whoLine(e.r) }}</div>
            <div v-if="e.diffs.length" class="row num diffs">
              <span v-for="(d, i) in e.diffs" :key="i" class="diff">
                <span class="muted">{{ d.field }}</span>
                <del>{{ d.before }}</del>
                <span aria-hidden="true">→</span>
                <ins>{{ d.after }}</ins>
              </span>
            </div>
            <div v-if="e.note" class="xsmall muted">{{ e.note }}</div>
          </div>
          <div class="undo">
            <button
              type="button"
              class="btn sm"
              :aria-label="e.undo.label + ': ' + e.r.title"
              :disabled="!e.undo.enabled || busy === e.r.id"
              @click="act(e.r, e.undo.cancel)"
            >
              {{ e.undo.label }}
            </button>
            <span class="undo-note">{{ e.undo.note }}</span>
          </div>
        </li>
      </ol>
      <p v-if="!error && !entries.length" class="empty">
        {{ loading ? 'Loading.' : 'No change matches these filters.' }}
      </p>
      <div v-if="!error && entries.length" class="older">
        <button
          v-if="more"
          type="button"
          class="btn"
          :disabled="loadingOlder || loading"
          @click="loadOlder"
        >
          {{ loadingOlder ? 'Loading older changes.' : 'Load older changes' }}
        </button>
        <p v-else class="xsmall muted" style="margin: 0">
          {{
            filters.when === 'all'
              ? 'That is every change.'
              : 'No older changes in this window. Choose "All time" to see earlier ones.'
          }}
        </p>
        <p v-if="olderError" class="xsmall" role="alert" style="margin: 0">
          Could not load older changes: {{ olderError }}
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.waiting {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--warn);
  background: var(--warn-bg);
  border-radius: 0.625rem;
  padding: 0.625rem 1rem;
  font-size: 0.8125rem;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}
.grow {
  flex: 1 1 14rem;
}
.grow .input {
  min-width: 0;
}
.older {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 1rem 0;
}
.list {
  padding: 0.5rem 1.5rem;
  gap: 0;
}
.entries {
  list-style: none;
  margin: 0;
  padding: 0;
}
.entries li {
  display: grid;
  grid-template-columns: minmax(0, 7rem) minmax(0, 1fr) auto;
  gap: 0.5rem 1.25rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
  align-items: start;
}
.entries li:last-child {
  border-bottom: 0;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}
.diffs {
  gap: 0.375rem;
  font-size: 0.8125rem;
}
.diff {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
}
del {
  background: var(--del-bg);
  border-radius: 0.25rem;
  padding: 0 0.25rem;
}
ins {
  background: var(--add-bg);
  border-radius: 0.25rem;
  padding: 0 0.25rem;
  text-decoration: none;
}
.undo {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}
.undo .btn {
  height: 2rem;
  padding: 0 0.875rem;
  font-size: 0.8125rem;
}
.undo-note {
  font-size: 0.6875rem;
  color: var(--muted-foreground);
  text-align: right;
  max-width: 10rem;
}
@media (max-width: 640px) {
  .entries li {
    grid-template-columns: minmax(0, 1fr);
  }
  .undo {
    align-items: flex-start;
  }
  .undo-note {
    text-align: left;
    max-width: none;
  }
}
</style>
