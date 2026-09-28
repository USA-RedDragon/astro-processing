<template>
  <div ref="root" class="relative inline-block">
    <button
      v-if="busy"
      type="button"
      class="inline-flex items-center p-1 text-muted-foreground hover:text-foreground"
      aria-label="What is processing"
      :aria-expanded="open"
      @click="open = !open"
    >
      <LoaderCircle class="size-4 animate-spin" />
    </button>
    <div
      v-if="open && busy"
      class="absolute right-0 top-full mt-2 z-50 w-80 rounded-md border bg-background p-3 shadow-md
        text-sm text-left space-y-3"
    >
      <div v-for="w in status.workers" :key="w.object" class="space-y-1">
        <div class="flex justify-between gap-2">
          <span class="font-medium truncate">{{ w.object }} · {{ w.filter }}</span>
          <span class="text-muted-foreground shrink-0">
            {{ stageLabels[w.stage] ?? w.stage }}{{ w.total ? ` ${w.done}/${w.total}` : '' }}
          </span>
        </div>
        <UiProgress :model-value="w.total ? (100 * w.done) / w.total : 0" class="h-1.5" />
      </div>
      <div v-if="status.backlog" class="space-y-1 text-muted-foreground">
        <div v-if="stackTotal > 0">
          <div class="flex justify-between">
            <span>Subs checked</span>
            <span class="tabular-nums">{{ status.backlog.lights_done }} of {{ stackTotal }}</span>
          </div>
          <UiProgress :model-value="(100 * status.backlog.lights_done) / stackTotal" class="h-1.5 mt-1" />
        </div>
        <div v-if="status.backlog.previews_pending > 0" class="flex justify-between">
          <span>Previews left</span>
          <span class="tabular-nums">{{ status.backlog.previews_pending }}</span>
        </div>
        <div v-if="status.backlog.dead > 0" class="flex justify-between">
          <span>Subs that failed 5 times</span>
          <span class="tabular-nums">{{ status.backlog.dead }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { LoaderCircle } from 'lucide-vue-next';
import { Progress } from '@/components/ui/progress';
import { stageLabels, status, watchStatus } from '@/lib/events';

export default {
  name: 'ProcessingIndicator',
  components: { LoaderCircle, UiProgress: Progress },
  data() {
    return { open: false, status, stageLabels };
  },
  computed: {
    stackTotal(): number {
      const b = this.status.backlog;
      return b ? b.lights_done + b.lights_pending : 0;
    },
    busy(): boolean {
      const b = this.status.backlog;
      return this.status.workers.length > 0 || (b !== null && b.previews_pending > 0);
    },
  },
  mounted() {
    watchStatus();
    document.addEventListener('click', this.closeOutside);
  },
  unmounted() {
    document.removeEventListener('click', this.closeOutside);
  },
  methods: {
    closeOutside(e: MouseEvent) {
      const root = this.$refs.root as HTMLElement | undefined;
      if (this.open && root && !root.contains(e.target as Node)) this.open = false;
    },
  },
};
</script>
