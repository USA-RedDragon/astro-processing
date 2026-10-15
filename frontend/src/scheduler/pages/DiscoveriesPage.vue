<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHead from '../components/PageHead.vue'
import DiscoveryChart from '../components/DiscoveryChart.vue'
import {
  getDiscoveryCandidate,
  getDiscoveryCandidates,
  getDiscoveryNights,
  getDiscoveryRuns,
  getDiscoveryStatus,
  setDiscoveryVetting,
  type DiscoveryCandidate,
  type DiscoveryDetail,
  type DiscoveryNight,
  type DiscoveryRun,
  type DiscoveryStatus,
  type Vetting,
} from '../api/discoveries'
import {
  CHIPS,
  decText,
  raText,
  VET_BUTTONS,
  cards,
  chipCounts,
  classLabel,
  deltaText,
  edgeOf,
  inChip,
  isChip,
  isNight,
  links,
  matchLines,
  matchText,
  moverName,
  movers,
  nextVetting,
  nightChoices,
  nightLabel,
  offsetText,
  pillOf,
  positionText,
  presenceText,
  rateText,
  runNotes,
  sentence,
  sourceWords,
  starText,
  statusText,
  summarize,
  targets,
  vettingLabel,
  vmagText,
  type Chip,
} from '../discoveries'
import { onChange } from '@/lib/events'
import { latestOnly } from '../latest'

const route = useRoute()
const router = useRouter()

const qs = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')

const night = ref(isNight(qs('night')) ? qs('night') : '')
const target = ref(qs('target'))
const chip = ref<Chip>(isChip(qs('show')) ? (qs('show') as Chip) : 'all')
const selectedId = ref<number | null>(Number(qs('candidate')) || null)

const nights = ref<DiscoveryNight[]>([])
const runs = ref<DiscoveryRun[]>([])
const candidates = ref<DiscoveryCandidate[]>([])
const status = ref<DiscoveryStatus | null>(null)
const error = ref('')
const loading = ref(true)
const nightReq = latestOnly()

function syncQuery() {
  const q: Record<string, string> = {}
  if (night.value) q.night = night.value
  if (target.value) q.target = target.value
  if (chip.value !== 'all') q.show = chip.value
  if (selectedId.value) q.candidate = String(selectedId.value)
  router.replace({ query: q })
}

async function loadStatus() {
  try {
    status.value = await getDiscoveryStatus()
  } catch {
    status.value = null
  }
}

async function loadNight() {
  const current = nightReq.next()
  if (!night.value) {
    runs.value = []
    candidates.value = []
    return
  }
  const [r, c] = await Promise.all([
    getDiscoveryRuns(night.value),
    getDiscoveryCandidates(night.value, target.value || undefined),
  ])
  if (!current()) return
  runs.value = r ?? []
  candidates.value = c ?? []
}

let loadSeq = 0

async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const n = await getDiscoveryNights()
    nights.value = n ?? []
    if (!night.value && nights.value.length) night.value = nights.value[0]!.night
    await Promise.all([loadNight(), loadStatus()])
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
  syncQuery()
}

async function reloadNight() {
  try {
    await loadNight()
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

let statusTimer: ReturnType<typeof setInterval> | undefined
watch(
  () => status.value?.state,
  (s) => {
    if (s === 'running' && !statusTimer) statusTimer = setInterval(loadStatus, 15000)
    if (s !== 'running' && statusTimer) {
      clearInterval(statusTimer)
      statusTimer = undefined
    }
  },
)

let stopEvents: (() => void) | undefined
onMounted(() => {
  load()
  stopEvents = onChange(['discovery'], load)
})
onUnmounted(() => {
  stopEvents?.()
  if (statusTimer) clearInterval(statusTimer)
})

function pickNight(ev: Event) {
  night.value = (ev.target as HTMLSelectElement).value
  selectedId.value = null
  syncQuery()
  reloadNight()
}

function pickTarget(ev: Event) {
  target.value = (ev.target as HTMLSelectElement).value
  selectedId.value = null
  syncQuery()
  reloadNight()
}

function pickChip(c: Chip) {
  chip.value = c
  syncQuery()
}

const nightList = computed(() => nightChoices(nights.value, night.value))
const targetList = computed(() => {
  const list = targets(runs.value)
  if (target.value && !list.includes(target.value)) list.push(target.value)
  return list
})
const shownRuns = computed(() =>
  target.value ? runs.value.filter((r) => r.object === target.value) : runs.value,
)
const notes = computed(() => runNotes(shownRuns.value))
const summary = computed(() => summarize(shownRuns.value, candidates.value))
const grid = computed(() => cards(candidates.value))
const counts = computed(() => chipCounts(grid.value))
const shown = computed(() => grid.value.filter((c) => inChip(c, chip.value)))
const moving = computed(() => movers(candidates.value))
const unknownMovers = computed(() => moving.value.filter((c) => c.class === 'unknown_mover').length)
const live = computed(() => statusText(status.value))

const selected = computed<DiscoveryCandidate | null>(() => {
  return candidates.value.find((c) => c.id === selectedId.value) ?? shown.value[0] ?? null
})

const pageState = computed(() => {
  if (loading.value && !runs.value.length) return 'loading'
  if (error.value && !runs.value.length && !nights.value.length) return 'error'
  if (!night.value) return 'none'
  return 'ready'
})

const detail = ref<DiscoveryDetail | null>(null)
const detailError = ref('')
const detailLoading = ref(false)
const detailReq = latestOnly()

watch(
  () => selected.value?.id,
  async (id) => {
    const current = detailReq.next()
    detail.value = null
    detailError.value = ''
    if (!id) return
    detailLoading.value = true
    try {
      const d = await getDiscoveryCandidate(id)
      if (!current()) return
      detail.value = d
    } catch (e) {
      if (!current()) return
      detailError.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (current()) detailLoading.value = false
    }
  },
  { immediate: true },
)

const note = ref('')
watch(
  () => selected.value?.id,
  () => (note.value = selected.value?.vet_note ?? ''),
  { immediate: true },
)

const detailRun = computed(() => {
  const s = selected.value
  if (!s) return null
  return runs.value.find((r) => r.id === s.run_id) ?? detail.value?.run ?? null
})
const checkedWords = computed(() => sourceWords(detailRun.value?.checked))
const checkedText = computed(() => sentence(checkedWords.value) || 'not measured')
const failedText = computed(() =>
  sentence(sourceWords(detailRun.value?.failed).filter((w) => !checkedWords.value.includes(w))),
)
const place = computed(() => (selected.value ? links(selected.value.ra, selected.value.dec) : null))

const panel = ref<HTMLElement | null>(null)

function select(c: DiscoveryCandidate) {
  selectedId.value = c.id
  syncQuery()
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 980px)').matches) {
    panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const vetBusy = ref(false)
const vetError = ref('')

function replace(next: DiscoveryCandidate) {
  const i = candidates.value.findIndex((c) => c.id === next.id)
  if (i >= 0) candidates.value[i] = { ...candidates.value[i]!, ...next }
  if (detail.value?.id === next.id) detail.value = { ...detail.value, ...next }
}

async function saveVetting(state: Vetting) {
  const s = selected.value
  if (!s) return
  vetBusy.value = true
  vetError.value = ''
  try {
    replace(await setDiscoveryVetting(s.id, state, note.value))
  } catch (e) {
    vetError.value = e instanceof Error ? e.message : String(e)
  } finally {
    vetBusy.value = false
  }
}

const vet = (state: Vetting) => saveVetting(nextVetting(selected.value?.vetting ?? '', state))

function saveNote() {
  const s = selected.value
  if (!s || note.value.trim() === (s.vet_note ?? '')) return
  saveVetting(s.vetting)
}
</script>

<template>
  <main class="page wide disc">
    <PageHead title="Discoveries">
      Each night is compared with the same field's other nights. Anything that changed and is not a
      known object waits here for you.
      <span v-if="live" class="block xsmall mt-1" role="status">{{ live }}</span>
    </PageHead>

    <section v-if="pageState === 'loading'" class="card" role="status">
      <p class="empty" style="padding: 0">Loading discoveries.</p>
    </section>

    <section v-else-if="pageState === 'error'" class="card" role="alert">
      <h2>Discoveries are not available</h2>
      <p class="empty" style="padding: 0">The stacker did not answer: {{ error }}</p>
      <div><button type="button" class="btn sm" @click="load">Try again</button></div>
    </section>

    <section v-else-if="pageState === 'none'" class="card" role="status">
      <h2>No nights compared yet</h2>
      <p class="empty" style="padding: 0">
        A night is compared with the target's other nights once the target has 3 nights of subs.
        Results show here after that.
      </p>
    </section>

    <template v-else>
      <div class="bar">
        <span class="pick">
          <label class="dim small" for="disc-night">Night</label>
          <select id="disc-night" :value="night" @change="pickNight">
            <option v-for="n in nightList" :key="n" :value="n">{{ nightLabel(n) }}</option>
          </select>
        </span>
        <span class="pick">
          <label class="dim small" for="disc-target">Target</label>
          <select id="disc-target" :value="target" @change="pickTarget">
            <option value="">All targets</option>
            <option v-for="t in targetList" :key="t" :value="t">{{ t }}</option>
          </select>
        </span>
        <button
          v-for="c in CHIPS"
          :key="c.key"
          type="button"
          class="chip"
          :aria-pressed="chip === c.key"
          @click="pickChip(c.key)"
        >
          {{ c.label }} <span class="n">{{ counts[c.key] }}</span>
        </button>
      </div>

      <p v-if="error" class="small bad" role="alert">The stacker did not answer: {{ error }}</p>

      <div v-if="notes.pending || notes.failed.length || notes.skipped.length" class="run-notes small">
        <p v-if="notes.pending" role="status">
          Still comparing this night: {{ notes.pending }}
          {{ notes.pending === 1 ? 'comparison is' : 'comparisons are' }} queued or running. The
          page updates when each one finishes.
        </p>
        <p v-for="f in notes.failed" :key="'f' + f.label">
          <span class="badge bad">Failed</span> {{ f.label }}: {{ f.reason }}
        </p>
        <p v-for="f in notes.skipped" :key="'s' + f.label" class="dim">
          Skipped {{ f.label }}: {{ f.reason }}
        </p>
      </div>

      <div class="summary">
        <div><span class="v">{{ summary.look }}</span><span class="l">new, needs a look</span></div>
        <div>
          <span class="v">{{ summary.knownVariables }}</span
          ><span class="l">known variables changed</span>
        </div>
        <div><span class="v">{{ summary.low }}</span><span class="l">low confidence (5–7σ)</span></div>
        <div>
          <span class="v">{{ summary.knownAsteroids }}</span><span class="l">known asteroids crossed</span>
        </div>
        <div><span class="v">{{ summary.unknownMovers }}</span><span class="l">unknown movers</span></div>
        <div>
          <span class="v">{{ summary.nightSubs }} vs {{ summary.refSubs }}</span
          ><span class="l">subs: night vs reference</span>
        </div>
        <div>
          <span class="v" :class="{ nm: summary.depth === null }">{{
            summary.depth === null ? 'not measured' : summary.depth.toFixed(1)
          }}</span
          ><span class="l">night depth (Gaia G, 5σ)</span>
        </div>
      </div>

      <div class="main">
        <div>
          <div v-if="shown.length" class="grid">
            <button
              v-for="c in shown"
              :key="c.id"
              type="button"
              class="cand"
              :class="edgeOf(c.class)"
              :aria-current="selected?.id === c.id ? 'true' : undefined"
              @click="select(c)"
            >
              <span class="trip">
                <template v-if="c.cutouts">
                  <img :src="c.cutouts.night" alt="night" loading="lazy" />
                  <img :src="c.cutouts.ref" alt="reference" loading="lazy" />
                  <img :src="c.cutouts.diff" alt="difference" loading="lazy" />
                </template>
                <span v-else class="nocut small dim">no cutouts</span>
              </span>
              <span class="meta">
                <span class="pill" :class="pillOf(c.class)">{{ classLabel(c.class) }}</span>
                <span class="snr">{{ c.snr.toFixed(1) }}σ</span>
              </span>
              <span class="line">
                <span>{{ deltaText(c) }}</span><span class="dim">{{ starText(c) }}</span>
              </span>
              <span class="line dim mono">
                <span>{{ raText(c.ra) }}</span><span>{{ decText(c.dec) }}</span>
              </span>
              <span class="line dim small">{{ matchText(c) }}</span>
              <span v-if="c.vetting" class="line dim small">Vetted: {{ vettingLabel(c.vetting) }}</span>
            </button>
          </div>
          <p v-else class="empty">
            {{
              grid.length
                ? 'Nothing in this group.'
                : notes.pending
                  ? 'Nothing found yet; comparisons are still running.'
                  : 'No changes found on this night.'
            }}
          </p>
        </div>

        <aside v-if="selected" ref="panel" class="detail" aria-label="Selected candidate">
          <div>
            <h2>Candidate at {{ positionText(selected) }}</h2>
            <p class="small dim sub">{{ selected.object }}, {{ selected.group }}</p>
          </div>
          <div class="big">
            <template v-if="selected.cutouts">
              <figure>
                <img :src="selected.cutouts.night" alt="Night image cutout" />
                <figcaption>Night</figcaption>
              </figure>
              <figure>
                <img :src="selected.cutouts.ref" alt="Reference cutout" />
                <figcaption>Reference</figcaption>
              </figure>
              <figure>
                <img :src="selected.cutouts.diff" alt="Difference cutout" />
                <figcaption>Difference</figcaption>
              </figure>
            </template>
            <p v-else class="small dim">No cutouts were saved for this candidate.</p>
          </div>
          <dl>
            <dt>Class</dt>
            <dd>
              <span class="pill" :class="pillOf(selected.class)">{{ classLabel(selected.class) }}</span>
            </dd>
            <dt>Signal</dt>
            <dd>{{ selected.snr.toFixed(1) }}σ in the difference</dd>
            <template v-if="selected.kind === 'mover'">
              <dt>Rate</dt>
              <dd>{{ rateText(selected.rate_arcsec_per_min) }}</dd>
              <dt>Offset</dt>
              <dd>{{ offsetText(selected.offset_arcsec) }} from the predicted position</dd>
              <dt>V mag</dt>
              <dd>{{ vmagText(selected.body_v) }}</dd>
            </template>
            <template v-else>
              <dt>Change</dt>
              <dd>{{ deltaText(selected, true) }}</dd>
              <dt>Star</dt>
              <dd>{{ starText(selected) }}</dd>
            </template>
            <dt>Per sub</dt>
            <dd>{{ presenceText(selected) }}</dd>
            <template v-if="selected.matches?.length">
              <dt>Matches</dt>
              <dd>
                <span v-for="(m, i) in matchLines(selected)" :key="i" class="block">{{ m }}</span>
              </dd>
            </template>
            <dt>Checked</dt>
            <dd>
              {{ checkedText }}
              <span v-if="failedText" class="block dim">Could not check: {{ failedText }}</span>
            </dd>
          </dl>
          <div class="lc">
            Brightness in each of the night's subs
            <p v-if="detailLoading" class="small" role="status">Loading the per-sub measurements.</p>
            <p v-else-if="detailError" class="small" role="alert">
              The per-sub measurements did not load: {{ detailError }}
            </p>
            <DiscoveryChart v-else-if="detail?.light?.length" :light="detail.light" />
            <p v-else class="small">Not measured for this candidate.</p>
          </div>
          <div class="vet" role="group" aria-label="Vet this candidate">
            <button
              v-for="b in VET_BUTTONS"
              :key="b.state"
              type="button"
              :class="{ primary: selected.vetting === b.state }"
              :aria-pressed="selected.vetting === b.state"
              :disabled="vetBusy"
              @click="vet(b.state)"
            >
              {{ b.label }}
            </button>
          </div>
          <p v-if="vetError" class="small bad" role="alert">That did not save: {{ vetError }}</p>
          <div class="note">
            <label class="small dim" for="disc-note">Note</label>
            <textarea
              id="disc-note"
              v-model="note"
              placeholder="Optional, for example the catalog name"
              @change="saveNote"
            />
          </div>
          <div v-if="place" class="small links">
            Open this spot in
            <a :href="place.aladin" target="_blank" rel="noopener noreferrer">Aladin</a> ·
            <a :href="place.vsx" target="_blank" rel="noopener noreferrer">VSX</a> ·
            <a :href="place.simbad" target="_blank" rel="noopener noreferrer">SIMBAD</a>
            <RouterLink :to="`/discoveries/report/${selected.id}`" class="btn sm report">Report</RouterLink>
          </div>
        </aside>
      </div>

      <section class="movers" aria-labelledby="disc-movers">
        <h3 id="disc-movers">Moving objects</h3>
        <p class="dim small intro">
          Linked across 5 or more subs.
          <template v-if="moving.length && !unknownMovers">
            Every track below matched a known asteroid.
          </template>
          Tracks that match nothing show at the top as unknown movers, with astrometry ready for the
          Minor Planet Center.
        </p>
        <div v-if="moving.length" class="tbl">
          <table>
            <thead>
              <tr>
                <th>Known as</th>
                <th class="num">V mag</th>
                <th class="num">Subs</th>
                <th class="num">Rate</th>
                <th class="num">Offset from prediction</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in moving"
                :key="m.id"
                :class="{ unknown: m.class === 'unknown_mover', on: selected?.id === m.id }"
                tabindex="0"
                @click="select(m)"
                @keydown.enter="select(m)"
              >
                <td>{{ moverName(m) }}</td>
                <td class="num">{{ vmagText(m.body_v) }}</td>
                <td class="num">{{ m.present_in }}</td>
                <td class="num">{{ rateText(m.rate_arcsec_per_min) }}</td>
                <td class="num">{{ offsetText(m.offset_arcsec) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty">No moving objects were linked on this night.</p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.disc {
  max-width: 80rem;
  gap: 0;
  --d-card: oklch(0.985 0 0);
  --known: oklch(0.55 0.13 250);
  --known-bg: oklch(0.95 0.03 250);
  --new: oklch(0.55 0.17 145);
  --new-bg: oklch(0.95 0.05 145);
  --low: oklch(0.55 0.02 285);
  --low-bg: oklch(0.95 0.003 285);
  --nova: oklch(0.55 0.18 340);
  --nova-bg: oklch(0.95 0.04 340);
  --d-sel: oklch(0.62 0.15 250);
}
.dark .disc {
  --d-card: oklch(0.18 0.005 285.8);
  --known: oklch(0.75 0.12 250);
  --known-bg: oklch(0.3 0.06 250);
  --new: oklch(0.8 0.15 145);
  --new-bg: oklch(0.3 0.07 145);
  --low: oklch(0.75 0.02 285);
  --low-bg: oklch(0.28 0.01 285);
  --nova: oklch(0.8 0.14 340);
  --nova-bg: oklch(0.3 0.08 340);
  --d-sel: oklch(0.7 0.14 250);
}
.dim {
  color: var(--muted-foreground);
}
.small {
  font-size: 12px;
}
.mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.bad {
  color: var(--bad);
}
.block {
  display: block;
}
.bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-block: 14px;
}
select,
.chip,
textarea {
  font: inherit;
  color: var(--foreground);
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  max-width: 100%;
}
.pick {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}
.chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.chip[aria-pressed='true'] {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}
.chip .n {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}
.run-notes {
  margin-bottom: 14px;
  display: grid;
  gap: 4px;
}
.run-notes p {
  margin: 0;
}
.summary {
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--d-card);
}
.summary div {
  display: flex;
  flex-direction: column;
}
.summary .v {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.summary .v.nm {
  font-size: 14px;
  font-weight: 500;
  color: var(--muted-foreground);
  line-height: 30px;
}
.summary .l {
  font-size: 12px;
  color: var(--muted-foreground);
}
.main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 20px;
  margin-top: 18px;
  align-items: start;
}
@media (max-width: 980px) {
  .main {
    grid-template-columns: minmax(0, 1fr);
  }
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
  gap: 12px;
}
.cand {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--d-card);
  border-left-width: 4px;
  min-width: 0;
}
.cand.known {
  border-left-color: var(--known);
}
.cand.low {
  border-left-color: var(--low);
}
.cand.new {
  border-left-color: var(--new);
}
.cand[aria-current='true'] {
  outline: 2px solid var(--d-sel);
  outline-offset: 1px;
}
.cand:focus-visible {
  outline: 2px solid var(--d-sel);
}
.trip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.trip img,
.big img {
  width: 100%;
  aspect-ratio: 1;
  image-rendering: pixelated;
  display: block;
  background: var(--muted);
}
.trip img {
  border-radius: 4px;
}
.nocut {
  grid-column: 1 / -1;
  aspect-ratio: 3 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border);
  border-radius: 4px;
}
.meta,
.line {
  display: flex;
  justify-content: space-between;
  gap: 0 8px;
  align-items: center;
}
.line {
  flex-wrap: wrap;
}
.pill {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 8px;
  border-radius: 99px;
  border: 0;
}
.pill.known {
  color: var(--known);
  background: var(--known-bg);
}
.pill.low {
  color: var(--low);
  background: var(--low-bg);
}
.pill.new {
  color: var(--new);
  background: var(--new-bg);
}
.pill.nova {
  color: var(--nova);
  background: var(--nova-bg);
}
.snr {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.detail {
  position: sticky;
  top: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--d-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
@media (max-width: 980px) {
  .detail {
    position: static;
  }
}
.detail h2 {
  font-size: 16px;
  margin: 0;
}
.detail .sub {
  margin: 2px 0 0;
}
.big {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.big p {
  grid-column: 1 / -1;
  margin: 0;
}
.big figure {
  margin: 0;
}
.big img {
  border-radius: 6px;
}
.big figcaption {
  font-size: 11px;
  color: var(--muted-foreground);
  text-align: center;
  margin-top: 3px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 14px;
  margin: 0;
}
dt {
  color: var(--muted-foreground);
}
dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.lc {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  color: var(--muted-foreground);
}
.lc p {
  margin: 4px 0 0;
}
.vet {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.vet button {
  font: inherit;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
}
.vet button.primary {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}
.vet button:focus-visible,
.chip:focus-visible {
  outline: 2px solid var(--d-sel);
}
.note {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
textarea {
  width: 100%;
  min-height: 56px;
  resize: vertical;
}
.detail > p {
  margin: 0;
}
.links a {
  color: var(--known);
}
.links a:hover {
  text-decoration: underline;
}
.links .report {
  margin-left: 8px;
  color: var(--foreground);
}
.links .report:hover {
  text-decoration: none;
}
.movers {
  margin-top: 28px;
}
.movers h3 {
  font-size: 16px;
  margin: 0 0 8px;
}
.movers .intro {
  margin: 0 0 8px;
}
.tbl {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}
table {
  border-collapse: collapse;
  width: 100%;
  min-width: 520px;
}
th,
td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
th.num,
td.num {
  text-align: right;
}
th {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}
tbody tr {
  cursor: pointer;
}
tbody tr:hover,
tbody tr.on {
  background: oklch(from var(--muted) l c h / 0.6);
}
tbody tr.unknown td:first-child {
  color: var(--new);
  font-weight: 600;
}
tr:last-child td {
  border-bottom: 0;
}
.empty {
  margin: 0;
  padding: 1rem 0;
  color: var(--muted-foreground);
  font-size: 0.875rem;
}
</style>
