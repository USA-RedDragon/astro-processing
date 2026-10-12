<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '../api/client'
import { getMoonKeep, type MoonKeepView } from '../api/moonkeep'
import { clock, longDate } from '../format'
import { basisText, filterChoices, grid, notUsedText, replayText, sepLabels } from '../moonKeep'

const v = ref<MoonKeepView | null>(null)
const error = ref('')
const missing = ref(false)
const choice = ref('bb')

onMounted(async () => {
  try {
    v.value = await getMoonKeep()
  } catch (e) {
    missing.value = e instanceof ApiError && e.status === 404
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const choices = computed(() => filterChoices(v.value))
const picked = computed(
  () => choices.value.find((c) => c.key === choice.value) ?? choices.value[0]!,
)
const rows = computed(() =>
  v.value ? grid(v.value, picked.value.filter, picked.value.narrowband) : [],
)
const seps = computed(() => (v.value ? sepLabels(v.value) : []))
const replay = computed(() => (v.value ? replayText(v.value) : []))
const notUsed = computed(() => notUsedText(v.value))
</script>

<template>
  <section class="card" aria-labelledby="mk-h" data-testid="moon-keep">
    <div class="spread" style="align-items: flex-start">
      <div style="min-width: 0">
        <h2 id="mk-h">Subs kept under the Moon</h2>
        <p class="small muted" style="margin: 0.25rem 0 0">
          {{ notUsed ? 'Once the scheduler gets these rates, Condition' : 'Condition' }} Match and
          Filter Steering weigh each sub by the share of past subs like it the stacker kept. Where
          that share is near zero, the scheduler leaves the time to other filters, darks or flats.
        </p>
      </div>
      <label v-if="v && v.computed_at" class="row small" style="flex-wrap: nowrap">
        <span class="muted">Show</span>
        <select v-model="choice" class="input" aria-label="Filter">
          <option v-for="c in choices" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
      </label>
    </div>
    <p v-if="error" class="empty small" style="padding: 0">
      {{
        missing
          ? 'Not measured yet: the stacker that fits these rates is not running this version.'
          : 'The kept rates could not be loaded: ' + error
      }}
    </p>
    <p v-else-if="!v" class="empty small" style="padding: 0">Loading.</p>
    <p v-else-if="!v.computed_at || !v.subs" class="empty small" style="padding: 0">
      Not measured yet{{ v.reason ? ': ' + v.reason : '.' }}
    </p>
    <template v-else>
      <div class="scroll-x">
        <table class="dgrid num xsmall" style="min-width: 36rem">
          <thead>
            <tr>
              <th>Moon</th>
              <th v-for="s in seps" :key="s">{{ s }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.label">
              <td style="white-space: nowrap; font-weight: 600">{{ r.label }}</td>
              <td
                v-for="(c, i) in r.cells"
                :key="i"
                :class="'mk-' + c.tone"
                :title="c.title"
                :aria-label="c.title || undefined"
              >
                {{ c.text
                }}<span v-if="c.row && c.row.subs" class="muted"> · {{ c.row.subs }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="row xsmall muted" style="gap: 0.875rem">
        <span><span class="key mk-skip"></span>Left to darks, flats or other filters</span>
        <span><span class="key mk-thin"></span>Too few subs to act on</span>
        <span>Each cell: share kept · subs</span>
      </div>
      <p v-for="(l, i) in replay" :key="i" class="small" style="margin: 0">{{ l }}</p>
      <p v-if="notUsed" class="small" style="margin: 0; color: var(--warn)">{{ notUsed }}</p>
      <p class="xsmall muted" style="margin: 0">
        {{ basisText(v) }} Fitted {{ longDate(v.computed_at) }} at {{ clock(v.computed_at) }}.
      </p>
    </template>
  </section>
</template>

<style scoped>
td.mk-skip {
  background: var(--bad-bg);
  color: var(--bad);
  font-weight: 600;
}
td.mk-thin,
td.mk-none {
  color: var(--muted-foreground);
}
.key {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  margin-right: 0.25rem;
  vertical-align: -1px;
}
.key.mk-skip {
  background: var(--bad-bg);
  border: 1px solid var(--bad);
}
.key.mk-thin {
  background: var(--secondary);
}
</style>
