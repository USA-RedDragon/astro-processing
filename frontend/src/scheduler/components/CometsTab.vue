<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Orbit } from 'lucide-vue-next'
import { getComets, type Comet, type CometView } from '../api/comets'
import { clock, shortDate } from '../format'
import { useAddedBodies } from '../addedBodies'
import AddBodyPanel from './AddBodyPanel.vue'
import {
  PIXEL_SCALE_ARCSEC,
  brightest,
  emptyState,
  longestSub,
  magText,
  peakText,
  rateText,
  shortSubs,
  sortComets,
  windowText,
} from '../comets'

const view = ref<CometView | null>(null)
const loadError = ref<unknown>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    view.value = await getComets()
    loadError.value = null
  } catch (e) {
    view.value = null
    loadError.value = e
  } finally {
    loading.value = false
  }
}

onMounted(load)

const added = useAddedBodies()
const stateOf = (c: Comet) => added.stateOf(c.designation)
const failure = (c: Comet) => added.failure(c.designation)

const comets = computed(() => sortComets(view.value?.comets ?? []))
const empty = computed(() => (loading.value ? null : emptyState(loadError.value, view.value)))
const minAlt = computed(() => view.value?.min_altitude ?? 0)

const heading = computed(() => {
  if (loading.value) return 'Loading…'
  if (loadError.value) return 'Comets tonight'
  const n = comets.value.length
  return `${n} ${n === 1 ? 'comet' : 'comets'} up tonight`
})

function isBrighter(c: Comet, which: 'mpc' | 'jpl'): boolean {
  const b = brightest(c)
  const m = which === 'mpc' ? c.magnitude_mpc : c.magnitude_jpl
  return b !== null && m === b && c.magnitude_mpc !== null && c.magnitude_jpl !== null
}

function subTitle(c: Comet): string {
  const parts = [`${c.delta_au.toFixed(2)} au from Earth`, `${c.r_au.toFixed(2)} au from the Sun`]
  if (c.designation && c.designation !== c.name) parts.unshift(c.designation)
  return parts.join(' · ')
}

function longestText(c: Comet): string {
  const s = longestSub(c.rate_arcsec_per_min)
  if (s === null) return '—'
  return s < 1 ? 'under 1 s' : `${s} s`
}

const sourceText = computed(() => {
  const v = view.value
  if (!v) return ''
  const parts = [`Computed ${shortDate(v.computed_at)} ${clock(v.computed_at)}`]
  if (v.elements.fetched_at)
    parts.push(`${v.elements.source} elements fetched ${shortDate(v.elements.fetched_at)}`)
  return parts.join(' · ')
})

const picked = ref<Comet | null>(null)
const pick = (c: Comet) => (picked.value = { ...c })
</script>

<template>
  <section aria-labelledby="comets-h" class="card" style="gap: 0.875rem">
    <div class="spread">
      <h2 id="comets-h">{{ heading }}</h2>
      <span v-if="sourceText" class="xsmall muted">{{ sourceText }}</span>
    </div>
    <p class="small muted" style="margin: 0; max-width: 72ch">
      Comets up tonight, brightest first. You pick what goes into the scheduler. Sub length is
      capped so the comet moves less than one pixel ({{ PIXEL_SCALE_ARCSEC }}″) per sub.
    </p>

    <div v-if="empty" class="blank" role="status">
      <Orbit class="blank-icon" aria-hidden="true" />
      <div>
        <p class="blank-title">{{ empty.title }}</p>
        <p class="small muted" style="margin: 0">{{ empty.text }}</p>
      </div>
    </div>

    <div
      v-else-if="comets.length"
      class="scroll-x"
      style="border: 1px solid var(--border); border-radius: 0.5rem"
    >
      <table class="dgrid num" style="min-width: 48rem">
        <thead>
          <tr>
            <th scope="col">Comet</th>
            <th scope="col" style="text-align: right">Mag · MPC / JPL</th>
            <th scope="col">Up tonight</th>
            <th scope="col" style="text-align: right">Highest</th>
            <th scope="col" style="text-align: right">Moving</th>
            <th scope="col" style="text-align: right">Longest sub</th>
            <th scope="col"><span class="sr-only">Add</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in comets" :key="c.designation || c.name">
            <td style="min-width: 14rem">
              <div style="font-weight: 600; white-space: nowrap">{{ c.name }}</div>
              <div class="xsmall muted">{{ subTitle(c) }}</div>
              <div v-if="failure(c)" class="xsmall" style="color: var(--bad)">
                Not added: {{ failure(c) }}
              </div>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <span :class="{ strong: isBrighter(c, 'mpc') }">{{ magText(c.magnitude_mpc) }}</span>
              <span class="muted"> / </span>
              <span :class="{ strong: isBrighter(c, 'jpl') }">{{ magText(c.magnitude_jpl) }}</span>
            </td>
            <td style="white-space: nowrap">
              <div>{{ windowText(c.window, minAlt).main }}</div>
              <div class="xsmall muted">{{ windowText(c.window, minAlt).sub }}</div>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <div>{{ peakText(c.window).main }}</div>
              <div class="xsmall muted">{{ peakText(c.window).sub }}</div>
            </td>
            <td style="text-align: right; white-space: nowrap">
              {{ rateText(c.rate_arcsec_per_min) }}
            </td>
            <td
              style="text-align: right; white-space: nowrap"
              :class="{ cap: shortSubs(c.rate_arcsec_per_min) }"
            >
              <div>{{ longestText(c) }}</div>
              <div v-if="shortSubs(c.rate_arcsec_per_min)" class="xsmall">short subs</div>
            </td>
            <td style="text-align: right">
              <span v-if="stateOf(c)?.state === 'added'" class="badge ok">Added</span>
              <span v-else-if="stateOf(c)?.state === 'adding'" class="badge info">Adding</span>
              <template v-else>
                <button
                  type="button"
                  class="btn sm"
                  :aria-expanded="picked?.designation === c.designation"
                  :aria-label="`Add ${c.name} to the scheduler`"
                  @click="pick(c)"
                >
                  {{ stateOf(c)?.state === 'failed' ? 'Try again' : 'Add to scheduler' }}
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AddBodyPanel
      :body="picked"
      :min-alt="minAlt"
      noun="comet"
      @cancel="picked = null"
      @added="added.upsert"
    />

    <div v-if="view" class="xsmall muted" style="display: grid; gap: 0.25rem">
      <p style="margin: 0">
        Both magnitudes are model predictions: MPC from the Minor Planet Center's elements, JPL from
        the JPL Small-Body Database. They can differ by several magnitudes for active comets. The
        list is sorted by the brighter of the two and keeps comets where either is
        {{ view.max_magnitude }} or brighter.
      </p>
      <p v-if="view.elements.error" style="margin: 0; color: var(--warn)">
        Comet elements: {{ view.elements.error }}
      </p>
      <p v-if="view.jpl_magnitudes.error" style="margin: 0; color: var(--warn)">
        JPL magnitudes: {{ view.jpl_magnitudes.error }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.strong {
  font-weight: 600;
}
.cap {
  color: var(--warn);
}
.blank {
  display: flex;
  gap: 0.875rem;
  align-items: flex-start;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  padding: 1.25rem;
}
.blank-icon {
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  color: var(--muted-foreground);
}
.blank-title {
  margin: 0 0 0.25rem;
  font-weight: 600;
}
</style>
