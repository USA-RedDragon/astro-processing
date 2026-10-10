<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCutout } from '../cutout'

const props = defineProps<{
  ra: number
  dec: number
  sizeDeg: number
  frame: { w: number; h: number } | null
  rotation?: number
  label: string
}>()

const W = 160
const H = 100
const el = ref<Element | null>(null)
const fov = computed(() =>
  Math.min(
    30,
    Math.max(0.1, 1.5 * Math.max(props.sizeDeg, props.frame?.w ?? 0, props.frame?.h ?? 0)),
  ),
)
const { url, state } = useCutout(
  () => ({ ra: props.ra, dec: props.dec, fov: fov.value, width: W, height: H }),
  el,
)
const box = computed(() => {
  const f = props.frame
  if (!f) return null
  const s = W / fov.value
  return { w: f.w * s, h: f.h * s }
})
</script>

<template>
  <svg ref="el" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="label" class="thumb">
    <rect x="0" y="0" :width="W" :height="H" fill="var(--sky)" />
    <image v-if="state === 'ready'" :href="url" x="0" y="0" :width="W" :height="H" />
    <text
      v-else-if="state === 'failed'"
      :x="W / 2"
      :y="H / 2 + 4"
      text-anchor="middle"
      font-size="11"
      fill="#c8c8d0"
    >
      No survey image
    </text>
    <text
      v-else-if="state === 'limited'"
      :x="W / 2"
      :y="H / 2 + 4"
      text-anchor="middle"
      font-size="11"
      fill="#c8c8d0"
    >
      Waiting for the survey
    </text>
    <rect
      v-if="box"
      :x="(W - box.w) / 2"
      :y="(H - box.h) / 2"
      :width="box.w"
      :height="box.h"
      fill="none"
      stroke="#f4f4f8"
      stroke-width="1.25"
      :transform="`rotate(${-(rotation ?? 0)} ${W / 2} ${H / 2})`"
    />
  </svg>
</template>

<style scoped>
.thumb {
  display: block;
  width: 6.5rem;
  height: auto;
  aspect-ratio: 8 / 5;
  border-radius: 0.25rem;
}
</style>
