<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  constantText,
  readCollabSwitch,
  runningText,
  setCollabSwitch,
  type CollabSwitchStatus,
} from '../api/collab'
import { ago, clock } from '../format'
import { errorToast, notifyCommand, shell } from '../shell'

const busy = ref<'' | 'set' | 'read'>('')
const s = computed<CollabSwitchStatus | null>(() => shell.collab)
const on = computed(() => s.value?.desired?.on ?? false)

const stateText = computed(() => {
  const d = s.value?.desired
  if (!d)
    return 'Not set yet. NINA starts with the collab off, so Target Scheduler has the telescope.'
  return d.on
    ? "On. The Starfront collaboration runs before Target Scheduler and keeps the telescope until you pause it or tonight's deal is shot."
    : 'Paused. Target Scheduler has the telescope. Resume hands it back to the collab at the next safe point.'
})

const buttonText = computed(() => {
  if (busy.value === 'set') return 'Sending to NINA…'
  if (!s.value?.desired) return 'Turn the collab on'
  return on.value ? 'Pause the collab' : 'Resume the collab'
})

const switchText = computed(() => {
  const d = s.value?.desired
  if (!d) return 'Not set'
  const who = d.setBy ? `set by ${d.setBy}` : 'set'
  return `${d.on ? 'On' : 'Paused'} · ${who} at ${clock(d.setAt)}`
})

const readText = computed(() => {
  const v = s.value
  if (!v) return ''
  const base = constantText(v)
  return v.readBack.at
    ? `${base} · read ${ago(v.readBack.at, shell.now)} through NINA's Advanced API`
    : base
})

const mismatch = computed(() => {
  const v = s.value
  return !!v?.desired && v.readBack.present && !v.matches
})

const runningLine = computed(() => {
  const v = s.value
  if (!v?.configured) return 'Not known: NINA is not set up.'
  if (!v.checkedAt) return 'Not checked yet.'
  if (!v.reachable) return `NINA did not answer: ${v.ninaError ?? 'no reason given'}.`
  return `${runningText(v.running)} · checked ${ago(v.checkedAt, shell.now)}`
})

async function flip() {
  busy.value = 'set'
  try {
    const r = await setCollabSwitch(!on.value)
    shell.collab = r.status
    notifyCommand(r.record, r.record.title)
  } catch (e) {
    errorToast(e, 'The collab switch did not go through')
  } finally {
    busy.value = ''
  }
}

async function readNow() {
  busy.value = 'read'
  try {
    shell.collab = await readCollabSwitch()
  } catch (e) {
    errorToast(e, 'Could not read NINA')
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <section class="card" aria-labelledby="ctl-h" style="gap: 1rem">
    <div class="spread" style="align-items: flex-start; gap: 1rem">
      <div>
        <span class="tag">At the observatory</span>
        <h2 id="ctl-h" style="margin: 0.25rem 0 0">Collab switch</h2>
        <p class="small muted" style="margin: 0.25rem 0 0; max-width: 80ch">{{ stateText }}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" :disabled="!!busy || !s" @click="flip">
          {{ buttonText }}
        </button>
        <span class="xsmall muted"
          >Takes effect at the next safe point: after the exposure that is running now.</span
        >
      </div>
    </div>

    <p v-if="!s && shell.collabError" class="badge bad" style="align-self: flex-start">
      Could not load the switch: {{ shell.collabError }}
    </p>
    <p v-else-if="!s" class="empty">Loading the switch…</p>
    <dl v-else class="facts">
      <dt>Switch</dt>
      <dd>{{ switchText }}</dd>
      <dt>Read back from NINA</dt>
      <dd>
        <span :style="{ color: s.readBack.at && !s.readBack.present ? 'var(--bad)' : undefined }">{{
          readText
        }}</span>
        <button
          v-if="s.configured"
          type="button"
          class="btn sm"
          style="margin-left: 0.5rem"
          :disabled="!!busy"
          @click="readNow"
        >
          {{ busy === 'read' ? 'Reading…' : 'Read now' }}
        </button>
        <div v-if="mismatch" class="xsmall" style="color: var(--warn)">
          NINA does not match the switch yet. The stacker sends it again after NINA restarts or the
          sequence is loaded again, and every 15 minutes while they differ.
        </div>
      </dd>
      <dt>Running now</dt>
      <dd>{{ runningLine }}</dd>
      <template v-if="s.lastSendAt">
        <dt>Last sent</dt>
        <dd>{{ ago(s.lastSendAt, shell.now) }} · {{ s.lastSend }}</dd>
      </template>
    </dl>

    <details>
      <summary style="cursor: pointer; font-weight: 500">How the switch works</summary>
      <ol class="steps small muted">
        <li>
          The switch sets the Powerups constant <code>collab</code> in NINA's running sequence
          through NINA's Advanced API. It does not restart NINA or load the sequence again.
        </li>
        <li>
          On: Target Scheduler stops before its next instruction and the collab block starts. It
          opens the flap if needed, slews, centres and shoots what Starfront dealt.
        </li>
        <li>
          Pause: the collab block stops before its next exposure and Target Scheduler starts again.
          Frames already shot stay credited; the rest wait for Resume.
        </li>
        <li>
          Turning it on also asks Target Scheduler to plan again, so a long wait ends and the
          hand-over happens now, not when the wait ends.
        </li>
        <li>
          Safety, the flap, darks and dawn work the same in both. Unsafe weather stops either one.
        </li>
        <li>
          If NINA restarts or the sequence is loaded again, the constant goes back to 0. The stacker
          checks NINA every minute, sends the stored setting again, and each re-send shows in
          History.
        </li>
        <li>
          Reading the constant back asks NINA for the whole running sequence, which is large, so it
          is read when the switch changes, when NINA restarts, and when you press Read now.
        </li>
      </ol>
    </details>
  </section>
</template>

<style scoped>
.tag {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
}
.actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  max-width: 22rem;
  text-align: right;
}
.facts {
  display: grid;
  grid-template-columns: minmax(9rem, max-content) 1fr;
  gap: 0.375rem 1rem;
  margin: 0;
  font-size: 0.875rem;
}
.facts dt {
  color: var(--muted-foreground);
}
.facts dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.steps {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  max-width: 80ch;
}
@media (max-width: 640px) {
  .facts {
    grid-template-columns: 1fr;
  }
  .facts dd {
    margin-bottom: 0.375rem;
  }
  .actions {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
