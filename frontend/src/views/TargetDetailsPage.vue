<template>
  <div class="space-y-6">
    <div v-if="!target && !loaded" class="space-y-2" aria-busy="true">
      <div class="h-4 w-32 rounded bg-muted animate-pulse" />
      <div class="h-7 w-72 rounded bg-muted animate-pulse" />
      <div class="h-4 w-2/3 rounded bg-muted animate-pulse" />
    </div>
    <div v-if="target">
      <router-link
        v-if="target.project"
        :to="`/project/${target.project.id}`"
        class="text-sm text-muted-foreground hover:underline"
      >
        &larr; {{ target.project.name }}
      </router-link>
      <h1 class="text-2xl font-semibold mt-1">{{ target.name }}</h1>
      <div id="target-sched-head" class="mt-2 empty:hidden" />
      <p v-if="done.subframes && subframes.length === 0" class="text-sm text-muted-foreground mt-1">
        No subs acquired yet for this target.
      </p>
    </div>

    <SchedulerTabs
      v-if="target?.project"
      :project-id="target.project.id"
      :target-id="target.id"
      head-to="#target-sched-head"
    />

    <MastersCard
      v-if="masters.length > 0"
      :masters="masters"
      :object-name="target?.name ?? ''"
      :updating="updatingFilters"
    />

    <PaletteMixer v-if="masters.length > 0" :masters="masters" />

    <Card v-if="quality.length > 0 || !done.subframes">
      <CardHeader>
        <CardTitle>Integration</CardTitle>
      </CardHeader>
      <CardContent>
        <UiTable>
          <TableHeader>
            <TableRow>
              <TableHead>Filter</TableHead>
              <TableHead class="text-right">Subs</TableHead>
              <TableHead class="text-right">Stacked</TableHead>
              <TableHead class="text-right">Nominal</TableHead>
              <TableHead class="text-right">Effective</TableHead>
              <TableHead class="text-right">Efficiency</TableHead>
              <TableHead class="text-right">Median sky above pedestal (ADU)</TableHead>
              <TableHead class="text-right">Median HFR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SkeletonRows v-if="!done.subframes" :rows="3" :cols="8" />
            <TableRow v-for="q in quality" :key="`${q.filter_name}-${q.exposure_time}`">
              <TableCell class="font-medium">{{ q.filter_name }} {{ q.exposure_time }}s</TableCell>
              <TableCell class="text-right">{{ q.subframes }}</TableCell>
              <TableCell class="text-right">
                {{ q.stacked }}<span v-if="q.pending > 0" class="text-muted-foreground">
                  ({{ q.pending }} pending)</span>
              </TableCell>
              <TableCell class="text-right">{{ formatHours(q.nominal_hours) }}</TableCell>
              <TableCell class="text-right font-medium">{{ formatHours(q.effective_hours) }}</TableCell>
              <TableCell class="text-right">{{ formatPercent(q.effective_hours, q.nominal_hours) }}</TableCell>
              <TableCell class="text-right">{{ formatNumber(q.median_sky, 0) }}</TableCell>
              <TableCell class="text-right">{{ formatNumber(q.median_hfr, 2) }}</TableCell>
            </TableRow>
            <TableRow v-if="done.subframes" class="font-semibold">
              <TableCell>Total</TableCell>
              <TableCell class="text-right">{{ totals.subframes }}</TableCell>
              <TableCell class="text-right">
                {{ totals.stacked }}<span v-if="totals.pending > 0" class="text-muted-foreground">
                  ({{ totals.pending }} pending)</span>
              </TableCell>
              <TableCell class="text-right">{{ formatHours(totals.nominal) }}</TableCell>
              <TableCell class="text-right">{{ formatHours(totals.effective) }}</TableCell>
              <TableCell class="text-right">{{ formatPercent(totals.effective, totals.nominal) }}</TableCell>
              <TableCell />
              <TableCell />
            </TableRow>
          </TableBody>
        </UiTable>
        <p v-if="done.subframes && totals.rejected > 0" class="text-sm text-muted-foreground mt-2 tabular-nums">
          Excludes {{ totals.rejected }} subs rejected in Target Scheduler.
        </p>
        <p v-for="b in skyBases" :key="b" class="text-xs text-muted-foreground mt-1">Sky: {{ b }}</p>
        <div v-if="scoringRows.length > 0" class="mt-4 space-y-2">
          <h3 class="text-sm font-semibold">Scoring</h3>
          <p class="text-xs text-muted-foreground">
            A score is the sub's 1/(sky &times; HFR&#8308;) over the reference below, times its transparency squared,
            capped at 1. The stacker leaves out subs under the cut.
          </p>
          <UiTable>
            <TableHeader>
              <TableRow>
                <TableHead>Filter</TableHead>
                <TableHead class="text-right">Reference 1/(ADU&middot;px&#8308;)</TableHead>
                <TableHead class="text-right">This target's best</TableHead>
                <TableHead class="text-right">Cut</TableHead>
                <TableHead class="text-right">Under the cut</TableHead>
                <TableHead class="text-right">Not measured</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="q in scoringRows" :key="`${q.filter_name}-${q.exposure_time}`">
                <TableCell class="font-medium">{{ q.filter_name }} {{ q.exposure_time }}s</TableCell>
                <TableCell class="text-right tabular-nums">
                  <template v-if="q.reference_weight != null">
                    {{ q.reference_weight.toExponential(2) }}
                    <span class="text-muted-foreground">
                      ({{ Math.round((q.reference_percentile ?? 0) * 100) }}th percentile of
                      {{ q.reference_subs }} subs, all targets)
                    </span>
                  </template>
                  <span v-else class="text-muted-foreground">no measurable subs</span>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(q.target_best, 2) }}</TableCell>
                <TableCell class="text-right tabular-nums">
                  <template v-if="q.cut != null">
                    {{ q.cut.toFixed(2) }}
                    <span class="text-muted-foreground">({{ q.min_score }} &times; best)</span>
                  </template>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ q.below_cut }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ q.unmeasured }}</TableCell>
              </TableRow>
            </TableBody>
          </UiTable>
        </div>
      </CardContent>
    </Card>

    <p v-if="done.calibration && calibration.length > 0" class="text-sm text-muted-foreground -mb-4">
      Calibration counts all {{ calibrationLights }} lights named &ldquo;{{ target?.name }}&rdquo; in the stacker's
      index; Target Scheduler has {{ subframes.length }} subs for this target.
    </p>
    <CalibrationCard
      v-if="calibration.length > 0 || !done.calibration"
      :rows="calibration"
      :loading="!done.calibration"
    />

    <Card v-if="subframes.length > 0 || !done.subframes">
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
              :value="threshold ?? ''"
              type="number"
              min="0"
              max="1"
              step="0.05"
              placeholder="stacker's cut"
              class="border rounded-md bg-background px-2 py-1 w-28"
              @input="setThreshold"
            >
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-muted-foreground">Sort</span>
            <select v-model="sort" class="border rounded-md bg-background px-2 py-1">
              <option value="date-desc">Newest first</option>
              <option value="date">Oldest first</option>
              <option value="score-asc">Worst first</option>
              <option value="score-desc">Best first</option>
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

        <p v-if="threshold === null" class="text-xs text-muted-foreground">
          Culling at each filter's stacker cut: {{ cutsText }}.
        </p>
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
                <TableHead class="text-right">Sky above pedestal</TableHead>
                <TableHead class="text-right">Transparency</TableHead>
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
              <SkeletonRows v-if="!done.subframes" :rows="8" :cols="12" />
              <TableRow
                v-for="s in shown"
                :key="s.id"
                :class="{ 'opacity-50': isCulled(s) }"
              >
                <TableCell class="whitespace-nowrap">
                  {{ s.acquired_date ? formatDate(s.acquired_date) : '' }}
                </TableCell>
                <TableCell class="whitespace-nowrap">{{ groupOf(s) }}</TableCell>
                <TableCell>
                  <div v-if="s.score != null" class="flex items-center gap-2">
                    <div class="h-2 w-24 rounded bg-muted overflow-hidden">
                      <div class="h-full bg-primary" :style="{ width: `${Math.round(s.score * 100)}%` }" />
                    </div>
                    <span class="tabular-nums">{{ s.score.toFixed(2) }}</span>
                  </div>
                  <span v-else class="text-xs text-muted-foreground">{{ s.score_missing }}</span>
                  <div
                    v-if="s.photometry === 'pending' && s.stack_status !== 'pending'"
                    class="text-xs text-muted-foreground"
                  >
                    awaiting photometry
                  </div>
                </TableCell>
                <TableCell class="text-right tabular-nums" :title="s.pedestal_basis ?? undefined">
                  <template v-if="s.sky != null">{{ s.sky.toFixed(0) }}</template>
                  <span v-else class="text-xs text-muted-foreground">{{ s.sky_missing }}</span>
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  <template v-if="s.transparency != null">
                    {{ s.transparency.toFixed(2) }}
                    <div class="text-xs text-muted-foreground">
                      {{ s.transparency_source === 'photometry' ? 'star photometry' : 'light above sky' }}
                    </div>
                  </template>
                  <span v-else-if="s.transparency_missing" class="text-xs text-muted-foreground">
                    not measured: {{ s.transparency_missing }}
                  </span>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.hfr, 2) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ s.stars ?? '' }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.eccentricity, 2) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.guiding_rms_arcsec, 2) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatNumber(s.airmass, 2) }}</TableCell>
                <TableCell :title="`Target Scheduler: ${s.grading_status.toLowerCase()}`">
                  <Badge :variant="statusVariant(s.stack_status)">
                    {{ s.stack_status.replace(/_/g, ' ') }}
                  </Badge>
                  <div v-if="s.stack_reason" class="text-xs text-muted-foreground max-w-56">{{ s.stack_reason }}</div>
                </TableCell>
                <TableCell class="text-xs text-muted-foreground whitespace-nowrap">
                  <PreviewLink v-if="s.file_name" :file-name="s.file_name" :url="s.preview_url ?? undefined" />
                </TableCell>
              </TableRow>
            </TableBody>
          </UiTable>
        </div>
        <div v-if="sorted.length > shown.length" class="flex items-center gap-3 text-sm">
          <button type="button" class="border rounded-md px-3 py-1 hover:bg-accent" @click="limit += pageSize">
            Show {{ Math.min(pageSize, sorted.length - shown.length) }} more
          </button>
          <span class="text-muted-foreground tabular-nums">{{ shown.length }} of {{ sorted.length }}</span>
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
import CalibrationCard from '@/components/CalibrationCard.vue';
import PreviewLink from '@/components/PreviewLink.vue';
import MastersCard from '@/components/MastersCard.vue';
import PaletteMixer from '@/components/PaletteMixer.vue';
import SchedulerTabs from '@/scheduler/components/SchedulerTabs.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import API from '@/lib/API';
import { onChange, onEvent, onReconnect, status, type LiveEvent } from '@/lib/events';
import { formatDate } from '@/lib/formatters';
import { isCulled } from '@/lib/cull';
import type { CalibrationRow, FilterMaster, FilterQuality, Subframe, Target } from '../graphql/graphql';

type Totals = {
  subframes: number; stacked: number; pending: number; nominal: number; effective: number; rejected: number;
};

// The page loads in parts, so each card fills in as soon as its data comes.
const GET_TARGET_QUERY = `
  query GetTarget($id: ID!) {
    target(id: $id) {
      id
      name
      project {
        id
        name
      }
    }
  }
`;

const GET_TARGET_CALIBRATION_QUERY = `
  query GetTargetCalibration($id: ID!) {
    target(id: $id) {
      calibration {
        night
        filter
        exposure
        gain
        offset
        set_temp
        rotator
        lights
        flat { quality night frames age_days rotation_mismatch scaled }
        dark {
          quality night frames age_days temp_off set_temp rotation_mismatch scaled exposure
          source master header_error basis { night exposure gain offset set_temp bin_x }
        }
        bias {
          quality night frames age_days rotation_mismatch scaled
          source master header_error basis { night exposure gain offset set_temp bin_x }
        }
      }
    }
  }
`;

// Also refetched when the stacker says previews or masters changed.
const GET_TARGET_SUBFRAMES_QUERY = `
  query GetTargetSubframes($id: ID!) {
    target(id: $id) {
      stats {
        quality {
          filter_name
          exposure_time
          subframes
          stacked
          pending
          nominal_hours
          effective_hours
          median_sky
          sky_basis
          median_hfr
          rejected_in_scheduler
          below_cut
          unmeasured
          min_score
          target_best
          cut
          reference_weight
          reference_subs
          reference_percentile
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
        score_missing
        weight
        target_best
        cut
        sky_missing
        pedestal_adu
        pedestal_source
        pedestal_basis
        transparency
        transparency_source
        transparency_missing
        stack_status
        stack_reason
        photometry
        preview_url
      }
    }
  }
`;

const GET_TARGET_MASTERS_QUERY = `
  query GetTargetMasters($id: ID!) {
    target(id: $id) {
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
        min_score
        lowest_score
        object_lights
        target_subs
      }
    }
  }
`;

export default {
  name: 'TargetDetailsPage',
  components: {
    Badge,
    CalibrationCard,
    PreviewLink,
    MastersCard,
    PaletteMixer,
    SchedulerTabs,
    SkeletonRows,
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
      calibration: [] as CalibrationRow[],
      masters: [] as FilterMaster[],
      loaded: false,
      // Which parts have loaded; each card shows placeholders until then.
      done: { subframes: false, masters: false, calibration: false },
      // Subframe rows shown; long lists render a page at a time.
      pageSize: 100,
      limit: 100,
      filter: '',
      threshold: null as number | null,
      sort: 'date-desc',
      copied: false,
      stopEvents: () => {},
      stopReconnect: () => {},
      stopChanges: [] as (() => void)[],
      refetchTimers: {} as Record<string, ReturnType<typeof setTimeout>>,
    };
  },
  watch: {
    filter() { this.limit = this.pageSize; },
    sort() { this.limit = this.pageSize; },
  },
  computed: {
    // Filters of this target the stacker is working on right now.
    updatingFilters(): string[] {
      const name = this.target?.name;
      return status.workers.filter((w) => w.object === name).map((w) => w.filter);
    },
    groups(): string[] {
      return [...new Set(this.subframes.map((s) => this.groupOf(s)))].sort();
    },
    totals(): Totals {
      return this.quality.reduce(
        (t, q) => ({
          subframes: t.subframes + q.subframes,
          stacked: t.stacked + q.stacked,
          pending: t.pending + q.pending,
          nominal: t.nominal + q.nominal_hours,
          effective: t.effective + q.effective_hours,
          rejected: t.rejected + q.rejected_in_scheduler,
        }),
        { subframes: 0, stacked: 0, pending: 0, nominal: 0, effective: 0, rejected: 0 },
      );
    },
    skyBases(): string[] {
      return [...new Set(this.quality.map((q) => q.sky_basis).filter((b): b is string => !!b))];
    },
    scoringRows(): FilterQuality[] {
      return this.quality.filter((q) => q.min_score != null);
    },
    calibrationLights(): number {
      return this.calibration.reduce((t, r) => t + r.lights, 0);
    },
    cutsText(): string {
      const cuts = this.scoringRows
        .filter((q) => q.cut != null && (!this.filter || this.filter === `${q.filter_name} ${q.exposure_time}s`))
        .map((q) => `${q.filter_name} ${q.exposure_time}s ${q.cut?.toFixed(2)}`);
      return cuts.length > 0 ? cuts.join(', ') : 'none known yet';
    },
    visible(): Subframe[] {
      return this.subframes.filter(
        (s) => s.stack_status !== 'rejected' && s.stack_status !== 'duplicate'
          && (!this.filter || this.groupOf(s) === this.filter),
      );
    },
    sorted(): Subframe[] {
      const rows = [...this.visible];
      // Unscored subs sort last either way.
      if (this.sort === 'score-asc') rows.sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity));
      else if (this.sort === 'score-desc') rows.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
      else if (this.sort === 'date-desc') rows.sort((a, b) => (b.acquired_date ?? 0) - (a.acquired_date ?? 0));
      else rows.sort((a, b) => (a.acquired_date ?? 0) - (b.acquired_date ?? 0));
      return rows;
    },
    shown(): Subframe[] {
      return this.sorted.slice(0, this.limit);
    },
    culled(): Subframe[] {
      return this.visible.filter((s) => this.isCulled(s));
    },
    culledNominal(): number {
      return this.culled.reduce((t, s) => t + (s.exposure_time ?? 0), 0) / 3600;
    },
    // Effective exposure is what the stacker stacked: its weights.
    culledEffective(): number {
      return this.culled.reduce((t, s) => t + this.effectiveOf(s), 0) / 3600;
    },
    visibleEffective(): number {
      return this.visible.reduce((t, s) => t + this.effectiveOf(s), 0) / 3600;
    },
  },
  created() {
    this.fetchData();
    this.stopEvents = onEvent(this.onLiveEvent);
    this.stopChanges = [
      onChange(['acquiredimage', 'exposureplan'], () => this.refetch('subframes')),
      onChange(['target', 'project'], () => this.refetchTarget()),
      onChange(['frames', 'flathistory'], () => this.refetch('calibration')),
    ];
    this.stopReconnect = onReconnect(() => {
      this.refetch('subframes');
      this.refetch('masters');
    });
  },
  unmounted() {
    this.stopEvents();
    this.stopReconnect();
    this.stopChanges.forEach((stop) => stop());
    Object.values(this.refetchTimers).forEach(clearTimeout);
  },
  methods: {
    formatDate,
    groupOf(s: Subframe): string {
      return `${s.filter_name} ${s.exposure_time ?? '?'}s`;
    },
    isCulled(s: Subframe): boolean {
      return isCulled(s.score, s.cut, this.threshold);
    },
    setThreshold(e: Event) {
      const v = (e.target as HTMLInputElement).value;
      this.threshold = v === '' ? null : Number(v);
    },
    effectiveOf(s: Subframe): number {
      return s.stack_status === 'added' ? (s.weight ?? 0) : 0;
    },
    statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (status === 'added') return 'default';
      if (status === 'pending') return 'outline';
      if (['low_score', 'unmeasured', 'moon', 'off_target', 'rejected', 'dead', 'duplicate'].includes(status)) return 'destructive';
      return 'secondary';
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
    onLiveEvent(e: LiveEvent) {
      if (e.type === 'mosaic' || !this.target || e.object !== this.target.name) return;
      this.refetch(e.type === 'master' ? 'masters' : 'subframes');
    },
    // refetch reloads one part of the page, at most every 2 s however many
    // events arrive.
    async refetchTarget() {
      try {
        const r = await API.request(GET_TARGET_QUERY, { id: this.$route.params.id as string });
        if (r.target) this.target = r.target as Target;
      } catch (error) {
        console.error('Error refreshing target:', error);
      }
    },
    refetch(part: 'subframes' | 'masters' | 'calibration') {
      if (this.refetchTimers[part]) return;
      this.refetchTimers[part] = setTimeout(async () => {
        delete this.refetchTimers[part];
        const id = this.$route.params.id as string;
        try {
          if (part === 'masters') {
            const r = await API.request(GET_TARGET_MASTERS_QUERY, { id });
            if (r.target) this.masters = r.target.masters as FilterMaster[];
          } else if (part === 'calibration') {
            const r = await API.request(GET_TARGET_CALIBRATION_QUERY, { id });
            if (r.target) this.calibration = r.target.calibration as CalibrationRow[];
          } else {
            const r = await API.request(GET_TARGET_SUBFRAMES_QUERY, { id });
            if (r.target) {
              this.quality = r.target.stats.quality as FilterQuality[];
              this.subframes = r.target.subframes as Subframe[];
            }
          }
        } catch (error) {
          console.error(`Error refreshing ${part}:`, error);
        }
      }, 2000);
    },
    fetchData() {
      const id = this.$route.params.id as string;
      const part = async (name: keyof typeof this.done | 'target', query: string, apply: (t: Target) => void) => {
        try {
          const r = await API.request(query, { id });
          if (r.target) apply(r.target as Target);
        } catch (error) {
          console.error(`Error fetching ${name}:`, error);
        } finally {
          if (name === 'target') this.loaded = true;
          else this.done[name] = true;
        }
      };
      part('target', GET_TARGET_QUERY, (t) => { this.target = t; });
      part('subframes', GET_TARGET_SUBFRAMES_QUERY, (t) => {
        this.quality = t.stats.quality as FilterQuality[];
        this.subframes = t.subframes as Subframe[];
      });
      part('masters', GET_TARGET_MASTERS_QUERY, (t) => { this.masters = t.masters as FilterMaster[]; });
      part('calibration', GET_TARGET_CALIBRATION_QUERY, (t) => {
        this.calibration = t.calibration as CalibrationRow[];
      });
    },
  },
};
</script>
