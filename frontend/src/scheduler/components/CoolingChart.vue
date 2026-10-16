<script setup lang="ts">
import type { ChartBox, CoolChart } from '../nowcalib'

defineProps<{ chart: CoolChart; box: ChartBox }>()
</script>

<template>
  <svg viewBox="0 0 600 206" role="img" :aria-label="chart.label" class="cool-chart">
    <template v-for="(tk, i) in chart.yTicks" :key="'y' + i">
      <line
        :x1="box.x0"
        :x2="box.x1"
        :y1="tk.pos"
        :y2="tk.pos"
        stroke="var(--border)"
        :stroke-dasharray="i === chart.yTicks.length - 1 ? undefined : '3 4'"
      />
      <text
        :x="box.x0 - 6"
        :y="tk.pos + 4"
        text-anchor="end"
        font-size="11"
        fill="var(--muted-foreground)"
      >
        {{ tk.label }}
      </text>
    </template>
    <text
      v-for="tk in chart.xTicks"
      :key="'x' + tk.pos"
      :x="tk.pos"
      y="198"
      text-anchor="middle"
      font-size="11"
      fill="var(--muted-foreground)"
    >
      {{ tk.label }}
    </text>
    <template v-if="chart.target">
      <line
        :x1="box.x0"
        :x2="box.x1"
        :y1="chart.target.y"
        :y2="chart.target.y"
        stroke="var(--info)"
        stroke-dasharray="6 4"
      />
      <text :x="box.x0 + 6" :y="chart.target.y - 6" font-size="11" fill="var(--info)">
        {{ chart.target.label }}
      </text>
    </template>
    <path
      v-if="chart.setpoint"
      :d="chart.setpoint"
      fill="none"
      stroke="var(--muted-foreground)"
      stroke-width="1.5"
      stroke-dasharray="4 4"
    />
    <path
      v-if="chart.ramp"
      :d="chart.ramp"
      fill="none"
      stroke="var(--muted-foreground)"
      stroke-width="1.5"
      stroke-dasharray="4 4"
    />
    <path :d="chart.area" fill="var(--info-bg)" stroke="none" />
    <path :d="chart.sensor" fill="none" stroke="var(--foreground)" stroke-width="2.25" />
    <template v-if="chart.now">
      <line
        :x1="chart.now.x"
        :x2="chart.now.x"
        :y1="box.yTop"
        :y2="box.yBottom"
        stroke="var(--foreground)"
        stroke-dasharray="2 3"
        opacity="0.5"
      />
      <circle :cx="chart.now.x" :cy="chart.now.y" r="4" fill="var(--foreground)" />
      <text
        :x="chart.now.x + (chart.now.x > box.x1 - 90 ? -8 : 8)"
        :y="chart.now.y - 6"
        :text-anchor="chart.now.x > box.x1 - 90 ? 'end' : 'start'"
        font-size="11"
        font-weight="600"
        fill="var(--foreground)"
      >
        {{ chart.now.label }}
      </text>
    </template>
    <template v-if="chart.end">
      <circle :cx="chart.end.x" :cy="chart.end.y" r="3.5" fill="var(--info)" />
      <text
        :x="chart.end.x"
        :y="chart.end.y + 18"
        text-anchor="end"
        font-size="11"
        fill="var(--info)"
      >
        {{ chart.end.label }}
      </text>
    </template>
  </svg>
</template>

<style scoped>
.cool-chart {
  width: 100%;
  height: auto;
  display: block;
}
</style>
