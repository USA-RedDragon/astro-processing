<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHead from '../components/PageHead.vue'
import {
  getDiscoverySource,
  getDiscoverySources,
  getDiscoveryStatus,
  getRecentRuns,
  setSourceVetting,
  type DiscoveryRun,
  type DiscoverySource,
  type DiscoveryStatus,
  type SourceCounts,
  type SourceView,
  type Vetting,
} from '../api/discoveries'
import {
  VET_BUTTONS,
  classLabel,
  deltaText,
  isNight,
  links,
  moverName,
  nextVetting,
  offsetText,
  pillOf,
  positionText,
  rateText,
  sentence,
  sourceWords,
  starText,
  statusText,
  vettingLabel,
  vmagText,
} from '../discoveries'
import {
  RANGES,
  VIEWS,
  catalogText,
  changeText,
  countText,
  depthText,
  groupLabel,
  groupsText,
  isRange,
  isView,
  nightRows,
  nightsLine,
  runResult,
  shortNight,
  sinceOf,
  sparkOf,
  starLine,
  subsText,
  subsVsRef,
  targetsOf,
  type Range,
} from '../discoveryInbox'
import { onChange } from '@/lib/events'
import { latestOnly } from '../latest'

const PAGE = 200
const RECENT_ROWS = 30

const route = useRoute()
const router = useRouter()
const qs = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')

const night = ref(isNight(qs('night')) ? qs('night') : '')
const target = ref(qs('target'))
const range = ref<Range>(isRange(qs('range')) ? (qs('range') as Range) : '30')
const search = ref(qs('q'))
const view = ref<SourceView | ''>(
  isView(qs('show'))
    ? (qs('show') as SourceView)
    : qs('show') === 'all' || night.value
      ? ''
      : 'look',
)
const selectedId = ref<number | null>(Number(qs('source')) || null)
const limit = ref(PAGE)

const sources = ref<DiscoverySource[]>([])
const total = ref(0)
const counts = ref<SourceCounts>({
  look: 0,
  known: 0,
  movers: 0,
  new_movers: 0,
  low: 0,
  vetted: 0,
  all: 0,
})
const runs = ref<DiscoveryRun[]>([])
const status = ref<DiscoveryStatus | null>(null)
const error = ref('')
const loading = ref(true)
const loaded = ref(false)
const listReq = latestOnly()

function syncQuery() {
  const q: Record<string, string> = {}
  if (night.value) q.night = night.value
  if (target.value) q.target = target.value
  if (range.value !== '30') q.range = range.value
  if (search.value.trim()) q.q = search.value.trim()
  const defaultView = night.value ? '' : 'look'
  if (view.value !== defaultView) q.show = view.value || 'all'
  if (selectedId.value) q.source = String(selectedId.value)
  router.replace({ query: q })
}

async function loadStatus() {
  try {
    status.value = await getDiscoveryStatus()
  } catch {
    status.value = null
  }
}

async function loadRuns() {
  try {
    const since = night.value ? undefined : sinceOf(range.value)
    runs.value = (await getRecentRuns(since === 'all' ? undefined : since)) ?? []
  } catch {
    runs.value = []
  }
}

async function loadList() {
  const current = listReq.next()
  loading.value = true
  try {
    const page = await getDiscoverySources({
      object: target.value || undefined,
      since: night.value ? undefined : sinceOf(range.value),
      night: night.value || undefined,
      q: search.value.trim() || undefined,
      view: view.value,
      limit: limit.value,
    })
    if (!current()) return
    sources.value = page.sources ?? []
    total.value = page.total
    counts.value = page.counts
    error.value = ''
    loaded.value = true
  } catch (e) {
    if (!current()) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (current()) loading.value = false
  }
}

function load() {
  return Promise.all([loadList(), loadRuns(), loadStatus()])
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
let searchTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  load()
  stopEvents = onChange(['discovery'], load)
})
onUnmounted(() => {
  stopEvents?.()
  if (statusTimer) clearInterval(statusTimer)
  if (searchTimer) clearTimeout(searchTimer)
})

function refilter(all = false) {
  limit.value = PAGE
  selectedId.value = null
  syncQuery()
  if (all) load()
  else loadList()
}

function pickTarget(ev: Event) {
  target.value = (ev.target as HTMLSelectElement).value
  refilter()
}

function pickRange(ev: Event) {
  range.value = (ev.target as HTMLSelectElement).value as Range
  night.value = ''
  refilter(true)
}

function typed() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => refilter(), 350)
}

function pickView(v: SourceView) {
  view.value = view.value === v ? '' : v
  refilter()
}

function clearNight() {
  night.value = ''
  if (!view.value) view.value = 'look'
  refilter(true)
}

function openRun(r: DiscoveryRun) {
  night.value = r.night
  target.value = r.object
  view.value = ''
  refilter()
  if (typeof window !== 'undefined') window.scrollTo?.({ top: 0, behavior: 'smooth' })
}

function more() {
  limit.value += PAGE
  loadList()
}

const targetList = computed(() => targetsOf(runs.value, target.value))
const recent = computed(() =>
  (target.value ? runs.value.filter((r) => r.object === target.value) : runs.value).slice(
    0,
    RECENT_ROWS,
  ),
)
const live = computed(() => statusText(status.value))
const pending = computed(
  () => runs.value.filter((r) => r.state === 'queued' || r.state === 'running').length,
)
const viewLabel = computed(() => VIEWS.find((v) => v.key === view.value)?.label ?? 'Everything')
const cards = computed(() =>
  sources.value.map((s) => ({
    s,
    spark: sparkOf(s),
    change: changeText(s),
    star: starLine(s),
    nights: nightsLine(s),
  })),
)

const fetched = ref<DiscoverySource | null>(null)
const selected = computed<DiscoverySource | null>(() => {
  const id = selectedId.value
  if (!id) return sources.value[0] ?? null
  return sources.value.find((s) => s.id === id) ?? (fetched.value?.id === id ? fetched.value : null)
})

const detailReq = latestOnly()
watch(
  [selectedId, sources],
  async ([id]) => {
    if (!id || sources.value.some((s) => s.id === id) || fetched.value?.id === id) return
    const current = detailReq.next()
    try {
      const s = await getDiscoverySource(id)
      if (current()) fetched.value = s
    } catch {
      if (current()) selectedId.value = null
    }
  },
  { immediate: true },
)

const rows = computed(() => (selected.value ? nightRows(selected.value) : []))
const place = computed(() => (selected.value ? links(selected.value.ra, selected.value.dec) : null))
const failedText = computed(() => {
  const s = selected.value
  if (!s) return ''
  const ok = sourceWords(s.checked)
  return sentence(sourceWords(s.failed).filter((w) => !ok.includes(w)))
})

const note = ref('')
watch(
  () => [selected.value?.id, selected.value?.vet_note],
  () => (note.value = selected.value?.vet_note ?? ''),
  { immediate: true },
)

const panel = ref<HTMLElement | null>(null)

function select(s: DiscoverySource) {
  selectedId.value = s.id
  syncQuery()
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 980px)').matches) {
    panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const vetBusy = ref(false)
const vetError = ref('')

async function saveVetting(state: Vetting) {
  const s = selected.value
  if (!s) return
  vetBusy.value = true
  vetError.value = ''
  try {
    const next = await setSourceVetting(s.id, state, note.value)
    fetched.value = next
    selectedId.value = next.id
    const i = sources.value.findIndex((x) => x.id === next.id)
    if (i >= 0) sources.value[i] = next
    syncQuery()
    loadList()
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

const emptyText = computed(() => {
  if (search.value.trim()) return 'Nothing matches that search.'
  if (counts.value.all === 0) {
    return night.value
      ? `Nothing changed on ${shortNight(night.value)}.`
      : 'Nothing changed on these nights.'
  }
  return view.value === 'look'
    ? 'Nothing needs a look. Pick another group above.'
    : 'Nothing in this group.'
})

const pageState = computed(() => {
  if (!loaded.value && loading.value) return 'loading'
  if (!loaded.value && error.value) return 'error'
  return 'ready'
})
</script>

<template>
  <main class="page wide disc">
    <PageHead title="Discoveries">
      Every spot that changed, across all your nights. The same spot seen on several nights is one
      entry with its history.
      <span v-if="live" class="block xsmall mt-1" role="status">{{ live }}</span>
    </PageHead>

    <div class="bar">
      <label class="dim small" for="disc-target">Target</label>
      <select id="disc-target" :value="target" @change="pickTarget">
        <option value="">All targets</option>
        <option v-for="t in targetList" :key="t" :value="t">{{ t }}</option>
      </select>
      <label class="dim small" for="disc-range">When</label>
      <select id="disc-range" :value="night ? '' : range" @change="pickRange">
        <option v-if="night" value="" disabled>Night of {{ shortNight(night) }}</option>
        <option v-for="r in RANGES" :key="r.key" :value="r.key">{{ r.label }}</option>
      </select>
      <input
        id="disc-find"
        v-model="search"
        type="search"
        placeholder="Search a name or position"
        aria-label="Search a name or position"
        @input="typed"
      />
    </div>
    <div class="bar">
      <button
        v-for="v in VIEWS"
        :key="v.key"
        type="button"
        class="chip"
        :aria-pressed="view === v.key"
        @click="pickView(v.key)"
      >
        {{ v.label }} <span class="n">{{ countText(v.key, counts) }}</span>
      </button>
      <button v-if="night" type="button" class="chip tag" @click="clearNight">
        Night of {{ shortNight(night) }} <span aria-hidden="true">×</span
        ><span class="sr-only">, show all nights</span>
      </button>
    </div>

    <section v-if="pageState === 'loading'" class="card" role="status">
      <p class="empty" style="padding: 0">Loading discoveries.</p>
    </section>

    <section v-else-if="pageState === 'error'" class="card" role="alert">
      <h2>Discoveries are not available</h2>
      <p class="empty" style="padding: 0">The stacker did not answer: {{ error }}</p>
      <div><button type="button" class="btn sm" @click="load">Try again</button></div>
    </section>

    <template v-else>
      <p v-if="error" class="small bad" role="alert">The stacker did not answer: {{ error }}</p>
      <p v-if="pending" class="small dim pending" role="status">
        Still comparing: {{ pending }} {{ pending === 1 ? 'comparison is' : 'comparisons are' }}
        queued or running. The page updates when each one finishes.
      </p>

      <div class="ibox">
        <div class="list">
          <div class="sec">
            {{ viewLabel }}<template v-if="night"> · {{ shortNight(night) }}</template> ·
            {{
              view === 'look' || view === ''
                ? 'needs a look first, then the newest change'
                : 'newest change first'
            }}
          </div>
          <button
            v-for="c in cards"
            :key="c.s.id"
            type="button"
            class="src"
            :class="pillOf(c.s.class)"
            :aria-current="selected?.id === c.s.id ? 'true' : undefined"
            @click="select(c.s)"
          >
            <span class="trip">
              <template v-if="c.s.best.cutouts">
                <img :src="c.s.best.cutouts.night" alt="night" loading="lazy" />
                <img :src="c.s.best.cutouts.ref" alt="reference" loading="lazy" />
                <img :src="c.s.best.cutouts.diff" alt="difference" loading="lazy" />
              </template>
              <span v-else class="nocut small dim">no cutouts</span>
            </span>
            <span class="mid">
              <span class="meta">
                <span class="pill" :class="pillOf(c.s.class)">{{ classLabel(c.s.class) }}</span>
                <span v-if="c.s.vetting" class="small dim"
                  >Vetted: {{ vettingLabel(c.s.vetting) }}</span
                >
              </span>
              <span class="t">
                <b>{{ c.s.object }}</b> <span class="mono dim">{{ positionText(c.s) }}</span>
              </span>
              <span>{{ c.change }}</span>
              <span class="dim small">{{ c.star }}</span>
              <span class="dim small">{{ c.nights }}</span>
            </span>
            <span class="spark">
              <svg
                v-if="c.spark"
                viewBox="0 0 260 90"
                role="img"
                :aria-label="`Change on each night, brighter up: ${c.change}`"
              >
                <line x1="10" y1="45" x2="250" y2="45" class="ax" stroke-dasharray="3 3" />
                <circle
                  v-for="(p, i) in c.spark.points"
                  :key="i"
                  :cx="p.x"
                  :cy="p.y"
                  r="4.5"
                  :fill="p.color"
                >
                  <title>{{ p.title }}</title>
                </circle>
                <text
                  v-for="l in c.spark.labels"
                  :key="l.text"
                  :x="l.x"
                  y="86"
                  text-anchor="middle"
                  class="tl"
                >
                  {{ l.text }}
                </text>
                <text x="12" y="12" class="tl">brighter</text>
                <text x="12" y="78" class="tl">fainter</text>
              </svg>
              <span v-else-if="c.s.kind === 'mover'" class="small dim">
                {{ c.s.best.present_in }} subs · V {{ vmagText(c.s.best.body_v) }}
              </span>
              <span v-else class="small dim">Change size not measured</span>
            </span>
          </button>
          <p v-if="!sources.length" class="empty">{{ loading ? 'Loading.' : emptyText }}</p>
          <div v-if="total > sources.length" class="more">
            <span class="small dim"
              >Showing {{ sources.length }} of {{ total.toLocaleString('en-US') }}</span
            >
            <button type="button" class="btn sm" :disabled="loading" @click="more">
              Show more
            </button>
          </div>
        </div>

        <aside v-if="selected" ref="panel" class="detail" aria-label="Selected source">
          <div class="meta">
            <span class="pill" :class="pillOf(selected.class)">{{
              classLabel(selected.class)
            }}</span>
            <RouterLink :to="`/discoveries/report/${selected.best.id}`" class="small report"
              >Report</RouterLink
            >
          </div>
          <h2>{{ selected.object }} · {{ positionText(selected) }}</h2>
          <dl>
            <template v-if="selected.kind === 'mover'">
              <dt>Known as</dt>
              <dd>
                {{
                  selected.class === 'unknown_mover' ? 'Nothing known' : moverName(selected.best)
                }}
              </dd>
              <dt>Rate</dt>
              <dd>{{ rateText(selected.best.rate_arcsec_per_min) }}</dd>
              <dt>Offset</dt>
              <dd>{{ offsetText(selected.best.offset_arcsec) }} from the predicted position</dd>
              <dt>V mag</dt>
              <dd>{{ vmagText(selected.best.body_v) }}</dd>
            </template>
            <template v-else>
              <dt>Star</dt>
              <dd>{{ starText(selected.best) }}</dd>
            </template>
            <dt>Catalogs</dt>
            <dd>
              {{ catalogText(selected) }}
              <span v-if="failedText" class="block dim">Could not check: {{ failedText }}</span>
            </dd>
            <dt>Seen</dt>
            <dd>
              {{ selected.nights_seen }} of the {{ selected.nights_compared }}
              {{ selected.nights_compared === 1 ? 'night' : 'nights' }} this field was compared
              since
              {{ shortNight(selected.first_seen) }}
            </dd>
            <template v-if="selected.vetting">
              <dt>Vetted</dt>
              <dd>{{ vettingLabel(selected.vetting) }}</dd>
            </template>
          </dl>
          <h3 class="sub">Night by night</h3>
          <div class="nights">
            <div v-for="r in rows" :key="r.night" class="nrow">
              <div class="nl">
                <b>{{ shortNight(r.night) }}</b>
                <span class="dim small"
                  >{{ groupsText(r.groups) }} · {{ subsText(r.best)
                  }}<template v-if="r.lowOnly"> · low confidence</template></span
                >
                <span>{{
                  selected.kind === 'mover' ? groupLabel(r.best.group) : deltaText(r.best)
                }}</span>
              </div>
              <div class="trip sm">
                <template v-if="r.best.cutouts">
                  <img
                    :src="r.best.cutouts.night"
                    :alt="`${shortNight(r.night)} night`"
                    loading="lazy"
                  />
                  <img
                    :src="r.best.cutouts.ref"
                    :alt="`${shortNight(r.night)} reference`"
                    loading="lazy"
                  />
                  <img
                    :src="r.best.cutouts.diff"
                    :alt="`${shortNight(r.night)} difference`"
                    loading="lazy"
                  />
                </template>
                <span v-else class="nocut small dim">no cutouts</span>
              </div>
            </div>
          </div>
          <div class="vet" role="group" aria-label="Vet this source">
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
          </div>
        </aside>
      </div>

      <section class="recent" aria-labelledby="disc-recent">
        <h3 id="disc-recent">Recent nights</h3>
        <p class="dim small intro">
          Each comparison, newest first. Open one to see everything it found, including known
          objects.
        </p>
        <div v-if="recent.length" class="tbl">
          <table>
            <thead>
              <tr>
                <th>Night</th>
                <th>Target</th>
                <th class="num">Subs vs reference</th>
                <th class="num">Depth (G, 5σ)</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in recent"
                :key="r.id"
                tabindex="0"
                :class="{ on: night === r.night && target === r.object }"
                @click="openRun(r)"
                @keydown.enter="openRun(r)"
              >
                <td>{{ shortNight(r.night) }}</td>
                <td>
                  {{ r.object }} <span class="dim small">{{ groupLabel(r.group) }}</span>
                </td>
                <td class="num">{{ subsVsRef(r) }}</td>
                <td class="num" :class="{ dim: depthText(r) === 'not measured' }">
                  {{ depthText(r) }}
                </td>
                <td :class="{ dim: r.state !== 'done' }">{{ runResult(r) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty">No nights compared in this time.</p>
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
  --nova: oklch(0.55 0.16 25);
  --nova-bg: oklch(0.95 0.04 25);
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
  --nova: oklch(0.78 0.13 25);
  --nova-bg: oklch(0.32 0.07 25);
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
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 14px;
}
.bar + .bar {
  margin-top: 10px;
}
select,
input,
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
input {
  min-width: 0;
  flex: 1 1 200px;
  max-width: 320px;
}
.chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
}
.chip[aria-pressed='true'] {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}
.chip.tag {
  border-style: dashed;
}
.chip .n {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}
.chip:focus-visible,
.vet button:focus-visible,
.src:focus-visible,
tbody tr:focus-visible {
  outline: 2px solid var(--d-sel);
}
.ibox {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 20px;
  margin-top: 16px;
  align-items: start;
}
@media (max-width: 980px) {
  .ibox {
    grid-template-columns: minmax(0, 1fr);
  }
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.sec {
  font-size: 12px;
  color: var(--muted-foreground);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.src {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) 260px;
  gap: 14px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 10px;
  background: var(--d-card);
  min-width: 0;
}
.src.new {
  border-left-color: var(--new);
}
.src.nova {
  border-left-color: var(--nova);
}
.src.known {
  border-left-color: var(--known);
}
.src.low {
  border-left-color: var(--low);
}
.src[aria-current='true'] {
  outline: 2px solid var(--d-sel);
  outline-offset: 1px;
}
@media (max-width: 1200px) {
  .src {
    grid-template-columns: 160px minmax(0, 1fr);
  }
  .src .spark {
    grid-column: 1 / -1;
  }
}
@media (max-width: 760px) {
  .src {
    grid-template-columns: minmax(0, 1fr);
  }
}
.mid {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.mid .t {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: baseline;
}
.spark svg {
  width: 100%;
  max-width: 360px;
  height: auto;
  display: block;
}
.spark .ax {
  stroke: var(--muted-foreground);
  stroke-opacity: 0.5;
}
.spark .tl {
  font-size: 10px;
  fill: var(--muted-foreground);
}
.trip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.trip.sm {
  gap: 3px;
}
.trip img {
  width: 100%;
  aspect-ratio: 1;
  image-rendering: pixelated;
  display: block;
  background: var(--muted);
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
.meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.pill {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 8px;
  border-radius: 99px;
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
.pending {
  margin: 12px 0 0;
}
.more {
  display: flex;
  gap: 12px;
  align-items: center;
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
  font-size: 15px;
  margin: 0;
  overflow-wrap: anywhere;
}
.detail .meta a {
  color: var(--known);
}
h3.sub {
  font-size: 14px;
  margin: 4px 0 0;
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
.nights {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.nrow {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}
.nl {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 13px;
  min-width: 0;
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
  cursor: pointer;
}
.vet button.primary {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
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
.recent {
  margin-top: 28px;
}
.recent h3 {
  font-size: 16px;
  margin: 0 0 8px;
}
.recent .intro {
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
