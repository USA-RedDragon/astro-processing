<template>
        <Card class="target-card relative overflow-hidden">
        <!-- Status Badge at top right -->
        <div class="absolute top-5 right-2 z-10">
          <Badge :variant="getStatusVariant(target)">
            {{ getStatusText(target) }}
          </Badge>
        </div>

        <CardHeader>
          <CardTitle class="pr-24">{{ target.name }}</CardTitle>
          <div class="flex flex-col gap-1 mt-2">
            <p v-if="target.ra !== null && target.dec !== null" class="text-xs text-muted-foreground">
              <span class="font-medium">RA:</span> {{ formatRA(target.ra) }}
              <span class="font-medium ml-2">Dec:</span> {{ formatDec(target.dec) }}
              <span class="ml-2">({{ target.epoch_code }})</span>
            </p>
            <p v-if="target.rotation !== null" class="text-xs text-muted-foreground">
              <span class="font-medium">Rotation:</span> {{ target.rotation }}°
            </p>
            <p v-if="target.stats?.last_image_date" class="text-xs text-muted-foreground">
              <span class="font-medium">Last Image:</span> {{ formatDate(target.stats.last_image_date) }}
            </p>
          </div>
        </CardHeader>

        <CardContent class="space-y-4 pb-12">
          <!-- Image Statistics -->
          <div v-if="target.stats && target.stats.total">
            <StatsDisplay :stats="target.stats.total" total />

            <div v-if="target.stats.filters && target.stats.filters.length > 0" class="text-sm space-y-1">
              <div class="font-semibold mb-1">By Filter:</div>
              <div
                v-for="(filterStats, index) in target.stats.filters"
                :key="index"
                class="flex justify-between items-center text-xs py-1 px-2 rounded"
                :class="{
                  'bg-green-500/20 dark:bg-green-500/30':
                    filterStats.accepted_images >= filterStats.desired_images &&
                    filterStats.desired_images > 0
                }"
              >
                <span class="font-medium">{{ formatFilterName(filterStats) }}:</span>
                <StatsDisplay :stats="filterStats" />
              </div>
            </div>
          </div>

        </CardContent>

        <!-- Circular Progress at bottom right -->
        <div v-if="target.stats" class="absolute bottom-0 right-0">
          <ProgressCircle :percentage="getProgressPercentage(target)" />
        </div>
        </Card>
</template>

<script lang="ts">
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatsDisplay from '@/components/StatsDisplay.vue';
import ProgressCircle from '@/components/ProgressCircle.vue';

import type { TargetWithStats, TargetFilterStats } from '@/types/Target';

import type { PropType } from 'vue';
import { formatDate, formatRA, formatDec } from '@/lib/formatters';

export default {
  components: {
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    StatsDisplay,
    ProgressCircle,
  },
  props: {
    target: {
      type: Object as PropType<TargetWithStats>,
      required: true,
    },
  },
  data: function() {
    return {
    };
  },
  mounted() {
  },
  unmounted() {
  },
  methods: {
    formatDate,
    formatRA,
    formatDec,
    formatFilterName(filterStats: TargetFilterStats): string {
      let name = filterStats.filter_name;
      const parts = [];

      if (filterStats.exposure_time !== undefined && filterStats.exposure_time !== null) {
        parts.push(`${filterStats.exposure_time.toFixed(1)}s`);
      }
      if (filterStats.gain !== undefined && filterStats.gain !== null) {
        parts.push(`Gain ${filterStats.gain}`);
      }
      if (filterStats.offset !== undefined && filterStats.offset !== null) {
        if (filterStats.offset === -1) {
          parts.push(`Offset Default`);
        } else {
          parts.push(`Offset ${filterStats.offset}`);
        }
      }

      if (parts.length > 0) {
        name += ` (${parts.join(', ')})`;
      }

      return name;
    },
    getProgressPercentage(target: TargetWithStats): number {
      if (!target.stats || !target.stats.total) return 0;
      const { accepted_images, desired_images } = target.stats.total;
      if (desired_images === 0) return 0;
      return Math.min(Math.round((accepted_images / desired_images) * 100), 100);
    },
    getStatusVariant(
      target: TargetWithStats,
    ): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (target.stats && target.stats.total) {
        const { accepted_images, desired_images } = target.stats.total;
        if (accepted_images >= desired_images) {
          return 'default'; // completed
        }
      }
      return target.active ? 'secondary' : 'outline';
    },
    getStatusText(target: TargetWithStats): string {
      if (target.stats && target.stats.total) {
        const { accepted_images, desired_images } = target.stats.total;
        if (accepted_images >= desired_images) {
          return 'Completed';
        }
      }
      return target.active ? 'Active' : 'Inactive';
    },
  },
};
</script>

<style scoped>
</style>
