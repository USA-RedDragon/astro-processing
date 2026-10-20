<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  cancelEclipseRequest,
  getDipper,
  requestDip,
  setEveryWindow,
  type DipWindow,
  type DipperView,
} from '../api/binaries'
import { dipKey, requestView } from '../binaries'
import { latestOnly } from '../latest'

const props = defineProps<{ sourceId: number }>()
const emit = defineEmits<{ everyWindow: [on: boolean] }>()

const view = ref<DipperView | null>(null)
const error = ref('')
const loading = ref(true)
const saving = ref(false)
const req = latestOnly()

async function load() {
  const current = req.next()
  loading.value = true
  try {
    const r = await getDipper(props.sourceId)
    if (!current()) return
    view.value = r
    error.value = ''
  } catch (e) {
    if (!current()) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (current()) loading.value = false
  }
}

onMounted(load)

async function toggle(ev: Event) {
  const box = ev.target as HTMLInputElement
  const on = box.checked
  saving.value = true
  error.value = ''
  try {
    view.value = await setEveryWindow(props.sourceId, on)
    emit('everyWindow', view.value.every_window)
  } catch (e) {
    box.checked = !on
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

const busy = reactive<Record<string, boolean>>({})
const rowError = reactive<Record<string, string>>({})

async function act(w: DipWindow, run: () => Promise<void>) {
  const k = dipKey(w)
  busy[k] = true
  rowError[k] = ''
  try {
    await run()
  } catch (e) {
    rowError[k] = e instanceof Error ? e.message : String(e)
  } finally {
    busy[k] = false
  }
}

const ask = (w: DipWindow) =>
  act(w, async () => {
    w.request = await requestDip(w.source_id, w.mid)
  })

const cancel = (w: DipWindow) =>
  act(w, async () => {
    if (!w.request) return
    await cancelEclipseRequest(w.request.id)
    w.request = null
  })

const judged = (w: DipWindow) => w.result.state === 'dip' || w.result.state === 'no-dip'
</script>

<template>
  <div class="dipbox" role="region" aria-label="Dip windows">
    <div class="head">
      <h3>Dip windows</h3>
      <label v-if="view?.ephemeris" class="toggle small" :for="'every-' + sourceId">
        <input
          :id="'every-' + sourceId"
          type="checkbox"
          :checked="view.every_window"
          :disabled="saving"
          @change="toggle"
        />
        Ask for imaging on every window the site can see
      </label>
    </div>
    <p class="note small dim">
      Requests go in at high priority for the dark part of each window and follow the live curve on
      the Now page. Windows with less than 1 hour of usable dark are listed but not requested.
    </p>
    <p v-if="error" class="small bad" role="alert">The stacker did not answer: {{ error }}</p>
    <p v-if="!view && loading" class="small dim" role="status">Loading the dip windows.</p>
    <template v-else-if="view">
      <p v-if="!view.ephemeris" class="small dim">
        Dip windows not set up yet: the star's dip cycle is not stored.
      </p>
      <template v-else>
        <div class="scroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Window middle</th>
                <th>Dark time inside it</th>
                <th>Imaging</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in view.windows" :key="dipKey(w)">
                <td>{{ w.mid_label }}</td>
                <td class="num" :class="{ dim: !w.dark_text }">
                  {{ w.dark_text || 'No dark time' }}
                </td>
                <td class="wrap">
                  <span class="cell">
                    <span
                      v-if="requestView(w.request).label"
                      class="badge"
                      :class="requestView(w.request).tone"
                      >{{ requestView(w.request).label }}</span
                    >
                    <span v-if="w.imaging" class="xsmall dim">{{ w.imaging.text }}</span>
                    <span v-if="!w.observable" class="xsmall dim">{{ w.observable_note }}</span>
                    <button
                      v-else-if="requestView(w.request).canRequest && !w.over"
                      type="button"
                      class="btn sm"
                      :disabled="busy[dipKey(w)]"
                      @click="ask(w)"
                    >
                      {{ w.request ? 'Request again' : 'Request' }}
                    </button>
                    <button
                      v-if="requestView(w.request).canCancel"
                      type="button"
                      class="btn sm ghost"
                      :disabled="busy[dipKey(w)]"
                      @click="cancel(w)"
                    >
                      Cancel request
                    </button>
                    <span v-if="rowError[dipKey(w)]" class="xsmall bad" role="alert"
                      >That did not go through: {{ rowError[dipKey(w)] }}</span
                    >
                  </span>
                </td>
                <td v-if="judged(w)" class="wrap">
                  <span class="cell">
                    <span class="badge" :class="{ dip: w.result.state === 'dip' }">{{
                      w.result.label
                    }}</span>
                    <span v-if="w.result.note" class="xsmall dim">{{ w.result.note }}</span>
                  </span>
                </td>
                <td v-else class="wrap dim">{{ w.result.label }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!view.windows.length" class="small dim">No windows listed yet.</p>
      </template>
      <p v-if="view.past_text" class="xsmall dim">{{ view.past_text }}</p>
      <p v-if="view.zone_note" class="xsmall dim">{{ view.zone_note }}</p>
    </template>
  </div>
</template>

<style scoped>
.dipbox {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
  justify-content: space-between;
}
.head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.toggle {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
}
.dipbox p {
  margin: 0;
}
.note {
  max-width: 70ch;
}
.num {
  font-variant-numeric: tabular-nums;
}
.dipbox .tbl td.wrap {
  white-space: normal;
  min-width: 10rem;
}
.cell {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  align-items: center;
}
</style>
