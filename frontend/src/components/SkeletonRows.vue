<template>
  <TableRow v-for="r in rows" :key="r" class="hover:bg-transparent">
    <TableCell v-for="c in cols" :key="c">
      <div class="h-4 rounded bg-muted animate-pulse" :style="{ width: `${widths[(r + c) % widths.length]}%` }" />
    </TableCell>
  </TableRow>
</template>

<script lang="ts">
import { TableCell, TableRow } from '@/components/ui/table';

// Placeholder table rows shown while data loads.
export default {
  name: 'SkeletonRows',
  components: { TableCell, TableRow },
  props: {
    rows: { type: Number, default: 5 },
    cols: { type: Number, required: true },
  },
  data() {
    return { widths: [70, 90, 55, 80, 65] };
  },
};
</script>
