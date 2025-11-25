<template>
  <div class="text-sm mb-3" v-if="total">
    <div class="font-semibold mb-1">Total:</div>
    <div class="flex gap-3 text-xs">
      <span>
        <span class="text-muted-foreground">Desired:</span>
        <span :class="desiredClass + ' ml-1'">{{ stats.desired_images }}</span>
      </span>
      <span>
        <span class="text-muted-foreground">Acquired:</span>
        <span :class="acquiredClass + ' ml-1'">{{ stats.acquired_images }}</span>
      </span>
      <span>
        <span class="text-muted-foreground">Accepted:</span>
        <span :class="acceptedClass + ' ml-1'">{{ stats.accepted_images }}</span>
      </span>
      <span>
        <span class="text-muted-foreground">Rejected:</span>
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
</template>

<script lang="ts">
import type { Stats } from '@/types/Project';
import type { PropType } from 'vue';

export default {
  name: 'StatsDisplay',
  props: {
    total: {
      type: Boolean,
      default: false,
    },
    stats: {
      type: Object as PropType<Stats>,
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
};
</script>
