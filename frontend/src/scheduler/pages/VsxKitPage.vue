<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHead from '../components/PageHead.vue'
import {
  getKit,
  setDiscoverer,
  updateBinary,
  type Kit,
  type KitCheck,
  type KitField,
} from '../api/binaries'
import {
  bytesText,
  canCopy,
  checklistText,
  fieldWords,
  manualChecklist,
} from '../binaries'
import { showToast } from '../shell'
import { latestOnly } from '../latest'
import '../binaries.css'

const route = useRoute()
const id = computed(() => Number(route.params.id) || 0)

const kit = ref<Kit | null>(null)
const error = ref('')
const loading = ref(true)
const req = latestOnly()

async function load() {
  const current = req.next()
  loading.value = true
  try {
    const r = await getKit(id.value)
    if (!current()) return
    kit.value = r
    error.value = ''
  } catch (e) {
    if (!current()) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (current()) loading.value = false
  }
}

watch(id, load, { immediate: true })

const copied = ref('')
let copyTimer: ReturnType<typeof setTimeout> | undefined
onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer)
})

async function copy(f: KitField) {
  try {
    await navigator.clipboard.writeText(f.value)
    copied.value = f.key
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = ''), 1500)
  } catch {
    showToast({ text: 'Copy is blocked here. Select the text instead.', tone: 'warn' })
  }
}

const editing = reactive<Record<string, boolean>>({})
const draft = reactive<Record<string, string>>({})
const fieldBusy = reactive<Record<string, boolean>>({})
const fieldError = reactive<Record<string, string>>({})

function edit(f: KitField) {
  draft[f.key] = f.value
  editing[f.key] = true
}

function setField(key: string, value: string) {
  const f = kit.value?.fields.find((x) => x.key === key)
  if (!f) return
  f.value = value
  f.state = value ? 'value' : 'not_set'
}

async function saveField(f: KitField) {
  const k = kit.value
  if (!k) return
  const value = (draft[f.key] ?? '').trim()
  fieldBusy[f.key] = true
  fieldError[f.key] = ''
  try {
    if (f.key === 'discoverer') {
      setField(f.key, (await setDiscoverer(value)).discoverer)
    } else if (f.key === 'primary_name') {
      const star = await updateBinary(k.star.source_id, { primary_name: value })
      k.star = star
      f.value = star.name
      f.state = 'value'
    }
    editing[f.key] = false
  } catch (e) {
    fieldError[f.key] = e instanceof Error ? e.message : String(e)
  } finally {
    fieldBusy[f.key] = false
  }
}

const checkBusy = ref(false)
const checkError = ref('')

async function tick(c: KitCheck, ev: Event) {
  const k = kit.value
  if (!k || c.auto) return
  const before = c.done
  c.done = (ev.target as HTMLInputElement).checked
  checkBusy.value = true
  checkError.value = ''
  try {
    await updateBinary(k.star.source_id, { checklist: manualChecklist(k.checklist) })
  } catch (e) {
    c.done = before
    checkError.value = e instanceof Error ? e.message : String(e)
  } finally {
    checkBusy.value = false
  }
}

const pageState = computed(() => {
  if (!kit.value && loading.value) return 'loading'
  if (!kit.value && error.value) return 'error'
  return 'ready'
})
</script>

<template>
  <main class="page wide bin kit-page">
    <PageHead :title="kit?.star.name ?? 'VSX kit'">
      <template #context>
        <RouterLink class="linkish" :to="{ name: 'discoveries-mine' }">My discoveries</RouterLink>
        / VSX kit
      </template>
      <template v-if="kit">{{ kit.lede }}</template>
    </PageHead>

    <div class="callout">
      <div class="lbl">Who submits</div>
      <div class="say">You submit this on VSX. The app never submits.</div>
      <div class="small dim">
        The app fills in the values and keeps the checklist. You open the VSX New Star Form, paste
        each value, upload the plots and press submit yourself.
      </div>
    </div>

    <section v-if="pageState === 'loading'" class="card state-card" role="status">
      <p class="empty" style="padding: 0">Loading the VSX kit.</p>
    </section>

    <section v-else-if="pageState === 'error'" class="card state-card" role="alert">
      <h2>The VSX kit is not available</h2>
      <p class="empty" style="padding: 0">The stacker did not answer: {{ error }}</p>
      <div><button type="button" class="btn sm" @click="load">Try again</button></div>
    </section>

    <div v-else-if="kit" class="kit">
      <section class="card">
        <div class="spread">
          <h2>Form fields, in the order of the VSX form</h2>
          <span class="small dim">Copy each value into the form</span>
        </div>
        <div class="fields">
          <div v-for="f in kit.fields" :key="f.key" class="fld">
            <div class="k">{{ f.label }}</div>
            <div class="v">
              <div v-if="editing[f.key]" class="fedit">
                <input
                  v-model="draft[f.key]"
                  type="text"
                  :aria-label="f.label"
                  :disabled="fieldBusy[f.key]"
                  @keydown.enter="saveField(f)"
                />
                <div class="row">
                  <button
                    type="button"
                    class="btn sm primary"
                    :disabled="fieldBusy[f.key]"
                    @click="saveField(f)"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    class="btn sm"
                    :disabled="fieldBusy[f.key]"
                    @click="editing[f.key] = false"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <template v-else>
                <span v-if="f.state === 'value'" class="val mono">{{ f.value }}</span>
                <span v-else class="nm">{{ fieldWords(f) }}</span>
                <button
                  v-if="f.editable"
                  type="button"
                  class="linkish small change"
                  @click="edit(f)"
                >
                  Change
                </button>
              </template>
              <span v-if="f.hint" class="hint">{{ f.hint }}</span>
              <span v-if="fieldError[f.key]" class="hint bad" role="alert"
                >That did not save: {{ fieldError[f.key] }}</span
              >
            </div>
            <button
              v-if="canCopy(f)"
              type="button"
              class="copy"
              :class="{ did: copied === f.key }"
              :aria-label="`Copy ${f.label}`"
              @click="copy(f)"
            >
              {{ copied === f.key ? 'Copied' : 'Copy' }}
            </button>
            <span v-else />
          </div>
        </div>
      </section>

      <div class="side">
        <section v-for="f in kit.files" :key="f.key" class="card" :class="'file-' + f.key">
          <h2>{{ f.title }}</h2>
          <figure v-if="f.state === 'ready' && f.url" class="fig">
            <div class="plot"><img :src="f.url" :alt="f.caption || f.title" /></div>
            <figcaption class="small dim">
              {{ f.caption }}
              <a class="linkish dl" :href="f.url" download
                >Download<template v-if="bytesText(f.bytes)"> ({{ bytesText(f.bytes) }})</template></a
              >
            </figcaption>
          </figure>
          <div v-else class="slot">
            <span class="nm" :class="{ bad: f.state === 'failed' }">{{
              f.note || (f.key === 'own' ? 'Not measured yet.' : 'Not made yet.')
            }}</span>
            <RouterLink
              v-if="f.key === 'own'"
              class="btn sm open-planner"
              :to="{ name: 'discovery-eclipses', query: { star: String(kit.star.source_id) } }"
              >Open the Eclipse planner</RouterLink
            >
          </div>
        </section>

        <section class="card">
          <div class="spread">
            <h2>Checklist</h2>
            <span class="small dim num">{{ checklistText(kit.checklist) }}</span>
          </div>
          <ul class="checks">
            <li v-for="c in kit.checklist" :key="c.key">
              <label>
                <input
                  type="checkbox"
                  :checked="c.done"
                  :disabled="c.auto || checkBusy"
                  @change="tick(c, $event)"
                />
                <span
                  >{{ c.text
                  }}<span v-if="c.note" class="cnote" :class="{ ok: c.auto && c.done }">{{
                    c.note
                  }}</span></span
                >
              </label>
            </li>
          </ul>
          <p v-if="checkError" class="small bad" role="alert" style="margin: 0">
            That did not save: {{ checkError }}
          </p>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.callout {
  border: 1px solid var(--border);
  border-left: 4px solid var(--info);
  border-radius: 10px;
  background: var(--d-card);
  padding: 12px 14px;
  margin-top: 16px;
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
.kit {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 20px;
  margin-top: 16px;
  align-items: start;
}
@media (max-width: 980px) {
  .kit {
    grid-template-columns: minmax(0, 1fr);
  }
}
.kit .card {
  padding: 1.25rem;
  gap: 0.875rem;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.fields {
  display: flex;
  flex-direction: column;
}
.fld {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr) auto;
  gap: 4px 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
  align-items: start;
}
.fld:last-child {
  border-bottom: 0;
}
.fld .k {
  color: var(--muted-foreground);
  font-size: 13px;
}
.fld .v {
  overflow-wrap: anywhere;
  min-width: 0;
}
.fld .val {
  white-space: pre-wrap;
}
.fld .hint {
  display: block;
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 2px;
}
.fld .hint.bad {
  color: var(--bad);
}
.fld .change {
  margin-left: 8px;
}
.fedit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fedit input {
  width: 100%;
}
@media (max-width: 560px) {
  .fld {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .fld .k {
    grid-column: 1 / -1;
  }
}
.copy {
  all: unset;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
  white-space: nowrap;
}
.copy:hover {
  background: var(--accent);
}
.copy.did {
  color: var(--ok);
  border-color: var(--ok);
}
.fig {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.plot {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.plot img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
}
.dl {
  margin-left: 4px;
}
.slot {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.open-planner {
  align-self: flex-start;
}
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checks label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  cursor: pointer;
}
.checks input {
  margin-top: 4px;
}
.cnote {
  display: block;
  font-size: 12px;
  color: var(--muted-foreground);
}
.cnote.ok {
  color: var(--ok);
}
</style>
