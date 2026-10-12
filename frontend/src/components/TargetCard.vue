<template>
        <Card class="target-card relative overflow-hidden">
        <!-- Status Badge at top right -->
        <div class="absolute top-5 right-2 z-10">
          <Badge :variant="statusVariant" :title="circle.title || undefined">
            {{ statusText }}
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
            <p v-if="circle.show" class="text-xs" :class="enoughData ? 'text-green-600' : 'text-muted-foreground'">
              <span class="font-medium">Data:</span> {{ circle.title }}
            </p>
            <p v-if="circle.plateau" class="text-xs plateau-text" :title="circle.plateau.title">
              <span class="font-medium">Plateau:</span> {{ circle.plateau.text }}
            </p>
          </div>
        </CardHeader>

        <CardContent class="space-y-4 pb-12">
          <div v-if="goals.length > 0" class="text-sm space-y-1">
            <div class="font-semibold mb-1">By filter:</div>
            <div
              v-for="g in goals"
              :key="g.filter"
              class="flex justify-between items-center gap-2 text-xs py-1 px-2 rounded"
              :class="{ 'bg-green-500/20 dark:bg-green-500/30': g.enough }"
            >
              <span class="font-medium">{{ g.filter }}</span>
              <span class="flex flex-col text-right">
                <span>{{ filterHeadline(g) }}</span>
                <span
                  v-if="g.plateauAt"
                  class="plateau-text"
                  :title="plateauTitle(filterPlateau(g), false, false)"
                >{{ plateauLabel(filterPlateau(g)) }}</span>
              </span>
            </div>
          </div>

          <!-- Image Statistics -->
          <div v-if="target.stats && target.stats.total">
            <StatsDisplay :stats="target.stats.total" total />

            <div v-if="target.stats.filters && target.stats.filters.length > 0" class="text-sm space-y-1">
              <div class="font-semibold mt-2 mb-1">Subs by exposure plan:</div>
              <div
                v-for="(filterStats, index) in target.stats.filters"
                :key="index"
                class="flex justify-between items-center text-xs py-1 px-2 rounded"
                :class="{ 'opacity-60': filterStats.enabled === false }"
              >
                <span class="font-medium">{{ formatFilterName(filterStats) }}:</span>
                <StatsDisplay :stats="filterStats.imaging" />
              </div>
            </div>
          </div>

        </CardContent>

        <!-- Circular Progress at bottom right -->
        <div v-if="circle.show" class="absolute bottom-0 right-0">
          <ProgressCircle
            :percentage="circle.percent"
            :caption="circle.caption"
            :title="circle.title"
            :plateau="circle.plateau ? circle.plateau.percent : undefined"
            :plateau-caption="circle.plateau ? plateauCaption(circle.plateau.percent) : ''"
            :plateau-title="circle.plateau?.title ?? ''"
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
import {
  filterHeadline,
  filterPlateau,
  plateauLabel,
  plateauTitle,
  type FilterGoal,
  type Target as PlanningTarget,
} from '@/scheduler/api/planning';
import { cardCircle, hasEnoughData, plateauCaption, type CardCircle, type PlanningState } from '@/scheduler/leastCards';

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
    planning: {
      type: Object as PropType<PlanningTarget | null>,
      default: null,
    },
    planningState: {
      type: String as PropType<PlanningState>,
      default: 'loading',
    },
  },
  computed: {
    circle(): CardCircle {
      return cardCircle(this.planning?.least, this.planningState);
    },
    enoughData(): boolean {
      return hasEnoughData(this.planning?.least);
    },
    goals(): FilterGoal[] {
      return this.planning?.goals ?? [];
    },
    statusVariant(): 'default' | 'secondary' | 'outline' {
      if (this.enoughData) return 'default';
      return this.target.active ? 'secondary' : 'outline';
    },
    statusText(): string {
      if (this.enoughData && this.planning?.bodyKind === 'comet') return 'Done for tonight';
      if (this.enoughData) return 'Enough data';
      return this.target.active ? 'Active' : 'Inactive';
    },
  },
  methods: {
    plateauCaption,
    filterPlateau,
    plateauLabel,
    plateauTitle,
    filterHeadline,
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
  },
};
</script>

<style scoped>
.plateau-text {
  color: var(--plateau);
}
</style>
