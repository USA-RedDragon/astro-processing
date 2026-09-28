<template>
  <div>
    <div v-if="loading" class="flex justify-center items-center min-h-screen">
      <p class="text-lg">Loading targets...</p>
    </div>
    <div v-else-if="error" class="flex justify-center items-center min-h-screen">
      <p class="text-lg text-red-500">Error loading targets: {{ error }}</p>
    </div>
    <div v-else class="space-y-8">
      <!-- Sort Bar -->
      <div class="px-4 py-4 flex items-center gap-4">
        <label class="text-sm font-medium">Sort by:</label>
        <SelectRoot v-model="sortField">
          <SelectTrigger class="w-[200px]">
            <SelectValue placeholder="Select sort field" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LAST_IMAGE_DATE">Last Image Date</SelectItem>
            <SelectItem value="NAME">Name</SelectItem>
            <SelectItem value="PRIORITY">Priority</SelectItem>
            <SelectItem value="STATE">State</SelectItem>
            <SelectItem value="CREATE_DATE">Create Date</SelectItem>
            <SelectItem value="ACTIVE_DATE">Active Date</SelectItem>
            <SelectItem value="PROGRESS">Progress</SelectItem>
            <SelectItem value="MOSAIC">Mosaic</SelectItem>
          </SelectContent>
        </SelectRoot>

        <SelectRoot v-model="sortDirection">
          <SelectTrigger class="w-[150px]">
            <SelectValue placeholder="Select direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DESC">Descending</SelectItem>
            <SelectItem value="ASC">Ascending</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>

      <div v-if="projects.length > 0" class="info px-4">
        <ProjectCard
          v-for="project in projects"
          :key="project.id"
          :project="project"
          :titleLink="`/project/${project.id}`"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import API from '@/lib/API';
import ProjectCard from '@/components/ProjectCard.vue';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { onChange, onEvent, onReconnect } from '@/lib/events';
import type { Project, ProjectCover } from '../graphql/graphql';

// Reloaded when the stacker updates a master or mosaic.
const GET_PROJECT_COVERS_QUERY = `
  query GetProjectCovers {
    projects {
      id
      cover {
        palette
        filter
        preview_url
        mosaic
        updated_at
      }
    }
  }
`;

const GET_PROJECTS_QUERY = `
  query GetProjects($orderBy: ProjectOrderBy) {
    projects(orderBy: $orderBy) {
      id
      profile_id
      name
      description
      state
      priority
      create_date
      active_date
      inactive_date
      minimum_time
      minimum_altitude
      use_custom_horizon
      horizon_offset
      meridian_window
      filter_switch_frequency
      dither_every
      enable_grader
      is_mosaic
      cover {
        palette
        filter
        preview_url
        mosaic
        updated_at
      }
      flats_handling
      maximum_altitude
      smart_exposure_order
      stats {
        imaging {
          desired_images
          accepted_images
          rejected_images
          acquired_images
        }
        last_image_date
      }
    }
  }
`;

type ProjectGroup = {
  key: string;
  projectId: number | null;
  projectName: string | null;
  projectDescription?: string;
  projects: Project[];
};

export default {
  components: {
    ProjectCard,
    SelectRoot,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  },
  created() {
    this.fetchData();
    this.stopEvents = onEvent((e) => {
      if (e.type === 'master' || e.type === 'mosaic') this.refreshCovers();
    });
    this.stopReconnect = onReconnect(() => this.refreshCovers());
    // Every stat on the cards comes from these tables.
    this.stopChanges = onChange(['project', 'target', 'exposureplan', 'acquiredimage'], () => this.fetchData(true));
  },
  unmounted() {
    this.stopEvents();
    this.stopChanges();
    this.stopReconnect();
    if (this.coverTimer) clearTimeout(this.coverTimer);
  },
  data: function() {
    return {
      projects: [] as Project[],
      loading: true,
      error: null as string | null,
      circumference: 2 * Math.PI * 28, // 28 is the radius for target cards
      projectCircumference: 2 * Math.PI * 35, // 35 is the radius for project headers
      sortField: 'LAST_IMAGE_DATE' as string,
      sortDirection: 'DESC' as string,
      stopEvents: () => {},
      stopReconnect: () => {},
      stopChanges: () => {},
      coverTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
  },
  watch: {
    sortField() {
      this.fetchData();
    },
    sortDirection() {
      this.fetchData();
    },
  },
  methods: {
    // refreshCovers reloads the cards' pictures, at most every 5 s.
    refreshCovers() {
      if (this.coverTimer) return;
      this.coverTimer = setTimeout(async () => {
        this.coverTimer = undefined;
        try {
          const r = await API.request(GET_PROJECT_COVERS_QUERY);
          const covers = new Map<string, ProjectCover | null | undefined>(
            (r.projects as Project[]).map((p) => [p.id, p.cover]),
          );
          for (const p of this.projects) {
            if (covers.has(p.id)) p.cover = covers.get(p.id);
          }
        } catch (error) {
          console.error('Error refreshing covers:', error);
        }
      }, 5000);
    },
    // fetchData loads the projects; quiet reloads keep the page as it is
    // until the new data arrives.
    async fetchData(quiet = false) {
      try {
        if (!quiet) this.loading = true;
        this.error = null;

        // Fetch all projects with their stats via GraphQL with sorting
        const response = await API.request(GET_PROJECTS_QUERY, {
          orderBy: {
            field: this.sortField,
            direction: this.sortDirection,
          },
        });
        const projects = response.projects;

        // Use projects directly since GraphQL includes all needed data
        this.projects = projects;
      } catch (err) {
        const error = err as Error;
        this.error = error.message || 'Failed to fetch projects';
        console.error('Error fetching projects:', err);
      } finally {
        this.loading = false;
      }
    },
    getProjectStats(group: ProjectGroup): { accepted: number; desired: number; total: number } {
      let totalAccepted = 0;
      let totalDesired = 0;

      for (const project of group.projects) {
        if (project.stats) {
          totalAccepted += project.stats.imaging.accepted_images;
          totalDesired += project.stats.imaging.desired_images;
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
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

@media (min-width: 2400px) {
  .info {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 1600px) {
  .info {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 1200px) {
  .info {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 800px) {
  .info {
    grid-template-columns: repeat(1, 1fr);
  }
}
</style>
