<template>
  <div class="flex items-center gap-1" :title="title || undefined">
    <span v-if="caption" class="text-[10px] leading-tight text-muted-foreground text-right">{{ caption }}</span>
    <div class="relative w-16 h-16">
      <svg class="transform -rotate-90 w-16 h-16">
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
        <span class="text-xs font-bold">{{ percentage }}%</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'ProgressCircle',
  props: {
    percentage: {
      type: Number,
      required: true,
      validator: (value: number) => value >= 0,
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
  },
  computed: {
    strokeDashoffset(): number {
      return this.circumference - (Math.min(this.percentage, 100) / 100) * this.circumference;
    },
    progressColor(): string {
      if (this.percentage >= 100) return 'hsl(142, 76%, 36%)';
      if (this.percentage >= 50) return 'hsl(48, 96%, 53%)';
      return 'hsl(221, 83%, 53%)';
    },
  },
};
</script>
