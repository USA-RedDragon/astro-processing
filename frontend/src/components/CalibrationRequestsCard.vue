<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CalibrationRequestList from '@/components/CalibrationRequestList.vue'
import type { CalibrationType } from '@/scheduler/api/calibration'
import { CALIBRATION_TYPES, hasOpenRequest, requestPayload, typeLabel } from '@/lib/calibrationRequests'
import { useCalibrationRequests } from '@/lib/useCalibrationRequests'

const props = defineProps<{
  object: string
  targetId: string | number | null
  nights: string[]
}>()

const night = ref(props.nights[0] ?? '')
watch(
  () => props.nights,
  (list) => {
    if (!list.includes(night.value)) night.value = list[0] ?? ''
  },
)

const { requests, loaded, error, busy, result, submit, cancel } = useCalibrationRequests(() => ({
  object: props.object,
  status: 'all',
}))

const openCount = computed(() => requests.value.filter((r) => r.status === 'open').length)

function isOpen(type: CalibrationType): boolean {
  return hasOpenRequest(requests.value, type, night.value, props.object)
}

function buttonTitle(type: CalibrationType): string {
  if (isOpen(type)) return `An open ${type} request for the night of ${night.value} already exists.`
  return `Ask the observatory to take ${type} for this target's lights of the night of ${night.value}.`
}

const BAD = { color: 'var(--bad)', background: 'var(--bad-bg)' }

function buttonText(type: CalibrationType): string {
  if (busy.value === `request:${type}:${night.value}`) return 'Requesting…'
  return isOpen(type) ? `${typeLabel(type)} requested` : `Request ${type}`
}

function ask(type: CalibrationType) {
  if (!night.value || isOpen(type)) return
  void submit(requestPayload(type, props.object, props.targetId, night.value))
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Calibration requests</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <p class="text-sm text-muted-foreground">
        Ask the observatory to take flats, darks or bias for the lights of one night of &ldquo;{{ object }}&rdquo;.
        Flats are taken at the next dawn with the flat panel; darks and bias with the cover closed.
      </p>
      <div v-if="nights.length > 0" class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-muted-foreground">Night</span>
          <select v-model="night" class="border rounded-md bg-background px-2 py-1 h-8">
            <option v-for="n in nights" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <Button
          v-for="t in CALIBRATION_TYPES"
          :key="t"
          variant="outline"
          size="sm"
          :disabled="busy !== '' || isOpen(t) || !loaded || error !== ''"
          :title="buttonTitle(t)"
          :data-type="t"
          @click="ask(t)"
        >
          {{ buttonText(t) }}
        </Button>
      </div>
      <p v-else class="text-sm text-muted-foreground">
        No nights with lights of this target in the stacker's index.
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
      <p v-if="!loaded" class="text-sm text-muted-foreground">Loading requests…</p>
      <p v-else-if="error" class="text-sm text-muted-foreground">{{ error }}</p>
      <p v-else-if="requests.length === 0" class="text-sm text-muted-foreground">No requests for this target yet.</p>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          {{ openCount }} open, {{ requests.length - openCount }} done or cancelled.
        </p>
        <CalibrationRequestList :requests="requests" :busy="busy" @cancel="cancel" />
      </template>
    </CardContent>
  </Card>
</template>
