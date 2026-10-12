<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Orbit } from 'lucide-vue-next'
import { getAsteroids, type Asteroid, type AsteroidView } from '../api/asteroids'
import { clock, shortDate } from '../format'
import { useAddedBodies } from '../addedBodies'
import AddBodyPanel from './AddBodyPanel.vue'
import {
  PIXEL_SCALE_ARCSEC,
  longestSub,
  magText,
  peakText,
  rateText,
  shortSubs,
  windowText,
} from '../comets'
import {
  asteroidEmptyState,
  asteroidSubTitle,
  fetchedText,
  positionSource,
  sortAsteroids,
} from '../asteroids'

const view = ref<AsteroidView | null>(null)
const loadError = ref<unknown>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    view.value = await getAsteroids()
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
const stateOf = (a: Asteroid) => added.stateOf(a.designation)
const failure = (a: Asteroid) => added.failure(a.designation)

const asteroids = computed(() => sortAsteroids(view.value?.asteroids ?? []))
const empty = computed(() =>
  loading.value ? null : asteroidEmptyState(loadError.value, view.value),
)
const minAlt = computed(() => view.value?.min_altitude ?? 0)
const maxMag = computed(() => view.value?.max_magnitude ?? 12)

const heading = computed(() => {
  if (loading.value) return 'Loading…'
  if (loadError.value) return 'Asteroids tonight'
  const n = asteroids.value.length
  return `${n} ${n === 1 ? 'asteroid' : 'asteroids'} up tonight`
})

function longestText(a: Asteroid): string {
  const s = longestSub(a.rate_arcsec_per_min)
  if (s === null) return '—'
  return s < 1 ? 'under 1 s' : `${s} s`
}

const computedText = computed(() => {
  const v = view.value
  return v ? `Computed ${shortDate(v.computed_at)} ${clock(v.computed_at)}` : ''
})

const picked = ref<Asteroid | null>(null)
const pick = (a: Asteroid) => (picked.value = { ...a })
</script>

<template>
  <section aria-labelledby="asteroids-h" class="card" style="gap: 0.875rem">
    <div class="spread">
      <h2 id="asteroids-h">{{ heading }}</h2>
      <span v-if="computedText" class="xsmall muted">{{ computedText }}</span>
    </div>
    <p class="small muted" style="margin: 0; max-width: 72ch">
      Asteroids at V {{ maxMag }} or brighter that are up tonight, brightest first. You pick what
      goes into the scheduler. Sub length is capped so the asteroid moves less than one pixel ({{
        PIXEL_SCALE_ARCSEC
      }}″) per sub.
    </p>

    <div v-if="empty" class="blank" role="status">
      <Orbit class="blank-icon" aria-hidden="true" />
      <div>
        <p class="blank-title">{{ empty.title }}</p>
        <p class="small muted" style="margin: 0">{{ empty.text }}</p>
      </div>
    </div>

    <div
      v-else-if="asteroids.length"
      class="scroll-x"
      style="border: 1px solid var(--border); border-radius: 0.5rem"
    >
      <table class="dgrid num" style="min-width: 48rem">
        <thead>
          <tr>
            <th scope="col">Asteroid</th>
            <th scope="col" style="text-align: right">V</th>
            <th scope="col">Up tonight</th>
            <th scope="col" style="text-align: right">Highest</th>
            <th scope="col" style="text-align: right">Moving</th>
            <th scope="col" style="text-align: right">Longest sub</th>
            <th scope="col"><span class="sr-only">Add</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in asteroids" :key="a.designation || a.name">
            <td style="min-width: 14rem">
              <div style="font-weight: 600; white-space: nowrap">
                {{ a.name }}
                <span
                  v-if="a.neo"
                  class="badge warn xsmall"
                  style="margin-left: 0.25rem"
                  title="Near-Earth asteroid"
                  >NEO</span
                >
              </div>
              <div class="xsmall muted">{{ asteroidSubTitle(a) }}</div>
              <div v-if="failure(a)" class="xsmall" style="color: var(--bad)">
                Not added: {{ failure(a) }}
              </div>
            </td>
            <td style="text-align: right; white-space: nowrap">{{ magText(a.magnitude) }}</td>
            <td style="white-space: nowrap">
              <div>{{ windowText(a.window, minAlt).main }}</div>
              <div class="xsmall muted">{{ windowText(a.window, minAlt).sub }}</div>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <div>{{ peakText(a.window).main }}</div>
              <div class="xsmall muted">{{ peakText(a.window).sub }}</div>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <div>{{ rateText(a.rate_arcsec_per_min) }}</div>
              <div class="xsmall muted" :title="positionSource(a).title">
                {{ positionSource(a).label }}
              </div>
            </td>
            <td
              style="text-align: right; white-space: nowrap"
              :class="{ cap: shortSubs(a.rate_arcsec_per_min) }"
            >
              <div>{{ longestText(a) }}</div>
              <div v-if="shortSubs(a.rate_arcsec_per_min)" class="xsmall">short subs</div>
            </td>
            <td style="text-align: right">
              <span v-if="stateOf(a)?.state === 'added'" class="badge ok">Added</span>
              <span v-else-if="stateOf(a)?.state === 'adding'" class="badge info">Adding</span>
              <template v-else>
                <button
                  type="button"
                  class="btn sm"
                  :aria-expanded="picked?.designation === a.designation"
                  :aria-label="`Add ${a.name} to the scheduler`"
                  @click="pick(a)"
                >
                  {{ stateOf(a)?.state === 'failed' ? 'Try again' : 'Add to scheduler' }}
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
      noun="asteroid"
      kind="asteroid"
      @cancel="picked = null"
      @added="added.upsert"
    />

    <div v-if="view" class="xsmall muted" style="display: grid; gap: 0.25rem">
      <p style="margin: 0">
        V magnitudes are predictions from each asteroid's H and G (the H,G model), not measurements.
        Positions and motion are two-body from JPL Small-Body Database elements, except near-Earth
        asteroids, which come from JPL Horizons. The list keeps asteroids at V
        {{ view.max_magnitude }} or brighter.
      </p>
      <p style="margin: 0">{{ fetchedText('Elements', view.elements) }}</p>
      <p style="margin: 0">{{ fetchedText('Close approaches', view.close_approaches) }}</p>
      <p v-if="view.elements.error" style="margin: 0; color: var(--warn)">
        Asteroid elements: {{ view.elements.error }}
      </p>
      <p v-if="view.close_approaches.error" style="margin: 0; color: var(--warn)">
        Close approaches: {{ view.close_approaches.error }}
      </p>
    </div>
  </section>
</template>

<style scoped>
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
