<template>
        <Card class="project-card relative overflow-hidden">
        <!-- Status Badge at top right -->
        <div class="absolute top-5 right-2 z-10">
          <Badge :variant="getStatusVariant(project)">
            {{ getStatusText(project) }}
          </Badge>
        </div>

        <CardHeader>
          <CardTitle class="pr-24">{{ project.name }}</CardTitle>
          <p v-if="project.project?.name" class="text-xs text-muted-foreground mt-1">
            {{ project.project.name }}
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
                :stroke="getProgressColor(project)"
                stroke-width="3"
                fill="transparent"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="getStrokeDashoffset(project)"
                class="transition-all duration-300"
                stroke-linecap="round"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs font-bold">{{ getProgressPercentage(project) }}%</span>
            </div>
          </div>
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

import type {
  projectWithStats,
} from '@/types/project';
import type { PropType } from 'vue';

export default {
  components: {
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  },
  props: {
    project: {
      type: Object as PropType<projectWithStats>,
      required: true,
    },
    circumference: {
      type: Number,
      default: 2 * Math.PI * 20, // 2 * π * r (r = 20)
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
    getProgressPercentage(project: projectWithStats): number {
      if (!project.stats) return 0;
      const { accepted_images, desired_images } = project.stats;
      if (desired_images === 0) return 0;
      return Math.min(Math.round((accepted_images / desired_images) * 100), 100);
    },
    getStrokeDashoffset(project: projectWithStats): number {
      const percentage = this.getProgressPercentage(project);
      return this.circumference - (percentage / 100) * this.circumference;
    },
    getProgressColor(project: projectWithStats): string {
      const percentage = this.getProgressPercentage(project);
      if (percentage >= 100) return 'hsl(142, 76%, 36%)'; // green
      if (percentage >= 50) return 'hsl(48, 96%, 53%)'; // yellow
      return 'hsl(221, 83%, 53%)'; // blue
    },
    formatCoordinate(coord: number): string {
      return coord.toFixed(4);
    },
    getStatusVariant(
      project: projectWithStats,
    ): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (project.stats) {
        const { accepted_images, desired_images } = project.stats;
        if (accepted_images >= desired_images) {
          return 'default'; // completed
        }
      }
      return project.active ? 'secondary' : 'outline';
    },
    getStatusText(project: projectWithStats): string {
      if (project.stats) {
        const { accepted_images, desired_images } = project.stats;
        if (accepted_images >= desired_images) {
          return 'Completed';
        }
      }
      return project.active ? 'Active' : 'Inactive';
    },
  },
};
</script>

<style scoped>
</style>
