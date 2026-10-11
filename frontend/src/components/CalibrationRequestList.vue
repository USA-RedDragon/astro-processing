<script setup lang="ts">
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CalibrationRequest } from '@/scheduler/api/calibration'
import {
  askedText,
  itemText,
  progressText,
  requestPublishState,
  statusText,
  statusVariant,
  typeLabel,
} from '@/lib/calibrationRequests'
import { NOT_RECORDED, text } from '@/lib/darkBacklog'

const props = withDefaults(
  defineProps<{
    requests: CalibrationRequest[]
    busy?: string
    showObject?: boolean
    closedLimit?: number
  }>(),
  { busy: '', showObject: false, closedLimit: 10 },
)

const emit = defineEmits<{ cancel: [r: CalibrationRequest] }>()

const showAllClosed = ref(false)
const open = computed(() => props.requests.filter((r) => r.status === 'open'))
const closed = computed(() => props.requests.filter((r) => r.status !== 'open'))
const shown = computed(() => [
  ...open.value,
  ...(showAllClosed.value ? closed.value : closed.value.slice(0, props.closedLimit)),
])
const hiddenClosed = computed(() => (showAllClosed.value ? 0 : Math.max(0, closed.value.length - props.closedLimit)))

const WARN = { color: 'var(--warn)', background: 'var(--warn-bg)' }

const closedNote = computed(() =>
  showAllClosed.value
    ? `Showing all ${closed.value.length} done and cancelled.`
    : `${hiddenClosed.value} older done or cancelled requests hidden.`,
)

function publishOf(r: CalibrationRequest) {
  return requestPublishState(r.publish, r.created_at)
}

function heading(r: CalibrationRequest): string {
  const what = `${typeLabel(r.type)} · night of ${r.night}`
  return props.showObject ? `${r.object} · ${what}` : what
}
</script>

<template>
  <ul class="space-y-3">
    <li
      v-for="r in shown"
      :key="r.id"
      class="rounded-md border p-3 space-y-2 text-sm"
      :data-request="r.id"
    >
      <div class="flex flex-wrap items-center gap-2">
        <Badge :variant="statusVariant(r.status)">{{ r.status }}</Badge>
        <span class="font-medium break-words min-w-0">{{ heading(r) }}</span>
        <span class="text-muted-foreground tabular-nums">{{ progressText(r) }}</span>
        <Button
          v-if="r.status === 'open'"
          variant="outline"
          size="sm"
          class="ml-auto"
          :disabled="busy !== ''"
          @click="emit('cancel', r)"
        >
          {{ busy === `cancel:${r.id}` ? 'Cancelling…' : 'Cancel' }}
        </Button>
      </div>
      <p class="text-muted-foreground">
        {{ askedText(r) }}<template v-if="r.status !== 'open'"> · {{ statusText(r) }}</template>
      </p>
      <ul v-if="(r.items ?? []).length > 0" class="flex flex-wrap gap-2">
        <li
          v-for="i in r.items ?? []"
          :key="i.key"
          class="rounded border px-2 py-1 tabular-nums break-words max-w-full"
          :class="i.done ? 'bg-muted' : ''"
        >
          {{ i.label }} <span class="text-muted-foreground">{{ itemText(i) }}{{ i.done ? ' · done' : '' }}</span>
        </li>
      </ul>
      <p
        v-if="r.status === 'open'"
        :class="publishOf(r).seen ? 'text-muted-foreground' : 'rounded px-2 py-1'"
        :style="publishOf(r).seen ? undefined : WARN"
        data-publish
      >
        {{ publishOf(r).text }}
      </p>
      <p class="text-xs text-muted-foreground">Basis: {{ text(r.basis, NOT_RECORDED) }}</p>
    </li>
  </ul>
  <div v-if="closed.length > closedLimit" class="mt-3 flex flex-wrap items-center gap-3">
    <span class="text-sm text-muted-foreground">{{ closedNote }}</span>
    <Button variant="outline" size="sm" @click="showAllClosed = !showAllClosed">
      {{ showAllClosed ? `Show the newest ${closedLimit}` : `Show all ${closed.length}` }}
    </Button>
  </div>
</template>
