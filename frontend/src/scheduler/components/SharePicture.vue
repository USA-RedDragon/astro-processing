<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import type { Share } from '../api/binaries'
import { absoluteUrl, downloadUrl } from '../binaries'
import { showToast } from '../shell'

const props = defineProps<{
  share: Share | null
  title: string
  loading?: boolean
  error?: string
}>()

const open = ref(false)

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') open.value = false
}

watch(open, (on) => {
  if (typeof window === 'undefined') return
  if (on) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
})

async function sendLink() {
  const s = props.share
  if (!s?.url) return
  const url = absoluteUrl(s.url, window.location.origin)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, title: props.title })
      return
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    showToast({ text: 'Picture link copied', sub: url, tone: 'ok' })
  } catch {
    showToast({ text: 'Copy is blocked here. Select the text instead.', sub: url, tone: 'warn' })
  }
}
</script>

<template>
  <div class="share">
    <template v-if="share?.state === 'ready' && share.url">
      <button type="button" class="thumb" :aria-label="`Open the picture of ${title} full size`" @click="open = true">
        <img :src="share.url" :alt="`Annotated picture of ${title}`" loading="lazy" />
      </button>
      <div class="acts">
        <a class="btn sm" :href="downloadUrl(share.url)" download>Download</a>
        <button type="button" class="btn sm" @click="sendLink">Share</button>
      </div>
      <p v-if="share.note" class="note">{{ share.note }}</p>
    </template>
    <p v-else-if="error" class="note bad" role="alert">The picture is not available: {{ error }}</p>
    <p v-else-if="share" class="note" :class="{ bad: share.state === 'failed' }">
      {{ share.note || (share.state === 'pending' ? 'The picture is being made.' : 'No picture yet.') }}
    </p>
    <p v-else-if="loading" class="note" role="status">Loading the picture.</p>

    <div v-if="open && share?.url" class="overlay">
      <div class="scrim" aria-hidden="true" @click="open = false"></div>
      <div role="dialog" aria-modal="true" :aria-label="`Picture of ${title}`" class="dialog full">
        <div class="spread">
          <h2>{{ title }}</h2>
          <button type="button" class="btn sm ghost" @click="open = false">Close</button>
        </div>
        <img :src="share.url" :alt="`Annotated picture of ${title}`" />
        <div class="acts">
          <a class="btn sm" :href="downloadUrl(share.url)" download>Download</a>
          <button type="button" class="btn sm" @click="sendLink">Share</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.share {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.thumb {
  all: unset;
  cursor: zoom-in;
  display: block;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--muted);
  max-width: 100%;
}
.thumb:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
.thumb img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: 10rem;
  object-fit: cover;
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.note {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}
.note.bad {
  color: var(--bad);
}
.dialog.full {
  width: min(64rem, 100%);
}
.dialog.full img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}
</style>
