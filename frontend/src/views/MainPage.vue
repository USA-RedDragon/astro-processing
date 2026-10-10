<template>
  <div>
    <div v-if="loading && !listView" class="flex justify-center items-center min-h-screen">
      <p class="text-lg">Loading targets...</p>
    </div>
    <div v-else-if="error && !listView" class="flex justify-center items-center min-h-screen">
      <p class="text-lg text-red-500">Error loading targets: {{ error }}</p>
    </div>
    <div v-else class="space-y-8">
      <!-- Sort Bar -->
      <div class="px-4 py-4 flex flex-wrap items-center gap-4">
        <div role="group" aria-label="View" class="inline-flex rounded-md border p-0.5 gap-0.5">
          <button
            v-for="v in ['cards', 'list']"
            :key="v"
            type="button"
            class="h-8 px-3 rounded-sm text-sm cursor-pointer"
            :class="(v === 'list') === listView ? 'bg-secondary font-semibold' : 'text-muted-foreground'"
            :aria-pressed="(v === 'list') === listView"
            @click="setView(v)"
          >
            {{ v === 'list' ? 'List' : 'Cards' }}
          </button>
        </div>
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

        <input
          v-model="filter.q"
          type="search"
          aria-label="Search name, description or target"
          placeholder="Search name, description or target"
          class="h-9 w-full sm:w-[15rem] rounded-md border border-input bg-transparent px-3 text-sm shadow-xs
            outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >

        <SelectRoot v-for="f in filterSelects" :key="f.key" v-model="filter[f.key]">
          <SelectTrigger class="min-w-[7rem]" :aria-label="f.label">
            <span class="text-muted-foreground">{{ f.label }}:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="o in f.options" :key="o" :value="o">{{ o }}</SelectItem>
          </SelectContent>
        </SelectRoot>

        <button
          v-if="filtering"
          type="button"
          class="text-sm underline underline-offset-4 cursor-pointer"
          @click="filter = emptyFilter()"
        >
          Clear filters
        </button>

        <router-link
          :to="{ name: 'add' }"
          class="ml-auto inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium
            text-primary-foreground hover:bg-primary/90"
        >
          Add target
        </router-link>
      </div>

      <div v-if="listView" class="px-4">
        <ProjectsTable :filter="filter" :order="projects.map((p) => p.id)" />
      </div>

      <!-- Cards keep their own heights: dealt left to right into columns, so
           the sort order reads across and nothing stretches to its row. -->
      <div v-if="!listView && shownProjects.length > 0" class="info px-4">
        <div v-for="(column, c) in columns" :key="c" class="flex flex-col gap-4 min-w-0">
          <ProjectCard
            v-for="project in column"
            :key="project.id"
            :project="project"
            :titleLink="`/project/${project.id}`"
          />
        </div>
      </div>

      <p v-if="!listView && projects.length > 0 && shownProjects.length === 0" class="px-4 text-muted-foreground">
        No project matches these filters.
      </p>

      <div v-if="!listView && otherTargets.length > 0" class="px-4 space-y-4">
        <div>
          <h2 class="text-xl font-semibold">Other targets</h2>
          <p class="text-sm text-muted-foreground">
            Lights Target Scheduler did not record, with no Target Scheduler target.
          </p>
        </div>
        <div class="info">
          <div v-for="(column, c) in otherColumns" :key="c" class="flex flex-col gap-4 min-w-0">
            <OtherTargetCard v-for="t in column" :key="t.name" :target="t" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import API from '@/lib/API';
import ProjectCard from '@/components/ProjectCard.vue';
import OtherTargetCard from '@/components/OtherTargetCard.vue';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { onChange, onEvent, onReconnect } from '@/lib/events';
import ProjectsTable from '@/scheduler/components/ProjectsTable.vue';
import { emptyFilter, filterActive, matchesFilter, type ProjectFilter } from '@/scheduler/projects';
import type { OtherTarget, Project, ProjectCover } from '../graphql/graphql';

// Reloaded when the stacker updates a master or mosaic.
const GET_OTHER_TARGETS_QUERY = `
  query GetOtherTargets {
    otherTargets {
      name
      lights
      recorded
      stacked
      nights
      first_night
      last_night
      cover {
        palette
        filter
        preview_url
        updated_at
      }
    }
  }
`;

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
        panels
        panels_total
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
      targets {
        name
      }
      cover {
        palette
        filter
        preview_url
        mosaic
        updated_at
        panels
        panels_total
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
        plans
        plans_met
      }
    }
  }
`;

export default {
  components: {
    OtherTargetCard,
    ProjectCard,
    ProjectsTable,
    SelectRoot,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  },
  created() {
    this.fetchData();
    this.fitColumns();
    window.addEventListener('resize', this.fitColumns);
    this.fetchOthers();
    this.stopEvents = onEvent((e) => {
      if (e.type === 'master' || e.type === 'mosaic') this.refreshCovers();
      if (e.type === 'master' || e.type === 'frames') this.refreshOthers();
    });
    this.stopReconnect = onReconnect(() => {
      this.refreshCovers();
      this.refreshOthers();
    });
    // Every stat on the cards comes from these tables.
    this.stopChanges = onChange(['project', 'target', 'exposureplan', 'acquiredimage'], () => this.fetchData(true));
  },
  unmounted() {
    window.removeEventListener('resize', this.fitColumns);
    this.stopEvents();
    this.stopChanges();
    this.stopReconnect();
    if (this.coverTimer) clearTimeout(this.coverTimer);
    if (this.othersTimer) clearTimeout(this.othersTimer);
  },
  data: function() {
    return {
      projects: [] as Project[],
      otherTargets: [] as OtherTarget[],
      othersTimer: undefined as ReturnType<typeof setTimeout> | undefined,
      loading: true,
      error: null as string | null,
      sortField: 'LAST_IMAGE_DATE' as string,
      sortDirection: 'DESC' as string,
      filter: emptyFilter() as ProjectFilter,
      filterSelects: [
        { key: 'pri', label: 'Priority', options: ['All', 'High', 'Normal', 'Low'] },
        { key: 'state', label: 'State', options: ['All', 'Active', 'Inactive', 'Closed', 'Draft'] },
        { key: 'kind', label: 'Kind', options: ['All', 'Single', 'Mosaic'] },
      ] as { key: 'pri' | 'state' | 'kind'; label: string; options: string[] }[],
      columnCount: 3,
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
    emptyFilter,
    setView(v: string) {
      const query = { ...this.$route.query };
      if (v === 'list') query.view = 'list';
      else delete query.view;
      this.$router.replace({ query });
    },
    fitColumns() {
      const w = window.innerWidth;
      this.columnCount = w > 2400 ? 4 : w > 1200 ? 3 : w > 800 ? 2 : 1;
    },
    async fetchOthers() {
      try {
        const r = await API.request(GET_OTHER_TARGETS_QUERY);
        this.otherTargets = (r.otherTargets ?? []) as OtherTarget[];
      } catch (error) {
        console.error('Error fetching other targets:', error);
      }
    },
    // refreshOthers reloads the other targets, at most every 5 s.
    refreshOthers() {
      if (this.othersTimer) return;
      this.othersTimer = setTimeout(() => {
        this.othersTimer = undefined;
        this.fetchOthers();
      }, 5000);
    },
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
  },
  computed: {
    listView(): boolean {
      return this.$route.query.view === 'list';
    },
    filtering(): boolean {
      return filterActive(this.filter);
    },
    shownProjects(): Project[] {
      return this.projects.filter((p) =>
        matchesFilter(this.filter, {
          name: p.name,
          description: p.description,
          priority: p.priority,
          state: p.state,
          isMosaic: !!p.is_mosaic,
          targetNames: (p.targets ?? []).map((t) => t?.name ?? ''),
        }),
      );
    },
    columns(): Project[][] {
      const cols: Project[][] = Array.from({ length: this.columnCount }, () => []);
      this.shownProjects.forEach((p, i) => cols[i % this.columnCount]!.push(p));
      return cols;
    },
    otherColumns(): OtherTarget[][] {
      const cols: OtherTarget[][] = Array.from({ length: this.columnCount }, () => []);
      this.otherTargets.forEach((t, i) => cols[i % this.columnCount]!.push(t));
      return cols;
    },
  },
};
</script>

<style scoped>
.info {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 1rem;
  align-items: start;
}
</style>
