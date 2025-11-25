<template>
  <div>
    <div v-if="loading" class="flex justify-center items-center min-h-screen">
      <p class="text-lg">Loading targets...</p>
    </div>
    <div v-else-if="error" class="flex justify-center items-center min-h-screen">
      <p class="text-lg text-red-500">Error loading targets: {{ error }}</p>
    </div>
    <div v-else class="space-y-8">
      <div v-if="projects.length > 0" class="info px-4">
        <div v-for="project in projects" :key="project.id">
          <ProjectCard :project="project" :titleLink="`/project/${project.id}`" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import API from '@/services/API';
import type {
  ListProjectsResponse,
  ProjectWithStats,
  Stats,
} from '@/types/Project';
import ProjectCard from '@/components/ProjectCard.vue';

type ProjectGroup = {
  key: string;
  projectId: number | null;
  projectName: string | null;
  projectDescription?: string;
  projects: ProjectWithStats[];
};

export default {
  components: {
    ProjectCard,
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
      projects: [] as ProjectWithStats[],
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
        const response = await API.get<ListProjectsResponse>('/projects');
        const projects = response.data.projects;

        // Fetch stats for each target
        const projectsWithStats = await Promise.all(
          projects.map(async (project) => {
            try {
              const statsResponse = await API.get<Stats>(`/projects/${project.id}/stats`);
              return {
                ...project,
                stats: statsResponse.data,
              };
            } catch (err) {
              // If stats fail, return project without stats
              console.error(`Failed to fetch stats for project ${project.id}:`, err);
              return project;
            }
          })
        );

        this.projects = projectsWithStats;
      } catch (err) {
        const error = err as Error;
        this.error = error.message || 'Failed to fetch targets';
        console.error('Error fetching targets:', err);
      } finally {
        this.loading = false;
      }
    },
    getProjectStats(group: ProjectGroup): { accepted: number; desired: number; total: number } {
      let totalAccepted = 0;
      let totalDesired = 0;

      for (const project of group.projects) {
        if (project.stats) {
          totalAccepted += project.stats.accepted_images;
          totalDesired += project.stats.desired_images;
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
  -webkit-column-count: 3;
  -moz-column-count: 3;
  column-count: 3;
  column-gap: 1rem;
}

.info > div {
  break-inside: avoid;
  margin-bottom: 1rem;
}

@media (min-width: 2400px) {
  .info {
    -moz-column-count: 4;
    -webkit-column-count: 4;
    column-count: 4;
  }
}
@media (max-width: 1600px) {
  .info {
    -moz-column-count: 3;
    -webkit-column-count: 3;
    column-count: 3;
  }
}
@media (max-width: 1200px) {
  .info {
    -moz-column-count: 2;
    -webkit-column-count: 2;
    column-count: 2;
  }
}
@media (max-width: 800px) {
  .info {
    -moz-column-count: 1;
    -webkit-column-count: 1;
    column-count: 1;
  }
}
</style>
