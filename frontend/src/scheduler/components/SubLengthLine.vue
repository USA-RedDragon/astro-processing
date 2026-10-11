<script setup lang="ts">
import { candidateText, seconds, type LengthView } from '../subLength'

defineProps<{ view: LengthView; label?: string }>()
</script>

<template>
  <div class="sublen" :data-state="view.state">
    <p class="small" style="margin: 0">
      <span v-if="label" style="font-weight: 600">{{ label }}: </span>
      <span :class="{ muted: view.state !== 'auto' }">{{ view.text }}</span>
    </p>
    <details v-if="view.parts.length || view.note" class="xsmall">
      <summary class="muted">Why these lengths</summary>
      <p v-if="view.note" class="muted" style="margin: 0.25rem 0 0">{{ view.note }}</p>
      <div v-for="p in view.parts" :key="p.bucket" class="part">
        <div>
          <span style="font-weight: 600">{{ p.bucket }} moon glare: {{ seconds(p.exposure) }}</span>
        </div>
        <p class="muted" style="margin: 0.125rem 0 0">{{ p.basis }}</p>
        <ul v-if="p.candidates.length" class="cands">
          <li
            v-for="c in p.candidates"
            :key="c.exposure"
            :class="{ chosen: c.exposure === p.exposure }"
          >
            <span class="num" style="font-weight: 600">{{ seconds(c.exposure) }}</span
            >{{ c.exposure === p.exposure ? ' (chosen)' : '' }}: {{ candidateText(c) }}
          </li>
        </ul>
      </div>
    </details>
  </div>
</template>

<style scoped>
.sublen {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  overflow-wrap: anywhere;
}
.sublen summary {
  cursor: pointer;
}
.part {
  margin-top: 0.375rem;
}
.cands {
  margin: 0.25rem 0 0;
  padding-left: 1.125rem;
}
.cands li.chosen {
  font-weight: 600;
}
</style>
