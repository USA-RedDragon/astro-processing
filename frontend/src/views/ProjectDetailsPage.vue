<template>
  <div class="space-y-6">
    <template v-if="project">
      <ProjectCard :project="project" :show-cover="false" />
    </template>

    <section class="space-y-4" aria-labelledby="scheduler-h">
      <h2 id="scheduler-h" class="text-xl font-semibold">Scheduler</h2>
      <SchedulerTabs :project-id="$route.params.id as string" />
    </section>

    <MosaicCard v-if="mosaics.length > 0" :mosaics="mosaics" :project="project?.name ?? ''" />
    <PaletteMixer
      v-if="mosaics.length > 0"
      :masters="mosaics"
      :cover-palette="project?.cover?.mosaic ? project.cover.palette : ''"
    />

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
      <div v-else-if="loaded" class="text-center text-muted-foreground py-8">
        No targets found for this project.
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import TargetCard from '@/components/TargetCard.vue';
import ProjectCard from '@/components/ProjectCard.vue';
import MosaicCard from '@/components/MosaicCard.vue';
import PaletteMixer from '@/components/PaletteMixer.vue';
import SchedulerTabs from '@/scheduler/components/SchedulerTabs.vue';
import API from '@/lib/API';
import { onChange, onEvent, onReconnect, type LiveEvent } from '@/lib/events';
import type { Mosaic, Target, Project } from '../graphql/graphql';

// Loaded on its own: it waits on the stacker, and most projects have none.
const GET_PROJECT_MOSAICS_QUERY = `
  query GetProjectMosaics($id: ID!) {
    project(id: $id) {
      mosaics {
        filter
        panels
        panels_total
        width
        height
        updated_at
        master_url
        preview_url
        linear_url
        crop { x y w h }
      }
    }
  }
`;

const GET_PROJECT_WITH_TARGETS_QUERY = `
  query GetProject($id: ID!) {
    project(id: $id) {
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
      flats_handling
      maximum_altitude
      smart_exposure_order
      targets {
        id
        name
        active
        ra
        dec
        epoch
        rotation
        region_of_interest
        stats {
          last_image_date
          total {
            desired_images
            accepted_images
            rejected_images
            acquired_images
          }
          filters {
            filter_name
            template_name
            exposure
            exposure_source
            enabled
            gain
            offset
            imaging {
              desired_images
              accepted_images
              rejected_images
              acquired_images
            }
          }
        }
      }
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
      cover {
        palette
        mosaic
      }
    }
  }
`;

export default {
  name: 'ProjectDetailsPage',
  components: {
    TargetCard,
    ProjectCard,
    MosaicCard,
    PaletteMixer,
    SchedulerTabs,
  },
  data() {
    return {
      project: undefined as Project | undefined,
      stats: undefined,
      targets: [] as Target[],
      mosaics: [] as Mosaic[],
      loaded: false,
      stopEvents: () => {},
      stopReconnect: () => {},
      stopChanges: () => {},
    };
  },
  created() {
    this.fetchData();
    this.fetchMosaics();
    this.stopEvents = onEvent((e: LiveEvent) => {
      if (e.type === 'mosaic' && this.project && e.object === this.project.name) this.fetchMosaics();
    });
    this.stopReconnect = onReconnect(() => this.fetchMosaics());
    this.stopChanges = onChange(['project', 'target', 'exposureplan', 'acquiredimage'], () => this.fetchData());
  },
  unmounted() {
    this.stopEvents();
    this.stopChanges();
    this.stopReconnect();
  },
  methods: {
    async fetchMosaics() {
      try {
        const r = await API.request(GET_PROJECT_MOSAICS_QUERY, { id: this.$route.params.id as string });
        if (r.project) this.mosaics = r.project.mosaics as Mosaic[];
      } catch (error) {
        console.error('Error fetching mosaics:', error);
      }
    },
    async fetchData() {
      try {
        const projectId = this.$route.params.id as string;

        // Fetch project with all targets and their stats in a single GraphQL query
        const response = await API.request(GET_PROJECT_WITH_TARGETS_QUERY, {
          id: projectId,
        });

        if (response.project) {
          // Set project data with stats already included
          this.project = response.project as Project;

          // Set targets data with stats already included
          this.targets = response.project.targets as Target[];
        }
      } catch (error) {
        console.error('Error fetching project data:', error);
      } finally {
        this.loaded = true;
      }
    },
  },
};
</script>
