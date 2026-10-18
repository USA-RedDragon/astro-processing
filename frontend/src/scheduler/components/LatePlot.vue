<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TimingKind, TimingRecord } from '../api/binaries'
import {
  PLOT,
  giveOrTake,
  kindLabels,
  kindsIn,
  linePath,
  lateShort,
  plotMarks,
  plotScale,
  pointLabel,
  pointTiming,
  pointTip,
} from '../timings'

const props = defineProps<{ record: TimingRecord }>()

const view = ref<'plot' | 'table'>('plot')
const labels = computed(() => kindLabels(props.record))
const kinds = computed(() => kindsIn(props.record.points))
const scale = computed(() => plotScale(props.record.points, props.record.lines))
const marks = computed(() => plotMarks(props.record.points, scale.value))
const lines = computed(() =>
  props.record.lines
    .filter((l) => l.points.length > 1)
    .map((l) => ({ kind: l.kind, d: linePath(l, scale.value) })),
)
const leftOut = computed(() => props.record.points.some((p) => !p.used))
const { W, H, L, R, T, B } = PLOT
const midY = (T + H - B) / 2

const COLOR: Record<TimingKind, string> = { primary: 'var(--known)', secondary: 'var(--warn)' }

const tipAt = ref<number | null>(null)
const tipPos = ref({ x: 0, y: 0 })
const wrap = ref<HTMLElement | null>(null)
const tipEl = ref<HTMLElement | null>(null)

const tipLines = computed(() => {
  const i = tipAt.value
  const p = i === null ? undefined : props.record.points[i]
  return p ? pointTip(p, pointTiming(props.record, i!), labels.value) : []
})

function label(i: number): string {
  return pointLabel(props.record.points[i]!, pointTiming(props.record, i), labels.value)
}

function show(i: number, ev: Event) {
  tipAt.value = i
  const g = ev.currentTarget as SVGGElement
  requestAnimationFrame(() => {
    const box = wrap.value?.getBoundingClientRect()
    const mk = (g.querySelector('.mk') as SVGGraphicsElement | null)?.getBoundingClientRect()
    const tip = tipEl.value
    if (!box || !mk || !tip) return
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    let x = mk.left - box.left + mk.width / 2 - tw / 2
    x = Math.max(4, Math.min(x, box.width - tw - 4))
    let y = mk.top - box.top - th - 10
    if (y < 4) y = mk.bottom - box.top + 10
    tipPos.value = { x, y }
  })
}

function hide() {
  tipAt.value = null
}

const diamond = (x: number, y: number) =>
  `M${x} ${y - 7}L${x + 7} ${y}L${x} ${y + 7}L${x - 7} ${y}Z`
const tick = (v: number) => (v > 0 ? `+${v}` : String(v))
</script>

<template>
  <section class="card late-plot">
    <div class="spread">
      <h2>Minutes late against the prediction, by year</h2>
      <div v-if="record.points.length" class="tabs" role="tablist" aria-label="View">
        <button
          type="button"
          class="tab"
          role="tab"
          :aria-selected="view === 'plot'"
          @click="view = 'plot'"
        >
          Plot
        </button>
        <button
          type="button"
          class="tab"
          role="tab"
          :aria-selected="view === 'table'"
          @click="view = 'table'"
        >
          Table
        </button>
      </div>
    </div>
    <div v-if="!record.points.length" class="empty-box">
      <b>No timings yet</b>
      <span class="small dim"
        >The plot appears once one eclipse of this star is timed. Each point will show how many
        minutes late or early the middle of the eclipse came, with its give or take.</span
      >
    </div>
    <template v-else>
      <div v-show="view === 'plot'" class="plot-view">
        <div ref="wrap" class="plotwrap">
          <div class="scroll">
            <div class="plotbox">
              <svg
                :viewBox="`0 0 ${W} ${H}`"
                role="img"
                aria-label="Minutes late against the prediction, by year"
              >
                <template v-for="v in scale.yTicks" :key="'y' + v">
                  <line
                    v-if="v !== 0"
                    :x1="L"
                    :x2="W - R"
                    :y1="scale.sy(v)"
                    :y2="scale.sy(v)"
                    stroke="var(--border)"
                  />
                  <text
                    :x="L - 8"
                    :y="scale.sy(v) + 4"
                    text-anchor="end"
                    font-size="11"
                    fill="var(--muted-foreground)"
                  >
                    {{ tick(v) }}
                  </text>
                </template>
                <template v-for="y in scale.xTicks" :key="'x' + y">
                  <line
                    :x1="scale.sx(y)"
                    :x2="scale.sx(y)"
                    :y1="T"
                    :y2="H - B"
                    stroke="var(--border)"
                    stroke-dasharray="2 3"
                  />
                  <text
                    :x="scale.sx(y)"
                    :y="H - B + 18"
                    text-anchor="middle"
                    font-size="11"
                    fill="var(--muted-foreground)"
                  >
                    {{ y }}
                  </text>
                </template>
                <line
                  class="zero"
                  :x1="L"
                  :x2="W - R"
                  :y1="scale.sy(0)"
                  :y2="scale.sy(0)"
                  stroke="var(--muted-foreground)"
                  stroke-width="1.25"
                />
                <text
                  :x="W - R + 6"
                  :y="scale.sy(0) + 4"
                  font-size="11"
                  fill="var(--muted-foreground)"
                >
                  on time
                </text>
                <text :x="W - R + 6" :y="T + 10" font-size="11" fill="var(--muted-foreground)">
                  late
                </text>
                <text :x="W - R + 6" :y="H - B - 2" font-size="11" fill="var(--muted-foreground)">
                  early
                </text>
                <text
                  x="12"
                  :y="midY"
                  font-size="11"
                  fill="var(--muted-foreground)"
                  text-anchor="middle"
                  :transform="`rotate(-90 12 ${midY})`"
                >
                  minutes late against the prediction
                </text>
                <path
                  v-for="l in lines"
                  :key="'l' + l.kind"
                  class="fit"
                  :d="l.d"
                  fill="none"
                  :stroke="COLOR[l.kind]"
                  stroke-width="1.5"
                  stroke-dasharray="5 4"
                />
                <g
                  v-for="m in marks"
                  :key="m.i"
                  class="pt"
                  :class="[m.kind, { out: !m.used }]"
                  tabindex="0"
                  :aria-label="label(m.i)"
                  @pointerenter="show(m.i, $event)"
                  @focus="show(m.i, $event)"
                  @click="show(m.i, $event)"
                  @pointerleave="hide"
                  @blur="hide"
                >
                  <line
                    :x1="m.x"
                    :x2="m.x"
                    :y1="m.top"
                    :y2="m.bottom"
                    :stroke="COLOR[m.kind]"
                    stroke-width="1.5"
                  />
                  <line
                    :x1="m.x - 5"
                    :x2="m.x + 5"
                    :y1="m.top"
                    :y2="m.top"
                    :stroke="COLOR[m.kind]"
                    stroke-width="1.5"
                  />
                  <line
                    :x1="m.x - 5"
                    :x2="m.x + 5"
                    :y1="m.bottom"
                    :y2="m.bottom"
                    :stroke="COLOR[m.kind]"
                    stroke-width="1.5"
                  />
                  <circle
                    v-if="m.kind === 'primary'"
                    class="mk"
                    :cx="m.x"
                    :cy="m.y"
                    r="5.5"
                    :fill="m.used ? COLOR.primary : 'var(--card)'"
                    :stroke="COLOR.primary"
                    stroke-width="1.5"
                  />
                  <path
                    v-else
                    class="mk"
                    :d="diamond(m.x, m.y)"
                    fill="var(--card)"
                    :stroke="COLOR.secondary"
                    stroke-width="2"
                  />
                  <rect
                    :x="m.x - 12"
                    :y="Math.min(m.top, m.y - 12)"
                    width="24"
                    :height="Math.max(m.bottom, m.y + 12) - Math.min(m.top, m.y - 12)"
                    fill="transparent"
                  />
                </g>
              </svg>
            </div>
          </div>
          <div
            v-show="tipLines.length"
            ref="tipEl"
            class="tip"
            role="status"
            :style="{ left: tipPos.x + 'px', top: tipPos.y + 'px' }"
          >
            <template v-for="(t, i) in tipLines" :key="i"
              ><b v-if="i === 0">{{ t }}</b
              ><template v-else>{{ t }}</template
              ><br v-if="i < tipLines.length - 1"
            /></template>
          </div>
        </div>
        <div class="keyline">
          <template v-if="kinds.length > 1">
            <span v-for="k in kinds" :key="k" class="key" :class="k">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <circle v-if="k === 'primary'" cx="7" cy="7" r="5" :fill="COLOR.primary" />
                <path
                  v-else
                  d="M7 1L13 7L7 13L1 7Z"
                  fill="none"
                  :stroke="COLOR.secondary"
                  stroke-width="2"
                />
              </svg>
              {{ labels[k] }}
            </span>
          </template>
          <span v-else-if="kinds.length === 1" class="key" :class="kinds[0]">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle v-if="kinds[0] === 'primary'" cx="7" cy="7" r="5" :fill="COLOR.primary" />
              <path
                v-else
                d="M7 1L13 7L7 13L1 7Z"
                fill="none"
                :stroke="COLOR.secondary"
                stroke-width="2"
              />
            </svg>
            {{ labels[kinds[0]!] }}, the only kind timed so far
          </span>
          <span v-if="lines.length" class="key">
            <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
              <line
                x1="1"
                x2="21"
                y1="7"
                y2="7"
                stroke="var(--muted-foreground)"
                stroke-width="1.5"
                stroke-dasharray="5 4"
              />
            </svg>
            The fit to your timings
          </span>
        </div>
        <p class="small dim note">
          Bars show the give or take. Points above the line came late, points below came
          early.<template v-if="leftOut"> Faint points are left out of the trend checks.</template>
        </p>
      </div>
      <div v-show="view === 'table'" class="scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>Night</th>
              <th>Eclipse</th>
              <th class="r">Minutes</th>
              <th class="r">Give or take</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in record.points" :key="i" :class="{ out: !p.used }">
              <td>{{ pointTiming(record, i)?.night ?? p.year.toFixed(2) }}</td>
              <td>{{ labels[p.kind] }}</td>
              <td class="r">{{ lateShort(p.minutes) }}</td>
              <td class="r" :aria-label="giveOrTake(p.err_minutes)">
                {{ p.err_minutes.toFixed(1) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.empty-box {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.plotwrap {
  position: relative;
}
.plotbox {
  min-width: 300px;
}
.plotbox svg {
  display: block;
  width: 100%;
  height: auto;
}
.pt {
  cursor: pointer;
  outline: none;
}
.pt.out {
  opacity: 0.45;
}
.pt:focus-visible .mk {
  stroke-width: 3;
}
.tip {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  max-width: 260px;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.45;
  box-shadow: 0 6px 20px oklch(0 0 0 / 0.2);
}
.keyline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 8px;
  align-items: center;
}
.keyline svg {
  vertical-align: -2px;
  margin-right: 4px;
}
.note {
  margin: 6px 0 0;
}
tr.out td {
  color: var(--muted-foreground);
}
</style>
