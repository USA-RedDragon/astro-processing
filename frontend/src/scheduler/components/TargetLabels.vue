<script setup lang="ts">
import { computed } from 'vue'
import { targetLabels, type ChartBox, type ChartChange } from '../plan'

const props = defineProps<{ first: string; changes: ChartChange[]; box: ChartBox; y: number }>()

const labels = computed(() => targetLabels(props.first, props.changes, props.box))
</script>

<template>
  <text
    v-if="labels.first"
    class="tl-first"
    :x="labels.first.x"
    :y="y"
    font-size="11"
    fill="var(--muted-foreground)"
  >
    {{ labels.first.text }}
  </text>
  <text
    v-if="labels.current"
    class="tl-current"
    :x="labels.current.x"
    :y="y"
    :text-anchor="labels.current.anchor"
    font-size="11"
    font-weight="600"
    fill="var(--foreground)"
  >
    {{ labels.current.text }}
  </text>
</template>
