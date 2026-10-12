<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError } from '../api/client'
import { getBodyNights, getBodyTarget, type BodyNightsView } from '../api/comets'

const props = defineProps<{ targetGuid: string }>()

const isBody = ref(false)
const view = ref<BodyNightsView | null>(null)
const error = ref('')

async function load() {
  view.value = null
  error.value = ''
  try {
    const t = await getBodyTarget(props.targetGuid)
    isBody.value = !!t.target
  } catch {
    isBody.value = false
  }
  if (!isBody.value) return
  try {
    view.value = await getBodyNights(props.targetGuid)
  } catch (e) {
    error.value = e instanceof ApiError || e instanceof Error ? e.message : String(e)
  }
}
watch(() => props.targetGuid, load, { immediate: true })

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const day = (night: string | null) => (night ? dayFmt.format(new Date(night + 'T12:00:00Z')) : '')
const mag = (v: number | null) => (v === null ? '—' : 'V ' + v.toFixed(1))
const kindWord = computed(() => (view.value?.kind === 'asteroid' ? 'asteroid' : 'comet'))

const summary = computed(() => {
  const v = view.value
  if (!v) return ''
  const n = v.nights.length
  if (v.season_nights_left > 0) {
    const later =
      v.usable_nights > v.season_nights_left
        ? ` It is usable on ${v.usable_nights - v.season_nights_left} more of the next ${n} nights after a break, up to ${day(v.last_usable)}.`
        : ''
    return `In season: ${v.season_nights_left} usable nights from tonight to ${day(v.season_end)}.${later}`
  }
  if (v.usable_nights > 0)
    return `Not usable tonight. Usable on ${v.usable_nights} of the next ${n} nights, the first on ${day(v.first_usable)}.`
  if (v.bright_nights === 0)
    return `Fainter than V ${v.mag_limit} on all of the next ${n} nights, so it has no season.`
  return `Bright enough on ${v.bright_nights} of the next ${n} nights, but never up long enough in full darkness on those nights, so it has no season.`
})

const brightest = computed(() => {
  const v = view.value
  if (!v || v.brightest_mag === null) return 'No brightness estimate is known for it.'
  return `Brightest ${mag(v.brightest_mag)} on ${day(v.brightest_night)} (a model estimate, not a measurement).`
})

const rule = computed(() => {
  const v = view.value
  if (!v) return ''
  return `A night counts when the ${kindWord.value} is V ${v.mag_limit} or brighter and stays above ${v.min_altitude}° for ${v.minimum_minutes} min in full darkness. The season runs from tonight until 14 nights in a row do not count. The season on the project list is counted the same way but also checks the horizon, moon avoidance and the twilight of the exposure plans, so it can be shorter.`
})

const windowNote = computed(() => {
  const v = view.value
  const h = v?.typical_window_hours
  if (!v || h === null || h === undefined) return ''
  const mins = Math.round(h * 60)
  const typical = `Typical window above ${v.min_altitude}° in full darkness over the next 90 nights: ${mins < 120 ? mins + ' min' : Math.round(h * 10) / 10 + ' h'}.`
  if (v.minimum_minutes > mins)
    return `${typical} The project's minimum time of ${v.minimum_minutes} min is longer, so most of those nights do not count. A shorter minimum time under Options lets them count.`
  return typical
})

const months = computed(() => {
  const out: {
    key: string
    label: string
    usable: number
    bright: number
    nights: number
    best: number | null
    peak: number | null
  }[] = []
  for (const d of view.value?.nights ?? []) {
    const key = d.night.slice(0, 7)
    let m = out[out.length - 1]
    if (!m || m.key !== key) {
      const label = new Date(key + '-15T18:00:00Z').toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
      m = { key, label, usable: 0, bright: 0, nights: 0, best: null, peak: null }
      out.push(m)
    }
    m.nights++
    if (d.usable) m.usable++
    if (d.bright) m.bright++
    if (d.mag !== null && (m.best === null || d.mag < m.best)) m.best = d.mag
    if (d.peak_altitude !== null && (m.peak === null || d.peak_altitude > m.peak))
      m.peak = d.peak_altitude
  }
  return out
})
</script>

<template>
  <section v-if="isBody" class="card" aria-labelledby="body-season-h" style="gap: 0.75rem">
    <h2 id="body-season-h">Season</h2>
    <p v-if="error" class="small muted" style="margin: 0">
      The season nights are not worked out yet: {{ error }}
    </p>
    <template v-else-if="view">
      <p class="small" style="margin: 0">{{ summary }} {{ brightest }}</p>
      <p v-if="windowNote" class="small" style="margin: 0" data-test="window-note">
        {{ windowNote }}
      </p>
      <p class="xsmall muted" style="margin: 0">{{ rule }}</p>
      <div class="scroll-x" style="border: 1px solid var(--border); border-radius: 0.5rem">
        <table class="dgrid num" style="min-width: 26rem">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" style="text-align: right">Usable nights</th>
              <th scope="col" style="text-align: right">Bright enough</th>
              <th scope="col" style="text-align: right">Brightest</th>
              <th scope="col" style="text-align: right">Highest in darkness</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in months" :key="m.key">
              <td style="white-space: nowrap">{{ m.label }}</td>
              <td style="text-align: right">{{ m.usable }} of {{ m.nights }}</td>
              <td style="text-align: right">{{ m.bright }} of {{ m.nights }}</td>
              <td style="text-align: right">{{ mag(m.best) }}</td>
              <td style="text-align: right">
                {{
                  m.peak === null
                    ? '—'
                    : m.peak < 0
                      ? 'below the horizon'
                      : Math.round(m.peak) + '°'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <p v-else class="small muted" style="margin: 0">Loading the season nights…</p>
  </section>
</template>
