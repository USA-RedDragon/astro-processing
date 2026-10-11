<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getBiasBacklog, type BiasBacklog } from '@/scheduler/api/calibration'
import { onChange } from '@/lib/events'
import {
  biasFramesNeededText,
  biasOpenSetTitle,
  biasPublishText,
  biasSessionGapText,
  biasUnavailableText,
  currentBiasText,
  isBiasBacklog,
  maxAgeText,
  newestBiasText,
  sortBiasCombos,
} from '@/lib/biasBacklog'
import { refsText } from '@/lib/calibrationRequests'
import { COMBO_LIMIT, NOT_RECORDED, basisText, computedText, framesText, num, readoutText, text } from '@/lib/darkBacklog'

const backlog = ref<BiasBacklog | null>(null)
const loaded = ref(false)
const unavailable = ref('')
const showAll = ref(false)
let seq = 0

const combos = computed(() => sortBiasCombos(backlog.value?.combos))
const shown = computed(() => (showAll.value ? combos.value : combos.value.slice(0, COMBO_LIMIT)))
const unschedulable = computed(() => backlog.value?.unschedulable ?? [])

async function load() {
  const mine = ++seq
  try {
    const r = await getBiasBacklog()
    if (mine !== seq) return
    backlog.value = isBiasBacklog(r) ? r : null
    unavailable.value = backlog.value ? '' : 'Not available: the stacker returned no bias backlog.'
  } catch (e) {
    if (mine !== seq) return
    backlog.value = null
    unavailable.value = biasUnavailableText(e)
  } finally {
    if (mine === seq) loaded.value = true
  }
}

const stop = onChange(['frames'], () => void load())
onUnmounted(stop)
void load()
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Bias backlog</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <p v-if="!loaded" class="text-sm text-muted-foreground">Loading…</p>
      <p v-else-if="!backlog" class="text-sm text-muted-foreground">{{ unavailable }}</p>
      <template v-else>
        <div class="space-y-1 text-sm text-muted-foreground">
          <p>{{ biasFramesNeededText(backlog) }}</p>
          <p>{{ basisText(backlog.frames_needed_basis) }}</p>
          <p>{{ maxAgeText(backlog) }}</p>
          <p>{{ basisText(backlog.max_age_basis) }}</p>
          <p>{{ biasSessionGapText(backlog) }}</p>
          <p>{{ computedText(backlog) }}</p>
        </div>
        <p v-if="combos.length === 0" class="text-sm text-muted-foreground">
          The backlog is empty: no lights are waiting on bias frames.
        </p>
        <template v-else>
          <p class="text-sm text-muted-foreground">{{ combos.length }} combos, ordered by priority.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="text-right">Priority</TableHead>
                <TableHead class="text-right">Gain</TableHead>
                <TableHead class="text-right">Offset</TableHead>
                <TableHead class="text-right">Binning</TableHead>
                <TableHead>Readout mode</TableHead>
                <TableHead class="text-right" :title="biasOpenSetTitle(backlog)">Open set</TableHead>
                <TableHead class="text-right">Lights missing</TableHead>
                <TableHead class="text-right">Lights stale</TableHead>
                <TableHead
                  class="text-right"
                  :title="`Lights whose bias set has fewer than ${backlog.frames_needed ?? '?'} frames`"
                >
                  Lights on a short set
                </TableHead>
                <TableHead class="text-right">Nights</TableHead>
                <TableHead>Latest night</TableHead>
                <TableHead>Newest bias</TableHead>
                <TableHead>Current bias set</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Basis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="c in shown" :key="c.combo_key" :title="basisText(c.basis)" :data-combo="c.combo_key">
                <TableCell class="text-right tabular-nums">
                  {{ c.priority }}
                  <Badge v-if="(c.requests ?? []).length > 0" variant="secondary" class="ml-1">requested</Badge>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.gain, '', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.offset, '', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.binning, '', NOT_RECORDED) }}</TableCell>
                <TableCell>{{ readoutText(c) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ framesText(c) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.lights_missing, '', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.lights_stale, '', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.lights_thin, '', NOT_RECORDED) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ num(c.nights) }}</TableCell>
                <TableCell>{{ text(c.latest_night, NOT_RECORDED) }}</TableCell>
                <TableCell>{{ newestBiasText(c) }}</TableCell>
                <TableCell>{{ currentBiasText(c) }}</TableCell>
                <TableCell class="whitespace-normal min-w-40">
                  <div v-for="r in refsText(c.requests)" :key="r">{{ r }}</div>
                  <span v-if="(c.requests ?? []).length === 0" class="text-muted-foreground">none</span>
                </TableCell>
                <TableCell class="text-xs text-muted-foreground whitespace-normal min-w-64">
                  {{ text(c.basis, NOT_RECORDED) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div v-if="combos.length > COMBO_LIMIT" class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-muted-foreground">Showing {{ shown.length }} of {{ combos.length }}.</span>
            <Button variant="outline" size="sm" @click="showAll = !showAll">
              {{ showAll ? `Show the first ${COMBO_LIMIT}` : `Show all ${combos.length}` }}
            </Button>
          </div>
        </template>
        <h3 class="text-sm font-semibold pt-2">Lights with no schedulable bias</h3>
        <p v-if="unschedulable.length === 0" class="text-sm text-muted-foreground">None.</p>
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead class="text-right">Lights</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(u, i) in unschedulable" :key="i">
              <TableCell class="text-right tabular-nums">{{ num(u.lights) }}</TableCell>
              <TableCell class="whitespace-normal">{{ text(u.reason, NOT_RECORDED) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div class="space-y-1 text-sm pt-2" data-bias-publish>
          <p v-for="line in biasPublishText(backlog.publish)" :key="line">{{ line }}</p>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
