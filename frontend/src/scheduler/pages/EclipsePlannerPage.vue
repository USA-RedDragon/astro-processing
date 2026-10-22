<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHead from '../components/PageHead.vue'
import {
  cancelEclipseRequest,
  getEclipses,
  requestDip,
  requestEclipse,
  type DipWindow,
  type EclipsePlan,
  type PlannedEclipse,
} from '../api/binaries'
import {
  ECLIPSE_VIEWS,
  durationText,
  eclipseKey,
  groupByDay,
  inPlanView,
  planRows,
  rangeText,
  requestView,
  heldText,
  uncertaintyText,
  type EclipseView,
} from '../binaries'
import { latestOnly } from '../latest'
import '../binaries.css'

const DAYS = 30

const route = useRoute()
const router = useRouter()
const qs = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')

const star = ref(Number(qs('star')) || 0)
const view = ref<EclipseView>(star.value ? 'all' : 'flag')
const showAll = ref(qs('all') === '1')

const data = ref<EclipsePlan | null>(null)
const error = ref('')
const loading = ref(true)
const req = latestOnly()

async function load() {
  const current = req.next()
  loading.value = true
  try {
    const r = await getEclipses(DAYS, showAll.value)
    if (!current()) return
    data.value = r
    error.value = ''
  } catch (e) {
    if (!current()) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (current()) loading.value = false
  }
}

onMounted(load)

function syncQuery() {
  const q: Record<string, string> = {}
  if (star.value) q.star = String(star.value)
  if (showAll.value) q.all = '1'
  router.replace({ query: q })
}

function pickStar(ev: Event) {
  star.value = Number((ev.target as HTMLSelectElement).value) || 0
  syncQuery()
}

function toggleAll(ev: Event) {
  showAll.value = (ev.target as HTMLInputElement).checked
  syncQuery()
  load()
}

const eclipses = computed(() => data.value?.eclipses ?? [])
const dips = computed(() => data.value?.dips ?? [])
const allRows = computed(() => planRows(eclipses.value, dips.value))
const starList = computed(() => {
  const seen = new Map<number, string>()
  for (const e of [...eclipses.value, ...dips.value]) {
    if (!seen.has(e.source_id)) seen.set(e.source_id, e.field ? `${e.name} · ${e.field}` : e.name)
  }
  return [...seen].map(([id, label]) => ({ id, label }))
})
const starMissing = computed(
  () => star.value !== 0 && !starList.value.some((s) => s.id === star.value),
)
const base = computed(() =>
  star.value ? allRows.value.filter((r) => r.source_id === star.value) : allRows.value,
)
const counts = computed(() =>
  Object.fromEntries(
    ECLIPSE_VIEWS.map((v) => [v.key, base.value.filter((r) => inPlanView(r, v.key)).length]),
  ),
)
const days = computed(() => groupByDay(base.value.filter((r) => inPlanView(r, view.value))))

const lede = computed(() => {
  const d = data.value
  if (!d) return ''
  const range = rangeText(d.from, d.to)
  const what = dips.value.length
    ? 'Predicted eclipses of your confirmed binaries and dip windows of your dippers'
    : 'Predicted eclipses of your confirmed binaries'
  return [range ? `${what} from ${range}.` : '', d.zone_note].filter(Boolean).join(' ')
})

const hiddenText = computed(() => {
  const n = data.value?.hidden ?? 0
  if (showAll.value || !n) return ''
  return `Hiding ${n} ${n === 1 ? 'eclipse' : 'eclipses'} the site cannot see.`
})

const emptyText = computed(() => {
  if (starMissing.value) return `No eclipses of this star in the next ${DAYS} days.`
  return `No eclipses in this group in the next ${DAYS} days.`
})

function starLine(e: PlannedEclipse): string {
  const every = `every ${e.period_text} days` + (e.alt_period_text ? ` ${e.alt_period_text}` : '')
  return [e.field, e.magnitude, every].filter(Boolean).join(' · ')
}

const busy = reactive<Record<string, boolean>>({})
const rowError = reactive<Record<string, string>>({})

async function act(k: string, run: () => Promise<void>) {
  busy[k] = true
  rowError[k] = ''
  try {
    await run()
  } catch (err) {
    rowError[k] = err instanceof Error ? err.message : String(err)
  } finally {
    busy[k] = false
  }
}

const ask = (e: PlannedEclipse) =>
  act(eclipseKey(e), async () => {
    e.request = await requestEclipse(e)
  })

const askDip = (d: DipWindow, k: string) =>
  act(k, async () => {
    d.request = await requestDip(d.source_id, d.mid)
  })

const cancel = (e: PlannedEclipse | DipWindow, k: string) =>
  act(k, async () => {
    if (!e.request) return
    await cancelEclipseRequest(e.request.id)
    e.request = null
  })

function dipStarLine(d: DipWindow): string {
  return [String(d.source_id), d.field, d.magnitude].filter(Boolean).join(' · ')
}

const pageState = computed(() => {
  if (!data.value && loading.value) return 'loading'
  if (!data.value && error.value) return 'error'
  return 'ready'
})
</script>

<template>
  <main class="page wide bin planner">
    <PageHead context="Discover" title="Eclipse planner">
      {{ lede }}
      <span v-if="data && !data.site_known" class="block xsmall mt-1" role="note"
        >The site location is not known yet, so the planner cannot tell which eclipses the site can
        see.</span
      >
    </PageHead>

    <section v-if="pageState === 'loading'" class="card state-card" role="status">
      <p class="empty" style="padding: 0">Loading the next eclipses.</p>
    </section>

    <section v-else-if="pageState === 'error'" class="card state-card" role="alert">
      <h2>The eclipse planner is not available</h2>
      <p class="empty" style="padding: 0">The stacker did not answer: {{ error }}</p>
      <div><button type="button" class="btn sm" @click="load">Try again</button></div>
    </section>

    <template v-else>
      <p v-if="error" class="small bad" role="alert">The stacker did not answer: {{ error }}</p>
      <div class="bar">
        <button
          v-for="v in ECLIPSE_VIEWS"
          :key="v.key"
          type="button"
          class="chip"
          :aria-pressed="view === v.key"
          @click="view = v.key"
        >
          {{ v.label }} <span class="n">{{ counts[v.key] }}</span>
        </button>
      </div>
      <div class="bar">
        <label class="dim small" for="ecl-star">Star</label>
        <select id="ecl-star" :value="star" @change="pickStar">
          <option :value="0">All stars</option>
          <option v-if="starMissing" :value="star">This star (no eclipses listed)</option>
          <option v-for="s in starList" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
        <label class="toggle small" for="ecl-all">
          <input
            id="ecl-all"
            type="checkbox"
            :checked="showAll"
            :disabled="loading"
            @change="toggleAll"
          />
          Show eclipses the site cannot see
        </label>
        <span v-if="hiddenText" class="dim small">{{ hiddenText }}</span>
      </div>
      <div class="legend">
        <span><i class="flag" />Settles a flag from the checks</span>
        <span><i class="period" />Adds a timed eclipse to check the period</span>
        <span><i class="own" />Adds your own eclipse to the VSX package</span>
        <span><i class="dip" />A window when a dipper can dim</span>
      </div>

      <section v-for="d in days" :key="d.label" class="day" :aria-label="d.label">
        <h3>{{ d.label }}</h3>
        <template v-for="r in d.eclipses" :key="r.key">
          <article
            v-if="r.kind === 'eclipse'"
            class="ecl"
            :class="[r.e.purpose, { unseen: !r.e.observable }]"
          >
            <div class="tm">
              <b>{{ r.e.time_label }}</b> <span class="small dim">{{ r.e.zone }}</span
              ><span class="block small dim num">{{ uncertaintyText(r.e.err_minutes) }}</span>
            </div>
            <div class="who">
              <b>{{ r.e.name }}</b>
              <span class="small dim">{{ starLine(r.e) }}</span>
              <span class="meta">
                <span class="pill" :class="r.e.kind === 'primary' ? 'known' : 'low'">{{
                  r.e.kind_label
                }}</span>
                <span class="small dim"
                  ><template v-if="durationText(r.e.duration_hours)">{{
                    durationText(r.e.duration_hours)
                  }}</template
                  ><template v-else>lasts <i>not measured yet</i></template></span
                >
              </span>
              <span class="small" :class="r.e.observable ? 'dim' : 'warn'">{{
                r.e.observable_note
              }}</span>
            </div>
            <div class="why">{{ r.e.why }}</div>
            <div class="go">
              <template v-if="requestView(r.e.request).label">
                <span class="badge" :class="requestView(r.e.request).tone">{{
                  requestView(r.e.request).label
                }}</span>
                <span v-if="requestView(r.e.request).by" class="badge info">{{
                  requestView(r.e.request).by
                }}</span>
                <span v-if="requestView(r.e.request).note" class="xsmall dim">{{
                  requestView(r.e.request).note
                }}</span>
              </template>
              <span v-if="heldText(r.e)" class="xsmall warn" role="note">{{ heldText(r.e) }}</span>
              <button
                v-if="requestView(r.e.request).canRequest && !heldText(r.e)"
                type="button"
                class="btn sm"
                :disabled="busy[r.key] || !r.e.observable"
                :title="r.e.observable ? undefined : r.e.observable_note"
                @click="ask(r.e)"
              >
                {{ r.e.request ? 'Request again' : 'Request imaging' }}
              </button>
              <button
                v-if="requestView(r.e.request).canCancel"
                type="button"
                class="btn sm ghost"
                :disabled="busy[r.key]"
                @click="cancel(r.e, r.key)"
              >
                Cancel request
              </button>
              <span v-if="rowError[r.key]" class="xsmall bad" role="alert"
                >That did not go through: {{ rowError[r.key] }}</span
              >
            </div>
          </article>
          <article v-else class="ecl dip" :class="{ unseen: !r.d.observable }">
            <div class="tm">
              <b>{{ r.d.window_text }}</b> <span class="small dim">{{ r.d.zone }}</span
              ><span class="block small dim num">middle {{ r.d.mid_text }}</span>
            </div>
            <div class="who">
              <b>{{ r.d.name }}</b>
              <span class="small dim">{{ dipStarLine(r.d) }}</span>
              <span class="meta">
                <span class="pill dip">Dip window</span>
                <span class="small dim">{{ r.d.dark_note }}</span>
              </span>
            </div>
            <div class="why">{{ r.d.why }}</div>
            <div class="go">
              <template v-if="requestView(r.d.request).label">
                <span class="badge" :class="requestView(r.d.request).tone">{{
                  requestView(r.d.request).label
                }}</span>
                <span v-if="requestView(r.d.request).by" class="badge info">{{
                  requestView(r.d.request).by
                }}</span>
                <span v-if="requestView(r.d.request).note" class="xsmall dim">{{
                  requestView(r.d.request).note
                }}</span>
              </template>
              <span v-if="r.d.every_window" class="badge info">Every window</span>
              <span v-if="!r.d.observable" class="xsmall dim">{{ r.d.observable_note }}</span>
              <button
                v-else-if="requestView(r.d.request).canRequest && !r.d.over"
                type="button"
                class="btn sm"
                :disabled="busy[r.key]"
                @click="askDip(r.d, r.key)"
              >
                {{ r.d.request ? 'Request again' : 'Request imaging' }}
              </button>
              <button
                v-if="requestView(r.d.request).canCancel"
                type="button"
                class="btn sm ghost"
                :disabled="busy[r.key]"
                @click="cancel(r.d, r.key)"
              >
                Cancel request
              </button>
              <span v-if="rowError[r.key]" class="xsmall bad" role="alert"
                >That did not go through: {{ rowError[r.key] }}</span
              >
            </div>
          </article>
        </template>
      </section>
      <p v-if="!days.length" class="empty" style="margin-top: 18px">{{ emptyText }}</p>
    </template>
  </main>
</template>

<style scoped>
.toggle {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 10px;
}
.legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: -1px;
}
.legend i.flag {
  background: var(--violet);
}
.legend i.period {
  background: var(--known);
}
.legend i.own {
  background: var(--low);
}
.legend i.dip {
  background: var(--dip);
}
.day {
  margin-top: 18px;
}
.day h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}
.ecl {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1.1fr) minmax(0, 1.6fr) auto;
  gap: 8px 16px;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 10px;
  background: var(--d-card);
}
.ecl + .ecl {
  margin-top: 8px;
}
.ecl.flag {
  border-left-color: var(--violet);
}
.ecl.period {
  border-left-color: var(--known);
}
.ecl.own {
  border-left-color: var(--low);
}
.ecl.dip {
  border-left-color: var(--dip);
}
.ecl.unseen {
  opacity: 0.7;
}
.tm b {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.num {
  font-variant-numeric: tabular-nums;
}
.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.who b {
  overflow-wrap: anywhere;
}
.who .warn,
.go .warn {
  color: var(--warn);
}
.why {
  font-size: 13px;
}
.go {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  text-align: right;
  max-width: 14rem;
}
@media (max-width: 980px) {
  .ecl {
    grid-template-columns: 7.5rem minmax(0, 1fr) auto;
  }
  .ecl .why {
    grid-column: 2 / -1;
  }
}
@media (max-width: 600px) {
  .ecl {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .ecl .who,
  .ecl .why {
    grid-column: 1 / -1;
  }
  .ecl .go {
    grid-row: 1;
    grid-column: 2;
  }
}
</style>
