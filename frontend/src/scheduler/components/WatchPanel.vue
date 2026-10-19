<script setup lang="ts">
import { computed } from 'vue'
import type { DiscoveryWatch, Vetting } from '../api/discoveries'
import { shortNight } from '../discoveryInbox'
import {
  askedText,
  confidenceText,
  fadeShare,
  fadeText,
  gotText,
  imagingText,
  resultText,
} from '../watching'

const props = defineProps<{
  watch: DiscoveryWatch
  object: string
  busy: boolean
  stopping: boolean
  error: string
}>()

const emit = defineEmits<{
  vet: [state: Vetting]
  stop: []
}>()

const share = computed(() => fadeShare(props.watch))
const stopped = computed(() => imagingText(props.watch))
</script>

<template>
  <section class="watch" aria-labelledby="watch-title">
    <div class="head">
      <h3 id="watch-title">Watching for more fades</h3>
      <span class="pill watching">{{ confidenceText(watch) }}</span>
    </div>
    <p class="callout small">
      The vet thinks this star dims now and then, but has too few fades to be sure. The app keeps
      looking and moves it when the evidence settles.
    </p>

    <div class="grid2">
      <div class="box">
        <div class="eyebrow">Moves to Needs a look when</div>
        <ul class="plain small">
          <li>2 more fade nights show up in your frames or a survey, with nearby stars steady</li>
          <li>or a survey re-check raises the vet to medium or high</li>
        </ul>
        <div class="small dim">{{ fadeText(watch) }}</div>
        <div
          v-if="share !== null"
          class="meter"
          role="img"
          :aria-label="`${watch.fade_nights} of ${watch.fade_nights_needed} fade nights`"
        >
          <span :style="{ width: `${Math.round(share * 100)}%` }"></span>
        </div>
      </div>
      <div class="box">
        <div class="eyebrow">Moves to Likely artifacts when</div>
        <ul class="plain small">
          <li>a re-check finds the fades shared by nearby stars, a blend, or a bad night</li>
        </ul>
        <div class="eyebrow">Stops asking for imaging when</div>
        <ul class="plain small">
          <li>90 days pass with no new fade; it stays here until you mark it</li>
        </ul>
      </div>
    </div>

    <div class="box">
      <div class="eyebrow">Imaging asked for</div>
      <p class="small dim">
        {{ watch.nights_planned }} nights over the next 3 weeks, 60 minutes each in the filter group
        it was found in. Gaps only: these requests yield to your normal targets and to eclipse
        windows, so they cost no planned time.
      </p>
      <p v-if="stopped" class="small">{{ stopped }}</p>
      <div v-if="watch.nights.length" class="tbl">
        <table>
          <thead>
            <tr>
              <th>Night</th>
              <th>Asked</th>
              <th>Got</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in watch.nights" :key="n.night">
              <td>{{ shortNight(n.night) }}</td>
              <td class="mono">{{ askedText(n) }}</td>
              <td class="mono">{{ gotText(n) }}</td>
              <td>
                <span v-if="n.result" class="pill" :class="n.result">{{ resultText(n) }}</span>
                <span v-else class="small" :class="n.state === 'failed' ? 'bad' : 'dim'">{{
                  resultText(n)
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="small dim">No nights asked for yet.</p>
      <div class="small dim">
        Plus every frame of {{ object }} from your normal imaging, and the weekly ZTF, ATLAS and
        TESS re-check.
      </div>
    </div>

    <p v-if="error" class="small bad" role="alert">That did not work: {{ error }}</p>
    <div class="btns">
      <button type="button" class="btn sm" :disabled="busy" @click="emit('vet', 'real')">
        Mark real
      </button>
      <button type="button" class="btn sm" :disabled="busy" @click="emit('vet', 'artifact')">
        Mark artifact
      </button>
      <button
        v-if="watch.imaging === 'asking'"
        type="button"
        class="btn sm"
        :disabled="stopping"
        @click="emit('stop')"
      >
        Stop asking for imaging
      </button>
    </div>
  </section>
</template>

<style scoped>
.watch {
  --watch: oklch(0.5 0.15 230);
  --watch-bg: oklch(0.62 0.13 230 / 0.15);
  --steady: oklch(0.5 0.13 155);
  --steady-bg: oklch(0.696 0.17 162.48 / 0.15);
  --faded: oklch(0.56 0.14 65);
  --faded-bg: oklch(0.769 0.188 70.08 / 0.14);
  display: grid;
  gap: 12px;
  margin-top: 12px;
}
.dark .watch {
  --watch: oklch(0.76 0.12 230);
  --steady: oklch(0.696 0.17 162.48);
  --faded: oklch(0.769 0.188 70.08);
}
.head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
}
h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.callout {
  border-left: 3px solid var(--watch);
  padding: 4px 0 4px 12px;
  margin: 0;
  color: var(--muted-foreground);
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.box {
  background: var(--d-card, var(--card));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  display: grid;
  gap: 8px;
  align-content: start;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  font-weight: 600;
}
ul.plain {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
}
.meter {
  height: 8px;
  border-radius: 999px;
  background: var(--muted);
  overflow: hidden;
}
.meter > span {
  display: block;
  height: 100%;
  background: var(--watch);
}
.tbl {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
th,
td {
  text-align: left;
  padding: 6px 8px;
  border-top: 1px solid var(--border);
}
th {
  font-weight: 600;
  color: var(--muted-foreground);
  font-size: 12px;
  border-top: 0;
}
.mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.pill {
  font-size: 12px;
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 600;
  white-space: nowrap;
}
.pill.watching {
  color: var(--watch);
  background: var(--watch-bg);
}
.pill.steady {
  color: var(--steady);
  background: var(--steady-bg);
}
.pill.faded {
  color: var(--faded);
  background: var(--faded-bg);
}
.small {
  font-size: 12px;
}
.dim {
  color: var(--muted-foreground);
}
.bad {
  color: var(--bad);
}
p {
  margin: 0;
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
