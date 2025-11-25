<template>
  <div class="space-y-6">
    <template v-if="project">
      <ProjectCard :project="project" />
    </template>

    <!-- Targets Section -->
    <div class="space-y-4">
      <h2 class="text-xl font-semibold">Targets</h2>
      <div v-if="targets.length > 0" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TargetCard
          v-for="target in targets"
          :key="target.id"
          :target="target"
        />
      </div>
      <div v-else class="text-center text-muted-foreground py-8">
        No targets found for this project.
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import TargetCard from '@/components/TargetCard.vue';

import API from '@/lib/API';
import type { TargetWithStats, ListTargetsResponse } from '@/types/Target';
import ProjectCard from '@/components/ProjectCard.vue';
import type { ProjectWithStats } from '@/types/Project';

export default {
  name: 'ProjectDetailsPage',
  components: {
    TargetCard,
    ProjectCard
  },
  data() {
    return {
      project: undefined as ProjectWithStats | undefined,
      stats: undefined,
      targets: [] as TargetWithStats[],
    };
  },
  created() {
    this.fetchData();
  },
  methods: {
    fetchData() {
      API.get(`/projects/${this.$route.params.id}`)
        .then((response) => {
          this.project = response.data;
        })
        .catch((error) => {
          console.error('Error fetching project data:', error);
        });

      API.get(`/projects/${this.$route.params.id}/stats`)
        .then((response) => {
          if (this.project) {
            this.project.stats = response.data;
            this.project.last_image_date = response.data.last_image_date;
          }
        })
        .catch((error) => {
          console.error('Error fetching project stats:', error);
        });

      API.get<ListTargetsResponse>(`/projects/${this.$route.params.id}/targets`)
        .then((response) => {
          this.targets = response.data.targets;
          // Fetch stats for each target
          this.fetchTargetStats();
        })
        .catch((error) => {
          console.error('Error fetching project targets:', error);
        });
    },
    fetchTargetStats() {
      this.targets.forEach((target, index) => {
        API.get(`/targets/${target.id}/image/stats`)
          .then((response) => {
            if (this.targets[index]) {
              this.targets[index].stats = response.data;
            }
          })
          .catch((error) => {
            console.error(`Error fetching stats for target ${target.id}:`, error);
          });
      });
    },
  },
};
</script>
