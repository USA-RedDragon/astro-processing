<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CHART_FONT, driftChart, type AfRun } from '../autofocus'

const props = defineProps<{ runs: AfRun[]; selected?: string }>()
const emit = defineEmits<{ pick: [id: string] }>()

const wrap = ref<HTMLElement | null>(null)
const width = ref(640)
let ro: ResizeObserver | undefined

function measure() {
  const w = wrap.value?.clientWidth
  if (w && w > 0) width.value = Math.max(300, Math.round(w))
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && wrap.value) {
    ro = new ResizeObserver(measure)
    ro.observe(wrap.value)
  }
})
onUnmounted(() => ro?.disconnect())

const d = computed(() => driftChart(props.runs, width.value))
</script>

<template>
  <div ref="wrap" class="drift">
    <svg
      v-if="d"
      :viewBox="`0 0 ${d.width} ${d.height}`"
      :width="d.width"
      :height="d.height"
      role="img"
      :aria-label="`Chosen focus position and sensor temperature for ${d.posDots.length} runs`"
      class="drift-svg"
    >
      <template v-for="(t, i) in d.posTicks" :key="'p' + i">
        <line :x1="d.box.l" :x2="d.box.r" :y1="t.pos" :y2="t.pos" stroke="var(--border)" />
        <text :x="d.box.l - 8" :y="t.pos + 4" text-anchor="end" :font-size="CHART_FONT" fill="var(--info)">
          {{ t.label }}
        </text>
      </template>
      <text
        v-for="(t, i) in d.tempTicks"
        :key="'c' + i"
        :x="d.box.r + 8"
        :y="t.pos + 4"
        :font-size="CHART_FONT"
        fill="var(--warn)"
      >
        {{ t.label }}
      </text>
      <text
        v-for="t in d.timeTicks"
        :key="'t' + t.label"
        :x="t.pos"
        :y="d.height - 8"
        text-anchor="middle"
        :font-size="CHART_FONT"
        fill="var(--muted-foreground)"
      >
        {{ t.label }}
      </text>
      <path
        v-if="d.tempPath"
        :d="d.tempPath"
        fill="none"
        stroke="var(--warn)"
        stroke-width="1.5"
        stroke-dasharray="4 4"
      />
      <path :d="d.posPath" fill="none" stroke="var(--info)" stroke-width="2" />
      <circle
        v-for="p in d.tempDots"
        :key="'tc' + p.id"
        :cx="p.x"
        :cy="p.y"
        r="3"
        fill="var(--warn)"
      />
      <circle
        v-for="p in d.posDots"
        :key="'pc' + p.id"
        :cx="p.x"
        :cy="p.y"
        :r="p.id === selected ? 6 : 4.5"
        fill="var(--info)"
        :stroke="p.id === selected ? 'var(--foreground)' : 'var(--card)'"
        stroke-width="1.5"
        class="dot"
        @click="emit('pick', p.id)"
      />
    </svg>
  </div>
</template>

<style scoped>
.drift {
  width: 100%;
  min-width: 0;
}
.drift-svg {
  display: block;
  width: 100%;
  height: auto;
  font-variant-numeric: tabular-nums;
}
.dot {
  cursor: pointer;
}
</style>
