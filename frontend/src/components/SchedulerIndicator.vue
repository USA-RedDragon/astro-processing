<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import StatusPopover from '@/components/StatusPopover.vue'
import { indicator, shell } from '@/scheduler/shell'

const ind = computed(indicator)
</script>

<template>
  <div class="relative inline-flex">
    <button
      type="button"
      class="status-btn tabular-nums"
      aria-haspopup="dialog"
      :aria-label="ind.label"
      :aria-expanded="shell.statusOpen ? 'true' : 'false'"
      :title="ind.label"
      :style="{ background: ind.bg, color: ind.tone }"
      @click.stop="shell.statusOpen = !shell.statusOpen"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <circle cx="4" cy="4" r="4" :fill="ind.dot" />
      </svg>
      <span class="label">{{ ind.label }}</span>
      <ChevronDown class="size-3" aria-hidden="true" />
    </button>
    <StatusPopover v-if="shell.statusOpen" @click.stop />
  </div>
</template>

<style scoped>
.status-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 2rem;
  padding: 0 0.625rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.label {
  display: none;
}
@media (min-width: 1280px) {
  .label {
    display: inline;
  }
}
</style>
