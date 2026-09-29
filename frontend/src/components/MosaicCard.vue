<template>
  <Card>
    <CardHeader>
      <CardTitle>Mosaic</CardTitle>
    </CardHeader>
    <CardContent>
      <p class="text-sm text-muted-foreground mb-4">
        The panels' masters, plate solved and blended. Rebuilt 30 minutes after a panel's master last changed.
        Linear FITS with the astrometric solution, ready for PixInsight.
      </p>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="m in mosaics" :key="m.filter" class="rounded-md border overflow-hidden">
          <a :href="m.preview_url" target="_blank" rel="noopener" class="block bg-black">
            <img
              :src="shown[m.filter] ?? m.preview_url"
              :alt="`${m.filter} mosaic`"
              loading="lazy"
              class="w-full aspect-[3/2] object-contain"
            >
          </a>
          <div class="p-3 space-y-1 text-sm">
            <div class="flex items-baseline justify-between">
              <span class="font-semibold inline-flex items-center gap-1.5">
                {{ m.filter }}
                <LoaderCircle
                  v-if="updating.includes(m.filter)"
                  class="size-3.5 animate-spin text-muted-foreground"
                  aria-label="Updating"
                />
              </span>
              <span class="text-muted-foreground tabular-nums">{{ m.panels }} of {{ m.panels_total }} panels</span>
            </div>
            <div class="text-muted-foreground tabular-nums">{{ m.width }} × {{ m.height }}</div>
            <div class="text-xs text-muted-foreground">Updated {{ formatDate(Date.parse(m.updated_at) / 1000) }}</div>
            <a :href="m.master_url" class="inline-block mt-1 border rounded-md px-3 py-1 hover:bg-accent">
              Download FITS
            </a>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { status } from '@/lib/events';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/formatters';
import type { Mosaic } from '../graphql/graphql';

export default {
  name: 'MosaicCard',
  components: { Card, CardContent, CardHeader, CardTitle, LoaderCircle },
  props: {
    mosaics: {
      type: Array as PropType<Mosaic[]>,
      required: true,
    },
    project: {
      type: String,
      required: true,
    },
  },
  computed: {
    // Filters whose mosaic the stacker is assembling now.
    updating(): string[] {
      return status.workers.filter((w) => w.object === `Mosaic: ${this.project}`).map((w) => w.filter);
    },
  },
  data() {
    return {
      // A new preview replaces the shown one only once it has loaded.
      shown: {} as Record<string, string>,
      shownAt: {} as Record<string, string>,
    };
  },
  watch: {
    mosaics: {
      immediate: true,
      handler(mosaics: Mosaic[]) {
        for (const m of mosaics) {
          if (this.shownAt[m.filter] === m.updated_at) continue;
          if (!this.shown[m.filter]) {
            this.shown[m.filter] = m.preview_url;
            this.shownAt[m.filter] = m.updated_at;
            continue;
          }
          const img = new Image();
          img.onload = () => {
            this.shown[m.filter] = m.preview_url;
            this.shownAt[m.filter] = m.updated_at;
          };
          img.src = m.preview_url;
        }
      },
    },
  },
  methods: {
    formatDate,
  },
};
</script>
