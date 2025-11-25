<template>
        <Card class="project-card relative overflow-hidden">
        <!-- Status Badge at top right -->
        <div class="absolute top-5 right-2 z-10 flex gap-2">
          <Badge v-if="project.is_mosaic" variant="outline" class="text-sm">
            Mosaic
          </Badge>
          <Badge v-if="project.priority" :variant="getPriorityVariant(project.priority)" class="text-sm">
            {{ project.priority }}
          </Badge>
          <Badge :variant="getStatusVariant(project)">
            {{ getStatusText(project) }}
          </Badge>
        </div>

        <CardHeader>
          <CardTitle class="pr-64">
            <a v-if="titleLink" :href="titleLink" class="underline hover:text-primary transition">
              {{ project.name }}
            </a>
            <span v-else>
              {{ project.name }}
            </span>
          </CardTitle>
          <div class="flex flex-col gap-1 mt-2">
            <p v-if="project.description" class="text-xs text-muted-foreground">
              {{ project.description }}
            </p>
            <p v-if="project.create_date" class="text-xs text-muted-foreground">
              <span class="font-medium">Created:</span> {{ formatDate(project.create_date) }}
            </p>
            <p v-if="project.active_date" class="text-xs text-muted-foreground">
              <span class="font-medium">Activated:</span> {{ formatDate(project.active_date) }}
            </p>
          </div>
        </CardHeader>

        <CardContent class="space-y-4 pb-12">
          <!-- Image Statistics -->
          <div v-if="project.stats">
            <StatsDisplay :stats="project.stats" total />
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

import {
  PROJECT_STATE_ACTIVE,
  PROJECT_PRIORITY_HIGH,
  PROJECT_PRIORITY_LOW,
  type ProjectWithStats,
  type ProjectPriority,
} from '@/types/Project';

import type { PropType } from 'vue';
import StatsDisplay from './StatsDisplay.vue';
import { formatDate } from '@/lib/formatters';

export default {
  components: {
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    ProgressCircle,
    StatsDisplay,
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
    formatDate,
    getProgressPercentage(project: ProjectWithStats): number {
      if (!project.stats) return 0;
      const { accepted_images, desired_images } = project.stats;
      if (desired_images === 0) return 0;
      return Math.min(Math.round((accepted_images / desired_images) * 100), 100);
    },
    getPriorityVariant(priority: ProjectPriority): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (priority === PROJECT_PRIORITY_HIGH) return 'destructive';
      if (priority === PROJECT_PRIORITY_LOW) return 'outline';
      return 'secondary';
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
