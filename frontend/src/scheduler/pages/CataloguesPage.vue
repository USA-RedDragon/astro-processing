<script setup lang="ts">
import PageHead from '../components/PageHead.vue'
import SkyCutout from '../components/SkyCutout.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  addLink,
  decideMatch,
  filterColour,
  filterOrder,
  getCatalogue,
  getMatches,
  getObject,
  getOverview,
  hours,
  label,
  linkEvidence,
  size,
  paText,
  typeLabel,
  type CatalogueEntry,
  type Decision,
  type Link,
  type SubjectRef,
  type ObjectDetail,
  type Overview,
  type ReviewItem,
} from '../api/discover'
import { errorToast, notifyCommand } from '../shell'
import { hm } from '../format'
import { imagedRoute } from '../imaged'

const route = useRoute()
const router = useRouter()

const overview = ref<Overview | null>(null)
const entries = ref<CatalogueEntry[]>([])
const matches = ref<ReviewItem[]>([])
const loading = ref(true)
const listLoading = ref(false)
const failed = ref('')
const matchesFailed = ref('')
const tab = ref(typeof route.query.list === 'string' ? route.query.list : 'messier')
const tonightOnly = ref(false)
const status = ref('All')
const pick = ref<CatalogueEntry | null>(null)
const detail = ref<ObjectDetail | null>(null)
const busy = ref('')
const sourcesOpen = ref(false)

const statusLabel: Record<string, string> = {
  done: 'Done',
  'in-progress': 'In progress',
  measuring: 'Measuring',
  'not-started': 'Not started',
}

const backfill = computed(() => overview.value?.backfill ?? null)

const backfillLine = computed(() => {
  const b = backfill.value
  if (!b) return ''
  const head = `Goal measurements: ${b.measured} of ${b.total} masters measured`
  const current = b.current < b.measured ? ` (${b.current} on the current method)` : ''
  let state: string
  switch (b.state) {
    case 'measuring':
      state = ` · measuring now on ${b.workers} ${b.workers === 1 ? 'worker' : 'workers'}, ${b.doneInPass} of ${b.queued} done this pass`
      if (b.perHour > 0) state += `, ${b.perHour} an hour`
      if (b.eta) state += `, done about ${hm(b.eta)}`
      break
    case 'paused-for-stacking':
      state = ` · paused while the stacker works, ${b.doneInPass} of ${b.queued} done this pass`
      break
    case 'idle':
      state = ' · idle until the next check'
      break
    default:
      state = ' · goal measurement is off'
  }
  return head + current + state
})

const current = computed(() => overview.value?.catalogues.find((c) => c.key === tab.value))

async function loadOverview() {
  try {
    overview.value = await getOverview()
    failed.value = ''
    if (
      !overview.value.catalogues.some((c) => c.key === tab.value) &&
      overview.value.catalogues.length
    ) {
      tab.value = overview.value.catalogues[0]!.key
    }
  } catch (e) {
    failed.value = e instanceof Error ? e.message : String(e)
  }
}

async function loadList() {
  listLoading.value = true
  try {
    entries.value = await getCatalogue(tab.value)
  } catch (e) {
    errorToast(e, 'Could not load the catalogue')
    entries.value = []
  } finally {
    listLoading.value = false
  }
}

async function loadMatches() {
  try {
    matches.value = await getMatches(true)
    matchesFailed.value = ''
  } catch (e) {
    matchesFailed.value = e instanceof Error ? e.message : String(e)
    errorToast(e, 'Could not load the name matches')
  }
}

onMounted(async () => {
  await Promise.all([loadOverview(), loadMatches()])
  await loadList()
  loading.value = false
})

watch(tab, (t) => {
  pick.value = null
  detail.value = null
  router.replace({ query: { ...route.query, list: t } })
  loadList()
})

function choose(e: CatalogueEntry) {
  if (pick.value?.object.id === e.object.id) {
    pick.value = null
    detail.value = null
    return
  }
  pick.value = e
  detail.value = null
  getObject(e.object.id)
    .then((d) => {
      if (pick.value?.object.id === e.object.id) detail.value = d
    })
    .catch(() => undefined)
}

function hidden(e: CatalogueEntry): boolean {
  if (tonightOnly.value && !e.tonight?.up) return true
  return status.value !== 'All' && statusLabel[e.status] !== status.value
}

function cellStyle(e: CatalogueEntry) {
  const s = e.status
  const started = s === 'in-progress' || s === 'measuring'
  return {
    background: s === 'done' ? 'var(--done)' : started ? 'var(--prog-bg)' : 'transparent',
    color:
      s === 'done' ? 'var(--ink-dark)' : started ? 'var(--foreground)' : 'var(--muted-foreground)',
    border:
      s === 'done'
        ? '1px solid var(--done)'
        : s === 'in-progress'
          ? '1px solid var(--prog)'
          : s === 'measuring'
            ? '1px dashed var(--prog)'
            : '1px dashed var(--border)',
    boxShadow: e.tonight?.up ? 'inset 0 -3px 0 var(--warn)' : 'none',
    opacity: hidden(e) ? 0.18 : 1,
    outline:
      pick.value?.object.id === e.object.id ? '2px solid var(--foreground)' : '0 solid transparent',
  }
}

function cellLabel(e: CatalogueEntry): string {
  const name = e.object.name ? ' ' + e.object.name : ''
  return `${e.label}${name}: ${statusLabel[e.status]?.toLowerCase()}${e.tonight?.up ? ', up tonight' : ''}`
}

const cellText = (e: CatalogueEntry) => (tab.value === 'herschel400' ? String(e.index) : e.label)

const wideCells = computed(() => entries.value.some((e) => e.label.length > 8))

const upNotStarted = computed(() =>
  entries.value
    .filter((e) => e.status === 'not-started' && e.tonight?.up)
    .sort((a, b) => (b.tonight?.hours ?? 0) - (a.tonight?.hours ?? 0))
    .slice(0, 8),
)

function window(e: CatalogueEntry): string {
  const t = e.tonight
  if (!t) return 'visibility unknown until the site is known'
  if (!t.up)
    return t.peakAlt === null
      ? 'no astronomical darkness tonight'
      : t.peakAlt > 0
        ? `peaks at ${Math.round(t.peakAlt)}°, not up long enough tonight`
        : 'not up tonight'
  return `up ${hm(t.start)} – ${hm(t.end)}, ${hours(t.hours)} above ${t.minAltitude}° (${t.minAltitudeSource})`
}

function measuredText(e: CatalogueEntry): string {
  const t = e.tally
  if (!t.filters) return e.scheduled ? 'scheduled, nothing captured yet' : 'no frames yet'
  const parts = [`${t.measured} of ${t.filters} masters measured`]
  if (t.short) parts.push(`${t.short} with too few subs to measure`)
  return parts.join(', ')
}

function pickStatus(e: CatalogueEntry): string {
  const s = statusLabel[e.status] ?? e.status
  const subj = e.subjects.filter((x) => x.status !== 'rejected' && x.status !== 'suggested')
  const head = `${s} · ${measuredText(e)}`
  if (!subj.length) return head
  return `${head} · ${subj.map((x) => x.name + (x.state ? ` (${x.state})` : '')).join(', ')}`
}

function basisText(l: Link | SubjectRef): string {
  const cov = l.coverage !== null && l.coverage !== undefined ? Math.round(l.coverage * 100) : null
  switch (l.basis) {
    case 'frames':
      return `inside your frames (${cov}% of the object covered)`
    case 'target':
      return `inside the Target Scheduler frame where your frames were taken (${cov}% covered)`
    case 'pointing':
      return 'your frames point inside it (no plate solution)'
    case 'plan':
      return `inside a planned frame (${cov}% covered), nothing captured`
    case 'manual':
      return 'confirmed by you'
  }
  return 'name only'
}

const pickHours = computed(() => {
  const h = pick.value?.hours ?? {}
  return Object.keys(h)
    .sort(filterOrder)
    .map((f) => ({ f, h: h[f]!, colour: filterColour(f) }))
})

const pickImaged = computed(() => imagedRoute(pick.value?.subjects))

const pickLinks = computed(() =>
  (detail.value?.links ?? [])
    .filter((l) => l.status !== 'rejected')
    .map(
      (l) =>
        `${l.subjectName}: ${l.status === 'suggested' ? 'name conflict, waiting for you' : basisText(l)}`,
    ),
)

function addFor(e: CatalogueEntry, subject?: string) {
  const fit = e.fit
  const mosaic = !!fit && fit.panels > 1
  return addLink(e.object, mosaic ? 'mosaic' : 'frame', {
    panels: mosaic ? fit.panels : undefined,
    cols: mosaic ? fit.columns : undefined,
    rows: mosaic ? fit.rows : undefined,
    subject,
  })
}

const openMatches = computed(() => matches.value.filter((m) => !m.decided))
const shownMatches = computed(() => [
  ...openMatches.value,
  ...matches.value.filter((m) => m.decided),
])

async function decide(m: ReviewItem, after: Decision) {
  const before: Decision = m.decided ? (m.status as Decision) : ''
  busy.value = m.subject + m.object.id
  try {
    const r = await decideMatch(m, before, after)
    notifyCommand(r)
    await Promise.all([loadMatches(), loadOverview()])
    await loadList()
  } catch (e) {
    errorToast(e, 'Could not save the match')
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <main class="page wide">
    <PageHead context="Discover" title="Catalogue completion">
      <span>
        Catalogue objects inside your plate-solved frames, judged the way Target Scheduler judges
        your targets: by a goal where one is set, otherwise by subs against desired. Measuring means
        a filter with a goal has no measurement yet. Only names that point outside your frames wait
        for you below.
      </span>
      <template #actions>
        <div v-if="overview?.night" class="xsmall muted num" style="text-align: right">
          Tonight: dark {{ hm(overview.night.dusk) }} – {{ hm(overview.night.dawn) }} · Moon
          {{ Math.round(overview.night.moonIllumination * 100) }}% lit
        </div>
      </template>
    </PageHead>

    <p v-if="failed" class="empty">The catalogues could not be loaded: {{ failed }}</p>
    <p v-if="overview?.siteError" class="badge warn" style="align-self: flex-start">
      {{ overview.siteError }}
    </p>
    <p v-if="loading" class="empty">Loading catalogues…</p>
    <p v-if="backfillLine" class="small muted num" style="margin: 0">{{ backfillLine }}</p>

    <div v-if="overview" class="cats">
      <button
        v-for="c in overview.catalogues"
        :key="c.key"
        type="button"
        class="cat"
        :aria-pressed="c.key === tab"
        :style="{ borderColor: c.key === tab ? 'var(--foreground)' : 'var(--border)' }"
        @click="tab = c.key"
      >
        <span class="spread" style="width: 100%">
          <span style="font-weight: 600; font-size: 1rem">{{ c.name }}</span>
          <span class="xsmall muted">{{ c.total }} objects</span>
        </span>
        <span class="row num" style="align-items: baseline">
          <span style="font-size: 1.5rem; font-weight: 600; line-height: 1.1">{{ c.done }}</span>
          <span class="xsmall muted"
            >done · {{ c.inProgress }} in progress · {{ c.measuring }} measuring ·
            {{ c.notStarted }} not started</span
          >
        </span>
        <span class="bar" aria-hidden="true">
          <span :style="{ width: (c.done / c.total) * 100 + '%', background: 'var(--done)' }" />
          <span
            :style="{ width: (c.inProgress / c.total) * 100 + '%', background: 'var(--prog)' }"
          />
          <span
            :style="{
              width: (c.measuring / c.total) * 100 + '%',
              background: 'var(--prog-bg)',
              boxShadow: 'inset 0 0 0 1px var(--prog)',
            }"
          />
        </span>
        <span class="xsmall muted"
          >Done by goal {{ c.doneByGoal }} · by subs against desired {{ c.doneByCounts }} ·
          scheduled, nothing captured {{ c.scheduled }} · up tonight {{ c.upTonight }}</span
        >
      </button>
    </div>

    <section v-if="overview" aria-labelledby="grid-h" class="card">
      <div class="spread" style="align-items: center">
        <h2 id="grid-h">{{ current?.name }}</h2>
        <div class="row small" style="gap: 0.75rem">
          <label for="f-now" class="row" style="gap: 0.375rem"
            ><input id="f-now" v-model="tonightOnly" type="checkbox" /> Up tonight only</label
          >
          <label for="f-status" class="row" style="gap: 0.375rem">
            <span class="muted">Status</span>
            <select id="f-status" v-model="status" class="input" style="height: 2rem">
              <option>All</option>
              <option>Not started</option>
              <option>Measuring</option>
              <option>In progress</option>
              <option>Done</option>
            </select>
          </label>
        </div>
      </div>
      <div class="row xsmall muted" style="gap: 1rem">
        <span class="row" style="gap: 0.375rem"
          ><span class="key" style="background: var(--done)" />Done</span
        >
        <span class="row" style="gap: 0.375rem"
          ><span class="key" style="background: var(--prog-bg); border: 1px solid var(--prog)" />In
          progress</span
        >
        <span class="row" style="gap: 0.375rem"
          ><span
            class="key"
            style="background: var(--prog-bg); border: 1px dashed var(--prog)"
          />Measuring</span
        >
        <span class="row" style="gap: 0.375rem"
          ><span class="key" style="border: 1px dashed var(--muted-foreground)" />Not started</span
        >
        <span class="row" style="gap: 0.375rem"
          ><span
            class="key"
            style="border: 1px solid var(--border); box-shadow: inset 0 -3px 0 var(--warn)"
          />Up tonight</span
        >
        <span v-if="overview.night"
          >Up tonight means at least {{ overview.night.upTonightHours }} h above the minimum
          altitude.</span
        >
        <span>Click any object for details.</span>
      </div>

      <div v-if="pick" role="status" class="strip">
        <SkyCutout
          :ra="pick.object.ra"
          :dec="pick.object.dec"
          :fov="Math.max(0.25, Math.min(10, (pick.object.majorArcmin / 60) * 1.6))"
          :width="240"
          :height="160"
          :alt="'DSS2 colour survey image around ' + label(pick.object)"
          style="max-width: 12rem"
        />
        <div
          style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; flex: 1 1 14rem"
        >
          <span>
            <strong>{{ pick.label }}</strong> {{ pick.object.name }}
            <span class="muted">
              · {{ typeLabel(pick.object.type) }} · {{ size(pick.object) }} ·
              {{ paText(pick.object) }} ·
              {{
                !pick.fit
                  ? 'fit unknown until the rig is measured'
                  : pick.fit.panels > 1
                    ? pick.fit.panels + ' panels'
                    : Math.round(pick.fit.fill * 100) + "% of the frame's long side"
              }}
            </span>
          </span>
          <span class="xsmall muted">
            {{ pickStatus(pick) }} · {{ window(pick)
            }}<template v-if="pick.tonight && pick.tonight.moonSeparation !== null">
              · Moon {{ Math.round(pick.tonight.moonSeparation) }}° away</template
            >
          </span>
          <span v-if="pickHours.length" class="row xsmall num" style="gap: 0.75rem">
            <span v-for="h in pickHours" :key="h.f" class="row" style="gap: 0.25rem"
              ><span class="key" :style="{ background: h.colour }" />{{ h.f }}
              {{ hours(h.h) }}</span
            >
            <span class="muted">effective</span>
          </span>
          <span v-if="pick.completionBasis" class="xsmall muted">{{ pick.completionBasis }}</span>
          <ul v-if="pickLinks.length" class="xsmall muted links">
            <li v-for="l in pickLinks" :key="l">{{ l }}</li>
          </ul>
        </div>
        <span class="row">
          <RouterLink v-if="pickImaged" class="btn sm" :to="pickImaged.to">{{
            pickImaged.project ? 'Open project' : 'Open imaging'
          }}</RouterLink>
          <RouterLink class="btn sm primary" :to="addFor(pick)">{{
            pick.status === 'not-started' ? 'Add' : 'Add again'
          }}</RouterLink>
          <button type="button" class="btn ghost sm" aria-label="Close" @click="pick = null">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      </div>

      <p v-if="listLoading" class="empty">Loading…</p>
      <div v-else class="cells" :class="{ wide: wideCells }">
        <button
          v-for="e in entries"
          :key="e.object.id"
          type="button"
          class="cell num"
          :aria-label="cellLabel(e)"
          :title="label(e.object) + (e.completionBasis ? ' · ' + e.completionBasis : '')"
          :style="cellStyle(e)"
          @click="choose(e)"
        >
          {{ cellText(e) }}
        </button>
      </div>
    </section>

    <div class="row" style="gap: 1.5rem; align-items: flex-start">
      <section aria-labelledby="match-h" class="card" style="flex: 3 1 34rem; gap: 0.75rem">
        <div class="spread">
          <h2 id="match-h">Name conflicts to review</h2>
          <span class="xsmall muted"
            >{{ openMatches.length }} {{ openMatches.length === 1 ? 'conflict' : 'conflicts' }} to
            review</span
          >
        </div>
        <p class="small muted" style="margin: 0">
          Objects inside your frames link on their own. These are names that point at an object
          outside them. Confirming links the project to the object for completion; the scheduler's
          names stay as they are, so the stacker still finds its frames.
        </p>
        <p v-if="matchesFailed" class="empty">
          Could not load the name matches: {{ matchesFailed }}
        </p>
        <p v-else-if="!shownMatches.length" class="empty">
          Nothing to review. No project name points outside its frames.
        </p>
        <ul class="list">
          <li v-for="m in shownMatches" :key="m.subject + m.object.id" class="match">
            <div style="min-width: 0">
              <div>
                <strong>{{ m.subjectName }}</strong>
                <span class="muted"> → </span>{{ label(m.object) }}
                <span class="xsmall muted"> · {{ linkEvidence(m) }}</span>
              </div>
              <div class="xsmall muted">
                {{ m.why
                }}<template v-if="m.state"> · project {{ m.state.toLowerCase() }}</template>
              </div>
            </div>
            <div class="row" style="gap: 0.375rem">
              <template v-if="!m.decided">
                <button
                  type="button"
                  class="btn sm"
                  :disabled="busy === m.subject + m.object.id"
                  @click="decide(m, 'rejected')"
                >
                  Not a match
                </button>
                <button
                  type="button"
                  class="btn sm primary"
                  :disabled="busy === m.subject + m.object.id"
                  @click="decide(m, 'confirmed')"
                >
                  Confirm
                </button>
              </template>
              <template v-else>
                <span :class="['badge', m.status === 'confirmed' ? 'ok' : 'bad']">{{
                  m.status === 'confirmed' ? 'Confirmed' : 'Not a match'
                }}</span>
                <button
                  type="button"
                  class="btn link xsmall"
                  :disabled="busy === m.subject + m.object.id"
                  @click="decide(m, '')"
                >
                  Undo
                </button>
              </template>
            </div>
          </li>
        </ul>
      </section>

      <section aria-labelledby="up-h" class="card" style="flex: 2 1 22rem; gap: 0.75rem">
        <h2 id="up-h">Up tonight, not started · {{ current?.name }}</h2>
        <p v-if="!upNotStarted.length" class="empty">
          Nothing in this catalogue is both up tonight and not started.
        </p>
        <ul class="list">
          <li v-for="e in upNotStarted" :key="e.object.id" class="spread small upline">
            <span>
              <strong>{{ e.label }}</strong> {{ e.object.name }}
              <span class="muted">· {{ hm(e.tonight?.start) }} – {{ hm(e.tonight?.end) }}</span>
            </span>
            <RouterLink class="btn sm" :to="addFor(e)">Add</RouterLink>
          </li>
        </ul>
        <p class="xsmall muted" style="margin: 0">
          Add opens the wizard with the object found and the name match checked.
        </p>
      </section>
    </div>

    <section v-if="overview" class="xsmall muted">
      <button
        type="button"
        class="btn link xsmall"
        :aria-expanded="sourcesOpen"
        @click="sourcesOpen = !sourcesOpen"
      >
        Catalogue sources and licences
      </button>
      <ul v-if="sourcesOpen" style="margin: 0.5rem 0 0; padding-left: 1rem">
        <li v-for="s in overview.sources" :key="s.id">
          <a :href="s.url" target="_blank" rel="noopener" class="lnk">{{ s.name }}</a> —
          {{ s.citation }}. {{ s.licence }}.
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.cats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}
.cat {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.125rem;
  background: var(--card);
  text-align: left;
}
.bar {
  display: flex;
  width: 100%;
  height: 0.5rem;
  border-radius: 999px;
  overflow: hidden;
  background: var(--secondary);
}
.key {
  display: inline-block;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 3px;
}
.strip {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  background: var(--secondary);
  border-radius: 0.625rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
}
.cells {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3.5rem, 1fr));
  gap: 0.25rem;
}
.cells.wide {
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
}
.cell {
  height: 1.875rem;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  outline-offset: 1px;
  font-size: 0.6875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.match {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.25rem 1rem;
  align-items: center;
  padding: 0.75rem 0;
  border-top: 1px solid var(--border);
  font-size: 0.8125rem;
}
.links {
  margin: 0;
  padding-left: 1rem;
}
.upline {
  align-items: center;
  padding: 0.5rem 0;
  border-top: 1px solid var(--border);
}
</style>
