<template>
  <div class="space-y-6">
    <div v-if="!target && !loaded" class="space-y-2" aria-busy="true">
      <div class="h-7 w-72 rounded bg-muted animate-pulse" />
      <div class="h-4 w-2/3 rounded bg-muted animate-pulse" />
    </div>
    <p v-else-if="!target" class="text-muted-foreground">No target named {{ name }}.</p>
    <div v-if="target">
      <router-link to="/" class="text-sm text-muted-foreground hover:underline">&larr; Home</router-link>
      <h1 class="text-2xl font-semibold mt-1">{{ target.name }}</h1>
      <p class="text-sm text-muted-foreground mt-1 tabular-nums">
        {{ target.lights }} lights, {{ target.stacked }} stacked, over {{ target.nights }}
        {{ target.nights === 1 ? 'night' : 'nights' }}. {{ unrecorded }}; lights without its record are scored
        from their own sky and star sizes.
      </p>
    </div>

    <MastersCard v-if="masters.length > 0" :masters="masters" :updating="updatingFilters" />

    <PaletteMixer v-if="masters.length > 0" :masters="masters" />
  </div>
</template>

<script lang="ts">
import API from '@/lib/API';
import MastersCard from '@/components/MastersCard.vue';
import PaletteMixer from '@/components/PaletteMixer.vue';
import { onEvent, onReconnect, status } from '@/lib/events';
import { unrecordedLights } from '@/lib/otherTargets';
import type { FilterMaster, OtherTarget } from '../graphql/graphql';

const GET_OTHER_TARGET_QUERY = `
  query GetOtherTarget($name: String!) {
    otherTarget(name: $name) {
      name
      lights
      recorded
      stacked
      nights
      first_night
      last_night
      masters {
        filter
        subs
        exposure_hours
        effective_hours
        width
        height
        updated_at
        master_url
        preview_url
        linear_url
        crop { x y w h }
        xisf_url
        fitted_url
        fit_reference
        comet_preview_url
        comet_url
        comet_xisf_url
      }
    }
  }
`;

export default {
  name: 'ObjectPage',
  components: { MastersCard, PaletteMixer },
  data() {
    return {
      target: null as OtherTarget | null,
      masters: [] as FilterMaster[],
      loaded: false,
      stopEvents: () => {},
      stopReconnect: () => {},
    };
  },
  computed: {
    name(): string {
      return String(this.$route.params.name ?? '');
    },
    unrecorded(): string {
      return this.target ? unrecordedLights(this.target) : '';
    },
    updatingFilters(): string[] {
      return status.workers.filter((w) => w.object === this.name).map((w) => w.filter);
    },
  },
  watch: {
    name() {
      this.fetchData();
    },
  },
  created() {
    this.fetchData();
    this.stopEvents = onEvent((e) => {
      if (e.type === 'master' && e.object === this.name) this.fetchData();
    });
    this.stopReconnect = onReconnect(() => this.fetchData());
  },
  unmounted() {
    this.stopEvents();
    this.stopReconnect();
  },
  methods: {
    async fetchData() {
      try {
        const r = await API.request(GET_OTHER_TARGET_QUERY, { name: this.name });
        this.target = (r.otherTarget as OtherTarget | null) ?? null;
        this.masters = (this.target?.masters ?? []) as FilterMaster[];
      } catch (error) {
        console.error('Error fetching target:', error);
      } finally {
        this.loaded = true;
      }
    },
  },
};
</script>
