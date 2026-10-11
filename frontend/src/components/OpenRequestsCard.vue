<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CalibrationRequestList from '@/components/CalibrationRequestList.vue'
import { useCalibrationRequests } from '@/lib/useCalibrationRequests'

const { requests, loaded, error, busy, result, cancel } = useCalibrationRequests(() => ({ status: 'open' }))
const BAD = { color: 'var(--bad)', background: 'var(--bad-bg)' }
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Open requests</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <p class="text-sm text-muted-foreground">
        Flats, darks and bias asked for from a target's page. A request is done when its frames are in the
        stacker's index.
      </p>
      <div
        v-if="result"
        role="status"
        class="rounded-md border px-3 py-2 text-sm"
        :style="result.tone === 'bad' ? BAD : undefined"
        data-result
      >
        <div class="font-medium">{{ result.text }}</div>
        <div :class="result.tone === 'bad' ? '' : 'text-muted-foreground'">{{ result.sub }}</div>
      </div>
      <p v-if="!loaded" class="text-sm text-muted-foreground">Loading…</p>
      <p v-else-if="error" class="text-sm text-muted-foreground">{{ error }}</p>
      <p v-else-if="requests.length === 0" class="text-sm text-muted-foreground">No open requests.</p>
      <CalibrationRequestList v-else :requests="requests" :busy="busy" show-object @cancel="cancel" />
    </CardContent>
  </Card>
</template>
