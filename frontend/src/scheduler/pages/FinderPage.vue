<script setup lang="ts">
import PageHead from '../components/PageHead.vue'
import SkyThumb from '../components/SkyThumb.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  MONTHS,
  addLink,
  getFinder,
  size,
  typeLabel,
  halphaSource,
  minAltitudeText,
  rigFrame,
  rigSource,
  skySource,
  type FinderResult,
  type FinderRow,
  type ScoreTerm,
} from '../api/discover'
import { errorToast } from '../shell'
import { imagedRoute } from '../imaged'

const fits = [
  { key: 'one', label: 'Fits one frame' },
  { key: 'few', label: '2–4 panels' },
  { key: 'many', label: '5+ panels' },
]
const types = [
  { key: 'em', label: 'Emission' },
  { key: 'snr', label: 'Remnant' },
  { key: 'dark', label: 'Dark' },
  { key: 'ref', label: 'Reflection' },
  { key: 'pn', label: 'Planetary' },
  { key: 'gal', label: 'Galaxy' },
]

const thisMonth = new Date().getMonth()
function defaultMonths(): Record<number, boolean> {
  const m: Record<number, boolean> = {}
  for (let i = 0; i < 3; i++) m[((thisMonth + i) % 12) + 1] = true
  return m
}

const f = reactive({
  fit: { one: true, few: true, many: true } as Record<string, boolean>,
  types: { em: true, snr: true, dark: true, ref: true, pn: true, gal: true } as Record<
    string,
    boolean
  >,
  months: defaultMonths(),
  minFill: 0,
  imaged: 'hide' as 'hide' | 'show',
  sort: 'score',
})

const result = ref<FinderResult | null>(null)
const loading = ref(false)
let seq = 0

async function load() {
  const my = ++seq
  loading.value = true
  try {
    const r = await getFinder({
      fit: Object.keys(f.fit).filter((k) => f.fit[k]),
      types: Object.keys(f.types).filter((k) => f.types[k]),
      months: Object.keys(f.months)
        .map(Number)
        .filter((k) => f.months[k]),
      minFill: f.minFill / 100,
      imaged: f.imaged === 'show',
      sort: f.sort,
      limit: 100,
    })
    if (my === seq) result.value = r
  } catch (e) {
    if (my === seq) errorToast(e, 'Could not load the finder')
  } finally {
    if (my === seq) loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  f,
  () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(load, 200)
  },
  { deep: true },
)
onMounted(load)

function reset() {
  f.fit = { one: true, few: true, many: true }
  f.types = { em: true, snr: true, dark: true, ref: true, pn: true, gal: true }
  f.months = {}
  f.minFill = 0
  f.imaged = 'show'
}

const noFits = computed(
  () => !Object.values(f.fit).some(Boolean) || !Object.values(f.types).some(Boolean),
)

const pickedMonths = computed(() =>
  Object.keys(f.months)
    .map(Number)
    .filter((k) => f.months[k])
    .sort((a, b) => a - b)
    .map((m) => MONTHS[m - 1]),
)

const countText = computed(() => {
  const n = result.value?.total ?? 0
  const base = `${n} ${n === 1 ? 'match' : 'matches'}`
  return pickedMonths.value.length ? `${base} · best in ${pickedMonths.value.join(', ')}` : base
})

const frame = computed(() => {
  const r = result.value
  if (!r) return null
  const f = rigFrame(r.rig)
  if (f) return f
  if (r.frame && r.frame.widthDeg && r.frame.heightDeg)
    return { w: r.frame.widthDeg, h: r.frame.heightDeg }
  return null
})

function thumbLabel(r: FinderRow): string {
  const f = frame.value
  return (
    `DSS2 colour survey image around ${r.object.designation}` +
    (f
      ? `, with your ${f.w.toFixed(2)}° × ${f.h.toFixed(2)}° frame ${r.rotation === null ? 'unrotated, PA not catalogued' : `at ${Math.round(r.rotation)}°`}`
      : '')
  )
}

function fitText(r: FinderRow): string {
  if (r.fit.panels > 1) return `${r.fit.panels} panels (${r.fit.columns} × ${r.fit.rows})`
  return 'Fits one frame'
}

function fillText(r: FinderRow): string {
  return `${Math.round(Math.min(r.fit.fill, 9.99) * 100)}% of the frame's long side`
}

const goodHours = computed(() => result.value?.bestMonthHours ?? null)

function bars(r: FinderRow) {
  const g = goodHours.value
  return r.months.map((v, i) => ({
    h: Math.max(2, Math.round((Math.min(v, 9) / 9) * 28)) + 'px',
    c: (r.bestMonths ?? []).includes(i + 1) ? 'var(--bar)' : 'var(--bar-off)',
    title: `${MONTHS[i]}: ${v.toFixed(1)} h${g !== null ? ` (best at ${g} h or more)` : ''}`,
  }))
}

function monthsAria(r: FinderRow) {
  const best = (r.bestMonths ?? []).map((m) => MONTHS[m - 1])
  return best.length ? 'Best months: ' + best.join(', ') : 'No best month'
}

function brightText(r: FinderRow): string {
  const b = r.brightness
  if (!b) return 'Brightness not catalogued'
  if (b.kind === 'catalogued')
    return `${b.text}${b.band ? `, ${b.band} band` : ', band not stated'}`
  return b.text
}

function halphaText(r: FinderRow): string {
  const h = r.halpha
  if (!h) return 'H-α unknown'
  return `H-α ${Math.round(h.rayleigh)} R mean within ${h.radiusDeg.toFixed(2)}°`
}

const termLabel = computed(() => {
  const m: Record<string, string> = {}
  for (const w of result.value?.weights ?? []) m[w.key] = w.label
  return m
})

function termText(t: ScoreTerm): string {
  const label = termLabel.value[t.key] ?? t.key
  return t.value === null
    ? `${label} unknown (${t.detail})`
    : `${label} +${t.points.toFixed(2)} (${t.detail})`
}

function scoreTitle(r: FinderRow): string {
  return (r.terms ?? []).map(termText).join('\n')
}

function scorePct(r: FinderRow): number {
  const max = result.value?.scoreMax
  return max ? Math.min(100, (r.score / max) * 100) : 0
}

const minAlt = computed(() =>
  minAltitudeText(result.value?.minAltitude, result.value?.minAltitudeSource),
)

function go(r: FinderRow) {
  const mosaic = r.fit.panels > 1
  return addLink(r.object, mosaic ? 'mosaic' : 'frame', {
    rotation: r.rotation ?? undefined,
    panels: mosaic ? r.fit.panels : undefined,
    cols: mosaic ? r.fit.columns : undefined,
    rows: mosaic ? r.fit.rows : undefined,
  })
}

function imaged(r: FinderRow) {
  return r.imaged ? imagedRoute(r.subjects) : null
}
</script>

<template>
  <main class="page wide">
    <PageHead context="Discover" title="Target finder">
      <template v-if="frame">
        Objects that suit your {{ frame.w.toFixed(2) }}° × {{ frame.h.toFixed(2) }}° frame from your
        site, ranked by how well they fill it, their dark hours, H-α and catalogue gaps. Brightness
        is shown as the catalogue gives it and is not ranked.
      </template>
      <template v-else>
        Objects ranked by how well they fill your frame, their dark hours, H-α and catalogue gaps.
      </template>
      <span v-if="result" class="block xsmall mt-1">{{ rigSource(result.rig) }}</span>
      <template #actions>
        <span v-if="result?.siteError" class="badge warn">{{ result.siteError }}</span>
        <span v-if="result?.rigError" class="badge warn">{{ result.rigError }}</span>
      </template>
    </PageHead>

    <div class="row" style="gap: 1.5rem; align-items: flex-start">
      <form aria-labelledby="filters-h" class="card filters" @submit.prevent>
        <div class="spread">
          <h2 id="filters-h">Filters</h2>
          <button type="button" class="btn link xsmall" @click="reset">Show everything</button>
        </div>
        <fieldset class="fs">
          <legend>Size against the frame</legend>
          <div role="group" aria-label="Fit" class="row" style="gap: 0.375rem">
            <button
              v-for="x in fits"
              :key="x.key"
              type="button"
              class="chip"
              :aria-pressed="f.fit[x.key]"
              :class="{ on: f.fit[x.key] }"
              @click="f.fit[x.key] = !f.fit[x.key]"
            >
              {{ x.label }}
            </button>
          </div>
          <label for="fill" class="field">
            <span class="spread"
              ><span class="muted">Smallest frame fill</span
              ><span class="num">{{ f.minFill }}%</span></span
            >
            <input id="fill" v-model.number="f.minFill" type="range" min="0" max="80" step="5" />
          </label>
        </fieldset>
        <fieldset class="fs types">
          <legend>Type</legend>
          <label
            v-for="t in types"
            :key="t.key"
            :for="'t-' + t.key"
            class="row small"
            style="gap: 0.375rem"
          >
            <input :id="'t-' + t.key" v-model="f.types[t.key]" type="checkbox" /> {{ t.label }}
          </label>
        </fieldset>
        <fieldset class="fs">
          <legend>Best months, any of</legend>
          <div role="group" aria-label="Months" class="months">
            <button
              v-for="(m, i) in MONTHS"
              :key="m"
              type="button"
              class="chip month"
              :aria-pressed="!!f.months[i + 1]"
              :class="{ on: f.months[i + 1] }"
              @click="f.months[i + 1] = !f.months[i + 1]"
            >
              {{ m }}
            </button>
          </div>
          <p v-if="result" class="xsmall muted" style="margin: 0">
            A best month has {{ result.bestMonthHours ?? '?' }} or more hours above {{ minAlt }} in
            astronomical darkness, from {{ result.monthSample ?? 'one sampled night per month' }}.
            {{ skySource(result.skyBrightness, result.skyBrightnessBasis) }}
          </p>
        </fieldset>
        <fieldset class="fs">
          <legend>Already imaged</legend>
          <label for="i-hide" class="row small" style="gap: 0.375rem"
            ><input id="i-hide" v-model="f.imaged" type="radio" value="hide" /> Hide imaged and
            scheduled</label
          >
          <label for="i-show" class="row small" style="gap: 0.375rem"
            ><input id="i-show" v-model="f.imaged" type="radio" value="show" /> Show, marked</label
          >
        </fieldset>
      </form>

      <section aria-labelledby="res-h" class="card" style="flex: 4 1 44rem; gap: 0.875rem">
        <div class="spread">
          <h2 id="res-h">{{ loading && !result ? 'Loading…' : countText }}</h2>
          <label for="sort" class="row small" style="gap: 0.375rem">
            <span class="muted">Sort</span>
            <select id="sort" v-model="f.sort" class="input" style="height: 2rem">
              <option value="score">Sort key</option>
              <option value="fill">Frame fill</option>
              <option value="now">Best now</option>
            </select>
          </label>
        </div>
        <div class="scroll-x" style="border: 1px solid var(--border); border-radius: 0.5rem">
          <table class="dgrid num" style="min-width: 52rem" :style="{ opacity: loading ? 0.6 : 1 }">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Framing</th>
                <th scope="col">Object</th>
                <th scope="col">Size</th>
                <th scope="col">Fit</th>
                <th scope="col">Brightness · H-α</th>
                <th scope="col">Best months</th>
                <th scope="col" style="text-align: right">Sort key</th>
                <th scope="col"><span class="sr-only">Add</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in result?.rows ?? []" :key="r.object.id">
                <td class="muted">{{ i + 1 }}</td>
                <td>
                  <SkyThumb
                    :ra="r.object.ra"
                    :dec="r.object.dec"
                    :size-deg="r.object.majorArcmin / 60"
                    :frame="frame"
                    :rotation="r.rotation ?? undefined"
                    :label="thumbLabel(r)"
                  />
                </td>
                <td style="white-space: nowrap">
                  <div style="font-weight: 600">
                    {{ r.object.designation }}
                    <span
                      v-if="r.imaged"
                      class="xsmall"
                      style="font-weight: 500; color: var(--info)"
                      >{{ imaged(r)?.project === false ? 'Imaged' : 'In scheduler' }}</span
                    >
                  </div>
                  <div class="xsmall muted">
                    {{ [r.object.name, typeLabel(r.object.type)].filter(Boolean).join(' · ') }}
                  </div>
                </td>
                <td style="white-space: nowrap">{{ size(r.object) }}</td>
                <td style="white-space: nowrap">
                  <div>{{ fitText(r) }}</div>
                  <div class="xsmall muted">{{ fillText(r) }}</div>
                </td>
                <td style="min-width: 12rem">
                  <div class="small">
                    {{ brightText(r) }}
                    <span v-if="r.brightness?.kind === 'computed'" class="badge xsmall"
                      >computed</span
                    >
                  </div>
                  <div class="xsmall muted">{{ halphaText(r) }}</div>
                </td>
                <td>
                  <div role="img" :aria-label="monthsAria(r)" class="mbars">
                    <span
                      v-for="(b, j) in bars(r)"
                      :key="j"
                      :title="b.title"
                      :style="{ height: b.h, background: b.c }"
                    />
                  </div>
                  <div class="mlabels"><span>J</span><span>D</span></div>
                </td>
                <td style="text-align: right" :title="scoreTitle(r)">
                  <div style="font-weight: 600; font-size: 0.9375rem">
                    {{ r.score.toFixed(2)
                    }}<span v-if="result?.scoreMax" class="xsmall muted">
                      / {{ result.scoreMax.toFixed(2) }}</span
                    >
                  </div>
                  <div class="scorebar">
                    <div :style="{ width: scorePct(r) + '%' }" />
                  </div>
                  <ul class="terms xsmall muted">
                    <li v-for="t in r.terms ?? []" :key="t.key">
                      {{ termLabel[t.key] ?? t.key }}
                      {{ t.value === null ? 'unknown' : '+' + t.points.toFixed(2) }}
                    </li>
                  </ul>
                </td>
                <td style="text-align: right">
                  <RouterLink v-if="imaged(r)" class="btn sm" :to="imaged(r)!.to">Open</RouterLink>
                  <RouterLink v-else class="btn sm" :to="go(r)">{{
                    r.fit.panels > 1 ? 'Plan mosaic' : 'Frame it'
                  }}</RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="result?.rigError && !result.rows.length" class="empty">
          No ranking until the rig is known: {{ result.rigError }}
        </p>
        <p v-else-if="noFits || (result && !result.rows.length && !loading)" class="empty">
          Nothing fits all of these. Loosen a filter, or show everything.
        </p>
        <div v-if="result" class="xsmall muted" style="margin: 0">
          <p style="margin: 0">
            Sort key is the sum of these terms, at most {{ result.scoreMax?.toFixed(2) ?? '?' }}.
            Hover a row's key for its terms. An unknown term adds nothing.
          </p>
          <ul style="margin: 0.25rem 0 0; padding-left: 1.125rem">
            <li v-for="w in result.weights ?? []" :key="w.key">
              {{ w.label }} × {{ w.weight }}: {{ w.rule }}.
            </li>
          </ul>
          <p style="margin: 0.25rem 0 0">
            Panel counts assume {{ Math.round((result.overlap ?? 0) * 100) }}% overlap, the mosaic
            wizard's default, with the frame turned whichever way needs fewer panels.
            <template v-if="result.excluded?.length">
              Left out of the catalogue:
              {{ result.excluded.map((x) => `${x.count} ${x.reason}`).join('; ') }}.
            </template>
            Frame it opens the wizard at the framing step; Plan mosaic opens it at the mosaic step.
            {{ halphaSource(result.halphaMap) }}
          </p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.filters {
  flex: 1 1 17rem;
  max-width: 100%;
  padding: 1.25rem;
  gap: 1.125rem;
}
.fs {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.fs legend {
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.375rem;
}
.types {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem;
}
.chip {
  height: 1.875rem;
  padding: 0 0.625rem;
  border: 1px solid var(--input);
  border-radius: 0.375rem;
  background: transparent;
  font-size: 0.75rem;
}
.chip.on {
  border-color: var(--foreground);
  background: var(--sel);
  font-weight: 600;
}
.months {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.25rem;
}
.chip.month {
  height: 1.75rem;
  padding: 0;
  font-size: 0.6875rem;
}
.mbars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 1.75rem;
}
.mbars span {
  width: 0.375rem;
  border-radius: 1px;
}
.mlabels {
  display: flex;
  justify-content: space-between;
  font-size: 0.625rem;
  color: var(--muted-foreground);
  width: 6.125rem;
}
.terms {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  white-space: nowrap;
}
.scorebar {
  height: 0.25rem;
  width: 3rem;
  margin-left: auto;
  border-radius: 999px;
  background: var(--secondary);
  overflow: hidden;
}
.scorebar div {
  height: 100%;
  background: var(--foreground);
}
</style>
