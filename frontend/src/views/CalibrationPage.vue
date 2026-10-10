<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Calibration</h1>
      <template v-if="library">
        <p class="text-sm text-muted-foreground mt-1">{{ ladderText(library) }}</p>
        <p class="text-sm text-muted-foreground">{{ minFramesText(library) }}</p>
        <p v-if="library.gaps.length > 0" class="text-sm text-muted-foreground">{{ captureText(library.gaps) }}</p>
      </template>
      <p v-else-if="loaded" class="text-sm text-muted-foreground mt-1">{{ unavailable }}</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Dark library gaps</CardTitle>
      </CardHeader>
      <CardContent>
        <p v-if="loaded && library && gaps.length === 0" class="text-sm text-muted-foreground">
          Every ladder setpoint the lights need has a dark set of their exposure.
        </p>
        <p v-else-if="loaded && !library" class="text-sm text-muted-foreground">{{ unavailable }}</p>
        <UiTable v-else>
          <TableHeader>
            <TableRow>
              <TableHead class="text-right">Setpoint</TableHead>
              <TableHead class="text-right">Exposure</TableHead>
              <TableHead class="text-right">Gain</TableHead>
              <TableHead class="text-right">Offset</TableHead>
              <TableHead class="text-right">Lights</TableHead>
              <TableHead class="text-right">Nights</TableHead>
              <TableHead>Latest night</TableHead>
              <TableHead>Darks at this setpoint now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="g in gaps" :key="`${g.set_temp}-${g.gain}-${g.offset}-${g.exposure}`">
              <TableCell class="text-right tabular-nums">{{ g.set_temp }} °C</TableCell>
              <TableCell class="text-right tabular-nums">
                {{ g.exposure != null ? `${g.exposure} s` : 'not recorded' }}
              </TableCell>
              <TableCell class="text-right tabular-nums">{{ g.gain }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ g.offset }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ g.lights }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ g.nights }}</TableCell>
              <TableCell>{{ g.latest_night }}</TableCell>
              <TableCell>{{ otherExposuresText(g) }}</TableCell>
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
import { captureText, ladderText, minFramesText, otherExposuresText } from '@/lib/calibration';
import type { DarkLibrary, DarkLibraryGap } from '../graphql/graphql';

const GET_DARK_LIBRARY_QUERY = `
  query GetDarkLibrary {
    darkLibrary {
      ladder
      min_frames
      set_temp_exact_c
      set_temp_scale_max_c
      gaps {
        gain
        offset
        exposure
        set_temp
        lights
        nights
        latest_night
        other_exposures
      }
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
      library: null as DarkLibrary | null,
      unavailable: '',
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
  computed: {
    gaps(): DarkLibraryGap[] {
      return this.library?.gaps ?? [];
    },
  },
  methods: {
    captureText,
    ladderText,
    minFramesText,
    otherExposuresText,
    async fetchData() {
      try {
        const response = await API.request(GET_DARK_LIBRARY_QUERY);
        this.library = (response.darkLibrary as DarkLibrary | null) ?? null;
        this.unavailable = this.library ? '' : 'Not available: the stacker is not configured on this server.';
      } catch (error) {
        console.error('Error fetching the dark library:', error);
        this.unavailable = `Not available: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        this.loaded = true;
      }
    },
  },
};
</script>
