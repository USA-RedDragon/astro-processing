<template>
  <div ref="root" class="relative inline-block">
    <button
      v-if="busy || failed"
      type="button"
      class="inline-flex items-center p-1 text-muted-foreground hover:text-foreground"
      :aria-label="busy ? 'What is processing' : 'Background work that failed'"
      :aria-expanded="open"
      @click="open = !open"
    >
      <LoaderCircle v-if="busy" class="size-4 animate-spin" />
      <TriangleAlert v-else class="size-4 fail" />
    </button>
    <div
      v-if="open && (busy || failed)"
      class="panel absolute right-0 top-full mt-2 z-50 rounded-md border bg-background p-3 shadow-md
        text-sm text-left space-y-3 overflow-y-auto"
      role="list"
      aria-label="Background work"
    >
      <div v-for="it in items" :key="it.id" class="space-y-1" role="listitem" :data-kind="it.kind">
        <div class="flex justify-between gap-2">
          <span class="font-medium truncate">{{ it.label }}</span>
          <span class="shrink-0 tabular-nums" :class="it.state === 'failed' ? 'fail' : 'text-muted-foreground'">
            {{ stateText(it) }}
          </span>
        </div>
        <div v-if="it.current" class="text-muted-foreground truncate" :title="it.current">{{ it.current }}</div>
        <div
          v-if="indeterminate(it)"
          class="indeterminate relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20"
          role="progressbar"
          aria-label="Running, no measure of progress"
        >
          <div class="bar absolute inset-y-0 rounded-full bg-primary" />
        </div>
        <UiProgress
          v-else
          :model-value="barValue(it)"
          class="h-1.5"
          :class="{ failed: it.state === 'failed' }"
          :aria-label="progressText(it) || stateText(it)"
        />
        <div v-if="facts(it)" class="text-xs text-muted-foreground">{{ facts(it) }}</div>
        <div v-if="it.warning" class="text-xs warn">{{ it.warning }}</div>
        <div v-if="failure(it, now)" class="text-xs fail">{{ failure(it, now) }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { LoaderCircle, TriangleAlert } from 'lucide-vue-next';
import { Progress } from '@/components/ui/progress';
import { status, watchStatus } from '@/lib/events';
import {
  type ActivityItem,
  failure,
  fraction,
  indeterminate,
  isBusy,
  notes,
  progressText,
  shown,
  stackingItems,
  stateText,
} from '@/lib/activity';

export default {
  name: 'ProcessingIndicator',
  components: { LoaderCircle, TriangleAlert, UiProgress: Progress },
  data() {
    return { open: false, status, now: Date.now(), timer: undefined as ReturnType<typeof setInterval> | undefined };
  },
  computed: {
    items(): ActivityItem[] {
      return shown([...stackingItems(this.status.workers, this.status.backlog), ...this.status.activity]);
    },
    busy(): boolean {
      return this.items.some(isBusy);
    },
    failed(): boolean {
      return this.items.some((it) => it.state === 'failed');
    },
  },
  mounted() {
    watchStatus();
    document.addEventListener('click', this.closeOutside);
    this.timer = setInterval(() => (this.now = Date.now()), 30000);
  },
  unmounted() {
    document.removeEventListener('click', this.closeOutside);
    clearInterval(this.timer);
  },
  methods: {
    failure,
    indeterminate,
    progressText,
    stateText,
    facts(it: ActivityItem): string {
      return [progressText(it), ...notes(it, this.now)].filter(Boolean).join(' · ');
    },
    barValue(it: ActivityItem): number {
      return fraction(it) ?? (it.state === 'failed' ? 100 : 0);
    },
    closeOutside(e: MouseEvent) {
      const root = this.$refs.root as HTMLElement | undefined;
      if (this.open && root && !root.contains(e.target as Node)) this.open = false;
    },
  },
};
</script>

<style scoped>
.panel {
  width: min(22rem, calc(100vw - 2rem));
  max-height: min(70vh, 36rem);
}
@media (max-width: 640px) {
  .panel {
    position: fixed;
    left: 1rem;
    right: 1rem;
    top: 4.5rem;
    width: auto;
    max-height: calc(100vh - 6rem);
  }
}
.warn {
  color: var(--warn);
}
.fail {
  color: var(--destructive-foreground);
}
.failed :deep([data-slot='progress-indicator']) {
  background-color: var(--destructive-foreground);
}
.indeterminate .bar {
  width: 35%;
  animation: slide 1.4s ease-in-out infinite;
}
@keyframes slide {
  from {
    left: -35%;
  }
  to {
    left: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .indeterminate .bar {
    animation: none;
    left: 0;
    width: 100%;
    opacity: 0.5;
  }
}
</style>
