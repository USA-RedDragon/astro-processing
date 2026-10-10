<script setup lang="ts">
import { useCutout } from '../cutout'

const props = defineProps<{ ra: number; dec: number; fov: number; width: number; height: number }>()
const { url, state } = useCutout(() =>
  props.fov > 30
    ? null
    : { ra: props.ra, dec: props.dec, fov: props.fov, width: props.width, height: props.height },
)
</script>

<template>
  <image
    v-if="state === 'ready'"
    :href="url"
    x="0"
    y="0"
    :width="width"
    :height="height"
    opacity="0.8"
  />
</template>
