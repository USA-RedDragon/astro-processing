<template>
        <Card class="target-card relative overflow-hidden">
        <!-- Status Badge at top right -->
        <div class="absolute top-5 right-2 z-10">
          <Badge :variant="getStatusVariant(target)" :title="statusTitle">
            {{ getStatusText(target) }}
          </Badge>
        </div>

        <CardHeader>
          <CardTitle class="pr-24">
            <router-link :to="`/target/${target.id}`" class="hover:underline">{{ target.name }}</router-link>
          </CardTitle>
          <div class="flex flex-col gap-1 mt-2">
            <p v-if="target.ra !== null && target.dec !== null" class="text-xs text-muted-foreground">
              <span class="font-medium">RA:</span> {{ target.ra != null ? formatRA(target.ra) : '' }}
              <span class="font-medium ml-2">Dec:</span> {{ target.dec != null ? formatDec(target.dec) : '' }}
              <span class="ml-2">({{ target.epoch }})</span>
            </p>
            <p class="text-xs text-muted-foreground">
              <span class="font-medium">Rotation:</span>
              {{ target.rotation != null ? target.rotation.toFixed(1) + '°' : 'not set' }}
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
              <div class="font-semibold mt-2 mb-1">By exposure plan:</div>
              <div
                v-for="(filterStats, index) in target.stats.filters"
                :key="index"
                class="flex justify-between items-center text-xs py-1 px-2 rounded"
                :class="{
                  'bg-green-500/20 dark:bg-green-500/30':
                    filterStats.imaging.accepted_images >= filterStats.imaging.desired_images &&
                    filterStats.imaging.desired_images > 0,
                  'opacity-60': filterStats.enabled === false,
                }"
              >
                <span class="font-medium">{{ formatFilterName(filterStats) }}:</span>
                <StatsDisplay :stats="filterStats.imaging" />
              </div>
            </div>
          </div>

        </CardContent>

        <!-- Circular Progress at bottom right -->
        <div v-if="target.stats && target.stats.total.desired_images > 0" class="absolute bottom-0 right-0">
          <ProgressCircle
            :percentage="getProgressPercentage(target)"
            caption="accepted of desired"
            :title="circleTitle"
          />
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

import type { PropType } from 'vue';
import { formatDate, formatRA, formatDec } from '@/lib/formatters';
import type { Target, TargetFilterStats } from '../graphql/graphql';

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
      type: Object as PropType<Target>,
      required: true,
    },
  },
  computed: {
    enabledPlans(): TargetFilterStats[] {
      return (this.target.stats?.filters ?? []).filter((f) => f.enabled === true);
    },
    allPlansMet(): boolean {
      const plans = this.enabledPlans;
      return plans.length > 0 && plans.every((f) => f.imaging.accepted_images >= f.imaging.desired_images);
    },
    circleTitle(): string {
      const t = this.target.stats.total;
      return `${t.accepted_images} accepted of ${t.desired_images} desired, all plans together`;
    },
    statusTitle(): string {
      const plans = this.enabledPlans;
      const met = plans.filter((f) => f.imaging.accepted_images >= f.imaging.desired_images).length;
      return `${met} of ${plans.length} enabled exposure plans have their desired accepted subs`;
    },
  },
  methods: {
    formatDate,
    formatRA,
    formatDec,
    formatFilterName(filterStats: TargetFilterStats): string {
      let name = filterStats.template_name ?? `${filterStats.filter_name || 'Unknown'} (template missing)`;
      const parts = [];

      if (filterStats.exposure !== undefined && filterStats.exposure !== null) {
        parts.push(`${filterStats.exposure}s${filterStats.exposure_source === 'template' ? ' template default' : ''}`);
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
      if (filterStats.enabled === false) name += ' · off';

      return name;
    },
    getProgressPercentage(target: Target): number {
      if (!target.stats || !target.stats.total) return 0;
      const { accepted_images, desired_images } = target.stats.total;
      if (desired_images === 0) return 0;
      return Math.round((accepted_images / desired_images) * 100);
    },
    getStatusVariant(
      target: Target,
    ): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (this.allPlansMet) return 'default';
      return target.active ? 'secondary' : 'outline';
    },
    getStatusText(target: Target): string {
      if (this.allPlansMet) return 'All plans met';
      return target.active ? 'Active' : 'Inactive';
    },
  },
};
</script>

<style scoped>
</style>
