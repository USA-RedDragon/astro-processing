<template>
  <div>
    <div v-if="loading" class="flex justify-center items-center min-h-screen">
      <p class="text-lg">Loading targets...</p>
    </div>
    <div v-else-if="error" class="flex justify-center items-center min-h-screen">
      <p class="text-lg text-red-500">Error loading targets: {{ error }}</p>
    </div>
    <div v-else class="space-y-8">
      <!-- Single-target projects and ungrouped targets flow together in mosaic -->
      <div v-if="singleTargetCards.length > 0" class="info px-4">
        <Card
          v-for="target in singleTargetCards"
          :key="target.id"
          class="target-card relative overflow-hidden"
        >
        <!-- Status Badge at top right -->
        <div class="absolute top-4 right-4 z-10">
          <Badge :variant="getStatusVariant(target)">
            {{ getStatusText(target) }}
          </Badge>
        </div>

        <CardHeader>
          <CardTitle class="pr-24">{{ target.name }}</CardTitle>
          <p v-if="target.project?.name" class="text-xs text-muted-foreground mt-1">
            {{ target.project.name }}
          </p>
        </CardHeader>

        <CardContent class="space-y-4 pb-20">
          <!-- Coordinates -->
          <div v-if="target.ra !== null && target.dec !== null">
            <p class="text-sm text-muted-foreground">Coordinates</p>
            <p class="text-sm font-mono">
              RA: {{ formatCoordinate(target.ra) }}° | Dec: {{ formatCoordinate(target.dec) }}°
            </p>
            <p class="text-xs text-muted-foreground">Epoch: {{ target.epoch_code }}</p>
          </div>

          <!-- Image Statistics -->
          <div v-if="target.stats">
            <p class="text-sm text-muted-foreground mb-2">Image Statistics</p>
            <div class="space-y-1 text-sm">
              <div class="flex justify-between">
                <span>Desired:</span>
                <span class="font-semibold">{{ target.stats.total.desired_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Accepted:</span>
                <span class="font-semibold text-green-600">{{ target.stats.total.accepted_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Acquired:</span>
                <span class="font-semibold">{{ target.stats.total.acquired_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Rejected:</span>
                <span class="font-semibold text-red-600">{{ target.stats.total.rejected_images }}</span>
              </div>
            </div>

            <!-- Filter breakdown if available -->
            <div v-if="Object.keys(target.stats.filters).length > 0" class="mt-3">
              <p class="text-xs text-muted-foreground mb-1">By Filter</p>
              <div class="space-y-1 text-xs">
                <div
                  v-for="(filterStats, filterName) in target.stats.filters"
                  :key="filterName"
                  class="flex justify-between"
                >
                  <span class="font-mono">{{ filterName }}:</span>
                  <span>
                    {{ filterStats.accepted_images }}/{{ filterStats.desired_images }}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </CardContent>

        <!-- Circular Progress at bottom right -->
        <div v-if="target.stats" class="absolute bottom-4 right-4">
          <div class="relative w-16 h-16">
            <svg class="transform -rotate-90 w-16 h-16">
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="currentColor"
                stroke-width="6"
                fill="transparent"
                class="text-muted"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                :stroke="getProgressColor(target)"
                stroke-width="6"
                fill="transparent"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="getStrokeDashoffset(target)"
                class="transition-all duration-300"
                stroke-linecap="round"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs font-bold">{{ getProgressPercentage(target) }}%</span>
            </div>
          </div>
        </div>
        </Card>
      </div>

      <!-- Multi-target projects get their own section with header -->
      <div v-for="group in multiTargetProjects" :key="group.key" class="project-group">
        <div class="mb-4 px-4 flex items-center gap-4">
          <div>
            <h2 class="text-2xl font-bold">
              {{ group.projectName }}
            </h2>
            <p v-if="group.projectDescription" class="text-sm text-muted-foreground">
              {{ group.projectDescription }}
            </p>
          </div>

          <!-- Project-wide progress circle -->
          <div v-if="getProjectStats(group).total > 0" class="shrink-0">
            <div class="relative w-20 h-20">
              <svg class="transform -rotate-90 w-20 h-20">
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="currentColor"
                  stroke-width="7"
                  fill="transparent"
                  class="text-muted"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  :stroke="getProjectProgressColor(group)"
                  stroke-width="7"
                  fill="transparent"
                  :stroke-dasharray="projectCircumference"
                  :stroke-dashoffset="getProjectStrokeDashoffset(group)"
                  class="transition-all duration-300"
                  stroke-linecap="round"
                />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-sm font-bold">{{ getProjectProgressPercentage(group) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="info px-4">
          <Card
            v-for="target in group.targets"
            :key="target.id"
            class="target-card relative overflow-hidden"
          >
        <!-- Status Badge at top right -->
        <div class="absolute top-4 right-4 z-10">
          <Badge :variant="getStatusVariant(target)">
            {{ getStatusText(target) }}
          </Badge>
        </div>

        <CardHeader>
          <CardTitle class="pr-24">{{ target.name }}</CardTitle>
        </CardHeader>

        <CardContent class="space-y-4 pb-20">
          <!-- Coordinates -->
          <div v-if="target.ra !== null && target.dec !== null">
            <p class="text-sm text-muted-foreground">Coordinates</p>
            <p class="text-sm font-mono">
              RA: {{ formatCoordinate(target.ra) }}° | Dec: {{ formatCoordinate(target.dec) }}°
            </p>
            <p class="text-xs text-muted-foreground">Epoch: {{ target.epoch_code }}</p>
          </div>

          <!-- Image Statistics -->
          <div v-if="target.stats">
            <p class="text-sm text-muted-foreground mb-2">Image Statistics</p>
            <div class="space-y-1 text-sm">
              <div class="flex justify-between">
                <span>Desired:</span>
                <span class="font-semibold">{{ target.stats.total.desired_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Accepted:</span>
                <span class="font-semibold text-green-600">{{ target.stats.total.accepted_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Acquired:</span>
                <span class="font-semibold">{{ target.stats.total.acquired_images }}</span>
              </div>
              <div class="flex justify-between">
                <span>Rejected:</span>
                <span class="font-semibold text-red-600">{{ target.stats.total.rejected_images }}</span>
              </div>
            </div>

            <!-- Filter breakdown if available -->
            <div v-if="Object.keys(target.stats.filters).length > 0" class="mt-3">
              <p class="text-xs text-muted-foreground mb-1">By Filter</p>
              <div class="space-y-1 text-xs">
                <div
                  v-for="(filterStats, filterName) in target.stats.filters"
                  :key="filterName"
                  class="flex justify-between"
                >
                  <span class="font-mono">{{ filterName }}:</span>
                  <span>
                    {{ filterStats.accepted_images }}/{{ filterStats.desired_images }}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </CardContent>

        <!-- Circular Progress at bottom right -->
        <div v-if="target.stats" class="absolute bottom-4 right-4">
          <div class="relative w-16 h-16">
            <svg class="transform -rotate-90 w-16 h-16">
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="currentColor"
                stroke-width="6"
                fill="transparent"
                class="text-muted"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                :stroke="getProgressColor(target)"
                stroke-width="6"
                fill="transparent"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="getStrokeDashoffset(target)"
                class="transition-all duration-300"
                stroke-linecap="round"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs font-bold">{{ getProgressPercentage(target) }}%</span>
            </div>
          </div>
        </div>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import API from '@/services/API';
import type {
  ListTargetsResponse,
  TargetWithStats,
  TargetImageStatsResponse,
} from '@/types/Target';

type ProjectGroup = {
  key: string;
  projectId: number | null;
  projectName: string | null;
  projectDescription?: string;
  targets: TargetWithStats[];
};

export default {
  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Badge,
  },
  created() {
    this.fetchData();
  },
  mounted() {
  },
  unmounted() {
  },
  data: function() {
    return {
      targets: [] as TargetWithStats[],
      loading: true,
      error: null as string | null,
      circumference: 2 * Math.PI * 28, // 28 is the radius for target cards
      projectCircumference: 2 * Math.PI * 35, // 35 is the radius for project headers
    };
  },
  methods: {
    async fetchData() {
      try {
        this.loading = true;
        this.error = null;

        // Fetch all targets
        const response = await API.get<ListTargetsResponse>('/targets');
        const targets = response.data.targets;

        // Fetch stats for each target
        const targetsWithStats = await Promise.all(
          targets.map(async (target) => {
            try {
              const statsResponse = await API.get<TargetImageStatsResponse>(`/targets/${target.id}/image/stats`);
              return {
                ...target,
                stats: statsResponse.data,
              };
            } catch (err) {
              // If stats fail, return target without stats
              console.error(`Failed to fetch stats for target ${target.id}:`, err);
              return target;
            }
          })
        );

        this.targets = targetsWithStats;
      } catch (err) {
        const error = err as Error;
        this.error = error.message || 'Failed to fetch targets';
        console.error('Error fetching targets:', err);
      } finally {
        this.loading = false;
      }
    },
    getStatusVariant(
      target: TargetWithStats,
    ): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (target.stats) {
        const { accepted_images, desired_images } = target.stats.total;
        if (accepted_images >= desired_images) {
          return 'default'; // completed
        }
      }
      return target.active ? 'secondary' : 'outline';
    },
    getStatusText(target: TargetWithStats): string {
      if (target.stats) {
        const { accepted_images, desired_images } = target.stats.total;
        if (accepted_images >= desired_images) {
          return 'Completed';
        }
      }
      return target.active ? 'Active' : 'Inactive';
    },
    getProgressPercentage(target: TargetWithStats): number {
      if (!target.stats) return 0;
      const { accepted_images, desired_images } = target.stats.total;
      if (desired_images === 0) return 0;
      return Math.min(Math.round((accepted_images / desired_images) * 100), 100);
    },
    getStrokeDashoffset(target: TargetWithStats): number {
      const percentage = this.getProgressPercentage(target);
      return this.circumference - (percentage / 100) * this.circumference;
    },
    getProgressColor(target: TargetWithStats): string {
      const percentage = this.getProgressPercentage(target);
      if (percentage >= 100) return 'hsl(142, 76%, 36%)'; // green
      if (percentage >= 50) return 'hsl(48, 96%, 53%)'; // yellow
      return 'hsl(221, 83%, 53%)'; // blue
    },
    formatCoordinate(coord: number): string {
      return coord.toFixed(4);
    },
    getProjectStats(group: ProjectGroup): { accepted: number; desired: number; total: number } {
      let totalAccepted = 0;
      let totalDesired = 0;

      for (const target of group.targets) {
        if (target.stats) {
          totalAccepted += target.stats.total.accepted_images;
          totalDesired += target.stats.total.desired_images;
        }
      }

      return {
        accepted: totalAccepted,
        desired: totalDesired,
        total: totalDesired,
      };
    },
    getProjectProgressPercentage(group: ProjectGroup): number {
      const stats = this.getProjectStats(group);
      if (stats.desired === 0) return 0;
      return Math.min(Math.round((stats.accepted / stats.desired) * 100), 100);
    },
    getProjectStrokeDashoffset(group: ProjectGroup): number {
      const percentage = this.getProjectProgressPercentage(group);
      return this.projectCircumference - (percentage / 100) * this.projectCircumference;
    },
    getProjectProgressColor(group: ProjectGroup): string {
      const percentage = this.getProjectProgressPercentage(group);
      if (percentage >= 100) return 'hsl(142, 76%, 36%)'; // green
      if (percentage >= 50) return 'hsl(48, 96%, 53%)'; // yellow
      return 'hsl(221, 83%, 53%)'; // blue
    },
  },
  computed: {
    groupedTargets(): ProjectGroup[] {
      const groups = new Map<string, ProjectGroup>();

      // Group targets by project
      for (const target of this.targets) {
        // Only group by project if the target has both a project_id AND a valid project object with a name
        const hasValidProject = target.project_id !== null
          && target.project_id !== undefined
          && target.project?.name;

        const key = hasValidProject
          ? `project-${target.project_id}`
          : 'ungrouped';

        if (!groups.has(key)) {
          groups.set(key, {
            key,
            projectId: hasValidProject ? target.project_id : null,
            projectName: target.project?.name || null,
            projectDescription: target.project?.description,
            targets: [],
          });
        }

        groups.get(key)!.targets.push(target);
      }

      // Convert to array and sort: projects first (alphabetically), then ungrouped
      const groupArray = Array.from(groups.values());

      return groupArray.sort((a, b) => {
        if (a.projectId === null && b.projectId !== null) return 1;
        if (a.projectId !== null && b.projectId === null) return -1;
        if (a.projectName && b.projectName) {
          return a.projectName.localeCompare(b.projectName);
        }
        return 0;
      });
    },
    // Multi-target projects that get their own section with header
    multiTargetProjects(): ProjectGroup[] {
      return this.groupedTargets.filter(group =>
        group.targets.length > 1 && group.projectName !== null
      );
    },
    // Single-target cards that flow in mosaic (single-target projects + ungrouped)
    singleTargetCards(): TargetWithStats[] {
      const singleTargetGroups = this.groupedTargets.filter(group =>
        group.targets.length === 1 || group.projectName === null
      );

      // Flatten all targets from these groups
      return singleTargetGroups.flatMap(group => group.targets);
    },
  },
};
</script>

<style scoped>
.project-group {
  margin-bottom: 2rem;
}

.project-group:last-child {
  margin-bottom: 0;
}

.info {
  -webkit-column-count: 4;
  -moz-column-count: 4;
  column-count: 4;
  column-gap: 1rem;
}

.info > div {
  break-inside: avoid;
  margin-bottom: 1rem;
}

@media (max-width: 2100px) {
  .info {
    -moz-column-count: 4;
    -webkit-column-count: 4;
    column-count: 4;
  }
}
@media (max-width: 1200px) {
  .info {
    -moz-column-count: 3;
    -webkit-column-count: 3;
    column-count: 3;
  }
}
@media (max-width: 600px) {
  .info {
    -moz-column-count: 2;
    -webkit-column-count: 2;
    column-count: 2;
  }
}
</style>
