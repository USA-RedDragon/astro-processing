<template>
  <Card class="relative overflow-hidden">
    <router-link v-if="target.cover" :to="link" class="block relative -mt-6 mb-2 bg-black">
      <img
        :src="target.cover.preview_url"
        :alt="`${target.name} preview`"
        loading="lazy"
        class="w-full h-auto max-h-[36rem] object-cover"
      >
      <span class="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {{ target.cover.palette || target.cover.filter }}
      </span>
      <span v-if="processing" class="absolute top-2 left-2 rounded-full bg-black/60 p-1" title="Processing">
        <LoaderCircle class="size-4 animate-spin text-white" aria-label="Processing" />
      </span>
    </router-link>
    <CardHeader>
      <CardTitle>
        <router-link :to="link" class="underline hover:text-primary transition">{{ target.name }}</router-link>
        <LoaderCircle
          v-if="processing && !target.cover"
          class="inline size-4 ml-1.5 animate-spin text-muted-foreground align-middle"
          aria-label="Processing"
        />
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-1 text-sm">
      <div class="tabular-nums">
        {{ target.lights }} lights &middot; {{ target.stacked }} stacked &middot;
        {{ target.nights }} {{ target.nights === 1 ? 'night' : 'nights' }}
      </div>
      <div v-if="target.first_night" class="text-muted-foreground">
        {{ nights }}
      </div>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { status } from '@/lib/events';
import type { OtherTarget } from '../graphql/graphql';

export default {
  name: 'OtherTargetCard',
  components: { Card, CardContent, CardHeader, CardTitle, LoaderCircle },
  props: {
    target: {
      type: Object as PropType<OtherTarget>,
      required: true,
    },
  },
  computed: {
    link(): string {
      return `/object/${encodeURIComponent(this.target.name)}`;
    },
    nights(): string {
      const { first_night: first, last_night: last } = this.target;
      return first === last ? `${first}` : `${first} to ${last}`;
    },
    processing(): boolean {
      return status.workers.some((w) => w.object === this.target.name);
    },
  },
};
</script>
