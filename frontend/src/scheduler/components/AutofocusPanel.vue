<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { hm } from '../format'
import { filterName } from '../plan'
import {
  bestPoint,
  durationText,
  movedText,
  startNote,
  stepSize,
  type AfRun,
  type AfView,
} from '../autofocus'
import AutofocusCurve from './AutofocusCurve.vue'

const props = defineProps<{
  view: AfView
  now: number
  last?: AfRun | null
  history?: boolean
}>()

const v = computed(() => props.view)
const filter = computed(() => (v.value.filter ? filterName(v.value.filter) : ''))

const title = computed(() => {
  const f = filter.value ? ' · ' + filter.value : ''
  const at = hm(isNaN(v.value.finishedAt) ? v.value.startedAt : v.value.finishedAt)
  switch (v.value.state) {
    case 'running': {
      const e = isNaN(v.value.startedAt) ? '' : ' · ' + durationText((props.now - v.value.startedAt) / 1000)
      return 'Focusing' + f + e
    }
    case 'failed':
      return 'Autofocus failed' + (at ? ' at ' + at : '') + f
    default:
      return 'Focused' + (at ? ' at ' + at : '') + f
  }
})

const sub = computed(() => {
  const s = v.value.start
  const parts: string[] = []
  if (v.value.state === 'running') {
    if (v.value.points.length) parts.push('point ' + v.value.points.length)
    if (s) parts.push((s.basis === 'last' ? 'last focus ' : 'started at ') + Math.round(s.position))
  } else {
    if (v.value.chosen && s) parts.push(movedText(v.value.chosen.position, s.position))
    const d = durationText(v.value.durationSeconds)
    if (d) parts.push(d)
  }
  return parts.join(' · ')
})

const temp = computed(() => (v.value.temperature !== null ? v.value.temperature.toFixed(1) + ' °C' : ''))

const facts = computed(() => {
  const out: { label: string; value: string; title?: string }[] = []
  const pts = v.value.points
  if (v.value.state === 'running') {
    const c = v.value.curve
    out.push({
      label: 'fit so far',
      value: c ? Math.round(c.c) + ' · HFR ' + c.min.toFixed(2) : `needs 4 points, has ${pts.length}`,
      title: 'Refit after every point; NINA replaces it with its own fit when the run ends',
    })
    const b = bestPoint(pts)
    if (b) out.push({ label: 'best point', value: Math.round(b.position) + ' · HFR ' + b.value.toFixed(2) })
    const l = props.last
    if (l)
      out.push({
        label: 'last run',
        value:
          hm(l.finished_at) +
          ' · ' +
          (l.success && l.chosen_position !== null && l.chosen_position !== undefined
            ? String(Math.round(l.chosen_position))
            : 'failed'),
      })
    if (temp.value) out.push({ label: 'sensor', value: temp.value })
    return out
  }
  if (v.value.chosen) {
    out.push({ label: 'position', value: String(Math.round(v.value.chosen.position)) })
    if (v.value.chosen.value !== null) out.push({ label: 'HFR', value: v.value.chosen.value.toFixed(2) })
  }
  if (temp.value) out.push({ label: 'sensor', value: temp.value, title: "The autofocuser's temperature reading" })
  if (pts.length) {
    const st = stepSize(pts)
    out.push({ label: '', value: `${pts.length} points` + (st ? `, ${st} steps apart` : '') })
  }
  if (v.value.rSquared !== null && v.value.curve?.kind === 'nina')
    out.push({ label: 'R²', value: v.value.rSquared.toFixed(3) })
  return out
})

const curveLabel = computed(() => {
  const n = v.value.points.length
  const base = `Autofocus curve, ${n} point${n === 1 ? '' : 's'}`
  const c = v.value.curve
  if (v.value.chosen) return `${base}, chosen position ${Math.round(v.value.chosen.position)}`
  if (c && v.value.state === 'running') return `${base}, fit so far ${Math.round(c.c)}`
  return base
})

const empty = computed(() => {
  if (v.value.points.length) return ''
  if (v.value.state === 'running') return 'Waiting for the first point.'
  return 'NINA recorded no points for this run.'
})

const fitName = computed(() => {
  const c = v.value.curve
  if (!c) return ''
  if (c.kind === 'nina') return "NINA's hyperbolic fit"
  return v.value.state === 'running' ? 'fit so far' : 'provisional fit'
})
</script>

<template>
  <div class="af" :class="{ failed: v.state === 'failed' }">
    <div class="af-head">
      <strong>{{ title }}</strong>
      <span v-if="sub" class="small muted num" :title="startNote(v.start)">{{ sub }}</span>
    </div>
    <p v-if="v.state === 'failed'" role="status" class="af-error">
      {{ v.error ? v.error : 'NINA reported the run as failed without a reason.' }}
    </p>
    <AutofocusCurve v-if="!empty" :view="v" :label="curveLabel" />
    <p v-else class="empty" style="padding: 0.25rem 0">{{ empty }}</p>
    <div v-if="!empty" class="af-legend xsmall muted">
      <span
        ><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="4" fill="var(--foreground)" /></svg
        >measured HFR</span
      >
      <span v-if="v.curve"
        ><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
          <path
            d="M1 6h16"
            stroke="var(--info)"
            stroke-width="2"
            :stroke-dasharray="v.curve.kind === 'provisional' ? '4 3' : undefined"
          /></svg
        >{{ fitName }}</span
      >
      <span v-if="v.chosen"
        ><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" fill="var(--warn)" /></svg
        >chosen position</span
      >
      <span v-if="v.start" :title="startNote(v.start)"
        ><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
          <path d="M9 1v10" stroke="var(--muted-foreground)" stroke-dasharray="2 2" /></svg
        >{{ v.start.basis === 'initial' ? 'start position' : 'last focus position' }}</span
      >
    </div>
    <p v-if="v.ninaUnreadable" class="xsmall muted" style="margin: 0">
      NINA's fit could not be read, so the dashed curve is this page's own fit to the points.
    </p>
    <p
      v-else-if="v.state === 'running' && v.points.length && v.points.length < 4"
      class="xsmall muted"
      style="margin: 0"
    >
      The dashed fit appears once there are 4 points. NINA's own fit replaces it when the run ends.
    </p>
    <div v-if="facts.length" class="af-facts small muted">
      <span v-for="f in facts" :key="f.label + f.value" :title="f.title"
        >{{ f.label ? f.label + ' ' : '' }}<b class="num">{{ f.value }}</b></span
      >
    </div>
    <RouterLink v-if="history" :to="{ name: 'autofocus' }" class="lnk small muted af-link"
      >Autofocus history</RouterLink
    >
  </div>
</template>

<style scoped>
.af {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.875rem 1rem;
  background: oklch(from var(--muted) l c h / 0.5);
  min-width: 0;
}
.af-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.25rem 1rem;
}
.af-head strong {
  font-weight: 600;
}
.af-error {
  margin: 0;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bad-bg);
  color: var(--bad);
  font-size: 0.875rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.af-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
}
.af-legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.af-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
}
.af-facts b {
  color: var(--foreground);
  font-weight: 600;
}
.af-link {
  align-self: flex-start;
}
</style>
