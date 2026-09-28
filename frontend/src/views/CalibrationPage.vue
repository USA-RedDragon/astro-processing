<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Calibration</h1>
      <p class="text-sm text-muted-foreground mt-1">
        Dark sets to take: about 25 × 600 s darks at each setpoint, per gain and offset.
        Lights between setpoints use the nearest set, scaled.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Dark library gaps</CardTitle>
      </CardHeader>
      <CardContent>
        <p v-if="loaded && gaps.length === 0" class="text-sm text-muted-foreground">No gaps.</p>
        <UiTable v-else>
          <TableHeader>
            <TableRow>
              <TableHead class="text-right">Setpoint</TableHead>
              <TableHead class="text-right">Gain</TableHead>
              <TableHead class="text-right">Offset</TableHead>
              <TableHead class="text-right">Lights</TableHead>
              <TableHead class="text-right">Nights</TableHead>
              <TableHead>Latest night</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="g in gaps" :key="`${g.set_temp}-${g.gain}-${g.offset}`">
              <TableCell class="text-right tabular-nums">{{ g.set_temp }} °C</TableCell>
              <TableCell class="text-right tabular-nums">{{ g.gain }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ g.offset }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ g.lights }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ g.nights }}</TableCell>
              <TableCell>{{ g.latest_night }}</TableCell>
            </TableRow>
          </TableBody>
        </UiTable>
      </CardContent>
    </Card>
  </div>
</template>

<script lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import API from '@/lib/API';
import { onChange } from '@/lib/events';
import type { DarkLibraryGap } from '../graphql/graphql';

const GET_DARK_GAPS_QUERY = `
  query GetDarkLibraryGaps {
    darkLibraryGaps {
      gain
      offset
      set_temp
      lights
      nights
      latest_night
    }
  }
`;

export default {
  name: 'CalibrationPage',
  components: {
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
      gaps: [] as DarkLibraryGap[],
      loaded: false,
      stopChanges: () => {},
    };
  },
  created() {
    this.fetchData();
    // Gaps change as the stacker indexes new lights and darks.
    this.stopChanges = onChange(['frames'], () => this.fetchData());
  },
  unmounted() {
    this.stopChanges();
  },
  methods: {
    async fetchData() {
      try {
        const response = await API.request(GET_DARK_GAPS_QUERY);
        this.gaps = response.darkLibraryGaps as DarkLibraryGap[];
      } catch (error) {
        console.error('Error fetching dark library gaps:', error);
      } finally {
        this.loaded = true;
      }
    },
  },
};
</script>
