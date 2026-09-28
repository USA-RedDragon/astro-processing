<template>
  <div class="space-y-6">
    <div v-if="target">
      <router-link
        v-if="target.project"
        :to="`/project/${target.project.id}`"
        class="text-sm text-muted-foreground hover:underline"
      >
        &larr; {{ target.project.name }}
      </router-link>
      <h1 class="text-2xl font-semibold mt-1">{{ target.name }}</h1>
      <p class="text-sm text-muted-foreground mt-1">
        Score is how much a sub is worth compared to your best subs for that filter, from 0 to 1.
        Darker sky and tighter stars score higher.
      </p>
    </div>

    <Card v-if="quality.length > 0">
      <CardHeader>
        <CardTitle>Integration</CardTitle>
      </CardHeader>
      <CardContent>
        <UiTable>
          <TableHeader>
            <TableRow>
              <TableHead>Filter</TableHead>
              <TableHead class="text-right">Subs</TableHead>
              <TableHead class="text-right">Nominal</TableHead>
              <TableHead class="text-right">Effective</TableHead>
              <TableHead class="text-right">Efficiency</TableHead>
              <TableHead class="text-right">Median sky (ADU)</TableHead>
              <TableHead class="text-right">Median HFR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="q in quality" :key="`${q.filter_name}-${q.exposure_time}`">
              <TableCell class="font-medium">{{ q.filter_name }} {{ q.exposure_time }}s</TableCell>
              <TableCell class="text-right">{{ q.subframes }}</TableCell>
              <TableCell class="text-right">{{ formatHours(q.nominal_hours) }}</TableCell>
              <TableCell class="text-right font-medium">{{ formatHours(q.effective_hours) }}</TableCell>
              <TableCell class="text-right">{{ formatPercent(q.effective_hours, q.nominal_hours) }}</TableCell>
              <TableCell class="text-right">{{ formatNumber(q.median_sky, 0) }}</TableCell>
              <TableCell class="text-right">{{ formatNumber(q.median_hfr, 2) }}</TableCell>
            </TableRow>
            <TableRow class="font-semibold">
              <TableCell>Total</TableCell>
              <TableCell class="text-right">{{ totals.subframes }}</TableCell>
              <TableCell class="text-right">{{ formatHours(totals.nominal) }}</TableCell>
              <TableCell class="text-right">{{ formatHours(totals.effective) }}</TableCell>
              <TableCell class="text-right">{{ formatPercent(totals.effective, totals.nominal) }}</TableCell>
              <TableCell />
              <TableCell />
            </TableRow>
          </TableBody>
        </UiTable>
      </CardContent>
    </Card>

    <Card v-if="subframes.length > 0">
      <CardHeader>
        <CardTitle>Subframes</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap items-end gap-4 text-sm">
          <label class="flex flex-col gap-1">
            <span class="text-muted-foreground">Filter</span>
            <select v-model="filter" class="border rounded-md bg-background px-2 py-1">
              <option value="">All</option>
              <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-muted-foreground">Cull below score</span>
            <input
              v-model.number="threshold"
              type="number"
              min="0"
              max="1"
              step="0.05"
              class="border rounded-md bg-background px-2 py-1 w-24"
            >
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-muted-foreground">Sort</span>
            <select v-model="sort" class="border rounded-md bg-background px-2 py-1">
              <option value="score-asc">Worst first</option>
              <option value="score-desc">Best first</option>
              <option value="date">By date</option>
            </select>
          </label>
          <button
            type="button"
            class="border rounded-md px-3 py-1 hover:bg-accent disabled:opacity-50"
            :disabled="culled.length === 0"
            @click="copyCulled"
          >
            {{ copied ? 'Copied' : `Copy ${culled.length} culled file names` }}
          </button>
        </div>

        <p class="text-sm tabular-nums">
          Culled: {{ culled.length }} / {{ visible.length }} subs
          &middot; {{ formatHours(culledNominal) }} nominal
          &middot; {{ formatHours(culledEffective) }} effective
          ({{ formatPercent(culledEffective, visibleEffective) }})
        </p>

        <div class="border rounded-md max-h-[70vh] overflow-auto">
          <UiTable>
            <TableHeader class="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Acquired</TableHead>
                <TableHead>Filter</TableHead>
                <TableHead class="w-40">Score</TableHead>
                <TableHead class="text-right">Sky</TableHead>
                <TableHead class="text-right">HFR</TableHead>
                <TableHead class="text-right">Stars</TableHead>
                <TableHead class="text-right">Ecc.</TableHead>
                <TableHead class="text-right">Guiding&quot;</TableHead>
                <TableHead class="text-right">Airmass</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>File</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="s in sorted"
                :key="s.id"
                :class="{ 'opacity-50': isCulled(s) }"
              >
                <TableCell class="whitespace-nowrap">
                  {{ s.acquired_date ? formatDate(s.acquired_date) : '' }}
                </TableCell>
                <TableCell class="whitespace-nowrap">{{ groupOf(s) }}</TableCell>
                <TableCell>
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-24 rounded bg-muted overflow-hidden">
                      <div class="h-full bg-primary" :style="{ width: `${Math.round(s.score * 100)}%` }" />
                    </div>
                    <span class="tabular-nums">{{ s.score.toFixed(2) }}</span>
                  </div>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.sky, 0) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.hfr, 2) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ s.stars ?? '' }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.eccentricity, 2) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.guiding_rms_arcsec, 2) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.airmass, 2) }}</TableCell>
                <TableCell>
                  <Badge :variant="s.grading_status === 'REJECTED' ? 'destructive' : 'outline'">
                    {{ s.grading_status.toLowerCase() }}
                  </Badge>
                </TableCell>
                <TableCell class="text-xs text-muted-foreground whitespace-nowrap">{{ s.file_name }}</TableCell>
              </TableRow>
            </TableBody>
          </UiTable>
        </div>
      </CardContent>
    </Card>

    <div v-if="loaded && !target" class="text-center text-muted-foreground py-8">
      Target not found.
    </div>
  </div>
</template>

<script lang="ts">
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import API from '@/lib/API';
import { formatDate } from '@/lib/formatters';
import type { FilterQuality, Subframe, Target } from '../graphql/graphql';

const GET_TARGET_QUALITY_QUERY = `
  query GetTargetQuality($id: ID!) {
    target(id: $id) {
      id
      name
      project {
        id
        name
      }
      stats {
        quality {
          filter_name
          exposure_time
          subframes
          nominal_hours
          effective_hours
          median_sky
          median_hfr
        }
      }
      subframes {
        id
        acquired_date
        filter_name
        exposure_time
        grading_status
        file_name
        sky
        hfr
        stars
        eccentricity
        guiding_rms_arcsec
        airmass
        score
      }
    }
  }
`;

export default {
  name: 'TargetDetailsPage',
  components: {
    Badge,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    UiTable: Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  },
  data() {
    return {
      target: undefined as Target | undefined,
      quality: [] as FilterQuality[],
      subframes: [] as Subframe[],
      loaded: false,
      filter: '',
      threshold: 0.1,
      sort: 'score-asc',
      copied: false,
    };
  },
  computed: {
    groups(): string[] {
      return [...new Set(this.subframes.map((s) => this.groupOf(s)))].sort();
    },
    totals(): { subframes: number; nominal: number; effective: number } {
      return this.quality.reduce(
        (t, q) => ({
          subframes: t.subframes + q.subframes,
          nominal: t.nominal + q.nominal_hours,
          effective: t.effective + q.effective_hours,
        }),
        { subframes: 0, nominal: 0, effective: 0 },
      );
    },
    visible(): Subframe[] {
      return this.subframes.filter(
        (s) => s.grading_status !== 'REJECTED' && (!this.filter || this.groupOf(s) === this.filter),
      );
    },
    sorted(): Subframe[] {
      const rows = [...this.visible];
      if (this.sort === 'score-asc') rows.sort((a, b) => a.score - b.score);
      else if (this.sort === 'score-desc') rows.sort((a, b) => b.score - a.score);
      else rows.sort((a, b) => (a.acquired_date ?? 0) - (b.acquired_date ?? 0));
      return rows;
    },
    culled(): Subframe[] {
      return this.visible.filter((s) => this.isCulled(s));
    },
    culledNominal(): number {
      return this.culled.reduce((t, s) => t + (s.exposure_time ?? 0), 0) / 3600;
    },
    culledEffective(): number {
      return this.culled.reduce((t, s) => t + s.score * (s.exposure_time ?? 0), 0) / 3600;
    },
    visibleEffective(): number {
      return this.visible.reduce((t, s) => t + s.score * (s.exposure_time ?? 0), 0) / 3600;
    },
  },
  created() {
    this.fetchData();
  },
  methods: {
    formatDate,
    groupOf(s: Subframe): string {
      return `${s.filter_name} ${s.exposure_time ?? '?'}s`;
    },
    isCulled(s: Subframe): boolean {
      return s.grading_status !== 'REJECTED' && s.score < this.threshold;
    },
    formatHours(h: number): string {
      return `${h.toFixed(1)} h`;
    },
    formatPercent(part: number, whole: number): string {
      return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '';
    },
    formatNumber(v: number | null | undefined, digits: number): string {
      return v === null || v === undefined ? '' : v.toFixed(digits);
    },
    async copyCulled() {
      const names = this.culled.map((s) => s.file_name).filter(Boolean).join('\n');
      await navigator.clipboard.writeText(names);
      this.copied = true;
      setTimeout(() => { this.copied = false; }, 2000);
    },
    async fetchData() {
      try {
        const response = await API.request(GET_TARGET_QUALITY_QUERY, {
          id: this.$route.params.id as string,
        });
        if (response.target) {
          this.target = response.target as Target;
          this.quality = response.target.stats.quality as FilterQuality[];
          this.subframes = response.target.subframes as Subframe[];
        }
      } catch (error) {
        console.error('Error fetching target quality:', error);
      } finally {
        this.loaded = true;
      }
    },
  },
};
</script>
