<script setup lang="ts">
import { computed } from 'vue'
import { collabPill } from '@/scheduler/api/collab'
import { shell } from '@/scheduler/shell'

const pill = computed(() => collabPill(shell.collab))
const tones = {
  info: { bg: 'var(--info-bg)', fg: 'var(--info)' },
  warn: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
  bad: { bg: 'var(--bad-bg)', fg: 'var(--bad)' },
  muted: { bg: 'transparent', fg: 'var(--muted-foreground)' },
}
</script>

<template>
  <RouterLink
    v-if="pill"
    to="/collabs"
    class="collab-pill"
    :title="pill.label"
    :aria-label="pill.label + '. Open the Collabs page'"
    :style="{ background: tones[pill.tone].bg, color: tones[pill.tone].fg }"
  >
    <span class="short" aria-hidden="true">{{ pill.short }}</span>
    <span class="label">{{ pill.label }}</span>
  </RouterLink>
</template>

<style scoped>
.collab-pill {
  display: inline-flex;
  align-items: center;
  height: 2rem;
  padding: 0 0.625rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}
.label {
  display: none;
}
@media (min-width: 1280px) {
  .short {
    display: none;
  }
  .label {
    display: inline;
  }
}
</style>
