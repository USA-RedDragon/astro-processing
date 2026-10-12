<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getBodyTarget, type BodyFraming, type BodyTargetView } from '../api/comets'
import { submitCommand } from '../api/commands'
import { headText, ninaPositionAngle } from '../framing'
import { errorToast, notifyCommand } from '../shell'
import FramingEditor from './FramingEditor.vue'

const props = defineProps<{
  targetGuid: string
  targetId: number
  targetName: string
}>()

const view = ref<BodyTargetView | null>(null)
const editing = ref(false)
const draft = ref<BodyFraming | null>(null)
const busy = ref(false)

async function load() {
  try {
    view.value = await getBodyTarget(props.targetGuid)
  } catch {
    view.value = null
  }
}
watch(() => props.targetGuid, load, { immediate: true })

const body = computed(() => view.value?.target ?? null)
const kind = computed(() => (body.value?.kind === 'asteroid' ? 'asteroid' : 'comet'))
const current = computed<BodyFraming | null>(() => {
  const b = body.value
  if (!b || b.rotation_deg === null || b.offset_frac === null) return null
  return { rotation_deg: b.rotation_deg, offset_frac: b.offset_frac }
})

const summary = computed(() => {
  if (!view.value?.framing_columns)
    return 'The home copy of the scheduler database has no framing columns yet, so the stored framing cannot be shown. A framing you save here still goes to the scheduler.'
  const f = current.value
  if (!f)
    return `No framing stored: the ${kind.value} is centered and the rotator stays at the target's own angle.`
  return `Long side at ${Math.round(f.rotation_deg)}° (NINA position angle ${Math.round(ninaPositionAngle(f.rotation_deg))}°), ${kind.value === 'comet' ? 'head' : 'body'} ${headText(f, null)}.`
})

const same = (a: BodyFraming | null, b: BodyFraming | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.rotation_deg - b.rotation_deg) < 1e-6 &&
    Math.abs(a.offset_frac - b.offset_frac) < 1e-6)

const changed = computed(() => !same(draft.value, current.value))

async function save() {
  if (busy.value || !changed.value) return
  busy.value = true
  try {
    const r = await submitCommand('target.framing', {
      target_id: props.targetId,
      target_guid: props.targetGuid,
      target_name: props.targetName,
      framing: draft.value,
      before: current.value,
    })
    const failed = ['rejected', 'failed', 'conflict', 'cancelled'].includes(r.status)
    notifyCommand(
      r,
      failed
        ? `Framing for ${props.targetName} was not saved`
        : `Framing for ${props.targetName} sent`,
    )
    if (!failed) editing.value = false
    load()
  } catch (e) {
    errorToast(e, `Could not save the framing for ${props.targetName}`)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="body" class="card" aria-labelledby="framing-h" style="gap: 0.75rem">
    <div class="spread">
      <h2 id="framing-h">Framing</h2>
      <button v-if="!editing" type="button" class="btn sm" @click="editing = true">
        Change framing
      </button>
      <button v-else type="button" class="btn link xsmall" @click="editing = false">Cancel</button>
    </div>
    <p class="small muted" style="margin: 0">{{ body.designation }} · {{ summary }}</p>
    <template v-if="editing">
      <FramingEditor
        v-model="draft"
        :designation="body.designation"
        :name="targetName"
        :kind="kind"
        :initial="current"
      />
      <div class="row">
        <button type="button" class="btn primary" :disabled="busy || !changed" @click="save">
          {{ busy ? 'Saving…' : 'Save framing' }}
        </button>
        <span v-if="!changed" class="xsmall muted">Same as the stored framing.</span>
      </div>
    </template>
  </section>
</template>
