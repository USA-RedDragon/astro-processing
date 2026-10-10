<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import type { Point, StackMaster } from '../api/planning'
import { ApiError } from '../api/client'
import { getGoalMaskInfo, goalMaskURL, type GoalMaskInfo } from '../api/goalmask'
import { frameToView, maskRect, pctLabel, viewToFrame } from '../faintmask'

const props = defineProps<{
  object?: string
  master?: StackMaster
  polygon: Point[]
  drawing: boolean
  regionSet: boolean
}>()
const emit = defineEmits<{ point: [p: Point] }>()

const BAND = 'oklch(0.82 0.16 195)'
const STARS = 'oklch(0.68 0.24 330)'
const SKY = 'oklch(0.78 0.16 140)'
const REGION = 'oklch(0.9 0.12 90)'
const VIEW_W = 1000

const uid = useId()
const ids = { band: `${uid}-band`, stars: `${uid}-stars`, sky: `${uid}-sky` }

const info = ref<GoalMaskInfo | null>(null)
const state = ref<'idle' | 'loading' | 'ready' | 'missing' | 'failed'>('idle')
const failure = ref('')
const showStars = ref(false)
const showSky = ref(false)

let seq = 0
watch(
  () => [props.object, props.master?.filter] as const,
  async ([object, filter]) => {
    const n = ++seq
    info.value = null
    failure.value = ''
    if (!object || !filter) {
      state.value = 'idle'
      return
    }
    state.value = 'loading'
    try {
      const got = await getGoalMaskInfo(object, filter)
      if (n !== seq) return
      info.value = got
      state.value = 'ready'
    } catch (e) {
      if (n !== seq) return
      if (e instanceof ApiError && e.status === 404) {
        state.value = 'missing'
      } else {
        state.value = 'failed'
        failure.value = e instanceof Error ? e.message : String(e)
      }
    }
  },
  { immediate: true },
)

const viewH = computed(() => {
  const m = props.master
  if (!m || !(m.width > 0) || !(m.height > 0)) return Math.round(VIEW_W * (2 / 3))
  const c = m.crop && m.crop.w > 0 && m.crop.h > 0 ? m.crop : { w: 1, h: 1 }
  return Math.round((VIEW_W * (m.height * c.h)) / (m.width * c.w))
})

const rect = computed(() =>
  info.value ? maskRect(info.value, props.master?.crop, VIEW_W, viewH.value) : null,
)
const layers = computed(() => {
  const i = info.value
  if (!i || !rect.value) return []
  const out = [{ id: ids.band, href: goalMaskURL(i, 'band'), fill: BAND, opacity: 0.6 }]
  if (showSky.value) out.push({ id: ids.sky, href: goalMaskURL(i, 'sky'), fill: SKY, opacity: 0.5 })
  if (showStars.value)
    out.push({ id: ids.stars, href: goalMaskURL(i, 'stars'), fill: STARS, opacity: 0.55 })
  return out
})

const shown = computed(() => props.polygon.map((p) => frameToView(p, props.master?.crop)))
const polyPoints = computed(() =>
  shown.value.map((q) => `${q.x * VIEW_W},${q.y * viewH.value}`).join(' '),
)

const skyPct = computed(() =>
  info.value && info.value.covered_pixels > 0
    ? (100 * info.value.sky_pixels) / info.value.covered_pixels
    : 0,
)
const measuredOn = computed(() => {
  const i = info.value
  if (!i) return ''
  const when = new Date(i.measured_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  return `${i.bin}×${i.bin} binned pixels (${i.width} × ${i.height}), measured on ${i.subs} subs, ${when}.`
})
const stale = computed(() => {
  const i = info.value
  if (!i) return ''
  if (props.regionSet && i.source !== 'region')
    return 'The shaded band is from before the region was drawn. The next goal measurement uses the region.'
  if (!props.regionSet && i.source === 'region')
    return 'The shaded pixels are the old region. The next goal measurement goes back to the automatic band.'
  return ''
})

function click(e: MouseEvent) {
  if (!props.drawing) return
  const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
  const view = {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  }
  emit('point', viewToFrame(view, props.master?.crop))
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${VIEW_W} ${viewH}`"
    role="img"
    :aria-label="
      info
        ? 'Master preview with the measured faint-signal pixels shaded'
        : 'Master preview of the faint-signal measurement'
    "
    class="canvas"
    :style="{ aspectRatio: `${VIEW_W} / ${viewH}`, cursor: drawing ? 'crosshair' : 'default' }"
    @click="click"
  >
    <rect x="0" y="0" :width="VIEW_W" :height="viewH" fill="var(--sky)" />
    <image
      v-if="master"
      :href="master.preview_url"
      x="0"
      y="0"
      :width="VIEW_W"
      :height="viewH"
      preserveAspectRatio="none"
    />
    <text v-else x="24" :y="viewH / 2" font-size="28" fill="var(--muted-foreground)">
      No master preview yet
    </text>
    <template v-if="master && rect">
      <defs>
        <mask
          v-for="l in layers"
          :id="l.id"
          :key="l.id"
          maskUnits="userSpaceOnUse"
          :x="rect.x"
          :y="rect.y"
          :width="rect.width"
          :height="rect.height"
        >
          <image
            :href="l.href"
            :x="rect.x"
            :y="rect.y"
            :width="rect.width"
            :height="rect.height"
            preserveAspectRatio="none"
          />
        </mask>
      </defs>
      <rect
        v-for="l in layers"
        :key="l.id + '-fill'"
        :data-layer="l.id.slice(uid.length + 1)"
        :x="rect.x"
        :y="rect.y"
        :width="rect.width"
        :height="rect.height"
        :fill="l.fill"
        :fill-opacity="l.opacity"
        :mask="`url(#${l.id})`"
      />
    </template>
    <polygon
      v-if="shown.length > 1"
      :points="polyPoints"
      :fill="drawing ? 'oklch(0.9 0.12 90 / 0.14)' : 'none'"
      :stroke="REGION"
      stroke-width="3"
    />
    <circle
      v-for="(q, i) in drawing ? shown : []"
      :key="i"
      :cx="q.x * VIEW_W"
      :cy="q.y * viewH"
      r="8"
      :fill="REGION"
    />
    <g v-if="master && state === 'missing'">
      <rect x="16" y="16" width="250" height="52" rx="10" fill="oklch(0 0 0 / 0.65)" />
      <text x="34" y="51" font-size="26" fill="white">Not measured yet</text>
    </g>
  </svg>
  <div v-if="state === 'ready' && info" class="legend small">
    <span class="key">
      <i class="sw" :style="{ background: BAND }" />
      {{ info.source === 'region' ? 'Measured region' : 'Measured band' }} ({{
        pctLabel(info.band_pct)
      }}
      of covered pixels)
    </span>
    <label class="key">
      <input v-model="showStars" type="checkbox" />
      <i class="sw" :style="{ background: STARS }" />
      Stars excluded ({{ pctLabel(info.star_pct) }})
    </label>
    <label class="key">
      <input v-model="showSky" type="checkbox" />
      <i class="sw" :style="{ background: SKY }" />
      Sky reference ({{ pctLabel(skyPct) }})
    </label>
  </div>
  <p v-if="state === 'ready' && info" class="xsmall muted" style="margin: 0">
    <template v-if="info.source === 'faint'">
      {{ info.band_low_percentile }}–{{ info.band_high_percentile }}th percentile of the star-free
      nebula pixels above sky.
    </template>
    <template v-else>Star-free pixels inside the drawn region.</template>
    {{ measuredOn }}
    <template v-if="info.noise_mask === 'background'">
      Too few band pixels for the noise, so the noise is measured on the sky reference.
    </template>
  </p>
  <p v-if="stale" class="xsmall" style="margin: 0; color: var(--warn)">{{ stale }}</p>
  <p v-if="master && state === 'missing'" class="small muted" style="margin: 0">
    Not measured yet. The next goal measurement records which pixels it uses.
  </p>
  <p v-if="state === 'failed'" class="small" style="margin: 0; color: var(--warn)">
    Could not load the measured pixels: {{ failure }}
  </p>
</template>

<style scoped>
.canvas {
  width: 100%;
  display: block;
  border-radius: 0.5rem;
  background: var(--sky);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 1rem;
  align-items: center;
}
.key {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.sw {
  flex: none;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
}
</style>
