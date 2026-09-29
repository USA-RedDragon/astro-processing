<template>
  <Card>
    <CardHeader>
      <CardTitle>Masters</CardTitle>
    </CardHeader>
    <CardContent>
      <p class="text-sm text-muted-foreground mb-4">
        Subs scoring at least 0.3 of the target's best, added as they arrive. The XISF opens in PixInsight
        upright and plate solved.
      </p>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="m in masters" :key="m.filter" class="rounded-md border overflow-hidden">
          <a :href="m.preview_url" target="_blank" rel="noopener" class="block bg-black">
            <img
              :src="shown[m.filter] ?? m.preview_url"
              :alt="`${m.filter} master`"
              loading="lazy"
              class="w-full aspect-[3/2] object-contain"
            >
          </a>
          <a
            v-if="m.comet_preview_url"
            :href="m.comet_preview_url"
            target="_blank"
            rel="noopener"
            class="block relative bg-black border-t"
          >
            <img
              :src="m.comet_preview_url"
              :alt="`${m.filter} comet master`"
              loading="lazy"
              class="w-full aspect-[3/2] object-contain"
            >
            <span class="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
              Aligned on the comet
            </span>
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
              <span class="text-muted-foreground tabular-nums">{{ m.subs }} subs</span>
            </div>
            <div class="tabular-nums">
              {{ m.effective_hours.toFixed(1) }} h effective
              <span class="text-muted-foreground">&middot; {{ m.exposure_hours.toFixed(1) }} h total</span>
            </div>
            <div class="text-xs text-muted-foreground">Updated {{ formatDate(Date.parse(m.updated_at) / 1000) }}</div>
            <div class="flex flex-wrap gap-2 mt-1">
              <a
                v-if="m.xisf_url"
                :href="m.xisf_url"
                title="For PixInsight: opens upright and plate solved"
                class="inline-block border rounded-md px-3 py-1 hover:bg-accent"
              >
                XISF
              </a>
              <a
                v-if="m.fitted_url"
                :href="m.fitted_url"
                :title="`Linear fitted to ${m.fit_reference}`"
                class="inline-block border rounded-md px-3 py-1 hover:bg-accent"
              >
                LinearFit XISF
              </a>
              <a
                v-if="m.comet_xisf_url"
                :href="m.comet_xisf_url"
                title="Aligned on the comet"
                class="inline-block border rounded-md px-3 py-1 hover:bg-accent"
              >
                Comet XISF
              </a>
              <a
                v-if="m.comet_url"
                :href="m.comet_url"
                title="Aligned on the comet"
                class="inline-block border rounded-md px-3 py-1 hover:bg-accent"
              >
                Comet FITS
              </a>
              <a
                :href="m.master_url"
                title="Standard FITS, for Siril and other tools"
                class="inline-block border rounded-md px-3 py-1 hover:bg-accent"
              >
                FITS
              </a>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/formatters';
import type { FilterMaster } from '../graphql/graphql';

export default {
  name: 'MastersCard',
  components: { Card, CardContent, CardHeader, CardTitle, LoaderCircle },
  props: {
    masters: {
      type: Array as PropType<FilterMaster[]>,
      required: true,
    },
    // Filters being stacked right now.
    updating: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
  },
  data() {
    return {
      // The preview each card shows. A new one replaces it only once it
      // has loaded, so the image never goes blank while a master updates.
      shown: {} as Record<string, string>,
      shownAt: {} as Record<string, string>,
    };
  },
  watch: {
    masters: {
      immediate: true,
      handler(masters: FilterMaster[]) {
        for (const m of masters) {
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
