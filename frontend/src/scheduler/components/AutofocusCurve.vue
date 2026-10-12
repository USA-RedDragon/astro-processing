<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CHART_FONT, curveChart, type AfView } from '../autofocus'

const props = defineProps<{ view: AfView; label: string }>()

const wrap = ref<HTMLElement | null>(null)
const width = ref(640)
let ro: ResizeObserver | undefined

function measure() {
  const w = wrap.value?.clientWidth
  if (w && w > 0) width.value = Math.max(280, Math.round(w))
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && wrap.value) {
    ro = new ResizeObserver(measure)
    ro.observe(wrap.value)
  }
})
onUnmounted(() => ro?.disconnect())

const c = computed(() => curveChart(props.view, width.value))
</script>

<template>
  <div ref="wrap" class="af-curve">
    <svg
      :viewBox="`0 0 ${c.width} ${c.height}`"
      :width="c.width"
      :height="c.height"
      role="img"
      :aria-label="label"
      class="af-svg"
    >
      <template v-for="(t, i) in c.yTicks" :key="'y' + i">
        <line :x1="c.box.l" :x2="c.box.r" :y1="t.pos" :y2="t.pos" stroke="var(--border)" stroke-width="1" />
        <text :x="c.box.l - 8" :y="t.pos + 4" text-anchor="end" :font-size="CHART_FONT" fill="var(--muted-foreground)">
          {{ t.label }}
        </text>
      </template>
      <text
        v-for="t in c.xTicks"
        :key="'x' + t.label"
        :x="t.pos"
        :y="c.xTickY"
        text-anchor="middle"
        :font-size="CHART_FONT"
        fill="var(--muted-foreground)"
      >
        {{ t.label }}
      </text>
      <text :x="c.yTitle.x" :y="c.yTitle.y" :font-size="CHART_FONT" fill="var(--muted-foreground)">HFR</text>
      <text :x="c.xTitle.x" :y="c.xTitle.y" text-anchor="end" :font-size="CHART_FONT" fill="var(--muted-foreground)">
        focuser position
      </text>
      <line
        v-if="c.start"
        :x1="c.start.x"
        :x2="c.start.x"
        :y1="c.box.t"
        :y2="c.box.b"
        stroke="var(--muted-foreground)"
        stroke-width="1"
        stroke-dasharray="3 4"
      />
      <path
        v-if="c.path"
        :d="c.path"
        fill="none"
        stroke="var(--info)"
        stroke-width="2"
        :stroke-dasharray="c.dashed ? '6 5' : undefined"
      />
      <template v-if="c.marker">
        <line
          v-if="c.marker.filled"
          :x1="c.marker.x"
          :x2="c.marker.x"
          :y1="c.marker.y"
          :y2="c.box.b"
          stroke="var(--warn)"
          stroke-width="1.5"
        />
        <rect
          :x="c.marker.x - 6"
          :y="c.marker.y - 6"
          width="12"
          height="12"
          :transform="`rotate(45 ${c.marker.x} ${c.marker.y})`"
          :fill="c.marker.filled ? 'var(--warn)' : 'none'"
          stroke="var(--warn)"
          stroke-width="2"
        />
        <text
          v-if="c.marker.label"
          :x="c.marker.lx"
          :y="c.marker.ly"
          :text-anchor="c.marker.anchor"
          :font-size="CHART_FONT"
          fill="var(--warn)"
        >
          {{ c.marker.label }}
        </text>
      </template>
      <circle
        v-for="(p, i) in c.points"
        :key="'p' + i"
        :cx="p.x"
        :cy="p.y"
        :r="p.latest ? 6 : 4.5"
        fill="var(--foreground)"
        stroke="var(--card)"
        stroke-width="1.5"
        :class="{ latest: p.latest }"
      />
    </svg>
  </div>
</template>

<style scoped>
.af-curve {
  width: 100%;
  min-width: 0;
}
.af-svg {
  display: block;
  width: 100%;
  height: auto;
  font-variant-numeric: tabular-nums;
}
</style>
