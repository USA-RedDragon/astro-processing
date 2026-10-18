<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHead from '../components/PageHead.vue'
import LatePlot from '../components/LatePlot.vue'
import { getBinaries, getTimings, type Binary, type TimingRecord } from '../api/binaries'
import { requestView, typeText } from '../binaries'
import {
  TREND_WHAT,
  checkText,
  lateShort,
  midText,
  predictionText,
  seasonKindText,
  trendChip,
  trendWhy,
  untimedLine,
} from '../timings'
import { latestOnly } from '../latest'
import '../binaries.css'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id) || 0)

const record = ref<TimingRecord | null>(null)
const stars = ref<Binary[]>([])
const error = ref('')
const loading = ref(true)
const req = latestOnly()

async function load() {
  const current = req.next()
  loading.value = true
  try {
    const r = await getTimings(id.value)
    if (!current()) return
    record.value = r
    error.value = ''
  } catch (e) {
    if (!current()) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (current()) loading.value = false
  }
}

async function loadStars() {
  try {
    stars.value = (await getBinaries()).stars
  } catch {
    stars.value = []
  }
}

watch(id, load, { immediate: true })
loadStars()

const star = computed(() => stars.value.find((s) => s.source_id === id.value) ?? null)
const title = computed(() => record.value?.name || star.value?.name || 'Eclipse timings')
const lede = computed(() => {
  const s = star.value
  if (!s) return ''
  const every =
    `repeats every ${s.period_text} days` + (s.alt_period_text ? ` (${s.alt_period_text})` : '')
  return `Find #${s.source_id} · ${[s.field, s.magnitude].filter(Boolean).join(' · ')} · ${typeText(s)}, ${every}.`
})

function pickStar(ev: Event) {
  const next = Number((ev.target as HTMLSelectElement).value)
  if (next && next !== id.value)
    router.push({ name: 'discovery-timings', params: { id: String(next) } })
}

const pageState = computed(() => {
  if (!record.value && loading.value) return 'loading'
  if (!record.value && error.value) return 'error'
  return 'ready'
})
</script>

<template>
  <main class="page wide bin timings-page">
    <PageHead :title="title">
      <template #context>
        <RouterLink class="linkish" :to="{ name: 'discoveries-mine' }">My discoveries</RouterLink>
        / Eclipse timings
      </template>
      {{ lede }}
    </PageHead>

    <div v-if="stars.length" class="bar">
      <label class="dim small" for="tm-star">Star</label>
      <select id="tm-star" :value="id" @change="pickStar">
        <option v-if="!star" :value="id">This star</option>
        <option v-for="s in stars" :key="s.source_id" :value="s.source_id">
          {{ s.field ? `${s.name} · ${s.field}` : s.name }}
        </option>
      </select>
    </div>

    <section v-if="pageState === 'loading'" class="card state-card" role="status">
      <p class="empty" style="padding: 0">Loading the eclipse timings.</p>
    </section>

    <section v-else-if="pageState === 'error'" class="card state-card" role="alert">
      <h2>The eclipse timings are not available</h2>
      <p class="empty" style="padding: 0">The stacker did not answer: {{ error }}</p>
      <div><button type="button" class="btn sm" @click="load">Try again</button></div>
    </section>

    <template v-else-if="record">
      <p v-if="error" class="small bad" role="alert">The stacker did not answer: {{ error }}</p>
      <div class="callout">
        <div class="lbl">Timing record</div>
        <div class="say">{{ record.summary }}</div>
        <div class="small dim">
          {{
            [untimedLine(record.untimed.length), 'Times are US Central (CDT or CST).']
              .filter(Boolean)
              .join(' ')
          }}
        </div>
      </div>
      <div v-if="record.updated" class="callout warn updated">
        <div class="lbl">Predicted times need updating</div>
        <div class="say sm">
          Your timings call for a period of {{ record.updated.period_text }} days.
        </div>
        <div class="small dim">
          New eclipse middle for reports: Barycentric Julian date (TDB)
          <span class="mono">{{ record.updated.epoch_bjd_tdb.toFixed(5) }}</span>
        </div>
      </div>

      <div class="cols">
        <div class="stack">
          <LatePlot :record="record" />

          <section class="card timings">
            <h2>Timings</h2>
            <p v-if="!record.timings.length" class="dim m0">No timings yet.</p>
            <div v-else class="scroll">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Night</th>
                    <th>Eclipse</th>
                    <th>Middle of the eclipse</th>
                    <th class="r">Minutes</th>
                    <th class="r">Give or take</th>
                    <th>Filter</th>
                    <th class="r">Frames</th>
                    <th>How</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="t in record.timings" :key="t.id">
                    <tr class="has-rep" :class="{ out: !t.used }">
                      <td>{{ t.night }}</td>
                      <td>{{ t.kind_label }}</td>
                      <td>{{ midText(t.mid) }}</td>
                      <td class="r">{{ lateShort(t.late_minutes) }}</td>
                      <td class="r">{{ t.err_minutes.toFixed(1) }}</td>
                      <td>{{ t.filter }}</td>
                      <td class="r">{{ t.points }}</td>
                      <td>{{ t.method }}</td>
                    </tr>
                    <tr class="rep">
                      <td colspan="8">
                        <span v-if="t.state === 'doubtful' || !t.used" class="meta tags">
                          <span v-if="t.state === 'doubtful'" class="badge warn">Doubtful</span>
                          <span v-if="!t.used" class="badge">Left out of the trend checks</span>
                        </span>
                        <span v-if="checkText(t)" class="dim block">{{ checkText(t) }}</span>
                        <span v-if="t.note" class="dim block">{{ t.note }}</span>
                        <span class="dim">For reports:</span> Heliocentric Julian date (UTC):
                        <span class="mono">{{ t.hjd_utc.toFixed(5) }}</span> · Barycentric Julian
                        date (TDB): <span class="mono">{{ t.bjd_tdb.toFixed(5) }}</span> · Cycle
                        <span class="num">{{ t.cycle }}</span>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <p v-if="predictionText(record)" class="small dim m0">{{ predictionText(record) }}</p>
          </section>

          <section class="card">
            <h2>Nights that covered an eclipse but gave no timing</h2>
            <ul v-if="record.untimed.length" class="covered">
              <li v-for="u in record.untimed" :key="u.id">
                <span class="num">{{ u.night }}</span>
                <span
                  ><b>{{ u.kind_label }}</b
                  >: {{ u.note }}</span
                >
              </li>
            </ul>
            <p v-else class="dim m0">None so far.</p>
          </section>
        </div>

        <div class="stack">
          <section class="card">
            <div class="spread">
              <h2>Trend checks</h2>
              <span class="small dim">Each shows Flag, Clear or Not enough timings yet</span>
            </div>
            <div>
              <div v-for="t in record.trends" :key="t.id" class="trend" :class="t.state">
                <div>
                  <div class="st">
                    <span class="badge" :class="trendChip(t.state).tone">{{
                      trendChip(t.state).text
                    }}</span>
                  </div>
                  <span class="nm">{{ t.label }}</span>
                  <span v-if="TREND_WHAT[t.id]" class="what">{{ TREND_WHAT[t.id] }}</span>
                </div>
                <div class="small">
                  {{ trendWhy(t) }}
                  <span v-if="t.basis" class="block dim basis">{{ t.basis }}</span>
                </div>
              </div>
              <p v-if="!record.trends.length" class="dim m0">No trend checks yet.</p>
            </div>
          </section>

          <section class="card season">
            <h2>{{ record.season?.label || 'This season' }}</h2>
            <p v-if="!record.season" class="dim m0">The app has not planned this season yet.</p>
            <template v-else>
              <dl>
                <template v-for="k in record.season.kinds" :key="k.kind">
                  <dt>{{ k.label }}</dt>
                  <dd>{{ seasonKindText(k) }}</dd>
                </template>
                <dt>Requests</dt>
                <dd>
                  <ul v-if="record.season.requests.length" class="reqs">
                    <li v-for="r in record.season.requests" :key="r.id">
                      <span class="meta">
                        <span class="badge" :class="requestView(r).tone">{{
                          requestView(r).label
                        }}</span>
                        <span v-if="requestView(r).by" class="badge info">{{
                          requestView(r).by
                        }}</span>
                      </span>
                      <span v-if="r.note" class="block small dim">{{ r.note }}</span>
                    </li>
                  </ul>
                  <template v-else>No requests yet.</template>
                </dd>
              </dl>
              <p v-if="record.season.stopped" class="small warn-text m0" role="note">
                {{ record.season.stopped }}
              </p>
            </template>
            <div class="small">
              <p class="dim m0">
                How the app asks, each season (the year around the date the star is opposite the
                Sun):
              </p>
              <ul>
                <li>
                  It asks for the soonest eclipse in the next two weeks that is dark and at least 30
                  degrees up from the start to the end of the dip.
                </li>
                <li>
                  One open request per star, and at most 6 open in all. A request never overlaps
                  another request's window.
                </li>
                <li>Timings already made this season count toward the number.</li>
                <li>
                  Requests it makes show "Asked by the app". You can cancel them like any other. It
                  never asks again for an eclipse you cancelled.
                </li>
                <li>
                  If you cancel one of this star's automatic requests, it asks for no more of this
                  star until next season. After 2 failed requests in a season it also stops for this
                  star.
                </li>
              </ul>
              <RouterLink
                class="btn sm planner"
                :to="{ name: 'discovery-eclipses', query: { star: String(record.source_id) } }"
                >Eclipse planner</RouterLink
              >
            </div>
          </section>
        </div>
      </div>
    </template>

    <details class="howto">
      <summary>How a timing is made</summary>
      <p>
        After a night with an eclipse is stacked, the app measures the star in every frame against
        steady stars nearby.
      </p>
      <p>
        It then fits the eclipse's own shape to the points to find the middle of the eclipse. Each
        filter gets its own brightness level and depth, but all filters share one middle.
      </p>
      <p>
        It checks that middle with a second method, the mirror method: the time about which both
        sides of the dip match best.
      </p>
      <p>
        When the noise in the frames drifts over the night, the app makes the "give or take" wider
        to match.
      </p>
      <p>
        A timing whose two methods disagree is kept in the table, but left out of the trend checks.
      </p>
      <p>
        A trend is only flagged when the chance of seeing it from noise alone is under 1 in 1,000,
        and only once the star has enough timings for that check.
      </p>
      <p>
        The app also measures eclipses already in your archive, so frames you took before a star was
        confirmed can add timings too.
      </p>
    </details>
  </main>
</template>

<style scoped>
.m0 {
  margin: 0;
}
.callout {
  border: 1px solid var(--border);
  border-left: 4px solid var(--info);
  border-radius: 10px;
  background: var(--d-card);
  padding: 12px 14px;
  margin-top: 16px;
}
.callout.warn {
  border-left-color: var(--warn);
}
.callout .lbl {
  font-size: 12px;
  color: var(--muted-foreground);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.callout .say {
  font-size: 16px;
  font-weight: 600;
}
.callout .say.sm {
  font-size: 15px;
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 20px;
  margin-top: 16px;
  align-items: start;
}
@media (max-width: 980px) {
  .cols {
    grid-template-columns: minmax(0, 1fr);
  }
}
.cols :deep(.card) {
  padding: 1.25rem;
  gap: 0.875rem;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.tbl tr.rep td {
  white-space: normal;
  background: var(--d-card);
  font-size: 12px;
}
.tbl tr.rep td span.mono {
  white-space: nowrap;
}
.tbl tr.has-rep td {
  border-bottom: 0;
}
.tbl tr.out td {
  color: var(--muted-foreground);
}
.tags {
  margin-bottom: 4px;
}
.covered {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.covered li {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr);
  gap: 2px 12px;
  font-size: 13px;
}
@media (max-width: 480px) {
  .covered li {
    grid-template-columns: minmax(0, 1fr);
  }
}
.trend {
  display: grid;
  grid-template-columns: minmax(0, 13rem) minmax(0, 1fr);
  gap: 4px 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.trend:last-child {
  border-bottom: 0;
}
.trend .nm {
  font-weight: 600;
  color: inherit;
  font-style: normal;
}
.trend .what {
  display: block;
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 2px;
}
.trend .st {
  margin-bottom: 4px;
}
.trend .basis {
  margin-top: 4px;
}
@media (max-width: 560px) {
  .trend {
    grid-template-columns: minmax(0, 1fr);
  }
}
.season dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
  font-size: 13px;
}
.season dt {
  color: var(--muted-foreground);
}
.season dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.season ul,
.howto ul {
  margin: 6px 0 0;
  padding-left: 1.1rem;
  font-size: 13px;
  list-style: disc;
}
.season ul.reqs {
  margin: 0;
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.season .planner {
  margin-top: 10px;
}
.warn-text {
  color: var(--warn);
}
details.howto {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--d-card);
  padding: 10px 14px;
  margin-top: 20px;
}
details.howto summary {
  cursor: pointer;
  font-weight: 600;
}
details.howto p {
  margin: 8px 0 0;
  max-width: 80ch;
  font-size: 13px;
}
</style>
