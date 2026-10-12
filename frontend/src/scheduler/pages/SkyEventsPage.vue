<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHead from '../components/PageHead.vue'
import {
  MAX_MONTHS,
  getSkyEvents,
  planSkyEvent,
  setSkyEventPriority,
  unplanSkyEvent,
  type EventChange,
  type SkyEvent,
  type SkyEvents,
} from '../api/skyEvents'
import {
  autoView,
  countText,
  exposureText,
  frameGeometry,
  frameLabel,
  groupEvents,
  isRare,
  kindChip,
  lanes,
  momentText,
  monthMarks,
  monthsText,
  movingChip,
  nightsText,
  objectLabels,
  pageState,
  planView,
  rareBadge,
  rareFirst,
  rarityDetail,
  rarityText,
  separationLabel,
  stripRange,
  thisWeek,
  windowText,
} from '../skyEvents'
import { describeOutcome, shell, showToast, upsertWaiting } from '../shell'
import { clock, shortDate } from '../format'
import { latestOnly } from '../latest'

const MONTH_CHOICES = [3, 6, 12, MAX_MONTHS]
const wanted = ref(MAX_MONTHS)

const data = ref<SkyEvents | null>(null)
const error = ref('')
const loading = ref(true)
const req = latestOnly()

async function load() {
  const current = req.next()
  loading.value = true
  try {
    const r = await getSkyEvents(wanted.value)
    if (!current()) return
    data.value = r
    error.value = ''
  } catch (e) {
    if (!current()) return
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (current()) loading.value = false
  }
}

onMounted(load)

const state = computed(() => pageState(data.value, error.value, loading.value))
const events = computed(() => data.value?.events ?? [])
const months = computed(() => data.value?.months ?? wanted.value)
const groups = computed(() => groupEvents(events.value))
const stripWidth = computed(() => `max(100%, ${months.value * 2.75}rem)`)

function pickMonths(ev: Event) {
  wanted.value = Number((ev.target as HTMLSelectElement).value)
  load()
}

const range = computed(() => stripRange(data.value?.from, data.value?.to, months.value, shell.now))

const laneList = computed(() => (range.value ? lanes(rareFirst(events.value), range.value.t0, range.value.t1) : []))
const marks = computed(() => (range.value ? monthMarks(range.value.t0, range.value.t1, 24 / months.value) : []))
const todayAt = computed(() => {
  const r = range.value
  if (!r || shell.now < r.t0 || shell.now > r.t1) return null
  return ((shell.now - r.t0) / (r.t1 - r.t0)) * 100
})

const planning = computed(() => data.value?.planning ?? null)
const planDisabledReason = computed(() => {
  const p = planning.value
  if (!p) return 'The stacker did not say whether planning is available.'
  return p.available ? '' : p.reason || 'Planning is not available.'
})

const majorBodies = ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']

const bodiesText = computed(() => {
  const b = data.value?.bodies ?? []
  if (!b.length) return ''
  const added = b.map((x) => x.name).filter((n) => !majorBodies.includes(n))
  return added.length ? `Searches the Moon, the planets and ${added.join(', ')}.` : 'Searches the Moon and the planets.'
})

const frameText = computed(() => {
  const f = data.value?.frame
  return f ? `Your camera frame is ${f.width_deg.toFixed(2)}° × ${f.height_deg.toFixed(2)}°, measured from your images.` : ''
})

const criteriaText = computed(() => {
  const c = data.value?.criteria
  if (!c) return ''
  return (
    `Criteria: all members inside ${c.usable_width_deg.toFixed(2)}° × ${c.usable_height_deg.toFixed(2)}° of the frame, ` +
    `Sun below ${c.sun_below_deg}°, altitude above ${c.min_altitude_deg}°, sampled every ${c.step_minutes} minutes. ${c.basis}`
  )
})

const rarityBasis = computed(() => events.value.find((e) => e.rarity?.status === 'ready')?.rarity?.basis ?? '')

const computedText = computed(() => {
  const d = data.value
  if (!d?.computed_at) return ''
  return `Updated ${shortDate(d.computed_at)} ${clock(d.computed_at)}.`
})

const busy = reactive<Record<string, boolean>>({})
const cardError = reactive<Record<string, string>>({})

function replace(next: SkyEvent) {
  const d = data.value
  if (!d?.events) return
  const i = d.events.findIndex((e) => e.id === next.id)
  if (i >= 0) d.events[i] = next
}

async function act(e: SkyEvent, run: () => Promise<EventChange>, text: string) {
  busy[e.id] = true
  cardError[e.id] = ''
  try {
    const r = await run()
    replace(r.event)
    if (r.command) {
      upsertWaiting(r.command)
      const o = describeOutcome(r.command)
      showToast({ text: `${text} · ${r.event.title}`, sub: o.sub, tone: o.tone })
    }
  } catch (err) {
    cardError[e.id] = err instanceof Error ? err.message : String(err)
  } finally {
    busy[e.id] = false
  }
}

const plan = (e: SkyEvent) => act(e, () => planSkyEvent(e.id, e.priority), 'Planned')
const unplan = (e: SkyEvent) => act(e, () => unplanSkyEvent(e.id), 'Unplanned')
function setHigh(e: SkyEvent, ev: Event) {
  const high = (ev.target as HTMLInputElement).checked
  act(e, () => setSkyEventPriority(e.id, high ? 'high' : 'normal'), high ? 'High priority' : 'Normal priority')
}

const geometry = (e: SkyEvent) => frameGeometry(e.frame, objectLabels(e))
const pointColour = (kind: string) =>
  kind === 'moon' ? 'var(--ev-moon)' : kind === 'dso' ? 'var(--ev-dso)' : 'var(--ev-body)'
</script>

<template>
  <main class="page wide sky-events">
    <PageHead context="Discover" title="Sky events">
      Close pairings and groups of the Moon, planets and comets with each other and with catalogue
      objects, in one frame or two frames side by side, found by searching ahead from your site.
      Times are Central.
      <span v-if="bodiesText" class="block xsmall mt-1">{{ bodiesText }}</span>
      <span v-if="frameText" class="block xsmall">{{ frameText }}</span>
      <span v-if="computedText" class="block xsmall">{{ computedText }}</span>
    </PageHead>

    <section v-if="state === 'loading'" class="card" role="status">
      <p class="empty" style="padding: 0">Loading sky events.</p>
    </section>

    <section v-else-if="state === 'error'" class="card" role="alert">
      <h2>Sky events are not available</h2>
      <p class="empty" style="padding: 0">
        The stacker did not answer: {{ error }}
      </p>
      <div><button type="button" class="btn sm" @click="load">Try again</button></div>
    </section>

    <section v-else-if="state === 'pending'" class="card" role="status">
      <h2>Searching the next {{ months }} months</h2>
      <p class="empty" style="padding: 0">
        {{ data?.reason || 'The stacker is still computing events.' }}
      </p>
      <div><button type="button" class="btn sm" :disabled="loading" @click="load">Check again</button></div>
    </section>

    <section v-else-if="state === 'unavailable'" class="card" role="status">
      <h2>Sky events are not available</h2>
      <p class="empty" style="padding: 0">
        {{ data?.reason || 'The stacker did not give a reason.' }}
      </p>
    </section>

    <section v-else aria-labelledby="ev-h" class="card">
      <div class="spread" style="align-items: baseline">
        <h2 id="ev-h">
          {{ state === 'empty' ? `No events in the ${monthsText(months)}` : countText(events.length, months) }}
        </h2>
        <label class="small months-pick" for="ev-months">
          Show
          <select id="ev-months" :value="wanted" :disabled="loading" @change="pickMonths">
            <option v-for="n in MONTH_CHOICES" :key="n" :value="n">{{ n }} months</option>
          </select>
        </label>
      </div>
      <p class="small muted lead">
        Events fill gaps. Mark one high priority to let it interrupt a running project at the next
        exposure boundary. Rare events, with no other chance within 10 years either way, are planned
        at high priority by the stacker unless you unplan them or set them to normal.
      </p>

      <p v-if="state === 'empty' && criteriaText" class="empty" style="padding: 0">
        {{ criteriaText }}
      </p>

      <p v-if="planDisabledReason" class="small badge-line" role="note">
        <span class="badge warn">Planning off</span> {{ planDisabledReason }}
      </p>

      <ul v-if="data?.body_errors?.length" class="body-errors small" role="note">
        <li v-for="b in data.body_errors" :key="b.name">
          <span class="badge bad">{{ b.name }}</span> left out of the search: {{ b.error }}
        </li>
      </ul>

      <div
        v-if="state === 'ready' && range"
        class="strip-scroll"
        tabindex="0"
        aria-label="Event windows over the search span, scrolls sideways"
      >
      <div class="strip" :style="{ width: stripWidth }">
        <div class="months" aria-hidden="true">
          <span v-for="m in marks" :key="m.label + m.at" :style="{ left: m.at + '%' }"
            >{{ m.label }}<b v-if="m.year" class="yr">{{ m.year }}</b></span
          >
        </div>
        <ul class="lanes">
          <li v-for="l in laneList" :key="l.id" class="lane" :title="l.title">
            <span
              class="bar"
              :class="{ hi: l.high, rare: l.rare }"
              :style="{ left: l.left + '%', width: l.width + '%' }"
              aria-hidden="true"
            />
            <em
              :style="
                l.labelSide === 'right'
                  ? { left: l.labelAt + '%', maxWidth: l.labelMax + '%' }
                  : { right: l.labelAt + '%', maxWidth: l.labelMax + '%', textAlign: 'right' }
              "
              >{{ l.label }}<span v-if="l.rare" class="sr-only">, rare</span
              ><span v-if="l.high" class="sr-only">, high priority</span></em
            >
          </li>
          <li
            v-if="todayAt !== null"
            class="today"
            :style="{ left: todayAt + '%' }"
            aria-label="Today"
          >
            <span>today</span>
          </li>
        </ul>
      </div>
      </div>

      <section
        v-for="g in state === 'ready' ? groups : []"
        :key="g.key"
        class="events"
        :class="g.key"
        :aria-label="g.title || 'Events'"
      >
        <header v-if="g.title" class="group-head">
          <h3>{{ g.title }}</h3>
          <span v-if="g.key === 'rare'" class="xsmall muted"
            >No other chance for these members within 10 years before or after.</span
          >
        </header>
        <article v-for="e in g.events" :key="e.id" class="ev" :class="{ rare: isRare(e) }">
          <svg
            :viewBox="`0 0 ${geometry(e).width} ${geometry(e).height}`"
            role="img"
            :aria-label="frameLabel(e)"
            class="sky"
          >
            <rect
              v-for="(r, i) in geometry(e).rects"
              :key="i"
              :x="r.x"
              :y="r.y"
              :width="r.w"
              :height="r.h"
              fill="none"
              stroke="var(--ev-frame)"
              stroke-dasharray="4 3"
              stroke-width="1.2"
              :transform="`rotate(${r.rotate} ${r.cx} ${r.cy})`"
            />
            <g v-for="p in geometry(e).points" :key="p.name">
              <title>{{ p.title }}</title>
              <circle
                v-if="p.disc"
                :cx="p.x"
                :cy="p.y"
                :r="p.r"
                :fill="pointColour(p.kind)"
              />
              <ellipse
                v-else
                :cx="p.x"
                :cy="p.y"
                :rx="p.r"
                :ry="p.r"
                fill="var(--ev-dso)"
                fill-opacity="0.35"
                stroke="var(--ev-dso)"
              />
              <text
                :x="p.lx"
                :y="p.ly"
                :text-anchor="p.anchor"
                fill="var(--ev-frame)"
                font-size="9"
                class="mono"
              >
                {{ p.label }}
              </text>
            </g>
            <text x="6" y="12" font-size="8" fill="var(--ev-frame)" opacity="0.8">N ↑ E ←</text>
          </svg>
          <div class="ev-body">
            <h3>{{ e.title }}</h3>
            <div class="chips">
              <span v-if="isRare(e)" class="badge rare">{{ rareBadge(e.rarity) }}</span>
              <span v-else-if="rarityText(e.rarity)" class="chip">{{ rarityText(e.rarity) }}</span>
              <span v-if="thisWeek(e, shell.now)" class="chip now">This week</span>
              <span class="chip">{{ kindChip(e) }}</span>
              <span class="chip">{{ nightsText(e.nights) }}</span>
              <span v-if="movingChip(e)" class="chip">{{ movingChip(e) }}</span>
            </div>
            <div class="facts">
              <span>window <b>{{ windowText(e.first_night, e.last_night) }}</b></span>
              <span>closest <b>{{ momentText(e.best.at) }}</b></span>
              <span>{{ separationLabel(e) }} <b>{{ e.best.separation_deg.toFixed(2) }}°</b></span>
              <span>altitude then <b>{{ Math.round(e.best.altitude_deg) }}°</b></span>
              <span>in frame <b>{{ Number(e.hours_in_frame.toFixed(1)) }} h</b> total</span>
            </div>
            <p class="xsmall muted exposure" :title="e.rarity?.basis || undefined">{{ rarityDetail(e.rarity) }}</p>
            <p class="xsmall muted exposure">{{ exposureText(e.exposure) }}</p>
            <div class="row actions">
              <template v-if="planView(e.plan)?.active">
                <span class="badge" :class="planView(e.plan)!.tone">{{ planView(e.plan)!.label }}</span>
                <button type="button" class="btn sm" :disabled="busy[e.id]" @click="unplan(e)">
                  Unplan
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="btn sm primary"
                  :disabled="busy[e.id] || !!planDisabledReason"
                  :title="planDisabledReason || undefined"
                  @click="plan(e)"
                >
                  Plan it
                </button>
                <span v-if="planView(e.plan)" class="badge" :class="planView(e.plan)!.tone">{{
                  planView(e.plan)!.label
                }}</span>
              </template>
              <label class="toggle small" :for="'hi-' + e.id">
                <input
                  :id="'hi-' + e.id"
                  type="checkbox"
                  :checked="e.priority === 'high'"
                  :disabled="busy[e.id]"
                  @change="setHigh(e, $event)"
                />
                High priority
              </label>
            </div>
            <p v-if="autoView(e)" class="xsmall plan-msg auto">
              <span class="badge" :class="autoView(e)!.tone">{{ autoView(e)!.label }}</span>
              {{ autoView(e)!.message }}
            </p>
            <p v-if="planView(e.plan)?.message" class="xsmall muted plan-msg">
              {{ planView(e.plan)!.message }}
            </p>
            <p v-if="cardError[e.id]" class="xsmall plan-err" role="alert">{{ cardError[e.id] }}</p>
          </div>
        </article>
      </section>

      <div v-if="state === 'ready'" class="xsmall muted notes">
        <p>
          <b>Frame previews</b> are to scale: the dashed box is the camera field, turned by the
          rotator to fit every object. A 2-panel mosaic shows two overlapping boxes, shot one after
          the other. Planet and comet discs are enlarged so they show; the Moon and deep-sky
          objects are drawn at their catalogued diameters.
        </p>
        <p v-if="criteriaText">{{ criteriaText }}</p>
        <p v-if="rarityBasis"><b>Rarity.</b> {{ rarityBasis }}</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sky-events {
  --ev-frame: oklch(0.85 0.03 265);
  --ev-body: oklch(0.8 0.15 75);
  --ev-moon: oklch(0.85 0.03 265);
  --ev-dso: oklch(0.75 0.08 300);
}
.badge-line {
  margin: 0;
}
.body-errors {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.lead {
  margin: 0.25rem 0 0.75rem;
  max-width: 75ch;
}
.months-pick {
  display: inline-flex;
  gap: 0.375rem;
  align-items: center;
}
.strip-scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
.strip {
  position: relative;
  min-width: 0;
}
.months {
  position: relative;
  height: 2.25rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
}
.months span {
  position: absolute;
  top: 0;
  white-space: nowrap;
  padding-left: 2px;
  border-left: 1px solid var(--border);
  height: 100%;
}
.months .yr {
  display: block;
  font-weight: 600;
  color: var(--foreground);
}
.lanes {
  position: relative;
  list-style: none;
  margin: 0.5rem 0 1.25rem;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.lane {
  position: relative;
  height: 1.125rem;
}
.lane .bar {
  position: absolute;
  top: 2px;
  height: 14px;
  min-width: 6px;
  border-radius: 7px;
  background: var(--info);
  opacity: 0.85;
}
.lane .bar.hi {
  background: var(--warn);
}
.lane .bar.rare {
  background: var(--violet);
  opacity: 1;
}
.lane .bar.rare.hi {
  box-shadow: 0 0 0 2px var(--warn);
}
.badge.rare {
  background: var(--violet-bg);
  color: var(--violet);
  font-weight: 600;
}
.group-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  align-items: baseline;
}
.group-head h3 {
  margin: 0;
  font-size: 1rem;
}
.events.rare {
  margin-bottom: 1.25rem;
}
.ev.rare {
  border-color: var(--violet);
}
.auto {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: baseline;
  color: var(--muted-foreground);
}
.lane em {
  position: absolute;
  top: 0;
  font-style: normal;
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.today {
  position: absolute;
  top: -1.75rem;
  bottom: -1.125rem;
  border-left: 1px dashed var(--foreground);
  pointer-events: none;
}
.today span {
  position: absolute;
  bottom: 0;
  left: 3px;
  line-height: 1;
  font-size: 0.6875rem;
  color: var(--foreground);
  background: var(--card);
  padding: 0 2px;
}
.events {
  display: grid;
  gap: 0.875rem;
}
.ev {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1.125rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1rem;
  align-items: start;
}
@media (max-width: 640px) {
  .ev {
    grid-template-columns: minmax(0, 1fr);
  }
}
.ev svg.sky {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: 0.625rem;
  background: var(--sky);
}
.mono {
  font-family: ui-monospace, Menlo, monospace;
}
.ev h3 {
  margin: 0;
  font-size: 1.0625rem;
  text-wrap: balance;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0.375rem 0 0.5rem;
}
.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 0.625rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
.chip.now {
  background: var(--ok-bg);
  color: var(--ok);
  border-color: transparent;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  color: var(--muted-foreground);
}
.facts b {
  color: var(--foreground);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.exposure {
  margin: 0.375rem 0 0;
}
.actions {
  margin-top: 0.625rem;
  gap: 0.5rem;
  align-items: center;
}
.toggle {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
}
.plan-msg,
.plan-err {
  margin: 0.375rem 0 0;
}
.plan-err {
  color: var(--bad);
}
.notes {
  display: grid;
  gap: 0.375rem;
  max-width: 75ch;
}
.notes p {
  margin: 0;
}
.notes b {
  color: var(--foreground);
}
</style>
