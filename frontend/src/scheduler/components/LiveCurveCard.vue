<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getDipper, type DipWindow, type LiveCurve } from '../api/binaries'
import { latestOnly } from '../latest'
import { hm } from '../format'
import {
  bandPath,
  binLegend,
  binTitle,
  chartOf,
  compPath,
  darkSpan,
  dipFacts,
  eclipseFacts,
  expectedPath,
  findHash,
  lowSpan,
  nextWindow,
  pillFor,
  storedText,
  subline,
  titleParts,
  whyText,
  xTicks,
  yTicks,
} from '../liveCurve'

const props = withDefaults(
  defineProps<{ live: LiveCurve; now: number; plannedEnd?: number | null }>(),
  { plannedEnd: null },
)
const clipId = 'lc-clip-' + useId()

const wrap = ref<HTMLElement | null>(null)
const width = ref(640)
let ro: ResizeObserver | undefined

function measure() {
  const w = wrap.value?.clientWidth
  if (w && w > 0) width.value = Math.round(w)
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && wrap.value) {
    ro = new ResizeObserver(measure)
    ro.observe(wrap.value)
  }
})
onUnmounted(() => {
  ro?.disconnect()
  windowsReq.cancel()
})

const pill = computed(() => pillFor(props.live.state, !!props.live.stored))
const chart = computed(() => chartOf(props.live, props.now, width.value))
const box = computed(() => chart.value.box)
const windows = ref<DipWindow[] | null>(null)
const windowsReq = latestOnly()

async function loadWindows() {
  const current = windowsReq.next()
  windows.value = null
  if (!props.live.stored || props.live.kind !== 'dip-watch') return
  const r = await getDipper(props.live.source_id).catch(() => null)
  if (current() && r) windows.value = r.windows
}

watch(() => [props.live.stored, props.live.kind, props.live.source_id] as const, loadWindows, {
  immediate: true,
})

const facts = computed(() =>
  props.live.kind === 'dip-watch'
    ? dipFacts(props.live, props.now, nextWindow(props.live, windows.value, props.now))
    : eclipseFacts(props.live, props.plannedEnd),
)
const head = computed(() => titleParts(props.live))
const starLink = computed(() => ({
  name: 'discoveries-mine',
  hash: findHash(props.live.source_id),
}))
const timingsLink = computed(() => ({
  name: 'discovery-timings',
  params: { id: String(props.live.source_id) },
}))
const points = computed(() =>
  (props.live.points ?? []).map((p) => {
    const x = chart.value.sx(new Date(p.time).getTime())
    return {
      id: p.frame_id,
      x,
      y: chart.value.sy(p.mag),
      y0: chart.value.sy(p.mag - p.err),
      y1: chart.value.sy(p.mag + p.err),
    }
  }),
)
const bins = computed(() =>
  (props.live.dip?.bins ?? []).map((b) => {
    const x = chart.value.sx(new Date(b.time).getTime())
    return {
      key: b.time,
      title: binTitle(b),
      x,
      y: chart.value.sy(b.mag),
      y0: chart.value.sy(b.mag - b.err),
      y1: chart.value.sy(b.mag + b.err),
    }
  }),
)
const low = computed(() => lowSpan(props.live, chart.value))
const dark = computed(() => darkSpan(props.live, chart.value))
const nowX = computed(() => {
  if (props.live.stored) return null
  const c = chart.value
  return props.now >= c.x0 && props.now <= c.x1 ? c.sx(props.now) : null
})
const midX = computed(() =>
  props.live.eclipse ? chart.value.sx(new Date(props.live.eclipse.mid).getTime()) : null,
)
const win = computed(() => {
  const d = props.live.dip
  if (!d) return null
  const c = chart.value
  const x0 = Math.max(c.box.l, c.sx(new Date(d.start).getTime()))
  const x1 = Math.min(c.box.r, c.sx(new Date(d.end).getTime()))
  return { x: x0, w: x1 - x0, y: c.sy(d.depth_low), h: c.sy(d.depth_high) - c.sy(d.depth_low) }
})
const why = computed(() => whyText(props.live))
const label = computed(() =>
  props.live.kind === 'dip-watch'
    ? `Brightness of ${props.live.name} against time with the dip window`
    : `Brightness of ${props.live.name} against time with the expected eclipse curve`,
)
</script>

<template>
  <section aria-labelledby="live-h" class="card live">
    <div class="head">
      <h2 id="live-h">
        {{ head.lead }} <RouterLink :to="starLink" class="star">{{ head.star }}</RouterLink
        >{{ head.field }}{{ head.when }}
      </h2>
      <span class="badge" :class="pill.tone">{{ pill.label }}</span>
    </div>
    <p v-if="live.kind === 'eclipse'" class="small sub links">
      <RouterLink :to="timingsLink">Eclipse timings</RouterLink>
    </p>
    <p v-if="live.stored" class="small sub">{{ storedText(live) }}</p>
    <p class="small muted sub">{{ subline(live, now) }}</p>
    <p v-if="why" class="small sub">{{ why }}</p>
    <div ref="wrap" class="chart">
      <div class="xsmall muted">Change in brightness, mag, fainter down</div>
      <svg
        :viewBox="`0 0 ${box.w} ${box.h}`"
        :width="box.w"
        :height="box.h"
        role="img"
        :aria-label="label"
      >
        <defs>
          <clipPath :id="clipId">
            <rect :x="box.l" :y="0" :width="box.r - box.l" :height="box.h" />
          </clipPath>
        </defs>
        <template v-if="dark">
          <rect :x="dark.x" :y="box.t" :width="dark.w" :height="box.b - box.t" class="darkspan" />
          <text :x="dark.tx" :y="box.t + 24" :text-anchor="dark.anchor">{{ dark.label }}</text>
        </template>
        <g v-for="v in yTicks(chart)" :key="'y' + v">
          <line :x1="box.l" :x2="box.r" :y1="chart.sy(v)" :y2="chart.sy(v)" class="grid" />
          <text :x="box.l - 6" :y="chart.sy(v) + 4" text-anchor="end">
            {{ (v > 0 ? '+' : '') + v.toFixed(1) }}
          </text>
        </g>
        <text
          v-for="t in xTicks(chart)"
          :key="'x' + t"
          class="xt"
          :x="chart.sx(t)"
          :y="box.b + 16"
          text-anchor="middle"
        >
          {{ hm(t) }}
        </text>
        <template v-if="win">
          <rect :x="win.x" :y="box.t" :width="win.w" :height="box.b - box.t" class="window" />
          <rect :x="win.x" :y="win.y" :width="win.w" :height="win.h" class="band" />
          <text :x="win.x + 4" :y="win.y + win.h - 4">past dips fell in here</text>
        </template>
        <template v-if="low">
          <rect :x="low.x" :y="box.t" :width="low.w" :height="box.b - box.t" class="low" />
          <text :x="low.tx" :y="box.t + 10" :text-anchor="low.anchor">
            star below the height limit
          </text>
        </template>
        <line
          v-if="live.dip"
          :x1="box.l"
          :x2="box.r"
          :y1="chart.sy(0)"
          :y2="chart.sy(0)"
          class="expect"
        />
        <template v-if="live.eclipse">
          <path :d="bandPath(live, chart)" class="band" :clip-path="`url(#${clipId})`" />
          <path
            :d="expectedPath(live, chart)"
            class="expect"
            fill="none"
            :clip-path="`url(#${clipId})`"
          />
          <template v-if="midX !== null">
            <line :x1="midX" :x2="midX" :y1="box.t" :y2="box.b" class="mid" />
            <text :x="midX + 4" :y="box.t + 10">expected middle</text>
          </template>
        </template>
        <path v-if="points.length > 1" :d="compPath(live, chart)" class="comp" fill="none" />
        <g v-for="p in points" :key="p.id">
          <line :x1="p.x" :x2="p.x" :y1="p.y0" :y2="p.y1" class="err" />
          <circle :cx="p.x" :cy="p.y" r="3" class="pt" />
        </g>
        <g v-for="b in bins" :key="'b' + b.key">
          <line :x1="b.x" :x2="b.x" :y1="b.y0" :y2="b.y1" class="bin-err" />
          <rect :x="b.x - 5" :y="b.y - 5" width="10" height="10" class="bin">
            <title>{{ b.title }}</title>
          </rect>
        </g>
        <template v-if="nowX !== null">
          <line :x1="nowX" :x2="nowX" :y1="box.t" :y2="box.b" class="now" />
          <text :x="nowX + 4" :y="box.b - 6" class="now-t">now {{ hm(now) }}</text>
        </template>
      </svg>
    </div>
    <p v-if="!points.length" class="small muted sub">
      Not measured yet. Each sub shows here a minute or two after it is registered.
    </p>
    <div class="legend xsmall muted">
      <template v-if="live.eclipse">
        <span
          ><i class="sw" style="background: var(--lc-expect)"></i>Expected, from
          {{ live.eclipse.basis || 'the surveys' }}</span
        >
        <span
          ><i class="sw" style="background: var(--lc-band)"></i>Where the timing error allows
          it</span
        >
      </template>
      <template v-else-if="live.dip">
        <span
          ><i class="sw" style="background: var(--lc-window)"></i>Window where a dip can come</span
        >
        <span
          ><i class="sw" style="background: var(--lc-band)"></i>Depths seen before,
          {{ live.dip.depth_low.toFixed(2) }} to {{ live.dip.depth_high.toFixed(2) }} mag</span
        >
        <span><i class="sw line" style="background: var(--lc-expect)"></i>Normal level</span>
      </template>
      <span
        ><i class="sw dot" style="background: var(--lc-point)"></i>Your subs{{
          live.filter ? ' in ' + live.filter : ''
        }}</span
      >
      <span v-if="bins.length"
        ><i class="sw" style="background: var(--lc-bin)"></i>{{ binLegend(live) }}</span
      >
      <span v-if="dark"
        ><i class="sw" style="background: var(--lc-dark)"></i>Dark and high enough for the
        planner</span
      >
      <span v-if="low"
        ><i class="sw" style="background: var(--lc-low)"></i>Star below the planner's height
        limit</span
      >
      <span
        ><i class="sw line" style="background: var(--lc-comp)"></i>Nearby stars together, already
        taken out of your subs</span
      >
    </div>
    <p v-if="live.other_subs" class="xsmall muted sub">
      {{ live.other_subs }} {{ live.other_subs === 1 ? 'sub' : 'subs' }} in other filters left off
      the chart.
    </p>
    <div v-if="facts.length" class="lfacts">
      <div v-for="f in facts" :key="f.label" class="lfact">
        <span class="xsmall muted">{{ f.label }}</span>
        <b class="num">{{ f.value }}</b>
        <span v-if="f.note" class="xsmall muted">{{ f.note }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.live {
  flex: 1 1 100%;
  gap: 0.75rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: baseline;
}
.head h2 {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.links a,
.head h2 .star {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.sub {
  margin: 0;
}
.chart {
  width: 100%;
  overflow-x: auto;
}
.chart svg {
  display: block;
  max-width: none;
}
.chart text {
  font-size: 11px;
  fill: var(--muted-foreground);
}
.grid {
  stroke: var(--border);
  stroke-width: 1;
}
.band {
  fill: var(--lc-band);
}
.window {
  fill: var(--lc-window);
}
.darkspan {
  fill: var(--lc-dark);
}
.low {
  fill: var(--lc-low);
}
.expect {
  stroke: var(--lc-expect);
  stroke-width: 2;
}
.mid {
  stroke: var(--lc-expect);
  stroke-dasharray: 3 4;
  stroke-width: 1;
}
.comp {
  stroke: var(--lc-comp);
  stroke-width: 1.5;
}
.err {
  stroke: var(--lc-point);
  stroke-opacity: 0.35;
  stroke-width: 1;
}
.pt {
  fill: var(--lc-point);
}
.bin {
  fill: var(--lc-bin);
  stroke: var(--lc-point);
  stroke-width: 1;
}
.bin-err {
  stroke: var(--lc-bin);
  stroke-width: 2.5;
}
.now {
  stroke: var(--lc-now);
  stroke-width: 1.5;
}
.chart text.now-t {
  fill: var(--lc-now);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.875rem;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.sw {
  width: 18px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}
.sw.line {
  height: 2px;
}
.sw.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.lfacts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr));
  gap: 0.625rem;
}
.lfact {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  display: grid;
  gap: 0.125rem;
}
.lfact b {
  font-weight: 600;
}
</style>
