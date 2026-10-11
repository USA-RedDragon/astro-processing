<template>
  <div class="flex items-center gap-1" :title="title || undefined">
    <span v-if="caption || plateauCaption" class="flex flex-col text-[10px] leading-tight text-right">
      <span v-if="caption" class="text-muted-foreground">{{ caption }}</span>
      <span v-if="plateauCaption" class="plateau-caption" :title="plateauTitle || undefined">{{ plateauCaption }}</span>
    </span>
    <div class="relative w-16 h-16">
      <svg class="transform -rotate-90 w-16 h-16">
        <circle
          v-if="plateauShown"
          cx="32"
          cy="32"
          r="26"
          stroke-width="2"
          fill="transparent"
          class="plateau-track"
          :stroke-dasharray="plateau === null ? '2 3' : undefined"
        />
        <circle
          v-if="plateauShown && plateau !== null"
          cx="32"
          cy="32"
          r="26"
          stroke-width="2"
          fill="transparent"
          class="plateau-fill transition-all duration-300"
          :stroke-dasharray="plateauCircumference"
          :stroke-dashoffset="plateauOffset"
          stroke-linecap="round"
          data-testid="plateau-ring"
        />
        <circle
          cx="32"
          cy="32"
          r="20"
          stroke="currentColor"
          stroke-width="3"
          fill="transparent"
          class="text-muted"
        />
        <circle
          v-if="percentage !== null"
          cx="32"
          cy="32"
          r="20"
          :stroke="progressColor"
          stroke-width="3"
          fill="transparent"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="strokeDashoffset"
          class="transition-all duration-300"
          stroke-linecap="round"
        />
      </svg>
      <div class="absolute inset-0 flex items-center justify-center">
        <span v-if="percentage !== null" class="text-xs font-bold">{{ percentage }}%</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import type { PropType } from 'vue';

export default {
  name: 'ProgressCircle',
  props: {
    percentage: {
      type: [Number, null] as PropType<number | null>,
      default: null,
      validator: (value: number | null) => value === null || value >= 0,
    },
    caption: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      default: '',
    },
    circumference: {
      type: Number,
      default: 2 * Math.PI * 20,
    },
    plateau: {
      type: [Number, null] as PropType<number | null | undefined>,
      default: undefined,
    },
    plateauCaption: {
      type: String,
      default: '',
    },
    plateauTitle: {
      type: String,
      default: '',
    },
  },
  computed: {
    plateauShown(): boolean {
      return this.plateau !== undefined;
    },
    plateauCircumference(): number {
      return 2 * Math.PI * 26;
    },
    plateauOffset(): number {
      const p = Math.max(0, Math.min(this.plateau ?? 0, 100));
      return this.plateauCircumference - (p / 100) * this.plateauCircumference;
    },
    strokeDashoffset(): number {
      return this.circumference - (Math.min(this.percentage ?? 0, 100) / 100) * this.circumference;
    },
    progressColor(): string {
      const p = this.percentage ?? 0;
      if (p >= 100) return 'hsl(142, 76%, 36%)';
      if (p >= 50) return 'hsl(48, 96%, 53%)';
      return 'hsl(221, 83%, 53%)';
    },
  },
};
</script>

<style scoped>
.plateau-track {
  stroke: var(--plateau-track);
}
.plateau-fill {
  stroke: var(--plateau);
}
.plateau-caption {
  color: var(--plateau);
}
</style>
