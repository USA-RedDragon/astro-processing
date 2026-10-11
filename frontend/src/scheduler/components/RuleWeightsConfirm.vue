<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectWeights } from '../api/ruleweights'
import { plural, type WeightChange } from '../ruleWeights'

const props = defineProps<{
  title: string
  changes: WeightChange[]
  projects: ProjectWeights[] | null
  loading?: boolean
  error?: string
  busy?: boolean
  action: string
  extra?: string[]
}>()
const emit = defineEmits<{ cancel: []; confirm: [] }>()

const shown = computed(() => (props.projects ?? []).slice(0, 12))
const more = computed(() => Math.max(0, (props.projects?.length ?? 0) - shown.value.length))
</script>

<template>
  <div class="overlay">
    <div class="scrim" aria-hidden="true" @click="emit('cancel')"></div>
    <div role="dialog" aria-modal="true" aria-labelledby="rw-confirm-h" class="dialog">
      <h2 id="rw-confirm-h">{{ title }}</h2>
      <template v-if="changes.length">
        <p>The app saves the global rule weights with these changes:</p>
        <ul class="small" style="margin: 0; padding-left: 1.125rem">
          <li v-for="c in changes" :key="c.key">
            {{ c.label }}: {{ c.from }} to <strong>{{ c.to }}</strong>
          </li>
        </ul>
      </template>
      <template v-if="extra?.length">
        <p>It also sends these project changes:</p>
        <ul class="small" style="margin: 0; padding-left: 1.125rem">
          <li v-for="x in extra" :key="x">{{ x }}</li>
        </ul>
      </template>
      <p v-if="loading" class="muted">Working out which projects change.</p>
      <p v-else-if="error" style="color: var(--bad)">
        The projects that would change are not known: {{ error }}
      </p>
      <template v-else-if="projects">
        <p v-if="!projects.length">
          Every project already has these weights, so nothing is sent to Target Scheduler.
        </p>
        <template v-else>
          <p>
            Then it sends a rule weight update to {{ plural(projects.length, 'project') }}. Target
            Scheduler applies each one when the current exposure ends, and each one is in History
            with undo.
          </p>
          <ul class="small" style="margin: 0; padding-left: 1.125rem">
            <li v-for="p in shown" :key="p.id">
              {{ p.name }}
              <span class="muted"
                >· {{ plural(p.diffs.length, 'rule') }}{{ p.isMosaic ? ' · mosaic' : '' }}</span
              >
            </li>
            <li v-if="more" class="muted">and {{ plural(more, 'more project') }}</li>
          </ul>
        </template>
      </template>
      <div class="actions">
        <button type="button" class="btn" @click="emit('cancel')">Cancel</button>
        <button
          type="button"
          class="btn primary"
          :disabled="busy || loading || !!error"
          @click="emit('confirm')"
        >
          {{ action }}
        </button>
      </div>
    </div>
  </div>
</template>
