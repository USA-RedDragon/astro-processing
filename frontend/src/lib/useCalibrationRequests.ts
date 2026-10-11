import { onUnmounted, ref } from 'vue'
import {
  cancelCalibration,
  getCalibrationRequests,
  requestCalibration,
  type CalibrationPayload,
  type CalibrationRequest,
  type CalibrationRequestFilter,
} from '@/scheduler/api/calibration'
import type { CommandRecord } from '@/scheduler/api/commands'
import { onEvent } from '@/scheduler/api/events'
import { describeOutcome, showToast } from '@/scheduler/shell'
import { onChange } from './events'
import {
  commandErrorText,
  payloadOf,
  requestPublishState,
  requestTitle,
  requestsUnavailableText,
  sortRequests,
  typeLabel,
} from './calibrationRequests'

export interface CommandResult {
  tone: 'ok' | 'bad'
  text: string
  sub: string
}

export function useCalibrationRequests(filter: () => CalibrationRequestFilter) {
  const requests = ref<CalibrationRequest[]>([])
  const loaded = ref(false)
  const error = ref('')
  const busy = ref('')
  const result = ref<CommandResult | null>(null)
  let seq = 0

  async function load() {
    const mine = ++seq
    try {
      const list = await getCalibrationRequests(filter())
      if (mine !== seq) return
      requests.value = sortRequests(Array.isArray(list) ? list : [])
      error.value = ''
    } catch (e) {
      if (mine !== seq) return
      error.value = requestsUnavailableText(e)
    } finally {
      if (mine === seq) loaded.value = true
    }
  }

  function findOpen(p: CalibrationPayload): CalibrationRequest | undefined {
    return requests.value.find(
      (r) => r.status === 'open' && r.type === p.type && r.object === p.object && r.night === p.night,
    )
  }

  function saved(c: CommandRecord, sub: string) {
    result.value = { tone: 'ok', text: `Saved · ${c.title}`, sub }
    showToast({ text: `Saved · ${c.title}`, sub, undoId: c.status === 'saved' ? c.id : undefined })
  }

  function refused(what: string, e: unknown) {
    const sub = commandErrorText(e)
    result.value = { tone: 'bad', text: `Not saved · ${what}`, sub }
    showToast({ text: `Not saved · ${what}`, sub, tone: 'bad' })
  }

  async function submit(p: CalibrationPayload) {
    const key = `request:${p.type}:${p.night}`
    busy.value = key
    try {
      const c = await requestCalibration(p)
      await load()
      const made = findOpen(p)
      saved(c, made ? requestPublishState(made.publish, made.created_at).text : describeOutcome(c).sub)
    } catch (e) {
      refused(`Request ${typeLabel(p.type).toLowerCase()} for ${p.object} · night of ${p.night}`, e)
    } finally {
      if (busy.value === key) busy.value = ''
    }
  }

  async function cancel(r: CalibrationRequest) {
    const key = `cancel:${r.id}`
    busy.value = key
    try {
      const c = await cancelCalibration(payloadOf(r))
      await load()
      saved(c, 'Cancelled in the app. When publishing is on, the stacker takes it off the observatory list at its next publish.')
    } catch (e) {
      refused(`Cancel ${requestTitle(r)}`, e)
    } finally {
      if (busy.value === key) busy.value = ''
    }
  }

  const stopFrames = onChange(['frames'], () => void load())
  const stopCommands = onEvent('command', (e: { data?: CommandRecord }) => {
    if (e.data?.category === 'calibration') void load()
  })
  onUnmounted(() => {
    stopFrames()
    stopCommands()
  })

  void load()

  return { requests, loaded, error, busy, result, load, submit, cancel }
}
