<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '../api/client'
import { filterColor, type BodyKind, type FilterGoal } from '../api/planning'
import { bodyNightsSummary, nightCellText, nightCellTitle, nightRows } from '../bodyGoals'

interface NightImage {
  filter: string
  night: string
  subs: number
  previewUrl?: string
  masterUrl?: string
  starlessUrl?: string
}

const props = defineProps<{
  kind: BodyKind
  goals: FilterGoal[]
  objects: string[]
}>()

const images = ref<NightImage[]>([])
const nightsKey = computed(() =>
  props.goals.flatMap((g) => (g.body?.nights ?? []).map((n) => `${g.filter}:${n.night}:${n.subs}`)).join(','),
)
const imageError = ref('')

watch(
  () => props.objects.join('\n') + '|' + nightsKey.value,
  async () => {
    images.value = []
    imageError.value = ''
    if (!props.objects.length) return
    const q = props.objects.map((o) => 'object=' + encodeURIComponent(o)).join('&')
    try {
      images.value = await api.get<NightImage[]>('/body-nights?' + q)
    } catch (e) {
      imageError.value = e instanceof Error ? e.message : String(e)
    }
  },
  { immediate: true },
)

const rows = computed(() => nightRows(props.goals))
const summary = computed(() => bodyNightsSummary(props.goals, props.kind))

function imagesFor(night: string): NightImage[] {
  return images.value.filter((i) => i.night === night)
}
</script>

<template>
  <section class="card" style="flex: 2 1 26rem; min-width: 0" aria-labelledby="nights-h">
    <h2 id="nights-h">Nights imaged</h2>
    <p class="small" style="margin: 0">{{ summary }}</p>
    <div v-if="rows.length" class="scroll-x">
      <table class="dgrid num xsmall" data-testid="body-nights">
        <thead>
          <tr>
            <th>Night</th>
            <th v-for="g in goals" :key="'h-' + g.filter">
              <span class="row" style="flex-wrap: nowrap; gap: 0.25rem"
                ><span class="swatch" :style="{ background: filterColor(g.stackFilter) }" />{{
                  g.filter
                }}</span
              >
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.night">
            <td style="font-weight: 600; white-space: nowrap">
              {{ r.night }}<span v-if="r.tonight" class="muted"> · tonight</span>
            </td>
            <td v-for="c in r.cells" :key="r.night + c.filter" :title="nightCellTitle(c.night)">
              {{ nightCellText(c.night, kind) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty small">No nights imaged yet.</p>
    <div v-for="r in rows" :key="'img-' + r.night">
      <div v-if="imagesFor(r.night).length" class="nightimgs">
        <figure v-for="i in imagesFor(r.night)" :key="i.night + i.filter">
          <img
            v-if="i.previewUrl"
            :src="i.previewUrl"
            :alt="`${i.filter} on the night of ${i.night}, aligned on the ${kind}`"
            loading="lazy"
          />
          <figcaption class="xsmall muted">
            {{ i.night }} · {{ i.filter }}
            <a v-if="i.masterUrl" :href="i.masterUrl">FITS</a>
            <a v-if="i.starlessUrl" :href="i.starlessUrl">starless FITS</a>
          </figcaption>
        </figure>
      </div>
    </div>
    <p v-if="imageError" class="xsmall muted">Night images could not be listed: {{ imageError }}</p>
    <p class="xsmall muted" style="margin: 0">
      Each night is stacked on its own, aligned on the {{ kind }}, so every row is a separate
      image.
    </p>
  </section>
</template>

<style scoped>
.nightimgs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.5rem;
}
.nightimgs figure {
  margin: 0;
  min-width: 0;
}
.nightimgs img {
  width: 100%;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  border-radius: 0.25rem;
  background: var(--secondary);
}
.nightimgs figcaption {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
</style>
