<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Calibration</h1>
      <template v-if="backlog">
        <p class="text-sm text-muted-foreground mt-1">{{ framesNeededText(backlog) }}</p>
        <p class="text-sm text-muted-foreground">{{ basisText(backlog.frames_needed_basis) }}</p>
        <p class="text-sm text-muted-foreground">{{ setTempMatchText(backlog) }}</p>
        <p class="text-sm text-muted-foreground">{{ sessionGapText(backlog) }}</p>
        <p class="text-sm text-muted-foreground">{{ computedText(backlog) }}</p>
      </template>
      <p v-else-if="loaded" class="text-sm text-muted-foreground mt-1">{{ unavailable }}</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Dark backlog</CardTitle>
      </CardHeader>
      <CardContent>
        <p v-if="!loaded" class="text-sm text-muted-foreground">Loading…</p>
        <p v-else-if="!backlog" class="text-sm text-muted-foreground">{{ unavailable }}</p>
        <p v-else-if="combos.length === 0" class="text-sm text-muted-foreground">
          The backlog is empty: no lights are waiting on darks.
        </p>
        <template v-else>
          <p class="text-sm text-muted-foreground mb-3">{{ combos.length }} combos, ordered by priority.</p>
          <UiTable>
            <TableHeader>
              <TableRow>
                <TableHead class="text-right">Priority</TableHead>
                <TableHead>Setpoint</TableHead>
                <TableHead class="text-right">Exposure</TableHead>
                <TableHead class="text-right">Gain</TableHead>
                <TableHead class="text-right">Offset</TableHead>
                <TableHead class="text-right">Binning</TableHead>
                <TableHead>Readout mode</TableHead>
                <TableHead class="text-right" :title="openSetTitle(backlog)">Open set</TableHead>
                <TableHead class="text-right">{{ rejectedHead(backlog) }}</TableHead>
                <TableHead class="text-right">Lights blocked</TableHead>
                <TableHead class="text-right">Lights scaled</TableHead>
                <TableHead
                  class="text-right"
                  :title="shortSetTitle(backlog)"
                >
                  Lights on a short set
                </TableHead>
                <TableHead class="text-right">Nights</TableHead>
                <TableHead>Latest night</TableHead>
                <TableHead>Newest dark</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Basis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="c in shownCombos"
                :key="c.combo_key"
                :title="basisText(c.basis)"
                :data-combo="c.combo_key"
              >
                <TableCell class="text-right tabular-nums">
                  {{ c.priority }}
                  <Badge v-if="(c.requests ?? []).length > 0" variant="secondary" class="ml-1">requested</Badge>
                </TableCell>
                <TableCell class="tabular-nums">
                  <div>{{ setpointText(c) }}</div>
                  <div v-if="coveredText(c)" class="text-xs text-muted-foreground">{{ coveredText(c) }}</div>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.exposure, 's', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.gain, '', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.offset, '', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.binning, '', NOT_RECORDED) }}</TableCell>
                <TableCell>{{ readoutText(c) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ framesText(c) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.frames_rejected) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.lights_blocked) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.lights_scaled) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ thinText(c) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.nights) }}</TableCell>
                <TableCell>{{ text(c.latest_night, NOT_RECORDED) }}</TableCell>
                <TableCell>{{ newestDarkText(c) }}</TableCell>
                <TableCell class="whitespace-normal min-w-40">
                  <div v-for="r in refsText(c.requests)" :key="r">{{ r }}</div>
                  <span v-if="(c.requests ?? []).length === 0" class="text-muted-foreground">none</span>
                </TableCell>
                <TableCell class="text-xs text-muted-foreground whitespace-normal min-w-64">
                  {{ text(c.basis, NOT_RECORDED) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </UiTable>
          <div v-if="combos.length > COMBO_LIMIT" class="mt-3 flex flex-wrap items-center gap-3">
            <span class="text-sm text-muted-foreground">Showing {{ shownCombos.length }} of {{ combos.length }}.</span>
            <UiButton variant="outline" size="sm" @click="showAll = !showAll">
              {{ showAll ? `Show the first ${COMBO_LIMIT}` : `Show all ${combos.length}` }}
            </UiButton>
          </div>
        </template>
      </CardContent>
    </Card>

    <template v-if="backlog">
      <Card>
        <CardHeader>
          <CardTitle>Darks sessions</CardTitle>
        </CardHeader>
        <CardContent class="space-y-1 text-sm">
          <p>Last darks session: {{ sessionText(backlog.last_session) }}</p>
          <p>{{ uncheckedText(backlog) }}</p>
          <p v-for="line in publishText(backlog.publish)" :key="line">{{ line }}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rejected darks</CardTitle>
        </CardHeader>
        <CardContent>
          <p v-if="rejected.length === 0" class="text-sm text-muted-foreground">No rejected darks.</p>
          <UiTable v-else>
            <TableHeader>
              <TableRow>
                <TableHead>Frame</TableHead>
                <TableHead>Taken</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead class="text-right">Spread (ADU)</TableHead>
                <TableHead class="text-right">Median (ADU)</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="r in rejected" :key="r.key">
                <TableCell class="font-mono text-xs break-all">{{ r.key }}</TableCell>
                <TableCell>{{ when(r.taken_at, NOT_RECORDED) }}</TableCell>
                <TableCell class="tabular-nums">{{ setupText(r) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(r.spread_adu) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(r.median_adu) }}</TableCell>
                <TableCell class="whitespace-normal">{{ text(r.reason, NOT_RECORDED) }}</TableCell>
              </TableRow>
            </TableBody>
          </UiTable>
          <div v-if="rejectedNote" class="mt-3 flex flex-wrap items-center gap-3">
            <span class="text-sm text-muted-foreground">{{ rejectedNote }}</span>
            <UiButton variant="outline" size="sm" :disabled="loadingRejected" @click="loadAllRejected">
              {{ loadingRejected ? 'Loading…' : `Show all ${backlog.rejected_total}` }}
            </UiButton>
          </div>
          <p v-if="rejectedError" class="mt-2 text-sm text-destructive">{{ rejectedError }}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lights with no schedulable darks</CardTitle>
        </CardHeader>
        <CardContent>
          <p v-if="unschedulable.length === 0" class="text-sm text-muted-foreground">None.</p>
          <UiTable v-else>
            <TableHeader>
              <TableRow>
                <TableHead class="text-right">Exposure</TableHead>
                <TableHead class="text-right">Set temp</TableHead>
                <TableHead class="text-right">Lights</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(u, i) in unschedulable" :key="i">
                <TableCell class="text-right tabular-nums">{{ num(u.exposure, 's', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(u.set_temp, '°C', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(u.lights) }}</TableCell>
                <TableCell class="whitespace-normal">{{ text(u.reason, NOT_RECORDED) }}</TableCell>
              </TableRow>
            </TableBody>
          </UiTable>
        </CardContent>
      </Card>
    </template>

    <BiasBacklogCard />

    <OpenRequestsCard />
  </div>
</template>

<script lang="ts">
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import BiasBacklogCard from '@/components/BiasBacklogCard.vue';
import OpenRequestsCard from '@/components/OpenRequestsCard.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { onChange } from '@/lib/events';
import { refsText } from '@/lib/calibrationRequests';
import {
  COMBO_LIMIT,
  NOT_RECORDED,
  basisText,
  computedText,
  coveredText,
  framesNeededText,
  framesText,
  shortSetTitle,
  isDarkBacklog,
  newestDarkText,
  num,
  openSetTitle,
  publishText,
  readoutText,
  rejectedHead,
  rejectedShownText,
  sessionGapText,
  sessionText,
  setTempMatchText,
  setpointText,
  setupText,
  sortCombos,
  text,
  thinText,
  unavailableText,
  uncheckedText,
  visibleCombos,
  when,
} from '@/lib/darkBacklog';
import {
  getDarkBacklog,
  getRejectedDarks,
  type DarkBacklog,
  type DarkBacklogCombo,
  type DarkBacklogRejected,
  type DarkBacklogUnschedulable,
} from '@/scheduler/api/darks';

export default {
  name: 'CalibrationPage',
  components: {
    Badge,
    BiasBacklogCard,
    OpenRequestsCard,
    UiButton: Button,
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
      backlog: null as DarkBacklog | null,
      unavailable: '',
      loaded: false,
      showAll: false,
      allRejected: null as DarkBacklogRejected[] | null,
      loadingRejected: false,
      rejectedError: '',
      seq: 0,
      COMBO_LIMIT,
      NOT_RECORDED,
      stopChanges: () => {},
    };
  },
  created() {
    this.fetchData();
    this.stopChanges = onChange(['frames'], () => this.fetchData());
  },
  unmounted() {
    this.stopChanges();
  },
  computed: {
    combos(): DarkBacklogCombo[] {
      return sortCombos(this.backlog?.combos);
    },
    shownCombos(): DarkBacklogCombo[] {
      return visibleCombos(this.combos, this.showAll);
    },
    rejected(): DarkBacklogRejected[] {
      return this.allRejected ?? this.backlog?.rejected ?? [];
    },
    rejectedNote(): string {
      return rejectedShownText(this.rejected.length, this.backlog?.rejected_total);
    },
    unschedulable(): DarkBacklogUnschedulable[] {
      return this.backlog?.unschedulable ?? [];
    },
  },
  methods: {
    basisText,
    computedText,
    coveredText,
    framesNeededText,
    framesText,
    newestDarkText,
    num,
    openSetTitle,
    shortSetTitle,
    publishText,
    readoutText,
    refsText,
    rejectedHead,
    sessionGapText,
    sessionText,
    setTempMatchText,
    setpointText,
    setupText,
    text,
    thinText,
    uncheckedText,
    when,
    async loadAllRejected() {
      this.loadingRejected = true;
      try {
        this.allRejected = await getRejectedDarks();
        this.rejectedError = '';
      } catch (error) {
        this.rejectedError = `Could not load every rejected dark: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        this.loadingRejected = false;
      }
    },
    async fetchData() {
      const seq = ++this.seq;
      try {
        const response = await getDarkBacklog();
        if (seq !== this.seq) return;
        this.backlog = isDarkBacklog(response) ? response : null;
        if (this.allRejected) void this.loadAllRejected();
        this.unavailable = this.backlog ? '' : 'Not available: the stacker returned no dark backlog.';
      } catch (error) {
        if (seq !== this.seq) return;
        console.error('Error fetching the dark backlog:', error);
        this.backlog = null;
        this.unavailable = unavailableText(error);
      } finally {
        if (seq === this.seq) this.loaded = true;
      }
    },
  },
};
</script>
