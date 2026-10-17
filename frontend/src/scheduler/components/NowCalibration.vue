<script setup lang="ts">
import { computed } from 'vue'
import type {
  CameraHistoryPoint,
  Conditions,
  RecentCalibration,
  SchedulerStatus,
  Twilight,
} from '../api/scheduler'
import type { DarkBacklog } from '../api/darks'
import { filterColor, filterName } from '../plan'
import { hm, mmss } from '../format'
import CoolingChart from './CoolingChart.vue'
import {
  NOT_REPORTED,
  afterFlats,
  calibSteps,
  comboMap,
  coolChart,
  coolingView,
  darkFacts,
  dateOnly,
  doneView,
  flatFacts,
  flatRows,
  framesGrid,
  isMorning,
  placementText,
  progress,
  queueRows,
  roofClosed,
  secText,
  setLabel,
  stopNote,
  takenRows,
  unreportedView,
  whoNeeds,
  type CalibCard,
} from '../nowcalib'

const props = defineProps<{
  card: CalibCard
  status: SchedulerStatus
  conditions: Conditions | null
  history: CameraHistoryPoint[] | null
  historyNote: string
  backlog: DarkBacklog | null
  recent: RecentCalibration | null
  recentNote: string
  twilight?: Twilight | null
  now: number
}>()

const cal = computed(() => props.status.calibration ?? null)
const closed = computed(() => roofClosed(props.conditions))
const combos = computed(() => comboMap(props.backlog))
const box = { x0: 44, x1: 584, yTop: 14, yBottom: 176 }

const chart = computed(() => {
  const c = cal.value
  return coolChart(
    props.history,
    {
      target: props.card === 'cooling' ? c?.cooling?.target : undefined,
      setpoint: props.conditions?.camera?.target_temperature ?? c?.camera?.setpoint,
      endsAt: props.card === 'cooling' ? c?.cooling?.ends_at : undefined,
      now: props.now,
    },
    box,
  )
})

const cooling = computed(() =>
  cal.value ? coolingView(cal.value, props.conditions, props.history, props.now) : null,
)
const steps = computed(() => (cal.value ? calibSteps(cal.value).slice().reverse() : []))
const queue = computed(() => (cal.value ? queueRows(cal.value, combos.value) : []))
const why = computed(() =>
  cal.value ? placementText(cal.value, props.status.wait?.until, props.twilight, props.now) : '',
)
const note = computed(() => (cal.value ? stopNote(cal.value) : ''))
const queueIntro = computed(() => {
  const c = cal.value
  if (!c) return ''
  const totals = [...new Set((c.queue ?? []).map((q) => q.frames_total).filter((t) => t))]
  const each =
    totals.length === 1
      ? ` Each set is ${totals[0]} ${c.kind === 'bias' ? 'frames' : 'darks'}.`
      : ''
  const warm =
    c.placement === 'while_unsafe'
      ? 'Warmest set first, so the camera only has to cool further as the night goes on.'
      : ''
  return (warm + each).trim()
})
const anySkipped = computed(() =>
  (cal.value?.queue ?? []).some((q) => q.status === 'skipped' || q.status === 'waiting'),
)

const set = computed(() => cal.value?.set ?? null)
const frames = computed(() => framesGrid(set.value, !!cal.value?.frame))
const framesLabel = computed(() => {
  const f = frames.value
  if (!f) return ''
  const now = f.now ? ', 1 in progress' : ''
  return `${f.old + f.done} of ${f.total} ${frameWord.value}: ${f.old} from earlier, ${f.done} in this run${now}`
})
const frameBar = computed(() =>
  progress(cal.value?.frame?.started_at, cal.value?.frame?.ends_at, props.now),
)
const isBias = computed(() => cal.value?.kind === 'bias')
const frameWord = computed(() => (isBias.value ? 'bias frames' : 'darks'))
const darkHeadline = computed(() => {
  const s = set.value
  if (!s) return isBias.value ? 'Bias frames' : 'Darks'
  if (isBias.value)
    return ['Bias frames', s.gain !== null && s.gain !== undefined ? `gain ${s.gain}` : '']
      .filter(Boolean)
      .join(', ')
  return setLabel(s, 'darks').replace(/^(\S+ s)/, '$1 darks')
})
const setSub = computed(() => {
  const s = set.value
  if (!s) return ''
  return [
    s.offset !== null && s.offset !== undefined ? `offset ${s.offset}` : '',
    s.binning ? `bin ${s.binning} × ${s.binning}` : '',
    s.readout_mode ? `readout ${s.readout_mode}` : '',
    s.frames_total ? `${s.frames_total} ${frameWord.value} in a set` : '',
  ]
    .filter(Boolean)
    .join(' · ')
})
const setIndex = computed(() => {
  const s = set.value
  return s?.index && s?.count ? `Set ${s.index} of ${s.count}` : ''
})
const dFacts = computed(() => (cal.value ? darkFacts(cal.value, props.conditions) : []))
const who = computed(() => {
  const k = set.value?.combo_key
  return k ? whoNeeds(combos.value.get(k)) : null
})

const flatHeadline = computed(() => {
  const s = set.value
  return `${filterName(s?.filter)} flats for ${s?.target_name || 'this target'}`
})
const flatSub = computed(() => {
  const s = set.value
  if (!s) return ''
  return [
    s.session_date ? `for the subs of ${dateOnly(s.session_date)}` : '',
    s.gain !== null && s.gain !== undefined ? `gain ${s.gain}` : '',
    s.offset !== null && s.offset !== undefined ? `offset ${s.offset}` : '',
    s.binning ? `bin ${s.binning} × ${s.binning}` : '',
    s.rotation !== null && s.rotation !== undefined ? `rotation ${Math.round(s.rotation)}°` : '',
  ]
    .filter(Boolean)
    .join(' · ')
})
const fFacts = computed(() => (cal.value ? flatFacts(cal.value, props.conditions) : []))
const fRows = computed(() => (cal.value ? flatRows(cal.value) : []))
const after = computed(() => (cal.value ? afterFlats(cal.value) : []))

const done = computed(() => (cal.value ? doneView(cal.value, props.conditions) : null))
const taken = computed(() => (cal.value ? takenRows(cal.value, props.recent) : []))
const anyChecked = computed(() => taken.value.some((t) => t.clean !== 'not checked yet'))

const unreported = computed(() => unreportedView(props.conditions))
</script>

<template>
  <template v-if="card === 'cooling' && cal && cooling">
    <section class="card current" aria-labelledby="cal-h">
      <div>
        <div class="row">
          <span class="badge info"
            ><span class="dot"></span
            >{{ cal.purpose === 'imaging' ? 'Cooling for imaging' : 'Cooling for darks' }}</span
          >
          <span v-if="closed" class="badge warn">Roof closed</span>
        </div>
        <h2 id="cal-h" class="big-h">{{ cooling.headline }}</h2>
        <p v-if="why" class="why muted">{{ why }}</p>
      </div>
      <div class="facts">
        <div v-for="f in cooling.facts" :key="f.label" class="fact">
          <span class="xsmall muted">{{ f.label }}</span>
          <span class="v num">{{ f.value }}</span>
          <span class="xsmall muted">{{ f.note }}</span>
        </div>
      </div>
      <div v-if="cooling.bar">
        <div class="spread small" style="margin-bottom: 0.375rem">
          <span>{{ cooling.bar.label }}</span>
          <span class="num muted">{{ cooling.bar.right }}</span>
        </div>
        <div
          class="bar"
          role="progressbar"
          aria-label="Cooling progress"
          :aria-valuenow="cooling.bar.pct"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div :style="{ width: cooling.bar.pct + '%' }"></div>
        </div>
      </div>
      <div class="chart">
        <div class="spread xsmall muted">
          <span>Sensor temperature, °C</span>
          <span v-if="chart.ramp">dashed: the rest of the ramp</span>
          <span v-else-if="chart.setpoint">dashed: setpoint</span>
        </div>
        <CoolingChart v-if="!chart.empty" :chart="chart" :box="box" />
        <p v-else class="empty" style="padding: 0">{{ historyNote }}</p>
      </div>
      <div v-if="steps.length" class="section">
        <h3>Tonight so far</h3>
        <ol class="steps num" aria-label="Steps so far">
          <li v-for="(s, i) in steps" :key="i" :class="s.state">
            <span :class="{ muted: s.state === 'done' }">{{ s.at }}</span
            ><span>{{ s.text }}</span>
          </li>
        </ol>
      </div>
    </section>

    <section v-if="cal.purpose !== 'imaging'" class="card side" aria-labelledby="cal-q-h">
      <div class="spread">
        <h2 id="cal-q-h">Darks planned tonight</h2>
        <a class="small muted lnk" href="#missing-h">All missing sets</a>
      </div>
      <p v-if="queueIntro" class="small muted" style="margin: 0">{{ queueIntro }}</p>
      <ol v-if="queue.length" class="queue">
        <li v-for="(q, i) in queue" :key="i">
          <span class="t">{{ q.at }}</span>
          <div>
            <div class="what num">{{ q.what }}</div>
            <div class="xsmall muted">{{ q.note }}</div>
          </div>
          <span class="small num" :class="q.cut ? 'cut' : 'muted'">{{ q.len }}</span>
        </li>
      </ol>
      <p v-else class="empty" style="padding: 0">No dark sets are planned in this run.</p>
      <p class="xsmall muted" style="margin: 0">
        <template v-if="queue.length">Start times and lengths are estimates. </template>{{ note }}
      </p>
    </section>
  </template>

  <template v-else-if="card === 'darks' && cal">
    <section class="card current" aria-labelledby="cal-h">
      <div class="spread top">
        <div>
          <div class="row">
            <span class="badge ok"
              ><span class="dot"></span>Taking {{ isBias ? 'bias' : 'darks' }}</span
            >
            <span v-if="closed" class="badge warn">Roof closed</span>
            <span v-if="setIndex" class="badge">{{ setIndex }} tonight</span>
          </div>
          <h2 id="cal-h" class="big-h num">{{ darkHeadline }}</h2>
          <p v-if="setSub" class="muted small num" style="margin: 0.125rem 0 0">{{ setSub }}</p>
        </div>
        <div v-if="set?.frames_total" class="count">
          <div class="xsmall muted">This set</div>
          <div class="big num">{{ set.frames_done ?? 0 }} of {{ set.frames_total }}</div>
          <div v-if="set.ends_at" class="xsmall muted">done about {{ hm(set.ends_at) }}</div>
        </div>
      </div>

      <div v-if="frames">
        <div class="frames" role="img" :aria-label="framesLabel">
          <i v-for="(c, i) in frames.cells" :key="i" :class="c"></i>
        </div>
        <div class="row xsmall muted" style="gap: 1rem; margin-top: 0.5rem">
          <span v-if="frames.old" class="legend"
            ><i class="old"></i>{{ frames.old }} from earlier</span
          >
          <span class="legend"><i class="done"></i>{{ frames.done }} in this run</span>
          <span v-if="frames.now" class="legend"><i class="now"></i>in progress</span>
        </div>
      </div>
      <p v-else class="empty" style="padding: 0">The set size is {{ NOT_REPORTED }}.</p>

      <div v-if="cal.frame">
        <div class="spread small" style="margin-bottom: 0.375rem">
          <span class="num"
            >{{ isBias ? 'Bias frame' : 'Dark'
            }}{{ cal.frame.number ? ' ' + cal.frame.number : '' }}
            <template v-if="cal.frame.seconds"> · {{ secText(cal.frame.seconds) }}</template></span
          >
          <span v-if="frameBar" class="num muted"
            >{{ mmss(frameBar.elapsed) }} of {{ mmss(frameBar.len) }} · finishes
            {{ hm(frameBar.end) }}</span
          >
        </div>
        <div
          class="bar"
          role="progressbar"
          aria-label="Exposure progress"
          :aria-valuenow="frameBar?.pct ?? 0"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div :style="{ width: (frameBar?.pct ?? 0) + '%' }"></div>
        </div>
      </div>

      <div class="facts">
        <div v-for="f in dFacts" :key="f.label" class="fact">
          <span class="xsmall muted">{{ f.label }}</span>
          <span class="v num">{{ f.value }}</span>
          <span class="xsmall muted">{{ f.note }}</span>
        </div>
      </div>

      <p v-if="why" class="why muted">{{ why }}</p>

      <div v-if="who" class="section">
        <div class="spread">
          <h3>Who needs this set</h3>
          <span class="xsmall muted num">{{ who.scope }}</span>
        </div>
        <p class="small" style="margin: 0">{{ who.text }}</p>
        <div v-if="who.pills.length" class="row small">
          <span v-for="p in who.pills" :key="p.name" class="pill"
            >{{ p.name }} <b class="num">{{ p.lights }}</b></span
          >
          <span v-if="who.more" class="pill muted">{{ who.more }} more</span>
        </div>
      </div>
    </section>

    <section class="card side" aria-labelledby="cal-q-h">
      <div class="spread">
        <h2 id="cal-q-h">{{ isBias ? 'Bias next' : 'Darks next' }}</h2>
        <span v-if="!isBias" class="small muted">coldest first</span>
      </div>
      <ol v-if="queue.length" class="queue">
        <li v-for="(q, i) in queue" :key="i">
          <span class="t">{{ q.at }}</span>
          <div>
            <div class="what num">{{ q.what }}</div>
            <div class="xsmall muted">{{ q.note }}</div>
          </div>
          <span class="small num" :class="q.cut ? 'cut' : 'muted'">{{ q.len }}</span>
        </li>
      </ol>
      <p v-else class="empty" style="padding: 0">No other sets are planned in this run.</p>
      <p class="xsmall muted" style="margin: 0">
        <template v-if="queue.length">Start times and lengths are estimates. </template>{{ note
        }}<template v-if="anySkipped"> Sets that do not fit wait for another night.</template>
      </p>
    </section>
  </template>

  <template v-else-if="card === 'flats' && cal">
    <section class="card current" aria-labelledby="cal-h">
      <div class="spread top">
        <div>
          <div class="row">
            <span class="badge ok"><span class="dot"></span>Taking flats</span>
            <span v-if="isMorning(now)" class="badge">Morning</span>
            <span v-if="setIndex" class="badge">{{ setIndex }}</span>
          </div>
          <h2 id="cal-h" class="big-h">
            <span class="swatch" :style="{ background: filterColor(set?.filter) }"></span
            >{{ flatHeadline }}
          </h2>
          <p v-if="flatSub" class="muted small num" style="margin: 0.125rem 0 0">{{ flatSub }}</p>
        </div>
        <div v-if="set?.frames_total" class="count">
          <div class="xsmall muted">This set</div>
          <div class="big num">{{ set.frames_done ?? 0 }} of {{ set.frames_total }}</div>
          <div v-if="set.ends_at" class="xsmall muted">done about {{ hm(set.ends_at) }}</div>
        </div>
      </div>

      <div
        v-if="frames"
        class="frames"
        role="img"
        :aria-label="`${frames.old + frames.done} of ${frames.total} flats${frames.now ? ', 1 in progress' : ''}`"
      >
        <i v-for="(c, i) in frames.cells" :key="i" :class="c"></i>
      </div>

      <div class="facts">
        <div v-for="f in fFacts" :key="f.label" class="fact">
          <span class="xsmall muted">{{ f.label }}</span>
          <span class="v num">{{ f.value }}</span>
          <span class="xsmall muted">{{ f.note }}</span>
        </div>
      </div>

      <p v-if="why" class="why muted">{{ why }}</p>

      <div v-if="fRows.length" class="section">
        <h3>{{ isMorning(now) ? 'Flats this morning' : 'Flats in this run' }}</h3>
        <div class="scroll-x">
          <table class="tbl num">
            <thead>
              <tr>
                <th>Done</th>
                <th>Target</th>
                <th>Filter</th>
                <th class="r">Flats</th>
                <th class="r">Exposure</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in fRows" :key="i">
                <td :class="{ muted: r.current }">{{ r.done }}</td>
                <td>{{ r.target }}</td>
                <td>
                  <span class="swatch" :style="{ background: filterColor(r.filter) }"></span
                  >{{ filterName(r.filter) }}
                </td>
                <td class="r">{{ r.flats }}</td>
                <td class="r">{{ r.exposure }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="card side" aria-labelledby="cal-q-h">
      <h2 id="cal-q-h">After this set</h2>
      <ol v-if="after.length" class="steps num">
        <li v-for="(s, i) in after" :key="i" :class="s.state">
          <span>{{ s.at }}</span
          ><span>{{ s.text }}</span>
        </li>
      </ol>
      <p class="xsmall muted" style="margin: 0">
        {{ after.length > 1 ? 'Times are estimates.' : 'No other flat sets wait in this run.' }}
      </p>
    </section>
  </template>

  <template v-else-if="card === 'done' && cal && done">
    <section class="card current" aria-labelledby="cal-h">
      <div>
        <div class="row">
          <span class="badge warn"
            ><span class="dot"></span>{{ closed ? 'Waiting to be safe' : 'Calibration done' }}</span
          >
          <span v-if="closed" class="badge warn">Roof closed</span>
        </div>
        <h2 id="cal-h" class="big-h">{{ done.headline }}</h2>
        <p v-if="done.why" class="why muted">{{ done.why }}</p>
      </div>
      <div class="facts">
        <div v-for="f in done.facts" :key="f.label" class="fact">
          <span class="xsmall muted">{{ f.label }}</span>
          <span class="v num">{{ f.value }}</span>
          <span class="xsmall muted">{{ f.note }}</span>
        </div>
      </div>
      <div class="section">
        <h3>Why the rest wait</h3>
        <div v-if="done.waits.length" class="scroll-x">
          <table class="tbl">
            <thead>
              <tr>
                <th>Set</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(w, i) in done.waits" :key="i">
                <td class="num">{{ w.set }}</td>
                <td class="wrap">{{ w.reason }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty" style="padding: 0">No sets are waiting in this run.</p>
      </div>
    </section>

    <section class="card side" aria-labelledby="cal-t-h">
      <h2 id="cal-t-h">Taken tonight</h2>
      <div v-if="taken.length" class="scroll-x">
        <table class="tbl num">
          <thead>
            <tr>
              <th>Set</th>
              <th class="r">Frames</th>
              <th class="r">Clean</th>
              <th>Ended</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in taken" :key="i">
              <td>{{ t.set }}</td>
              <td class="r">{{ t.frames }}</td>
              <td class="r" :class="{ muted: t.clean === 'not checked yet' }">{{ t.clean }}</td>
              <td>{{ t.ended }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty" style="padding: 0">No calibration frames were taken in this run.</p>
      <p v-if="taken.length" class="xsmall muted" style="margin: 0">
        {{
          anyChecked
            ? 'Clean counts come from the light-leak check on each frame.'
            : recentNote || 'The light-leak check has not seen these frames yet.'
        }}
      </p>
    </section>
  </template>

  <template v-else-if="card === 'unreported'">
    <section class="card current" aria-labelledby="cal-h">
      <div>
        <div v-if="closed" class="row">
          <span class="badge warn">Roof closed</span>
        </div>
        <h2 id="cal-h" class="big-h">{{ unreported.headline }}</h2>
        <p class="why muted">
          NINA may be taking calibration frames. Calibration details are {{ NOT_REPORTED }}, so the
          set, tonight's plan and the reasons are not shown. Below is what the camera and the
          weather report.
        </p>
      </div>
      <div class="facts">
        <div v-for="f in unreported.facts" :key="f.label" class="fact">
          <span class="xsmall muted">{{ f.label }}</span>
          <span class="v num">{{ f.value }}</span>
          <span class="xsmall muted">{{ f.note }}</span>
        </div>
      </div>
      <div class="chart">
        <div class="spread xsmall muted">
          <span>Sensor temperature, °C</span>
          <span v-if="chart.setpoint">dashed: setpoint</span>
        </div>
        <CoolingChart v-if="!chart.empty" :chart="chart" :box="box" />
        <p v-else class="empty" style="padding: 0">{{ historyNote }}</p>
      </div>
    </section>
  </template>
</template>

<style scoped>
.current {
  flex: 1.25 1 30rem;
  gap: 1.25rem;
}
.side {
  flex: 1 1 24rem;
}
.top {
  align-items: flex-start;
  gap: 0.75rem;
}
.count {
  text-align: right;
}
.card h2.big-h {
  margin: 0.5rem 0 0;
  font-size: 1.375rem;
  line-height: 1.3;
}
.card h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}
.why {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  max-width: 72ch;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  background: currentColor;
}
.big {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.1;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
  gap: 0.75rem;
}
.fact {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  display: flex;
  flex-direction: column;
}
.fact .v {
  font-weight: 600;
}
.bar {
  height: 0.5rem;
  border-radius: 999px;
  background: var(--secondary);
  overflow: hidden;
}
.bar > div {
  height: 100%;
  background: var(--primary);
  transition: width 0.9s linear;
}
.swatch {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 2px;
  margin-right: 0.375rem;
  vertical-align: baseline;
}
.frames {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14px, 1fr));
  gap: 3px;
  max-width: 30rem;
}
.frames i,
.legend i {
  display: block;
  aspect-ratio: 1;
  border-radius: 2px;
  border: 1px solid var(--border);
  background: transparent;
}
.legend {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.legend i {
  width: 10px;
  height: 10px;
}
.frames i.old,
.legend i.old {
  background: var(--muted-foreground);
  border-color: transparent;
  opacity: 0.45;
}
.frames i.done,
.legend i.done {
  background: var(--foreground);
  border-color: transparent;
}
.frames i.now {
  background:
    repeating-linear-gradient(135deg, var(--prog-stripe) 0 3px, transparent 3px 7px), var(--prog-bg);
  border-color: var(--info);
}
.legend i.now {
  background: var(--prog-bg);
  border-color: var(--info);
}
@media (prefers-reduced-motion: no-preference) {
  .frames i.now {
    animation: pulse 1.6s ease-in-out infinite;
  }
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
.queue {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.queue li {
  display: grid;
  grid-template-columns: 4.75rem minmax(0, 1fr) auto;
  gap: 0.25rem 0.75rem;
  padding: 0.625rem 0;
  border-top: 1px solid var(--border);
  align-items: baseline;
}
.queue li:first-child {
  border-top: 0;
  padding-top: 0;
}
.queue .t,
.queue .what {
  font-weight: 600;
}
.queue .cut {
  color: var(--warn);
}
@media (max-width: 480px) {
  .queue li {
    grid-template-columns: 4rem minmax(0, 1fr);
  }
  .queue li > :last-child {
    grid-column: 2;
  }
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: 0.8125rem;
}
.steps li {
  display: grid;
  grid-template-columns: 5.75rem 1fr;
  gap: 0.75rem;
}
.steps li.cur {
  font-weight: 600;
}
.steps li.later {
  color: var(--muted-foreground);
}
.section {
  border-top: 1px solid var(--border);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.pill b {
  font-weight: 500;
}
.tbl {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.8125rem;
}
.tbl th {
  font-weight: 500;
  color: var(--muted-foreground);
  text-align: left;
  font-size: 0.75rem;
  padding: 0 0.75rem 0.375rem 0;
  white-space: nowrap;
}
.tbl td {
  white-space: nowrap;
  padding: 0.4375rem 0.75rem 0.4375rem 0;
  border-top: 1px solid var(--border);
  vertical-align: top;
}
.tbl .r {
  text-align: right;
}
.tbl td.wrap {
  white-space: normal;
}
</style>
