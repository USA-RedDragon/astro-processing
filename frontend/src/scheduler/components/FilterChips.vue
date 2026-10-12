<script setup lang="ts">
import { filterColor } from '../api/planning'
import { hasFilter, type FilterGroup } from '../filters'

defineProps<{
  groups: FilterGroup[]
  selected: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{ toggle: [name: string] }>()
</script>

<template>
  <div v-for="g in groups" :key="g.label">
    <p class="group-label">{{ g.label }}</p>
    <div class="chips" role="group" :aria-label="g.label + ' filters'">
      <button
        v-for="f in g.filters"
        :key="f.name"
        type="button"
        class="chip"
        :aria-pressed="hasFilter(selected, f.name)"
        :disabled="disabled"
        :style="{ '--c': filterColor(f.name) }"
        @click="emit('toggle', f.name)"
      >
        <span class="dot" />{{ f.name
        }}<svg
          class="tick"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12l5 5 9-10" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.group-label {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin: 0 0 0.375rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  height: 2.25rem;
  padding: 0 0.875rem 0 0.625rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  font-size: 0.875rem;
  color: var(--muted-foreground);
}
.chip .dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
  background: var(--c);
  opacity: 0.35;
  flex: none;
}
.chip .tick {
  display: none;
  width: 0.875rem;
  height: 0.875rem;
  flex: none;
}
.chip[aria-pressed='true'] {
  border-color: var(--foreground);
  background: var(--secondary);
  color: var(--foreground);
  font-weight: 600;
}
.chip[aria-pressed='true'] .dot {
  opacity: 1;
}
.chip[aria-pressed='true'] .tick {
  display: inline;
}
.chip:hover:not(:disabled) {
  border-color: var(--ring);
}
</style>
