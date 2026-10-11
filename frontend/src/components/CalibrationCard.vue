<template>
  <Card>
    <CardHeader>
      <CardTitle>Calibration</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <div v-if="loading" class="h-4 w-2/3 rounded bg-muted animate-pulse" />
      <p v-else class="text-sm tabular-nums">{{ summary }}</p>
      <div class="border rounded-md max-h-[60vh] overflow-auto">
        <UiTable>
          <TableHeader class="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Night</TableHead>
              <TableHead>Filter</TableHead>
              <TableHead class="text-right">Gain</TableHead>
              <TableHead class="text-right">Offset</TableHead>
              <TableHead class="text-right">Setpoint</TableHead>
              <TableHead class="text-right">Lights</TableHead>
              <TableHead>Flat</TableHead>
              <TableHead>Dark</TableHead>
              <TableHead>Bias</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SkeletonRows v-if="loading" :rows="5" :cols="9" />
            <TableRow v-for="r in rows" :key="rowKey(r)">
              <TableCell class="whitespace-nowrap">{{ r.night }}</TableCell>
              <TableCell class="whitespace-nowrap">{{ r.filter }} {{ r.exposure }}s</TableCell>
              <TableCell class="text-right tabular-nums">{{ r.gain ?? '' }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ r.offset ?? '' }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ r.set_temp != null ? `${r.set_temp} °C` : '' }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ r.lights }}</TableCell>
              <TableCell><Badge :variant="variant(r.flat)">{{ flatText(r.flat) }}</Badge></TableCell>
              <TableCell>
                <Badge :variant="variant(r.dark)">{{ darkText(r, r.dark) }}</Badge>
                <span
                  v-if="importedText(r.dark)"
                  class="block text-xs text-muted-foreground"
                  :title="importedTitle(r.dark)"
                >
                  {{ importedText(r.dark) }}
                </span>
              </TableCell>
              <TableCell>
                <Badge :variant="variant(r.bias)">{{ ageText(r.bias) }}</Badge>
                <span
                  v-if="importedText(r.bias)"
                  class="block text-xs text-muted-foreground"
                  :title="importedTitle(r.bias)"
                >
                  {{ importedText(r.bias) }}
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </UiTable>
      </div>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { coverageSummary, darkText, importedText, importedTitle, rowKey } from '@/lib/calibration';
import type { CalibrationMatch, CalibrationRow } from '../graphql/graphql';

export default {
  name: 'CalibrationCard',
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
    SkeletonRows,
  },
  props: {
    rows: {
      type: Array as PropType<CalibrationRow[]>,
      required: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    summary(): string {
      return coverageSummary(this.rows);
    },
  },
  methods: {
    variant(m: CalibrationMatch): 'default' | 'secondary' | 'destructive' | 'outline' {
      if (m.quality === 'EXACT') return 'default';
      if (m.quality === 'MISSING') return 'destructive';
      return 'outline';
    },
    ageText(m: CalibrationMatch): string {
      if (m.quality === 'MISSING') return 'none';
      if (m.age_days === 0) return 'same night';
      return `${m.age_days} d away`;
    },
    flatText(m: CalibrationMatch): string {
      const text = this.ageText(m);
      return m.rotation_mismatch ? `${text}, other angle` : text;
    },
    darkText,
    importedText,
    importedTitle,
    rowKey,
  },
};
</script>
