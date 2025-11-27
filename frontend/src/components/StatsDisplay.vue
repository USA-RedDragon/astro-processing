<template>
  <div>
    <div class="text-sm mb-3" v-if="total">
      <div class="flex gap-3 text-xs">
        <span>
          <span>Desired:</span>
          <span :class="desiredClass + ' ml-1'">{{ stats.desired_images }}</span>
        </span>
        <span>
          <span>Acquired:</span>
          <span :class="acquiredClass + ' ml-1'">{{ stats.acquired_images }}</span>
        </span>
        <span>
          <span>Accepted:</span>
          <span :class="acceptedClass + ' ml-1'">{{ stats.accepted_images }}</span>
        </span>
        <span>
          <span>Rejected:</span>
          <span :class="rejectedClass + ' ml-1'">{{ stats.rejected_images }}</span>
        </span>
      </div>
    </div>
    <div class="flex gap-2" v-if="!total">
      <span :class="desiredClass">{{ stats.desired_images }}</span>
      <span>/</span>
      <span :class="acquiredClass">{{ stats.acquired_images }}</span>
      <span>/</span>
      <span :class="acceptedClass">{{ stats.accepted_images }}</span>
      <span>/</span>
      <span :class="rejectedClass">{{ stats.rejected_images }}</span>
    </div>
    <!-- Color bar showing ratio of rejected/accepted/acquired -->
    <div class="flex h-1.5 w-full rounded-full overflow-hidden mt-2 bg-muted">
      <div
        v-if="rejectedPercentage > 0"
        class="bg-red-600"
        :style="{ width: rejectedPercentage + '%' }"
        :title="`Rejected: ${stats.rejected_images}`"
      ></div>
      <div
        v-if="acceptedPercentage > 0"
        class="bg-green-600"
        :style="{ width: acceptedPercentage + '%' }"
        :title="`Accepted: ${stats.accepted_images}`"
      ></div>
      <div
        v-if="remainingAcquiredPercentage > 0"
        class="bg-muted-foreground/30"
        :style="{ width: remainingAcquiredPercentage + '%' }"
        :title="`Acquired (not yet processed): ${remainingAcquired}`"
      ></div>
    </div>
  </div>
</template>

<script lang="ts">
import type { ImagingStats } from '../graphql/graphql';
import type { PropType } from 'vue';

export default {
  name: 'StatsDisplay',
  props: {
    total: {
      type: Boolean,
      default: false,
    },
    stats: {
      type: Object as PropType<ImagingStats>,
      required: true,
    },
    desiredClass: {
      type: String,
      default: 'text-muted-foreground',
    },
    acquiredClass: {
      type: String,
      default: '',
    },
    acceptedClass: {
      type: String,
      default: 'text-green-600',
    },
    rejectedClass: {
      type: String,
      default: 'text-red-600',
    },
  },
  computed: {
    maxValue(): number {
      return Math.max(this.stats.desired_images, this.stats.acquired_images);
    },
    rejectedPercentage(): number {
      if (this.maxValue === 0) return 0;
      return (this.stats.rejected_images / this.maxValue) * 100;
    },
    acceptedPercentage(): number {
      if (this.maxValue === 0) return 0;
      return (this.stats.accepted_images / this.maxValue) * 100;
    },
    remainingAcquired(): number {
      // Acquired images that haven't been accepted or rejected yet
      return Math.max(0, this.stats.acquired_images - this.stats.accepted_images - this.stats.rejected_images);
    },
    remainingAcquiredPercentage(): number {
      if (this.maxValue === 0) return 0;
      return (this.remainingAcquired / this.maxValue) * 100;
    },
  },
};
</script>
