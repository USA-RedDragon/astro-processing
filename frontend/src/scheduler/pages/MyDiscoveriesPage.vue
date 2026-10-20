<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHead from '../components/PageHead.vue'
import DipWindowsBox from '../components/DipWindowsBox.vue'
import SharePicture from '../components/SharePicture.vue'
import {
  getBinaries,
  updateBinary,
  updateOther,
  type Binary,
  type BinaryChange,
  type BinaryList,
  type OtherStar,
} from '../api/binaries'
import {
  STAR_VIEWS,
  confidenceBadges,
  inOtherView,
  inStarView,
  isStarView,
  noteLines,
  otherHeadline,
  otherVetText,
  othersLine,
  starViewCounts,
  starsLine,
  typeText,
  vsxClass,
  vsxHref,
  vsxLabel,
  type StarView,
} from '../binaries'
import { latestOnly } from '../latest'
import '../binaries.css'

const route = useRoute()
const router = useRouter()
const shown = typeof route.query.show === 'string' ? route.query.show : ''
const view = ref<StarView>(isStarView(shown) ? shown : '')

const data = ref<BinaryList | null>(null)
const error = ref('')
const loading = ref(true)
const req = latestOnly()

async function load() {
  const current = req.next()
  loading.value = true
  try {
    const r = await getBinaries()
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

let factsTimer: ReturnType<typeof setInterval> | undefined
watch(
  () =>
    data.value?.facts.state === 'running' ||
    !!data.value?.stars.some((b) => b.share?.state === 'pending'),
  (busy) => {
    if (busy && !factsTimer) factsTimer = setInterval(load, 15000)
    if (!busy && factsTimer) {
      clearInterval(factsTimer)
      factsTimer = undefined
    }
  },
)

onMounted(load)
onUnmounted(() => {
  if (factsTimer) clearInterval(factsTimer)
})

const stars = computed(() => data.value?.stars ?? [])
const counts = computed(() => starViewCounts(stars.value))
const rows = computed(() => stars.value.filter((b) => inStarView(b, view.value)))
const others = computed(() => data.value?.others ?? [])
const otherRows = computed(() => others.value.filter((o) => inOtherView(o, view.value)))
const starTypes = computed(() => data.value?.star_types ?? [])
const viewLabel = computed(() => STAR_VIEWS.find((v) => v.key === view.value)?.label ?? 'All')
const factsText = computed(() => {
  const f = data.value?.facts
  if (!f || f.state !== 'running') return ''
  return `Working out survey facts: ${f.done} of ${f.total} stars done.`
})

function pickView(v: StarView) {
  view.value = v
  router.replace({ query: v ? { show: v } : {} })
}

const busy = reactive<Record<number, boolean>>({})
const cardError = reactive<Record<number, string>>({})
const editing = reactive<Record<number, boolean>>({})
const noteDraft = reactive<Record<number, string>>({})
const refDraft = reactive<Record<number, string>>({})
const dipOpen = reactive<Record<number, boolean>>({})

function isDipper(o: OtherStar): boolean {
  return !!o.dipper || o.star_type?.key === 'dipper'
}

function setEvery(o: OtherStar, on: boolean) {
  if (o.dipper) o.dipper.every_window = on
}

type Card = Binary | OtherStar

function isOther(b: Card): b is OtherStar {
  return !!data.value?.others?.some((o) => o.source_id === b.source_id)
}

function replace(next: Card) {
  const d = data.value
  if (!d) return
  const list: Card[] = isOther(next) ? (d.others ?? []) : d.stars
  const i = list.findIndex((s) => s.source_id === next.source_id)
  if (i >= 0) list[i] = next
}

async function save(b: Card, change: BinaryChange): Promise<boolean> {
  busy[b.source_id] = true
  cardError[b.source_id] = ''
  try {
    replace(
      isOther(b) ? await updateOther(b.source_id, change) : await updateBinary(b.source_id, change),
    )
    return true
  } catch (e) {
    cardError[b.source_id] = e instanceof Error ? e.message : String(e)
    return false
  } finally {
    busy[b.source_id] = false
  }
}

function pickType(o: OtherStar, ev: Event) {
  const key = (ev.target as HTMLSelectElement).value
  if (key !== (o.star_type?.key ?? '')) save(o, { star_type: key })
}

function pickVsx(b: Card, ev: Event) {
  const submitted = (ev.target as HTMLSelectElement).value === 'sub'
  if (submitted !== b.vsx.submitted) save(b, { vsx_submitted: submitted })
}

function refOf(b: Card): string {
  return refDraft[b.source_id] ?? b.vsx.ref
}

async function saveRef(b: Card) {
  const next = refOf(b).trim()
  if (next === b.vsx.ref) return
  if (await save(b, { vsx_ref: next })) delete refDraft[b.source_id]
}

function editNotes(b: Card) {
  noteDraft[b.source_id] = b.notes
  editing[b.source_id] = true
}

async function saveNotes(b: Card) {
  if (await save(b, { notes: noteDraft[b.source_id] ?? '' })) editing[b.source_id] = false
}

const pageState = computed(() => {
  if (!data.value && loading.value) return 'loading'
  if (!data.value && error.value) return 'error'
  return 'ready'
})
</script>

<template>
  <main class="page wide bin mine">
    <PageHead context="Discover" title="My discoveries">
      Every variable star you found and confirmed, where each one stands on VSX, and the record of
      its eclipse timings.
      <span v-if="factsText" class="block xsmall mt-1" role="status">{{ factsText }}</span>
      <template #actions>
        <RouterLink class="btn sm" :to="{ name: 'discovery-eclipses' }">Eclipse planner</RouterLink>
      </template>
    </PageHead>

    <section v-if="pageState === 'loading'" class="card state-card" role="status">
      <p class="empty" style="padding: 0">Loading your discoveries.</p>
    </section>

    <section v-else-if="pageState === 'error'" class="card state-card" role="alert">
      <h2>Your discoveries are not available</h2>
      <p class="empty" style="padding: 0">The stacker did not answer: {{ error }}</p>
      <div><button type="button" class="btn sm" @click="load">Try again</button></div>
    </section>

    <template v-else>
      <p v-if="error" class="small bad" role="alert">The stacker did not answer: {{ error }}</p>
      <div class="bar">
        <button
          v-for="v in STAR_VIEWS"
          :key="v.key"
          type="button"
          class="chip"
          :aria-pressed="view === v.key"
          @click="pickView(v.key)"
        >
          {{ v.label }} <span class="n">{{ counts[v.key] }}</span>
        </button>
      </div>
      <div class="sec">{{ starsLine(viewLabel, rows.length) }}</div>
      <div class="list">
        <article v-for="b in rows" :key="b.source_id" class="find" :class="vsxClass(b)">
          <div class="who">
            <div class="meta">
              <span class="pill" :class="b.vsx.submitted ? 'known' : 'low'">{{ vsxLabel(b) }}</span>
              <span v-for="f in b.flags ?? []" :key="f.id" class="badge violet" :title="f.why">{{
                f.label
              }}</span>
            </div>
            <div class="t">
              <b>{{ b.name }}</b
              ><span class="dim small">find #{{ b.source_id }}</span>
            </div>
            <div v-if="b.alt_name" class="dim small">{{ b.alt_name }}</div>
            <div class="dim small">
              {{ b.field }}<template v-if="b.magnitude"> · {{ b.magnitude }}</template>
            </div>
            <div class="acts">
              <RouterLink
                class="btn sm"
                :to="{ name: 'discovery-vsx', params: { id: String(b.source_id) } }"
                >Prepare VSX submission</RouterLink
              >
              <RouterLink
                class="btn sm"
                :to="{ name: 'discovery-eclipses', query: { star: String(b.source_id) } }"
                >Eclipses</RouterLink
              >
            </div>
            <SharePicture v-if="b.share" class="pic" :share="b.share" :title="b.name" />
            <div class="vsx-set">
              <label class="dim small" :for="'vsx-' + b.source_id">VSX</label>
              <select
                :id="'vsx-' + b.source_id"
                :value="b.vsx.submitted ? 'sub' : 'not'"
                :disabled="busy[b.source_id]"
                @change="pickVsx(b, $event)"
              >
                <option value="not">Not submitted yet</option>
                <option value="sub">Submitted to VSX</option>
              </select>
              <input
                v-if="b.vsx.submitted"
                type="text"
                class="ref"
                :value="refOf(b)"
                :disabled="busy[b.source_id]"
                placeholder="VSX link or id, optional"
                aria-label="VSX link or id"
                @input="refDraft[b.source_id] = ($event.target as HTMLInputElement).value"
                @change="saveRef(b)"
              />
              <a
                v-if="b.vsx.submitted && vsxHref(b.vsx.ref)"
                class="linkish small"
                :href="vsxHref(b.vsx.ref)"
                target="_blank"
                rel="noopener noreferrer"
                >Open on VSX</a
              >
            </div>
            <p v-if="cardError[b.source_id]" class="small bad" role="alert">
              That did not save: {{ cardError[b.source_id] }}
            </p>
          </div>
          <dl>
            <dt>Type</dt>
            <dd>{{ typeText(b) }}</dd>
            <dt>Repeats</dt>
            <dd>
              every {{ b.period_text }} days<span
                v-if="b.alt_period_text"
                class="block dim small"
                >{{ b.alt_period_text }}</span
              >
            </dd>
            <dt>Dips</dt>
            <dd>{{ b.depth_text }}</dd>
          </dl>
          <div class="notes">
            <div class="meta">
              <span v-for="c in confidenceBadges(b)" :key="c.text" class="badge" :class="c.tone">{{
                c.text
              }}</span>
            </div>
            <p v-for="f in b.flags ?? []" :key="f.id" class="small line">
              <span class="dim">Why flagged:</span> {{ f.why }}
            </p>
            <p v-if="b.facts_state === 'pending'" class="small dim line">
              Survey facts still being worked out.
            </p>
            <p v-else-if="b.facts_state === 'failed'" class="small bad line">
              Survey facts could not be worked out<template v-if="b.facts_error"
                >: {{ b.facts_error }}</template
              >
            </p>
            <div v-if="editing[b.source_id]" class="note-edit">
              <label class="dim small" :for="'notes-' + b.source_id">Notes, one per line</label>
              <textarea
                :id="'notes-' + b.source_id"
                v-model="noteDraft[b.source_id]"
                rows="4"
                :disabled="busy[b.source_id]"
              />
              <div class="row">
                <button
                  type="button"
                  class="btn sm primary"
                  :disabled="busy[b.source_id]"
                  @click="saveNotes(b)"
                >
                  Save notes
                </button>
                <button
                  type="button"
                  class="btn sm"
                  :disabled="busy[b.source_id]"
                  @click="editing[b.source_id] = false"
                >
                  Cancel
                </button>
              </div>
            </div>
            <template v-else>
              <ul v-if="noteLines(b.notes).length">
                <li v-for="(n, i) in noteLines(b.notes)" :key="i">{{ n }}</li>
              </ul>
              <p v-else class="dim small line">No notes.</p>
              <div>
                <button type="button" class="btn sm ghost edit" @click="editNotes(b)">
                  Edit notes
                </button>
              </div>
            </template>
          </div>
          <div v-if="b.timing" class="tline">
            <div class="k">Eclipse timings</div>
            <div class="v">
              <span>{{ b.timing.text }}</span>
              <div v-if="b.timing.flags?.length" class="meta">
                <span v-for="f in b.timing.flags ?? []" :key="f" class="badge warn">{{ f }}</span>
              </div>
            </div>
            <div>
              <RouterLink
                class="btn sm"
                :to="{ name: 'discovery-timings', params: { id: String(b.source_id) } }"
                >Timings</RouterLink
              >
            </div>
          </div>
        </article>
        <p v-if="!rows.length" class="empty">
          {{
            stars.length
              ? 'No stars in this group.'
              : others.length
                ? 'No confirmed eclipsing binaries yet.'
                : 'No confirmed variable stars yet.'
          }}
        </p>
      </div>
      <template v-if="otherRows.length">
        <div class="sec">{{ othersLine(otherRows.length) }}</div>
        <div class="list">
          <article
            v-for="o in otherRows"
            :key="o.source_id"
            class="find other"
            :class="vsxClass(o)"
            :data-source="o.source_id"
          >
            <div class="who">
              <div class="meta">
                <span class="pill" :class="o.vsx.submitted ? 'known' : 'low'">{{
                  vsxLabel(o)
                }}</span>
                <span
                  v-if="o.star_type?.vsx"
                  class="badge"
                  :title="'VSX type ' + o.star_type.vsx"
                  >{{ o.star_type.vsx }}</span
                >
              </div>
              <div class="t">
                <b>{{ o.name }}</b
                ><span class="dim small">find #{{ o.source_id }}</span>
              </div>
              <div v-if="o.alt_name" class="dim small">{{ o.alt_name }}</div>
              <div class="dim small">
                {{ o.field }}<template v-if="o.magnitude"> · {{ o.magnitude }}</template>
              </div>
              <p class="kind">{{ otherHeadline(o) }}</p>
              <div v-if="isDipper(o)" class="acts">
                <button
                  type="button"
                  class="btn sm"
                  :aria-expanded="!!dipOpen[o.source_id]"
                  @click="dipOpen[o.source_id] = !dipOpen[o.source_id]"
                >
                  Dip windows
                </button>
              </div>
              <SharePicture
                v-if="o.share.state !== 'none'"
                class="pic"
                :share="o.share"
                :title="o.name"
              />
              <div class="vsx-set">
                <label class="dim small" :for="'type-' + o.source_id">Kind</label>
                <select
                  :id="'type-' + o.source_id"
                  :value="o.star_type?.key ?? ''"
                  :disabled="busy[o.source_id]"
                  @change="pickType(o, $event)"
                >
                  <option value="">Not named yet</option>
                  <option v-for="t in starTypes" :key="t.key" :value="t.key">{{ t.words }}</option>
                </select>
              </div>
              <div class="vsx-set">
                <label class="dim small" :for="'vsx-' + o.source_id">VSX</label>
                <select
                  :id="'vsx-' + o.source_id"
                  :value="o.vsx.submitted ? 'sub' : 'not'"
                  :disabled="busy[o.source_id]"
                  @change="pickVsx(o, $event)"
                >
                  <option value="not">Not submitted yet</option>
                  <option value="sub">Submitted to VSX</option>
                </select>
                <input
                  v-if="o.vsx.submitted"
                  type="text"
                  class="ref"
                  :value="refOf(o)"
                  :disabled="busy[o.source_id]"
                  placeholder="VSX link or id, optional"
                  aria-label="VSX link or id"
                  @input="refDraft[o.source_id] = ($event.target as HTMLInputElement).value"
                  @change="saveRef(o)"
                />
                <a
                  v-if="o.vsx.submitted && vsxHref(o.vsx.ref)"
                  class="linkish small"
                  :href="vsxHref(o.vsx.ref)"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Open on VSX</a
                >
              </div>
              <p v-if="cardError[o.source_id]" class="small bad" role="alert">
                That did not save: {{ cardError[o.source_id] }}
              </p>
            </div>
            <dl>
              <dt>Kind</dt>
              <dd>{{ o.star_type?.words ?? 'Not named yet' }}</dd>
              <dt>Period</dt>
              <dd>{{ o.period > 0 ? `every ${o.period_text} days` : 'None found' }}</dd>
              <dt>Vet</dt>
              <dd>{{ otherVetText(o) }}</dd>
              <template v-if="o.dipper?.windows_text">
                <dt>Windows</dt>
                <dd>{{ o.dipper.windows_text }}</dd>
              </template>
              <template v-if="o.dipper?.dips_text">
                <dt>Dips</dt>
                <dd>{{ o.dipper.dips_text }}</dd>
              </template>
            </dl>
            <div class="notes">
              <div v-if="editing[o.source_id]" class="note-edit">
                <label class="dim small" :for="'notes-' + o.source_id">Notes, one per line</label>
                <textarea
                  :id="'notes-' + o.source_id"
                  v-model="noteDraft[o.source_id]"
                  rows="4"
                  :disabled="busy[o.source_id]"
                />
                <div class="row">
                  <button
                    type="button"
                    class="btn sm primary"
                    :disabled="busy[o.source_id]"
                    @click="saveNotes(o)"
                  >
                    Save notes
                  </button>
                  <button
                    type="button"
                    class="btn sm"
                    :disabled="busy[o.source_id]"
                    @click="editing[o.source_id] = false"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <template v-else>
                <ul v-if="noteLines(o.notes).length">
                  <li v-for="(n, i) in noteLines(o.notes)" :key="i">{{ n }}</li>
                </ul>
                <p v-else class="dim small line">No notes.</p>
                <div>
                  <button type="button" class="btn sm ghost edit" @click="editNotes(o)">
                    Edit notes
                  </button>
                </div>
              </template>
            </div>
            <DipWindowsBox
              v-if="isDipper(o) && dipOpen[o.source_id]"
              class="dips"
              :source-id="o.source_id"
              @every-window="setEvery(o, $event)"
            />
          </article>
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
.find {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 10px 20px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 10px;
  background: var(--d-card);
}
.find.s-sub {
  border-left-color: var(--known);
}
.find.s-not {
  border-left-color: var(--low);
}
@media (max-width: 980px) {
  .find {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .find .notes {
    grid-column: 1 / -1;
  }
}
@media (max-width: 640px) {
  .find {
    grid-template-columns: minmax(0, 1fr);
  }
}
.who {
  min-width: 0;
}
.kind {
  margin: 8px 0 0;
  font-weight: 600;
}
.t {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: baseline;
  margin-top: 6px;
}
.t b {
  overflow-wrap: anywhere;
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.pic {
  margin-top: 10px;
  max-width: 20rem;
}
.vsx-set {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
  margin-top: 8px;
}
.vsx-set select,
.vsx-set input {
  padding: 2px 8px;
  font-size: 12px;
}
.vsx-set .ref {
  flex: 1 1 10rem;
  min-width: 0;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 12px;
  margin: 0;
  font-size: 13px;
  align-content: start;
}
dt {
  color: var(--muted-foreground);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.notes {
  min-width: 0;
}
.notes ul {
  margin: 8px 0 0;
  padding-left: 1.1rem;
  font-size: 13px;
}
.notes .line {
  margin: 8px 0 0;
}
.notes .edit {
  margin-top: 4px;
  padding: 0;
  height: auto;
  color: var(--known);
}
.note-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.note-edit textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
}
.who p.bad {
  margin: 6px 0 0;
}
.dips {
  grid-column: 1 / -1;
}
.tline {
  grid-column: 1 / -1;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
  display: grid;
  grid-template-columns: 8rem minmax(0, 1fr) auto;
  gap: 4px 14px;
  align-items: start;
  font-size: 13px;
}
.tline .k {
  color: var(--muted-foreground);
}
.tline .v {
  min-width: 0;
  overflow-wrap: anywhere;
}
.tline .v .meta {
  margin-top: 4px;
}
@media (max-width: 640px) {
  .tline {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .tline .k {
    grid-column: 1 / -1;
  }
}
</style>
