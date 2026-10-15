<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { VetChart } from '../api/discoveries'
import { PLOT, nearest, plotOf } from '../vetting'

const props = defineProps<{ chart: VetChart }>()

const plot = computed(() => (props.chart.empty ? null : plotOf(props.chart)))
const { W, H, L, R, T, B } = PLOT

const body = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const tipEl = ref<HTMLElement | null>(null)
const hover = ref(-1)
const tipPos = ref({ left: 0, top: 0 })

async function move(e: PointerEvent) {
  const p = plot.value
  const box = svg.value?.getBoundingClientRect()
  const host = body.value?.getBoundingClientRect()
  if (!p || !box || !host || !box.width || !box.height) return
  const px = ((e.clientX - box.left) / box.width) * W
  const py = ((e.clientY - box.top) / box.height) * H
  hover.value = nearest(p.points, px, py)
  if (hover.value < 0) return
  const pt = p.points[hover.value]!
  const x = box.left - host.left + (pt.cx / W) * box.width
  const y = box.top - host.top + (pt.cy / H) * box.height
  await nextTick()
  const w = tipEl.value?.offsetWidth ?? 0
  tipPos.value = {
    left: Math.min(Math.max(x - w / 2, 4), Math.max(4, host.width - w - 4)),
    top: y - 32,
  }
}

const shown = computed(() =>
  plot.value && hover.value >= 0 ? plot.value.points[hover.value] : null,
)
</script>

<template>
  <figure class="chart">
    <h3>{{ chart.title }}</h3>
    <p v-if="chart.sub" class="sub">{{ chart.sub }}</p>
    <div ref="body" class="body">
      <div v-if="!plot" class="none">{{ chart.empty || 'Not measured yet' }}</div>
      <template v-else>
        <svg
          ref="svg"
          :viewBox="`0 0 ${W} ${H}`"
          role="img"
          :aria-label="`${chart.title}: ${plot.points.length} points. ${chart.sub}`"
        >
          <g v-for="t in plot.yTicks" :key="`y${t.label}`">
            <line class="gr" :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" />
            <text class="tl" :x="L - 6" :y="t.y + 3" text-anchor="end">{{ t.label }}</text>
          </g>
          <g v-for="t in plot.xTicks" :key="`x${t.label}`">
            <line class="ax" :x1="t.x" :x2="t.x" :y1="H - B" :y2="H - B + 4" />
            <text class="tl" :x="t.x" :y="H - B + 15" text-anchor="middle">{{ t.label }}</text>
          </g>
          <line class="ax" :x1="L" :x2="W - R" :y1="H - B" :y2="H - B" />
          <text class="tl" :x="(L + W - R) / 2" :y="H - 2" text-anchor="middle">
            {{ plot.xLabel }}
          </text>
          <text
            class="tl"
            x="0"
            y="0"
            :transform="`translate(9 ${(T + H - B) / 2}) rotate(-90)`"
            text-anchor="middle"
          >
            {{ plot.yLabel }}
          </text>
          <line
            v-for="(r, i) in plot.refs"
            :key="`r${i}`"
            :class="r.style === 'fade' ? 'fade' : 'ref'"
            :x1="L"
            :x2="W - R"
            :y1="r.y"
            :y2="r.y"
          />
          <line
            v-if="plot.vref !== null"
            class="ref"
            :x1="plot.vref"
            :x2="plot.vref"
            :y1="T"
            :y2="H - B"
          />
          <template v-for="(p, i) in plot.points" :key="`e${i}`">
            <line v-if="p.e1 !== null" class="eb" :x1="p.cx" :x2="p.cx" :y1="p.e1" :y2="p.e2!" />
          </template>
          <path v-if="plot.path" class="md" :d="plot.path" />
          <circle
            v-for="(p, i) in plot.points"
            :key="`p${i}`"
            class="pt"
            :cx="p.cx"
            :cy="p.cy"
            :r="plot.r"
          />
          <circle v-if="shown" class="ring" :cx="shown.cx" :cy="shown.cy" :r="plot.r + 3" />
          <rect
            class="hit"
            :x="L"
            :y="T"
            :width="W - L - R"
            :height="H - T - B"
            @pointermove="move"
            @pointerleave="hover = -1"
          />
        </svg>
        <div
          ref="tipEl"
          class="tip"
          :hidden="!shown"
          :style="{ left: `${tipPos.left}px`, top: `${tipPos.top}px` }"
        >
          {{ shown?.tip }}
        </div>
      </template>
    </div>
    <div v-if="plot && chart.legend?.length" class="legend">
      <span v-for="l in chart.legend" :key="l.label"
        ><i :class="l.style === 'line' ? 'ln' : l.style" aria-hidden="true" />{{ l.label }}</span
      >
    </div>
  </figure>
</template>

<style scoped>
.chart {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--background);
  padding: 10px 12px;
  margin: 0;
  container-type: inline-size;
  min-width: 0;
}
h3 {
  font-size: 14px;
  margin: 0;
  font-weight: 600;
}
.sub {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0 0 6px;
}
.body {
  position: relative;
}
svg {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}
.ax {
  stroke: var(--muted-foreground);
  stroke-opacity: 0.45;
  stroke-width: 1;
}
.gr {
  stroke: var(--border);
  stroke-width: 1;
}
.tl {
  font-size: 10px;
  fill: var(--muted-foreground);
}
@container (max-width: 420px) {
  .tl {
    font-size: 13px;
  }
}
@container (max-width: 340px) {
  .tl {
    font-size: 15px;
  }
}
.pt {
  fill: var(--pt);
  stroke: var(--background);
  stroke-width: 1;
}
.eb {
  stroke: var(--pt);
  stroke-opacity: 0.5;
  stroke-width: 1;
}
.md {
  fill: none;
  stroke: var(--model);
  stroke-width: 2;
  stroke-linejoin: round;
}
.ref {
  stroke: var(--muted-foreground);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.fade {
  stroke: var(--nova);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}
.ring {
  fill: none;
  stroke: var(--foreground);
  stroke-width: 1.5;
  pointer-events: none;
}
.hit {
  fill: transparent;
  cursor: crosshair;
}
.tip {
  position: absolute;
  pointer-events: none;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  z-index: 2;
}
.legend {
  display: flex;
  gap: 4px 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 4px;
}
.legend i {
  display: inline-block;
  vertical-align: middle;
  margin-right: 5px;
}
.legend .dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--pt);
}
.legend .ln {
  width: 16px;
  border-top: 2px solid var(--model);
}
.legend .dash {
  width: 16px;
  border-top: 2px dashed var(--nova);
}
.none {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 18px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--muted-foreground);
}
</style>
