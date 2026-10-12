<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { getBodyTrack, type BodyFraming, type BodyTrackView } from '../api/comets'
import { project, type SkyPoint } from '../api/mosaics'
import { useCutout, type CutoutParams } from '../cutout'
import { clock } from '../format'
import {
  OFFSET_LIMIT_PCT,
  centeredFraming,
  frameCenter,
  frameCorners,
  fromCustom,
  headText,
  hoursText,
  modeOf,
  move,
  ninaPositionAngle,
  previewView,
  rateText,
  recenterHours,
  tailFraming,
  toCustom,
  tonightPath,
  type CustomValues,
  type FramingMode,
} from '../framing'

const props = defineProps<{
  designation: string
  name: string
  kind?: 'comet' | 'asteroid'
  initial?: BodyFraming | null
}>()

const model = defineModel<BodyFraming | null>({ default: null })

const W = 800
const H = 600
const NO_ROTATION = 90

const view = ref<BodyTrackView | null>(null)
const loadError = ref('')
const loading = ref(true)
const mode = ref<FramingMode>('center')
const custom = ref<CustomValues>({ rotation: 0, offsetPct: 0 })
const comet = computed(() => (props.kind ?? 'comet') === 'comet')
const noun = computed(() => (comet.value ? 'comet' : 'asteroid'))

const best = computed(() => view.value?.track.best ?? null)
const tailPa = computed(() => (comet.value ? (best.value?.tail_pa ?? null) : null))
const frame = computed(() => view.value?.frame ?? null)

let ctrl: AbortController | undefined
async function load() {
  ctrl?.abort()
  ctrl = new AbortController()
  loading.value = true
  loadError.value = ''
  try {
    view.value = await getBodyTrack(props.designation, props.kind ?? 'comet', ctrl.signal)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    view.value = null
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    pickStart()
  }
}

function pickStart() {
  if (props.initial !== undefined) {
    mode.value = modeOf(props.initial, tailPa.value) ?? 'center'
    custom.value = toCustom(props.initial)
    return
  }
  mode.value = tailPa.value !== null ? 'tail' : 'center'
  custom.value = toCustom(framingFor(mode.value))
}

watch(() => [props.designation, props.kind], load, { immediate: true })
onUnmounted(() => ctrl?.abort())

function framingFor(m: FramingMode): BodyFraming | null {
  if (m === 'custom') return fromCustom(custom.value)
  if (tailPa.value === null) return null
  return m === 'tail' ? tailFraming(tailPa.value) : centeredFraming(tailPa.value)
}

const framing = computed(() => framingFor(mode.value))
watch(framing, (f) => (model.value = f), { immediate: true, deep: true })

function choose(m: FramingMode) {
  if (m === mode.value) return
  if (m === 'custom')
    custom.value = toCustom(framing.value ?? { rotation_deg: NO_ROTATION, offset_frac: 0 })
  mode.value = m
}

const choices = computed(() => {
  const out: { id: FramingMode; label: string; disabled: boolean }[] = []
  if (comet.value)
    out.push({ id: 'tail', label: 'Tail along the frame', disabled: tailPa.value === null })
  out.push({
    id: 'center',
    label: comet.value ? 'Comet centered' : 'Asteroid centered',
    disabled: false,
  })
  out.push({ id: 'custom', label: 'Custom', disabled: false })
  return out
})

const head = computed<SkyPoint | null>(() =>
  best.value ? { ra: best.value.ra, dec: best.value.dec } : null,
)
const longDeg = computed(() => frame.value?.width_deg ?? null)
const shortDeg = computed(() => frame.value?.height_deg ?? null)
const drawRotation = computed(() => framing.value?.rotation_deg ?? NO_ROTATION)
const center = computed(() =>
  head.value ? frameCenter(head.value, framing.value, longDeg.value ?? 0) : null,
)
const path = computed(() => tonightPath(view.value?.track.rows ?? []))

const corners = computed<SkyPoint[]>(() =>
  center.value && longDeg.value && shortDeg.value
    ? frameCorners(center.value, drawRotation.value, longDeg.value, shortDeg.value)
    : [],
)

const wanted = computed<CutoutParams | null>(() => {
  if (!head.value || !center.value) return null
  const v = previewView(
    head.value,
    center.value,
    frame.value,
    [...path.value.map((r) => ({ ra: r.ra, dec: r.dec })), ...corners.value],
    W / H,
    project,
  )
  const step = 0.05
  return {
    ra: Math.round(v.center.ra / step) * step,
    dec: Math.round(v.center.dec / step) * step,
    fov: Math.ceil(v.fov * 4) / 4,
    width: W,
    height: H,
  }
})

const cut = ref<CutoutParams | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  wanted,
  (w) => {
    clearTimeout(timer)
    if (!w) {
      cut.value = null
      return
    }
    const same = cut.value && JSON.stringify(cut.value) === JSON.stringify(w)
    if (same) return
    timer = setTimeout(() => (cut.value = w), cut.value ? 600 : 0)
  },
  { immediate: true },
)
onUnmounted(() => clearTimeout(timer))

const { url, state, retryIn } = useCutout(() => cut.value)
const shown = ref<CutoutParams | null>(null)
watch(url, () => (shown.value = cut.value))
const basis = computed(() => shown.value ?? cut.value)

function toSvg(p: SkyPoint): [number, number] {
  const b = basis.value
  if (!b) return [W / 2, H / 2]
  const [xi, eta] = project(b, p)
  const s = W / b.fov
  return [W / 2 - xi * s, H / 2 - eta * s]
}

const pts = (list: SkyPoint[]) =>
  list
    .map(toSvg)
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')

const overlay = computed(() => {
  if (!basis.value || !head.value || !center.value) return null
  const h = toSvg(head.value)
  const out: {
    frame: string | null
    head: [number, number]
    path: string
    dots: [number, number][]
    tail: { x1: number; y1: number; x2: number; y2: number; wing: string } | null
  } = { frame: null, head: h, path: '', dots: [], tail: null }
  if (corners.value.length) out.frame = pts(corners.value)
  const p = path.value.map((r) => ({ ra: r.ra, dec: r.dec }))
  out.path = pts(p)
  out.dots = p.filter((_, i) => i % 6 === 0).map(toSvg)
  if (tailPa.value !== null) {
    const len = (longDeg.value ?? 3) * 0.3
    const [x2, y2] = toSvg(move(head.value, tailPa.value, len))
    const ang = Math.atan2(y2 - h[1], x2 - h[0])
    const a1 = ang + Math.PI - 0.45
    const a2 = ang + Math.PI + 0.45
    const k = 18
    out.tail = {
      x1: h[0],
      y1: h[1],
      x2,
      y2,
      wing: `M${(x2 + k * Math.cos(a1)).toFixed(1)} ${(y2 + k * Math.sin(a1)).toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} L${(x2 + k * Math.cos(a2)).toFixed(1)} ${(y2 + k * Math.sin(a2)).toFixed(1)}`,
    }
  }
  return out
})

const headLabel = computed(() => `${props.name} ${best.value ? clock(best.value.at) : ''}`.trim())

const skyLabel = computed(() => {
  const parts = [`DSS2 colour sky around ${props.name}`]
  if (overlay.value?.frame) parts.push('with the camera frame')
  if (tailPa.value !== null) parts.push(`and the tail direction at ${Math.round(tailPa.value)}°`)
  return parts.join(' ')
})

const rate = computed(() => best.value?.rate_arcsec_per_min ?? null)
const recenter = computed(() =>
  rate.value !== null && shortDeg.value ? recenterHours(rate.value, shortDeg.value) : null,
)

const rotationText = computed(() => {
  const f = framing.value
  if (!f) return 'not turned for this target'
  return `${Math.round(f.rotation_deg)}° (NINA position angle ${Math.round(ninaPositionAngle(f.rotation_deg))}°)`
})

const why = computed(() => {
  if (mode.value === 'tail')
    return "The frame's long side follows the tail, with the head a quarter of the way in from the sunward end. The frame keeps this offset from the comet each time it re-centers."
  if (mode.value === 'center')
    return framing.value
      ? 'The comet sits in the middle with the long side along the tail. Use this when the tail is short or you want the coma only.'
      : `The ${noun.value} sits in the middle and the rotator stays at the target's own angle.`
  return `Turn the frame and move the ${noun.value} along its long side. The offset is kept relative to the ${noun.value} as it moves.`
})

const pathTimes = computed(() => {
  const p = path.value
  if (!p.length) return ''
  return `${clock(p[0].at)} to ${clock(p[p.length - 1].at)}`
})
</script>

<template>
  <div class="framing">
    <div class="choices" role="group" aria-label="Framing">
      <button
        v-for="c in choices"
        :key="c.id"
        type="button"
        class="choice"
        :aria-pressed="mode === c.id"
        :disabled="c.disabled || loading"
        :title="c.disabled ? 'JPL Horizons gave no tail angle for tonight' : undefined"
        @click="choose(c.id)"
      >
        {{ c.label }}
      </button>
    </div>

    <p v-if="loading" class="small muted" style="margin: 0">
      Getting tonight's track from JPL Horizons…
    </p>
    <p v-else-if="loadError" class="small" style="margin: 0; color: var(--bad)">
      Could not get tonight's track for {{ designation }}: {{ loadError }}. Framing falls back to
      centered.
    </p>
    <template v-else-if="view">
      <div class="sky">
        <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="skyLabel">
          <rect x="0" y="0" :width="W" :height="H" fill="var(--sky)" />
          <image
            v-if="state === 'ready' && url"
            :href="url"
            x="0"
            y="0"
            :width="W"
            :height="H"
            preserveAspectRatio="none"
          />
          <template v-if="overlay">
            <polygon
              v-if="overlay.frame"
              :points="overlay.frame"
              class="fr"
              fill="none"
              stroke-width="2.5"
              stroke-dasharray="10 6"
            />
            <polyline :points="overlay.path" class="tr" fill="none" stroke-width="3" />
            <circle
              v-for="(d, i) in overlay.dots"
              :key="i"
              :cx="d[0]"
              :cy="d[1]"
              r="3.5"
              class="trd"
            />
            <template v-if="overlay.tail">
              <line
                :x1="overlay.tail.x1"
                :y1="overlay.tail.y1"
                :x2="overlay.tail.x2"
                :y2="overlay.tail.y2"
                class="tl"
                stroke-width="3"
              />
              <path :d="overlay.tail.wing" class="tl" fill="none" stroke-width="3" />
            </template>
            <circle
              :cx="overlay.head[0]"
              :cy="overlay.head[1]"
              r="10"
              class="hd"
              fill="none"
              stroke-width="3"
            />
            <text
              :x="overlay.head[0] + (overlay.head[0] > W * 0.55 ? -16 : 16)"
              :y="overlay.head[1] + 34"
              :text-anchor="overlay.head[0] > W * 0.55 ? 'end' : 'start'"
              class="hdt"
            >
              {{ headLabel }}
            </text>
          </template>
          <g class="compass" transform="translate(56 64)">
            <line x1="0" y1="0" x2="0" y2="-36" stroke-width="2" />
            <line x1="0" y1="0" x2="-36" y2="0" stroke-width="2" />
            <text x="-6" y="-42">N</text>
            <text x="-54" y="6">E</text>
          </g>
          <text v-if="state === 'loading'" :x="W / 2" :y="H - 20" text-anchor="middle" class="msg">
            Loading the sky image…
          </text>
          <text
            v-else-if="state === 'limited'"
            :x="W / 2"
            :y="H - 20"
            text-anchor="middle"
            class="msg"
          >
            The sky survey is rate-limiting requests{{
              retryIn ? `; retrying in ${retryIn} s` : ''
            }}.
          </text>
          <text
            v-else-if="state === 'failed'"
            :x="W / 2"
            :y="H - 20"
            text-anchor="middle"
            class="msg"
          >
            The sky survey image is not available.
          </text>
        </svg>
      </div>
      <div class="legend xsmall muted">
        <span v-if="overlay?.frame"><i class="k fr-k" />camera frame</span>
        <span><i class="k hd-k" />{{ noun }} at {{ best ? clock(best.at) : '—' }}</span>
        <span v-if="tailPa !== null"><i class="k tl-k" />tail direction (away from the Sun)</span>
        <span v-if="pathTimes"><i class="k tr-k" />path tonight, {{ pathTimes }}</span>
      </div>
    </template>

    <div v-if="mode === 'custom'" class="custom">
      <label>
        <span>Rotation</span>
        <input v-model.number="custom.rotation" type="range" min="0" max="179" step="1" />
        <output>{{ custom.rotation }}°</output>
      </label>
      <label>
        <span>{{ comet ? 'Head' : 'Body' }} from center</span>
        <input
          v-model.number="custom.offsetPct"
          type="range"
          :min="-OFFSET_LIMIT_PCT"
          :max="OFFSET_LIMIT_PCT"
          step="1"
        />
        <output>{{ custom.offsetPct }}%</output>
      </label>
    </div>

    <div class="facts small muted">
      <span
        >Rotation <b>{{ rotationText }}</b></span
      >
      <span
        >{{ comet ? 'Head' : 'Position' }} <b>{{ headText(framing, tailPa) }}</b></span
      >
      <span v-if="rate !== null"
        >Moves <b>{{ rateText(rate) }}</b
        >, re-centered about every <b>{{ shortDeg ? hoursText(recenter) : 'not known' }}</b></span
      >
    </div>
    <p class="small muted" style="margin: 0">{{ why }}</p>
    <p v-if="view && !frame" class="xsmall" style="margin: 0; color: var(--warn)">
      {{ view.frame_reason || 'The camera field is not measured yet.' }} The frame is not drawn.
    </p>
    <p v-else-if="frame" class="xsmall muted" style="margin: 0">
      {{ frame.basis }} Re-centering happens when the {{ noun }} drifts 10% of the short side.
    </p>
    <p v-if="comet && tailPa !== null" class="xsmall note">
      The tail angle is the anti-Sun direction from JPL Horizons (PsAng). A real tail can bend; open
      the framing from the target page to correct it after the first subs.
    </p>
  </div>
</template>

<style scoped>
.framing {
  display: grid;
  gap: 0.625rem;
  --fr: oklch(0.92 0.02 265);
  --hd: oklch(0.82 0.15 75);
  --tl: oklch(0.78 0.11 200);
  --tr: oklch(0.8 0.12 330);
}
.choices {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.choice {
  font: inherit;
  font-size: 0.875rem;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: 0.625rem;
  padding: 0.375rem 0.75rem;
  cursor: pointer;
}
.choice[aria-pressed='true'] {
  border-color: var(--foreground);
  background: var(--secondary);
}
.choice:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.choice:focus-visible,
.custom input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.sky {
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--sky);
}
.sky svg {
  display: block;
  width: 100%;
  height: auto;
}
.sky text {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 22px;
}
.fr {
  stroke: var(--fr);
}
.tr {
  stroke: var(--tr);
}
.trd {
  fill: var(--tr);
}
.tl {
  stroke: var(--tl);
}
.hd {
  stroke: var(--hd);
}
.hdt {
  fill: var(--hd);
}
.compass line {
  stroke: var(--fr);
}
.compass text {
  fill: var(--fr);
}
.msg {
  fill: var(--fr);
  font-size: 18px;
}
.legend {
  display: flex;
  gap: 0.875rem;
  flex-wrap: wrap;
}
.k {
  display: inline-block;
  width: 0.875rem;
  height: 3px;
  border-radius: 2px;
  margin-right: 0.375rem;
  vertical-align: 3px;
}
.fr-k {
  background: var(--fr);
  outline: 1px solid var(--border);
}
.hd-k {
  background: var(--hd);
}
.tl-k {
  background: var(--tl);
}
.tr-k {
  background: var(--tr);
}
.custom {
  display: grid;
  gap: 0.5rem;
}
.custom label {
  display: grid;
  grid-template-columns: minmax(6rem, auto) 1fr 3.5rem;
  gap: 0.625rem;
  align-items: center;
  font-size: 0.875rem;
  color: var(--muted-foreground);
}
.custom input {
  width: 100%;
  min-width: 0;
}
.custom output {
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  text-align: right;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.125rem;
}
.facts b {
  color: var(--foreground);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.note {
  margin: 0;
  color: var(--violet);
}
</style>
