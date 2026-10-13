<script setup lang="ts">
import { ref } from 'vue'
import { snapFov, useCutout } from '../cutout'

const props = defineProps<{
  ra: number
  dec: number
  fov: number
  rotation?: number
  width?: number
  height?: number
  alt: string
}>()

const el = ref<Element | null>(null)
const { url, state } = useCutout(
  () => ({
    ra: props.ra,
    dec: props.dec,
    fov: snapFov(props.fov),
    rotation: props.rotation ?? 0,
    width: props.width ?? 320,
    height: props.height ?? 214,
  }),
  el,
)
</script>

<template>
  <figure ref="el" class="cutout" :style="{ aspectRatio: `${width ?? 320} / ${height ?? 214}` }">
    <img v-if="state === 'ready'" :src="url" :alt="alt" />
    <figcaption v-else class="xsmall muted">
      {{
        state === 'failed'
          ? 'The sky survey image is not available.'
          : state === 'limited'
            ? 'Waiting for the sky survey; the image fills in by itself.'
            : 'Loading the sky image…'
      }}
    </figcaption>
  </figure>
</template>

<style scoped>
.cutout {
  margin: 0;
  width: 100%;
  max-width: 20rem;
  border-radius: 0.5rem;
  background: var(--sky);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cutout img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cutout figcaption {
  padding: 0.75rem;
  text-align: center;
}
</style>
