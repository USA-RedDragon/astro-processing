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
import ProjectCard from '@/components/ProjectCard.vue';
import API from '@/lib/API';
import type { Target, Project } from '../graphql/graphql';

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
            exposure_time
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
      }
    }
  }
`;

export default {
  name: 'ProjectDetailsPage',
  components: {
    TargetCard,
    ProjectCard
  },
  data() {
    return {
      project: undefined as Project | undefined,
      stats: undefined,
      targets: [] as Target[],
    };
  },
  created() {
    this.fetchData();
  },
  methods: {
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
      }
    },
  },
};
</script>
