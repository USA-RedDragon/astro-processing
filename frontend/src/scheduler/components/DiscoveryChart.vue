<script setup lang="ts">
import { computed } from 'vue'
import type { LightPoint } from '../api/discoveries'
import { chartOf } from '../discoveries'

const props = defineProps<{ light: LightPoint[] | null | undefined }>()

const chart = computed(() => chartOf(props.light))
</script>

<template>
  <figure v-if="chart" class="chart">
    <svg
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      role="img"
      :aria-label="`${chart.axisLabel}, ${chart.points.length} subs measured`"
    >
      <line
        :x1="chart.left"
        :y1="chart.bottom"
        :x2="chart.right"
        :y2="chart.bottom"
        stroke="currentColor"
        stroke-opacity=".3"
      />
      <line
        :x1="chart.left"
        :y1="chart.top"
        :x2="chart.left"
        :y2="chart.bottom"
        stroke="currentColor"
        stroke-opacity=".3"
      />
      <line
        class="ref"
        :x1="chart.left"
        :y1="chart.refY"
        :x2="chart.right"
        :y2="chart.refY"
        stroke="currentColor"
        stroke-dasharray="4 4"
        stroke-opacity=".5"
      />
      <text :x="chart.right" :y="chart.refY - 4" font-size="10" text-anchor="end" fill="currentColor">
        reference
      </text>
      <text :x="chart.left - 4" :y="chart.top + 8" font-size="9" text-anchor="end" fill="currentColor">
        {{ chart.topLabel }}
      </text>
      <text :x="chart.left - 4" :y="chart.bottom" font-size="9" text-anchor="end" fill="currentColor">
        {{ chart.bottomLabel }}
      </text>
      <text :x="chart.left" :y="chart.height - 6" font-size="10" fill="currentColor">
        {{ chart.firstLabel }}
      </text>
      <text :x="chart.right" :y="chart.height - 6" font-size="10" text-anchor="end" fill="currentColor">
        {{ chart.lastLabel }}
      </text>
      <g v-for="(p, i) in chart.points" :key="i" class="pt" :style="{ color: p.colour }">
        <title>{{ p.title }}</title>
        <line
          v-if="p.hi - p.lo > 0.5"
          :x1="p.x"
          :y1="p.lo"
          :x2="p.x"
          :y2="p.hi"
          stroke="currentColor"
          stroke-opacity=".6"
        />
        <circle :cx="p.x" :cy="p.y" r="2.75" fill="currentColor" />
      </g>
    </svg>
    <figcaption>
      {{ chart.axisLabel }}.
      <span v-for="f in chart.filters" :key="f.name" class="key">
        <i :style="{ background: f.colour }" aria-hidden="true" />{{ f.name }}
      </span>
    </figcaption>
  </figure>
</template>

<style scoped>
.chart {
  margin: 0;
}
.chart svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.chart text {
  font-variant-numeric: tabular-nums;
}
figcaption {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.key {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.key i {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  display: inline-block;
}
</style>
