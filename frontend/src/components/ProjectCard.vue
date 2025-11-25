<template>
        <Card class="project-card relative overflow-hidden">
        <!-- Status Badge at top right -->
        <div class="absolute top-5 right-2 z-10">
          <Badge :variant="getStatusVariant(project)">
            {{ getStatusText(project) }}
          </Badge>
        </div>

        <CardHeader>
          <CardTitle class="pr-24">
            <a v-if="titleLink" :href="titleLink" class="underline hover:text-primary transition">
              {{ project.name }}
            </a>
            <span v-else>
              {{ project.name }}
            </span>
          </CardTitle>
          <p v-if="project.description" class="text-xs text-muted-foreground mt-1">
            {{ project.description }}
          </p>
        </CardHeader>

        <CardContent class="space-y-4 pb-12">
          <!-- Image Statistics -->
          <div v-if="project.stats">
            <p class="text-sm text-muted-foreground mb-2">Image Statistics</p>
            <div class="space-y-1 text-sm">
              <div class="flex justify-between">
                <span>Desired:</span>
                <span class="font-semibold">{{ project.stats.desired_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Acquired:</span>
                <span class="font-semibold">{{ project.stats.acquired_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Accepted:</span>
                <span class="font-semibold text-green-600">{{ project.stats.accepted_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Rejected:</span>
                <span class="font-semibold text-red-600">{{ project.stats.rejected_images }}</span>
              </div>
            </div>
          </div>

        </CardContent>

        <!-- Circular Progress at bottom right -->
        <div v-if="project.stats" class="absolute bottom-0 right-0">
          <ProgressCircle :percentage="getProgressPercentage(project)" />
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
import ProgressCircle from '@/components/ProgressCircle.vue';

import { PROJECT_STATE_ACTIVE, type ProjectWithStats } from '@/types/Project';

import type { PropType } from 'vue';

export default {
  components: {
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    ProgressCircle,
  },
  props: {
    project: {
      type: Object as PropType<ProjectWithStats>,
      required: true,
    },
    titleLink: {
      type: String,
      required: false,
      default: null,
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
    getProgressPercentage(project: ProjectWithStats): number {
      if (!project.stats) return 0;
      const { accepted_images, desired_images } = project.stats;
      if (desired_images === 0) return 0;
      return Math.min(Math.round((accepted_images / desired_images) * 100), 100);
    },
    formatCoordinate(coord: number): string {
      return coord.toFixed(4);
    },
    getStatusVariant(
      project: ProjectWithStats,
    ): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (project.stats) {
        const { accepted_images, desired_images } = project.stats;
        if (accepted_images >= desired_images) {
          return 'default'; // completed
        }
      }
      return project.state === PROJECT_STATE_ACTIVE ? 'secondary' : 'outline';
    },
    getStatusText(project: ProjectWithStats): string {
      if (project.stats) {
        const { accepted_images, desired_images } = project.stats;
        if (accepted_images >= desired_images) {
          return 'Completed';
        }
      }
      return project.state ?? 'Unknown';
    },
  },
};
</script>

<style scoped>
</style>
