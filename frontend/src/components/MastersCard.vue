<template>
  <Card>
    <CardHeader>
      <CardTitle>Masters</CardTitle>
    </CardHeader>
    <CardContent>
      <p class="text-sm text-muted-foreground mb-4">
        Only subs scoring 0.3 or better, added as they arrive. Linear FITS, ready for PixInsight.
      </p>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="m in masters" :key="m.filter" class="rounded-md border overflow-hidden">
          <a :href="m.preview_url" target="_blank" rel="noopener" class="block bg-black">
            <img
              :src="m.preview_url"
              :alt="`${m.filter} master`"
              loading="lazy"
              class="w-full aspect-[3/2] object-contain"
            >
          </a>
          <div class="p-3 space-y-1 text-sm">
            <div class="flex items-baseline justify-between">
              <span class="font-semibold">{{ m.filter }}</span>
              <span class="text-muted-foreground tabular-nums">{{ m.subs }} subs</span>
            </div>
            <div class="tabular-nums">
              {{ m.effective_hours.toFixed(1) }} h effective
              <span class="text-muted-foreground">&middot; {{ m.exposure_hours.toFixed(1) }} h total</span>
            </div>
            <div class="text-xs text-muted-foreground">Updated {{ formatDate(Date.parse(m.updated_at) / 1000) }}</div>
            <a
              :href="m.master_url"
              class="inline-block mt-1 border rounded-md px-3 py-1 hover:bg-accent"
            >
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/formatters';
import type { FilterMaster } from '../graphql/graphql';

export default {
  name: 'MastersCard',
  components: { Card, CardContent, CardHeader, CardTitle },
  props: {
    masters: {
      type: Array as PropType<FilterMaster[]>,
      required: true,
    },
  },
  methods: {
    formatDate,
  },
};
</script>
