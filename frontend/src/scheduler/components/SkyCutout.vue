<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { API_BASE, query } from '../api/client'

const props = defineProps<{
  ra: number
  dec: number
  fov: number
  rotation?: number
  width?: number
  height?: number
  alt: string
}>()

const url = ref('')
const state = ref<'loading' | 'ready' | 'limited' | 'failed'>('loading')
const retryAfter = ref(0)
let ctrl: AbortController | undefined

async function load() {
  ctrl?.abort()
  ctrl = new AbortController()
  state.value = 'loading'
  const src =
    API_BASE +
    '/sky/cutout' +
    query({
      ra: props.ra,
      dec: props.dec,
      fov: props.fov,
      rotation: props.rotation ?? 0,
      width: props.width ?? 320,
      height: props.height ?? 214,
    })
  try {
    const res = await fetch(src, { signal: ctrl.signal })
    if (res.status === 429) {
      retryAfter.value = Number(res.headers.get('Retry-After')) || 0
      state.value = 'limited'
      return
    }
    if (!res.ok) {
      state.value = 'failed'
      return
    }
    const blob = await res.blob()
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = URL.createObjectURL(blob)
    state.value = 'ready'
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) state.value = 'failed'
  }
}

watch(() => [props.ra, props.dec, props.fov, props.rotation, props.width, props.height], load, {
  immediate: true,
})

onUnmounted(() => {
  ctrl?.abort()
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>

<template>
  <figure class="cutout" :style="{ aspectRatio: `${width ?? 320} / ${height ?? 214}` }">
    <img v-if="state === 'ready'" :src="url" :alt="alt" />
    <figcaption v-else class="xsmall muted">
      {{
        state === 'loading'
          ? 'Loading the sky image…'
          : state === 'limited'
            ? `The sky survey is rate-limiting requests${retryAfter ? `; try again in ${retryAfter} s` : ''}.`
            : 'The sky survey image is not available.'
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
