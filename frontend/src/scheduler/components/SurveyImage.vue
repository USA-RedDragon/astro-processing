<script setup lang="ts">
import { ref } from 'vue'
import { useCutout } from '../cutout'

const props = withDefaults(
  defineProps<{
    ra: number
    dec: number
    fov: number
    rotation?: number
    width: number
    height: number
    pixels?: number
    fit?: string
    opacity?: number
  }>(),
  { rotation: 0, pixels: 2, fit: 'none', opacity: 1 },
)

const el = ref<Element | null>(null)
const { url, state } = useCutout(
  () => ({
    ra: props.ra,
    dec: props.dec,
    fov: props.fov,
    rotation: props.rotation,
    width: props.width * props.pixels,
    height: props.height * props.pixels,
  }),
  el,
)
</script>

<template>
  <g ref="el">
    <rect x="0" y="0" :width="width" :height="height" fill="none" />
    <image
      v-if="state === 'ready' && url"
      :href="url"
      x="0"
      y="0"
      :width="width"
      :height="height"
      :preserveAspectRatio="fit"
      :opacity="opacity"
    />
    <text
      v-else-if="state !== 'idle'"
      :x="width / 2"
      :y="height / 2 + 4"
      text-anchor="middle"
      font-size="12"
      fill="#c8c8d0"
    >
      {{
        state === 'failed'
          ? 'No sky survey image right now'
          : state === 'limited'
            ? 'Waiting for the sky survey'
            : 'Loading the sky image…'
      }}
    </text>
  </g>
</template>
