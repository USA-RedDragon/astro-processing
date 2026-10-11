<template>
        <Card class="project-card relative overflow-hidden">
        <component
          :is="titleLink ? 'a' : 'div'"
          v-if="coverShown && project.cover"
          :href="titleLink || undefined"
          class="block relative -mt-6 mb-2 bg-black"
        >
          <img
            :src="shownCover ?? project.cover.preview_url"
            :alt="`${project.name} preview`"
            loading="lazy"
            class="w-full h-auto max-h-[36rem] object-cover"
          >
          <span
            class="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white"
            title="What the stacker rendered for this picture"
          >
            Cover: {{ project.cover.palette || project.cover.filter }}{{ project.cover.mosaic ? ' mosaic' : '' }}
          </span>
          <span
            v-if="missingPanels"
            class="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white"
            :title="project.cover.palette ? 'Fewest panels in any filter of this colour mosaic'
              : 'Panels in this mosaic'"
          >
            {{ project.cover.panels }} of {{ project.cover.panels_total }} panels
          </span>
          <span
            v-if="processing"
            class="absolute top-2 left-2 rounded-full bg-black/60 p-1"
            title="Processing"
          >
            <LoaderCircle class="size-4 animate-spin text-white" aria-label="Processing" />
          </span>
        </component>
        <div v-if="coverShown" class="absolute top-5 right-2 z-10 flex gap-2">
          <Badge v-for="b in badges" :key="b.text" :variant="b.variant" :class="b.class" :title="b.title">
            {{ b.text }}
          </Badge>
        </div>

        <CardHeader>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <CardTitle class="min-w-0 leading-snug">
              <a v-if="titleLink" :href="titleLink" class="underline hover:text-primary transition">
                {{ project.name }}
              </a>
              <span v-else>
                {{ project.name }}
              </span>
              <LoaderCircle
                v-if="processing && !coverShown"
                class="inline size-4 ml-1.5 animate-spin text-muted-foreground align-middle"
                aria-label="Processing"
              />
            </CardTitle>
            <div v-if="!coverShown" class="flex flex-wrap gap-2 ml-auto">
              <Badge v-for="b in badges" :key="b.text" :variant="b.variant" :class="b.class" :title="b.title">
                {{ b.text }}
              </Badge>
            </div>
          </div>
          <div class="flex flex-col gap-1 mt-2">
            <p v-if="project.description" class="text-xs text-muted-foreground">
              {{ project.description }}
            </p>
            <p v-if="project.create_date" class="text-xs text-muted-foreground">
              <span class="font-medium">Created:</span> {{ formatDate(project.create_date) }}
            </p>
            <p v-if="project.active_date" class="text-xs text-muted-foreground">
              <span class="font-medium">Activated:</span> {{ formatDate(project.active_date) }}
            </p>
            <p v-if="project.stats.last_image_date" class="text-xs text-muted-foreground">
              <span class="font-medium">Last Image:</span> {{ formatDate(project.stats.last_image_date) }}
            </p>
            <p v-if="circle.show" class="text-xs" :class="enoughData ? 'text-green-600' : 'text-muted-foreground'">
              <span class="font-medium">Data:</span> {{ circle.title }}
            </p>
          </div>
        </CardHeader>

        <CardContent class="space-y-4 pb-12">
          <!-- Image Statistics -->
          <div v-if="project.stats">
            <StatsDisplay :stats="project.stats.imaging" total />
          </div>
        </CardContent>

        <!-- Circular Progress at bottom right -->
        <div v-if="circle.show" class="absolute bottom-0 right-0">
          <ProgressCircle
            :percentage="circle.percent"
            :caption="circle.caption"
            :title="circle.title"
          />
        </div>
        </Card>
</template>

<script lang="ts">
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ProgressCircle from '@/components/ProgressCircle.vue';

import type { PropType } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { status } from '@/lib/events';
import StatsDisplay from './StatsDisplay.vue';
import { formatDate } from '@/lib/formatters';
import type { Project as PlanningProject } from '@/scheduler/api/planning';
import { cardCircle, hasEnoughData, type CardCircle, type PlanningState } from '@/scheduler/leastCards';
import type {
  Project,
  ProjectPriority,
} from '../graphql/graphql';

export default {
  components: {
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    LoaderCircle,
    ProgressCircle,
    StatsDisplay,
  },
  props: {
    project: {
      type: Object as PropType<Project>,
      required: true,
    },
    // Show the project's cover picture at the top of the card.
    showCover: {
      type: Boolean,
      default: true,
    },
    titleLink: {
      type: String,
      required: false,
      default: null,
    },
    planning: {
      type: Object as PropType<PlanningProject | null>,
      default: null,
    },
    planningState: {
      type: String as PropType<PlanningState>,
      default: 'loading',
    },
  },
  data: function() {
    return {
      // The cover shown; a changed one replaces it once it has loaded, so
      // the picture never blanks while it updates.
      shownCover: undefined as string | undefined,
      shownAt: '',
    };
  },
  computed: {
    coverShown(): boolean {
      return this.showCover && !!this.project.cover;
    },
    badges(): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; class?: string;
      title?: string }[] {
      const out: { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; class?: string;
        title?: string }[] = [];
      if (this.project.is_mosaic) out.push({ text: 'Mosaic', variant: 'outline', class: 'text-sm' });
      if (this.project.priority)
        out.push({ text: this.project.priority, variant: this.getPriorityVariant(this.project.priority),
          class: 'text-sm' });
      out.push({ text: this.statusText, variant: this.statusVariant, title: this.circle.title || undefined });
      return out;
    },
    circle(): CardCircle {
      return cardCircle(this.planning?.least, this.planningState);
    },
    enoughData(): boolean {
      return hasEnoughData(this.planning?.least);
    },
    statusVariant(): 'default' | 'secondary' | 'outline' {
      if (this.enoughData) return 'default';
      return this.project.state === 'ACTIVE' ? 'secondary' : 'outline';
    },
    statusText(): string {
      if (this.enoughData) return 'Enough data';
      return this.project.state ?? 'State not set';
    },
    missingPanels(): boolean {
      const c = this.project.cover;
      return !!c && c.panels != null && c.panels_total != null && c.panels < c.panels_total;
    },
    // The stacker is working on one of the project's targets or its mosaic.
    processing(): boolean {
      const names = new Set((this.project.targets ?? []).map((t) => t.name));
      const mosaic = `Mosaic: ${this.project.name}`;
      return status.workers.some((w) => names.has(w.object) || w.object === mosaic);
    },
  },
  watch: {
    'project.cover': {
      immediate: true,
      handler(cover: Project['cover']) {
        if (!cover || cover.updated_at === this.shownAt) return;
        if (!this.shownCover) {
          this.shownCover = cover.preview_url;
          this.shownAt = cover.updated_at;
          return;
        }
        const img = new Image();
        img.onload = () => {
          this.shownCover = cover.preview_url;
          this.shownAt = cover.updated_at;
        };
        img.src = cover.preview_url;
      },
    },
  },
  methods: {
    formatDate,
    getPriorityVariant(priority: ProjectPriority): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (priority === 'HIGH') return 'destructive';
      if (priority === 'LOW') return 'outline';
      return 'secondary';
    },
  },
};
</script>

<style scoped>
</style>
