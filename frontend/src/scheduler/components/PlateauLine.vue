<script setup lang="ts">
import { computed } from 'vue'
import {
  plateauLabel,
  plateauRollupLabel,
  plateauTitle,
  type LeastPlateau,
} from '@/scheduler/api/planning'

const props = withDefaults(
  defineProps<{ plateau: LeastPlateau | null | undefined; mosaic?: boolean; rollup?: boolean; bare?: boolean }>(),
  { mosaic: false, rollup: true, bare: false },
)

const measured = computed(() => props.plateau?.progress !== null && props.plateau?.progress !== undefined)
const fill = computed(() => Math.max(0, Math.min(1, props.plateau?.progress ?? 0)))
const label = computed(() =>
  props.rollup ? plateauRollupLabel(props.plateau, props.mosaic) : plateauLabel(props.plateau),
)
const title = computed(() => plateauTitle(props.plateau, props.mosaic, props.rollup))
</script>

<template>
  <div v-if="plateau" class="plateau-line" :title="title" data-testid="plateau-line">
    <div
      class="ptrack"
      :class="{ unmeasured: !measured }"
      role="meter"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="measured ? Math.floor(fill * 100) : undefined"
      :aria-label="label"
    >
      <div v-if="measured" class="pfill" :style="{ width: (fill * 100).toFixed(1) + '%' }" />
    </div>
    <span v-if="!bare" class="plab">{{ label }}</span>
  </div>
</template>

<style scoped>
.plateau-line {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}
.ptrack {
  height: 0.1875rem;
  border-radius: 999px;
  background: var(--plateau-track);
  overflow: hidden;
}
.ptrack.unmeasured {
  background: repeating-linear-gradient(90deg, var(--plateau-track) 0 4px, transparent 4px 7px);
}
.pfill {
  height: 100%;
  background: var(--plateau);
}
.plab {
  font-size: 0.6875rem;
  line-height: 1.3;
  color: var(--plateau);
  overflow-wrap: anywhere;
}
</style>
