<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PageHead from '../components/PageHead.vue'
import AutofocusPanel from '../components/AutofocusPanel.vue'
import AutofocusDrift from '../components/AutofocusDrift.vue'
import { getAutofocusRuns } from '../api/autofocus'
import { onReconnect } from '../api/events'
import { hm, longDate, nightOf } from '../format'
import { filterName } from '../plan'
import { shell } from '../shell'
import {
  durationText,
  fromRun,
  fromStatus,
  historyEmpty,
  miniPath,
  movedSteps,
  signed,
  sortRuns,
  startOf,
  tonightSince,
  type AfRuns,
} from '../autofocus'

const data = ref<AfRuns | null>(null)
const error = ref('')
const picked = ref('')
let seq = 0

async function load() {
  const mine = ++seq
  try {
    const r = await getAutofocusRuns(tonightSince(shell.now), 200)
    if (mine !== seq) return
    data.value = r
    error.value = ''
  } catch (e) {
    if (mine !== seq) return
    error.value = e instanceof Error ? e.message : String(e)
  }
}

const offs: (() => void)[] = []
onMounted(() => {
  load()
  offs.push(onReconnect(load))
})
onUnmounted(() => offs.forEach((f) => f()))

const live = computed(() => shell.scheduler.autofocus ?? null)
watch(
  () => (live.value ? live.value.run_id + ':' + live.value.state : ''),
  (k, old) => {
    if (old !== undefined && k && !k.endsWith(':running')) load()
  },
)

const runs = computed(() => sortRuns(data.value?.runs))
const empty = computed(() => historyEmpty(data.value, error.value))

const rows = computed(() =>
  runs.value.map((r) => {
    const v = fromRun(r)
    const s = startOf(r)
    const mv = r.success ? movedSteps(r.chosen_position, s?.position) : null
    return {
      id: r.id,
      run: r,
      time: hm(r.finished_at),
      filter: r.filter ? filterName(r.filter) : '—',
      temp: r.temperature !== null && r.temperature !== undefined ? r.temperature.toFixed(1) + ' °C' : '—',
      start: s ? String(Math.round(s.position)) : '—',
      startTitle: s && s.basis !== 'initial' ? 'Where the last run left the focuser' : '',
      chosen:
        r.success && r.chosen_position !== null && r.chosen_position !== undefined
          ? String(Math.round(r.chosen_position))
          : '',
      moved: mv === null ? '—' : signed(mv),
      hfr: r.success && r.chosen_value !== null && r.chosen_value !== undefined ? r.chosen_value.toFixed(2) : '—',
      took: durationText(r.duration_seconds) || '—',
      failed: !r.success,
      error: r.error ?? '',
      mini: miniPath(v),
      dashed: v.curve?.kind === 'provisional',
    }
  }),
)

const liveView = computed(() => {
  const a = live.value
  return a && a.state === 'running' ? fromStatus(a, runs.value[0] ?? null) : null
})

const selectedRun = computed(() => runs.value.find((r) => r.id === picked.value) ?? null)

const shown = computed(() => {
  if (selectedRun.value) return { view: fromRun(selectedRun.value), live: false }
  if (liveView.value) return { view: liveView.value, live: true }
  if (runs.value.length) return { view: fromRun(runs.value[0]), live: false }
  const a = live.value
  if (a) return { view: fromStatus(a), live: false }
  return null
})

const shownId = computed(() => (shown.value && !shown.value.live ? shown.value.view.id : ''))

function pick(id: string) {
  picked.value = picked.value === id ? '' : id
}

const nightLine = computed(() => 'Night of ' + longDate(nightOf(shell.now)))
</script>

<template>
  <main class="page wide">
    <PageHead :context="nightLine" title="Autofocus">
      NINA's autofocus runs tonight: each run's curve, where it put the focuser, and how that
      position followed the temperature.
    </PageHead>

    <section aria-labelledby="af-curve-h" class="card">
      <div class="spread">
        <h2 id="af-curve-h">{{ shown?.live ? 'Running now' : selectedRun ? 'Selected run' : 'Latest run' }}</h2>
        <button v-if="selectedRun" type="button" class="btn sm ghost" @click="picked = ''">
          {{ liveView ? 'Show the run in progress' : 'Show the latest run' }}
        </button>
      </div>
      <AutofocusPanel
        v-if="shown"
        :view="shown.view"
        :now="shell.now"
        :last="shown.live ? (runs[0] ?? null) : null"
      />
      <p v-else class="empty">{{ empty || 'No autofocus run to show.' }}</p>
    </section>

    <section aria-labelledby="af-runs-h" class="card">
      <div class="spread">
        <h2 id="af-runs-h">Tonight's runs</h2>
        <span v-if="data" class="xsmall muted">since {{ hm(data.since) }} · times Central</span>
      </div>
      <p v-if="empty" class="empty">{{ empty }}</p>
      <template v-else>
        <div class="scroll-x">
          <table class="dgrid af-table num">
            <thead>
              <tr>
                <th>Time</th>
                <th>Filter</th>
                <th class="r">Sensor</th>
                <th class="r">Start</th>
                <th class="r">Chosen</th>
                <th class="r">Moved</th>
                <th class="r">Best HFR</th>
                <th class="r">Took</th>
                <th>Curve</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in rows"
                :key="r.id"
                tabindex="0"
                :aria-selected="r.id === shownId ? 'true' : 'false'"
                :class="{ sel: r.id === shownId }"
                @click="pick(r.id)"
                @keydown.enter.prevent="pick(r.id)"
                @keydown.space.prevent="pick(r.id)"
              >
                <td>{{ r.time }}</td>
                <td>{{ r.filter }}</td>
                <td class="r">{{ r.temp }}</td>
                <td class="r" :title="r.startTitle">{{ r.start }}</td>
                <td class="r">
                  <span v-if="r.failed" class="badge bad" :title="r.error">failed</span>
                  <template v-else>{{ r.chosen || '—' }}</template>
                </td>
                <td class="r">{{ r.moved }}</td>
                <td class="r">{{ r.hfr }}</td>
                <td class="r">{{ r.took }}</td>
                <td>
                  <svg v-if="r.mini.dots.length" width="80" height="24" viewBox="0 0 80 24" aria-hidden="true">
                    <path
                      v-if="r.mini.path"
                      :d="r.mini.path"
                      fill="none"
                      stroke="var(--info)"
                      stroke-width="1.5"
                      :stroke-dasharray="r.dashed ? '3 2' : undefined"
                    />
                    <circle
                      v-for="(p, i) in r.mini.dots"
                      :key="i"
                      :cx="p.x"
                      :cy="p.y"
                      r="1.6"
                      fill="var(--foreground)"
                    />
                  </svg>
                  <span v-else class="muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="xsmall muted" style="margin: 0">Select a run to show its curve above.</p>

        <div class="drift-block">
          <div class="spread">
            <h3>Chosen position and sensor temperature</h3>
            <span class="xsmall muted">one dot per run</span>
          </div>
          <div class="row xsmall muted legend">
            <span
              ><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
                <path d="M1 6h16" stroke="var(--info)" stroke-width="2" /></svg
              >chosen position (left axis)</span
            >
            <span
              ><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
                <path d="M1 6h16" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="4 4" /></svg
              >sensor temperature (right axis)</span
            >
          </div>
          <AutofocusDrift :runs="runs" :selected="shownId" @pick="pick" />
          <p v-if="!runs.some((r) => r.success)" class="empty" style="padding: 0">
            No run tonight chose a position yet.
          </p>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.af-table td,
.af-table th {
  white-space: nowrap;
  vertical-align: middle;
}
.af-table .r {
  text-align: right;
}
.af-table tbody tr {
  cursor: pointer;
}
.af-table tbody tr.sel {
  background: var(--sel);
}
.af-table tbody tr:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}
.drift-block {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}
.drift-block h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}
.legend {
  gap: 0.25rem 1rem;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
</style>
