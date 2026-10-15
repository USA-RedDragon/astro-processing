<script setup lang="ts">
import { computed } from 'vue'
import type { DiscoverySource, SourceChecks, Vetting } from '../api/discoveries'
import { VET_BUTTONS, links } from '../discoveries'
import VettingChart from './VettingChart.vue'
import {
  STATUS_ICON,
  STATUS_WORD,
  pendingText,
  reportOffer,
  runLine,
  savedText,
  statusOf,
  tallyText,
  toneOf,
  verdictLabel,
} from '../vetting'

const props = defineProps<{
  source: DiscoverySource
  checks: SourceChecks | null
  loading?: boolean
  error?: string
  runError?: string
  starting?: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  vet: [state: Exclude<Vetting, ''>]
  run: []
  reload: []
}>()

const report = computed(() => props.checks?.report ?? null)
const sug = computed(() => report.value?.suggestion ?? null)
const line = computed(() => (props.checks ? runLine(props.checks) : null))
const groups = computed(() =>
  (report.value?.groups ?? [])
    .filter((g) => g.checks?.length)
    .map((g) => ({
      ...g,
      tally: tallyText(g.checks),
    })),
)
const charts = computed(() => report.value?.charts ?? [])
const pending = computed(() => pendingText(report.value?.pending))
const offer = computed(() => reportOffer(sug.value, props.source))
const place = computed(() => links(props.source.ra, props.source.dec))
</script>

<template>
  <section class="vp" aria-label="Vetting">
    <div class="verdict" :class="toneOf(sug)">
      <div class="lbl">{{ verdictLabel(sug) }}</div>
      <template v-if="sug">
        <div class="say">{{ sug.say }}</div>
        <div v-if="sug.why" class="why">{{ sug.why }}</div>
      </template>
      <div class="vet" role="group" aria-label="Your verdict" :aria-busy="busy">
        <button
          v-for="b in VET_BUTTONS"
          :key="b.state"
          type="button"
          :aria-pressed="source.vetting === b.state"
          @click="emit('vet', b.state)"
        >
          {{ b.label }}<span v-if="sug?.state === b.state" class="sug"> Suggested</span>
        </button>
      </div>
      <div class="small dim">{{ savedText(source.vetting, !!sug) }}</div>
      <slot name="note" />
    </div>

    <div class="state small" :class="{ dim: line?.kind !== 'failed' && !(error && !checks) }">
      <template v-if="!checks && loading">
        <span role="status">Loading the automatic checks.</span>
      </template>
      <template v-else-if="!checks && error">
        <span class="bad" role="alert">Could not load the automatic checks: {{ error }}</span>
        <button type="button" class="btn sm" @click="emit('reload')">Try again</button>
      </template>
      <template v-else-if="line">
        <span :class="{ bad: line.kind === 'failed' }" role="status">{{ line.text }}</span>
        <button
          v-if="line.kind === 'none' || line.kind === 'failed'"
          type="button"
          class="btn sm"
          :disabled="starting"
          @click="emit('run')"
        >
          {{ line.kind === 'none' ? 'Run checks' : 'Run checks again' }}
        </button>
        <button
          v-else-if="line.kind === 'done'"
          type="button"
          class="linkish"
          :disabled="starting"
          @click="emit('run')"
        >
          Run again
        </button>
      </template>
      <span v-if="runError" class="bad block" role="alert"
        >The checks did not start: {{ runError }}</span
      >
      <span v-if="pending" class="block">{{ pending }}</span>
    </div>

    <div v-if="report" class="cols">
      <div class="checks">
        <div v-for="g in groups" :key="g.id" class="group">
          <h3>
            <span>{{ g.name }}</span
            ><span class="tally">{{ g.tally }}</span>
          </h3>
          <ul>
            <li v-for="c in g.checks" :key="c.id">
              <span class="ic" :class="statusOf(c.status)" aria-hidden="true">{{
                STATUS_ICON[statusOf(c.status)]
              }}</span>
              <span class="ct">{{ c.name }}</span>
              <span class="st" :class="statusOf(c.status)">{{
                STATUS_WORD[statusOf(c.status)]
              }}</span>
              <span v-if="c.evidence" class="ev">{{ c.evidence }}</span>
            </li>
          </ul>
        </div>
      </div>
      <div v-if="charts.length" class="charts">
        <VettingChart v-for="c in charts" :key="c.id" :chart="c" />
      </div>
    </div>

    <slot name="nights" />

    <div class="links">
      <RouterLink
        v-if="offer && 'link' in offer"
        :to="`/discoveries/report/${source.best.id}`"
        class="draft"
        >{{ offer.link }}</RouterLink
      >
      <span v-else-if="offer" class="dim">{{ offer.off }}</span>
      <a :href="place.aladin" target="_blank" rel="noopener noreferrer">Aladin</a>
      <a :href="place.vsx" target="_blank" rel="noopener noreferrer">VSX</a>
      <a :href="place.simbad" target="_blank" rel="noopener noreferrer">SIMBAD</a>
    </div>
  </section>
</template>

<style scoped>
.vp {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.dim {
  color: var(--muted-foreground);
}
.small {
  font-size: 12px;
}
.bad {
  color: var(--bad);
}
.block {
  display: block;
}
.verdict {
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 10px;
  background: var(--background);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.verdict.new {
  border-left-color: var(--new);
}
.verdict.nova {
  border-left-color: var(--nova);
}
.verdict.known {
  border-left-color: var(--known);
}
.verdict.low {
  border-left-color: var(--low);
}
.lbl {
  font-size: 12px;
  color: var(--muted-foreground);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.say {
  font-size: 17px;
  font-weight: 600;
  text-wrap: balance;
}
.why {
  font-size: 13px;
  color: var(--muted-foreground);
  max-width: 75ch;
}
.vet {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
@container (min-width: 520px) {
  .vet {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.vet button {
  font: inherit;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
}
.vet button[aria-pressed='true'] {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}
.vet button:focus-visible,
.linkish:focus-visible,
.links a:focus-visible {
  outline: 2px solid var(--d-sel);
  outline-offset: 1px;
}
.sug {
  display: block;
  font-size: 11px;
  color: var(--muted-foreground);
}
.vet button[aria-pressed='true'] .sug {
  color: inherit;
  opacity: 0.75;
}
.state {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
}
.state .block {
  flex-basis: 100%;
}
.linkish {
  all: unset;
  cursor: pointer;
  color: var(--known);
}
.linkish:disabled {
  cursor: default;
  opacity: 0.6;
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px 20px;
  align-items: start;
}
.charts {
  order: -1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
@container (min-width: 660px) {
  .cols {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  }
  .charts {
    order: 0;
  }
}
.group {
  margin: 0 0 12px;
}
.group:last-child {
  margin-bottom: 0;
}
.group h3 {
  font-size: 12px;
  color: var(--muted-foreground);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 500;
  margin: 0 0 6px;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0 8px;
}
.tally {
  text-transform: none;
  letter-spacing: 0;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--background);
}
li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 0 10px;
  padding: 6px 10px;
  line-height: 1.4;
  border-bottom: 1px solid var(--border);
  align-items: start;
}
li:last-child {
  border-bottom: 0;
}
.ic {
  width: 20px;
  height: 20px;
  border-radius: 99px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  margin-top: 1px;
}
.ct {
  font-weight: 500;
  overflow-wrap: anywhere;
}
.ev {
  grid-column: 2 / 4;
  font-size: 12.5px;
  color: var(--muted-foreground);
}
.st {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 99px;
  white-space: nowrap;
}
.pass {
  color: var(--new);
  background: var(--new-bg);
}
.fail {
  color: var(--nova);
  background: var(--nova-bg);
}
.skip {
  color: var(--low);
  background: var(--low-bg);
}
.links {
  display: flex;
  gap: 8px 16px;
  flex-wrap: wrap;
  align-items: center;
  font-size: 13px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.links a {
  color: var(--known);
}
.links a:hover {
  text-decoration: underline;
}
</style>
