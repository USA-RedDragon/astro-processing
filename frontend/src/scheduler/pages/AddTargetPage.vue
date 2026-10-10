<script setup lang="ts">
import PageHead from '../components/PageHead.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, query } from '../api/client'
import { submitCommand, type CommandRecord } from '../api/commands'
import {
  draftProject,
  getPlanning,
  type GoalKind,
  type PanelDraft,
  type Snapshot,
} from '../api/planning'
import { errorToast, notifyCommand, queuedText, shell, undo, whenApplies } from '../shell'
import { rigSource } from '../api/discover'
import FramePlanner, { type FramePlan } from '../components/FramePlanner.vue'

interface CatalogObject {
  id: string
  designation: string
  name: string
  type: string
  aliases: string[] | null
  ra: number
  dec: number
  majorArcmin: number
  minorArcmin: number | null
  pa: number | null
  source: string
}

interface Fit {
  fill: number
  panels: number
  columns: number
  rows: number
  category: string
}

interface Link {
  subject: string
  subjectName: string
  object: CatalogObject
  method: string
  confidence: number
  why: string
  separation: number
  status: string
}

interface SubjectRef {
  key: string
  name: string
  projectId?: number
  state?: string
  status: string
  method: string
  done: boolean
  hours: number
}

interface ObjectDetail {
  object: CatalogObject
  status: string
  subjects: SubjectRef[] | null
  links: Link[] | null
  fit: Fit
}

interface Hit {
  object: CatalogObject
  how?: string
  detail?: ObjectDetail
  detailError?: string
}

const route = useRoute()
const router = useRouter()

const steps = ['Find', 'Frame', 'Mosaic', 'Exposures and goal', 'Review and add']
const step = ref(1)
const q = ref('')
const hits = ref<Hit[]>([])
const searching = ref(false)
const searchError = ref('')
const catsOff = reactive<Record<string, boolean>>({})
const pick = ref<ObjectDetail | null>(null)
const matchChoice = ref('')
const snap = ref<Snapshot | null>(null)

const plan = reactive({
  rotation: null as number | null,
  overlap: null as number | null,
  cols: 1,
  rows: 1,
  layoutName: 'One frame',
  layoutId: 'single',
})
const planned = ref<FramePlan | null>(null)

function onPlan(p: FramePlan) {
  planned.value = p
  plan.rotation = p.rotation
  plan.overlap = p.overlap
  plan.cols = p.cols
  plan.rows = p.rows
  plan.layoutName = p.layoutName
  plan.layoutId = p.layoutId
}
const form = reactive({
  setId: '',
  goalKind: 'snr' as GoalKind,
  snr: null as number | null,
  depth: null as number | null,
  plateauStop: null as boolean | null,
  name: '',
  priority: null as string | null,
  minAlt: null as number | null,
  minTime: null as number | null,
  desired: null as number | null,
})
const created = ref<{ record: CommandRecord; name: string; guid: string } | null>(null)
const draft = ref<{
  project: { guid: string; name: string }
  targets: { name: string; plans: unknown[] }[]
  goals: unknown[]
} | null>(null)
const draftError = ref('')
const busy = ref(false)

onMounted(async () => {
  try {
    snap.value = await getPlanning()
  } catch {
    snap.value = null
  }
  const id = String(route.query.object ?? '')
  if (id) {
    await choose(id)
    if (route.query.rotation) plan.rotation = Number(route.query.rotation) || 0
    if (route.query.cols && route.query.rows) {
      plan.cols = Math.max(1, Number(route.query.cols) || 1)
      plan.rows = Math.max(1, Number(route.query.rows) || 1)
    } else if (route.query.panels) {
      const n = Math.max(1, Number(route.query.panels) || 1)
      plan.cols = n
      plan.rows = 1
    }
    if (route.query.step === 'frame') step.value = 2
    if (route.query.step === 'mosaic') step.value = 3
  }
})

let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(search, 250)
})

function parseCoords(s: string): { ra: number; dec: number } | null {
  const t = s.trim().replace(/[,]/g, ' ')
  const dec2 = /^(\d+(?:\.\d+)?)\s+([+-−]?\d+(?:\.\d+)?)$/.exec(t)
  if (dec2) return { ra: Number(dec2[1]), dec: Number(dec2[2].replace('−', '-')) }
  const hms =
    /^(\d{1,2})[h:\s](\d{1,2}(?:\.\d+)?)m?(?:[:\s]?(\d{1,2}(?:\.\d+)?)s?)?\s+([+-−])?(\d{1,2}(?:\.\d+)?)(?:[°d:\s](\d{1,2}(?:\.\d+)?))?/.exec(
      t,
    )
  if (!hms) return null
  const ra = (Number(hms[1]) + Number(hms[2]) / 60 + Number(hms[3] ?? 0) / 3600) * 15
  const sign = hms[4] === '-' || hms[4] === '−' ? -1 : 1
  const dec = sign * (Number(hms[5]) + Number(hms[6] ?? 0) / 60)
  return { ra, dec }
}

let searchSeq = 0

async function search() {
  const term = q.value.trim()
  if (!term) {
    hits.value = []
    return
  }
  const seq = ++searchSeq
  searching.value = true
  try {
    const c = parseCoords(term)
    let found: Hit[]
    if (c) {
      const objs = await api.get<CatalogObject[]>(
        '/catalog/cone' + query({ ra: c.ra, dec: c.dec, radius: 1 }),
      )
      found = objs.slice(0, 40).map((o) => ({ object: o, how: 'coordinates' }))
    } else {
      const ms = await api.get<{ object: CatalogObject; how: string }[]>(
        '/catalog/search' + query({ q: term, limit: 40 }),
      )
      found = ms.map((m) => ({ object: m.object, how: m.how }))
    }
    if (seq !== searchSeq) return
    hits.value = found
    searchError.value = ''
    let next = 0
    const worker = async () => {
      while (next < found.length && seq === searchSeq) {
        const h = found[next++]
        try {
          h.detail = await api.get<ObjectDetail>(
            '/catalog/objects/' + encodeURIComponent(h.object.id),
          )
        } catch (e) {
          h.detailError = e instanceof Error ? e.message : String(e)
        }
        if (seq === searchSeq) hits.value = [...found]
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker))
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

function cataloguesOf(o: CatalogObject): string[] {
  const out = new Set<string>()
  for (const d of [o.designation, ...(o.aliases ?? [])]) {
    const m = /^([A-Za-z]+(?:2)?)[\s-]?\d/.exec(d)
    if (m) out.add(m[1] === 'SH' ? 'Sh2' : m[1])
  }
  return [...out]
}

const allCats = computed(() => {
  const s = new Set<string>()
  hits.value.forEach((h) => cataloguesOf(h.object).forEach((c) => s.add(c)))
  return [...s].sort()
})

const shownHits = computed(() =>
  hits.value.filter((h) => {
    const cats = cataloguesOf(h.object)
    return !cats.length || cats.some((c) => !catsOff[c])
  }),
)

function arcText(arcmin: number): string {
  if (arcmin < 1) return `${Math.round(arcmin * 60)}″`
  return `${Math.round(arcmin)}′`
}

function sizeText(o: CatalogObject): string {
  if (!o.majorArcmin) return 'size unknown'
  if (o.majorArcmin >= 60) return `≈ ${(o.majorArcmin / 60).toFixed(1)}°`
  return o.minorArcmin && o.minorArcmin !== o.majorArcmin
    ? `${arcText(o.majorArcmin)} × ${arcText(o.minorArcmin)}`
    : `≈ ${arcText(o.majorArcmin)}`
}

function fitText(h: Hit): string {
  if (h.detailError) return 'not checked: ' + h.detailError
  const f = h.detail?.fit
  if (!f) return 'checking…'
  if (!h.object.majorArcmin) return 'size unknown'
  if (f.panels > 1) return `Mosaic · ${f.columns} × ${f.rows}`
  if (f.fill < 0.15) {
    const p = f.fill * 100
    return `Small · ${p < 1 ? '<1' : Math.round(p)}% of the frame width`
  }
  return 'Fits one frame'
}

function inDataText(h: Hit): { text: string; tone: string } {
  if (h.detailError) return { text: 'not checked', tone: 'var(--muted-foreground)' }
  const d = h.detail
  if (!d) return { text: 'checking…', tone: 'var(--muted-foreground)' }
  const subs = (d.subjects ?? []).filter((x) => x.status !== 'rejected')
  if (!subs.length) {
    const sug = (d.links ?? []).find((l) => l.status === 'suggested')
    return sug
      ? { text: `Maybe ${sug.subjectName}`, tone: 'var(--warn)' }
      : { text: 'Not imaged', tone: 'var(--muted-foreground)' }
  }
  const s0 = subs[0]
  const more = subs.length > 1 ? ` +${subs.length - 1}` : ''
  return {
    text: `${s0.name}${more} · ${s0.done ? 'done' : s0.hours ? s0.hours.toFixed(1) + ' h' : 'in progress'}`,
    tone: s0.done ? 'var(--ok)' : 'var(--info)',
  }
}

function label(o: CatalogObject): string {
  return o.designation + (o.name ? ' ' + o.name : '')
}

async function choose(id: string) {
  try {
    pick.value = await api.get<ObjectDetail>('/catalog/objects/' + encodeURIComponent(id))
  } catch (e) {
    errorToast(e, 'Could not open that object')
    return
  }
  const o = pick.value.object
  matchChoice.value = ''
  form.name = o.name || o.designation
  const f = pick.value.fit
  plan.cols = Math.max(1, f.columns)
  plan.rows = Math.max(1, f.rows)
  plan.rotation = null
  planned.value = null
  form.setId = presetSet.value?.set.id ?? ''
}

const topMatch = computed<Link | null>(() => {
  const ls = (pick.value?.links ?? []).filter((l) => l.status !== 'rejected')
  const want = String(route.query.subject ?? '')
  const m =
    (want && ls.find((x) => x.subject === want)) ||
    [...ls].sort((a, b) => b.confidence - a.confidence)[0]
  return m ?? null
})

const topProject = computed(() => {
  const m = topMatch.value
  if (!m) return null
  const ref = (pick.value?.subjects ?? []).find((s) => s.key === m.subject)
  return ref?.projectId ?? null
})

const matchOpts = computed(() => {
  const m = topMatch.value
  if (!m) return []
  if (!topProject.value) {
    return [
      ['link', 'Same object · link the stacker’s data to the new project'],
      ['different', 'Different object'],
    ]
  }
  return [
    ['open', `Same object · open ${m.subjectName} instead`],
    ['separate', 'Same object · keep a separate project'],
    ['different', 'Different object'],
  ]
})

const matchNeeds = computed(
  () => !!topMatch.value && topMatch.value.status !== 'confirmed' && !matchChoice.value,
)

async function recordMatch(after: 'confirmed' | 'rejected') {
  const m = topMatch.value
  const o = pick.value?.object
  if (!m || !o) return
  const before = m.status === 'confirmed' || m.status === 'rejected' ? m.status : ''
  if (before === after) return
  try {
    const r = await submitCommand('catalog.match', {
      subject: m.subject,
      subject_name: m.subjectName,
      object_id: o.id,
      object_name: label(o),
      method: 'add-target review',
      confidence: m.confidence,
      before,
      after,
    })
    notifyCommand(r)
    m.status = after
  } catch (e) {
    errorToast(e)
  }
}

async function next() {
  if (step.value === 1) {
    if (!pick.value || matchNeeds.value) return
    if (matchChoice.value === 'open' && topMatch.value && topProject.value) {
      await recordMatch('confirmed')
      router.push({ name: 'target', params: { projectId: String(topProject.value) } })
      return
    }
    if (matchChoice.value === 'separate' || matchChoice.value === 'link')
      await recordMatch('confirmed')
    if (matchChoice.value === 'different') await recordMatch('rejected')
  }
  if (step.value === 4) await makeDraft()
  step.value = Math.min(5, step.value + 1)
}

function back() {
  step.value = Math.max(1, step.value - 1)
}

const frameW = computed(() => snap.value?.frame?.widthDeg ?? null)
const frameH = computed(() => snap.value?.frame?.heightDeg ?? null)
const frameText = computed(() => {
  const f = snap.value?.frame
  if (!snap.value) return 'frame size unknown: the planning data did not load'
  if (frameW.value === null || frameH.value === null)
    return 'frame size unknown: ' + (f?.reason ?? 'the rig is not measured yet')
  return `one frame is ${frameW.value.toFixed(2)}° × ${frameH.value.toFixed(2)}° · ${rigSource(f as never)}`
})

interface Usual<T> {
  value: T
  count: number
  total: number
}

function usual<T>(vals: T[]): Usual<T> | null {
  const counts = new Map<T, number>()
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: Usual<T> | null = null
  for (const [value, count] of counts)
    if (!best || count > best.count) best = { value, count, total: vals.length }
  return best
}

function usedValues<T extends number>(vals: T[]): T[] {
  return [...new Set(vals)].sort((a, b) => a - b)
}

const projects = computed(() => snap.value?.projects ?? [])
const usualAlt = computed(() => usual(projects.value.map((p) => p.minimumAltitude)))
const usualTime = computed(() => usual(projects.value.map((p) => p.minimumTime)))
const usualPriority = computed(() => usual(projects.value.map((p) => p.priority)))
const altOptions = computed(() => usedValues(projects.value.map((p) => p.minimumAltitude)))
const timeOptions = computed(() => usedValues(projects.value.map((p) => p.minimumTime)))

function usualText(u: Usual<number | string> | null, unit: string): string {
  if (!u) return 'no projects to take a usual value from'
  return `your usual: ${u.value}${unit}, on ${u.count} of ${u.total} projects`
}

const minAlt = computed(() => form.minAlt ?? usualAlt.value?.value ?? null)
const minTime = computed(() => form.minTime ?? usualTime.value?.value ?? null)
const priority = computed(() => form.priority ?? usualPriority.value?.value ?? null)
const goalDefaults = computed(() => snap.value?.defaults?.goal ?? null)
const snr = computed(() => form.snr ?? goalDefaults.value?.snr ?? null)
const plateauStop = computed(() => form.plateauStop ?? goalDefaults.value?.plateauStop ?? null)

const presetSet = computed(() => {
  const pid = topProject.value
  if (!pid || matchChoice.value === 'different') return null
  const set = sets.value.find((x) => x.projectIds.includes(pid))
  const proj = projects.value.find((p) => p.id === pid)
  return set && proj ? { set, reason: `the set on ${proj.name}, which matches this object` } : null
})

const setNote = computed(() => {
  const what = 'Sets are the exposure plan combinations your projects use.'
  if (!sets.value.length)
    return 'None of your projects has enabled exposure plans, so there is no set to reuse.'
  if (presetSet.value && form.setId === presetSet.value.set.id)
    return `Preselected: ${presetSet.value.reason}. ${what}`
  if (form.setId) return what
  return `Nothing is preselected: no project of yours matches this object. ${what}`
})

const chosenSet = computed(() => sets.value.find((s) => s.id === form.setId) ?? null)

const setFilters = computed(() => {
  const set = chosenSet.value
  const byName = new Map((snap.value?.templates ?? []).map((t) => [t.name.toLowerCase(), t.filter]))
  return [...new Set((set?.items ?? []).map((i) => byName.get(i.template.toLowerCase()) ?? i.template))]
})

const depthDefaults = computed(() => {
  const d = goalDefaults.value?.depths ?? []
  const norm = (f: string) => f.toLowerCase().replace(/[^a-z0-9]/g, '')
  return setFilters.value.map((f) => {
    const m = d.find((x) => norm(x.filter) === norm(f))
    return { filter: f, depth: m?.depth ?? null }
  })
})

const depthDefaultText = computed(() => {
  const list = depthDefaults.value
  if (!list.length) return 'pick an exposure set to see the per-filter defaults'
  return (
    'default per filter: ' +
    list.map((x) => `${x.filter} ${x.depth === null ? 'unknown' : x.depth.toFixed(1)}`).join(', ')
  )
})

const panels = computed<PanelDraft[]>(() => {
  const o = pick.value?.object
  if (!o) return []
  if (planned.value?.panels.length)
    return planned.value.panels.map((p) => ({
      raHours: p.raHours,
      dec: p.dec,
      rotation: p.rotation,
      name: p.name,
    }))
  return [{ raHours: (((o.ra % 360) + 360) % 360) / 15, dec: o.dec, rotation: plan.rotation ?? 0 }]
})

const panelCount = computed(() => panels.value.length)

const sets = computed(() => snap.value?.sets ?? [])
const missingTemplates = computed(() => {
  const set = chosenSet.value
  const names = new Set((snap.value?.templates ?? []).map((t) => t.name.toLowerCase()))
  return (set?.items ?? [])
    .filter((i) => !names.has(i.template.toLowerCase()))
    .map((i) => i.template)
})

async function makeDraft() {
  const o = pick.value?.object
  if (!o) return
  draftError.value = ''
  draft.value = null
  try {
    draft.value = (await draftProject({
      name: form.name,
      catalog: o.designation,
      match: matchChoice.value || undefined,
      matchWith: topMatch.value?.subjectName,
      priority: priority.value ?? '',
      minimumAltitude: minAlt.value ?? -1,
      minimumTime: minTime.value ?? 0,
      setId: form.setId,
      desired: form.desired ?? 0,
      goal: {
        kind: form.goalKind,
        snr: form.snr ?? 0,
        depth: form.depth ?? 0,
        plateauStop: plateauStop.value ?? undefined,
      },
      panels: panels.value,
      mosaic:
        panels.value.length > 1
          ? {
            layout: plan.layoutId,
            rotation: plan.rotation ?? 0,
            overlap: plan.overlap ?? 0,
            cols: plan.cols,
            rows: plan.rows,
          }
          : undefined,
    })) as typeof draft.value
  } catch (e) {
    draftError.value = e instanceof Error ? e.message : String(e)
  }
}

function numOrNull(e: Event): number | null {
  const v = (e.target as HTMLInputElement).value.trim()
  return v === '' || isNaN(Number(v)) ? null : Number(v)
}

function itemText(i: { template: string; exposure: number; desired: number }): string {
  return `${i.template} ${i.exposure} s × ${form.desired ?? i.desired}`
}

const review = computed(() => {
  const o = pick.value?.object
  const set = chosenSet.value
  if (!o) return []
  return [
    { k: 'Object', v: label(o) + ' · ' + o.type },
    {
      k: 'Project',
      v: `${form.name} · ${priority.value ?? 'no'} priority · minimum altitude ${minAlt.value ?? 'not set'}° · minimum time ${minTime.value ?? 'not set'} min`,
    },
    {
      k: 'Framing',
      v:
        plan.rotation === null
          ? 'Not framed: one frame at the catalogue centre, rotation 0°, because the layouts were not worked out'
          : panelCount.value > 1
            ? `${plan.layoutName}, ${panelCount.value} panels at ${plan.rotation}°, ${plan.overlap}% overlap`
            : `One frame at ${plan.rotation}°`,
    },
    {
      k: 'Exposures',
      v: set ? set.items.map(itemText).join(', ') : 'No exposure set chosen',
    },
    {
      k: 'Goal',
      v:
        form.goalKind === 'snr'
          ? `Faint-signal SNR ${snr.value}${form.snr === null ? ' (default)' : ''} per filter${plateauStop.value ? ', or the plateau' : ''}`
          : form.depth === null
            ? `Default depth per filter (${depthDefaultText.value.replace('default per filter: ', '')} mag/arcsec²) at SNR ${goalDefaults.value?.depthSnr ?? '?'}`
            : `${form.depth} mag/arcsec² at SNR ${goalDefaults.value?.depthSnr ?? '?'} per filter`,
    },
    {
      k: 'Name match',
      v: !topMatch.value
        ? 'No project, target or stacker object of yours matches.'
        : matchChoice.value === 'different'
          ? `Not the same as ${topMatch.value.subjectName}`
          : `Same object as ${topMatch.value.subjectName}, kept separate`,
    },
    {
      k: 'Scheduler rows',
      v: draft.value
        ? `1 project, ${draft.value.targets.length} ${draft.value.targets.length === 1 ? 'target' : 'targets'}, ${draft.value.targets.reduce((a, t) => a + t.plans.length, 0)} plans, ${draft.value.goals.length} goals`
        : draftError.value
          ? 'Not drafted: ' + draftError.value
          : 'Drafting…',
    },
  ]
})

async function addNow() {
  if (!draft.value || busy.value) return
  busy.value = true
  try {
    const r = await submitCommand('project.create', draft.value)
    created.value = { record: r, name: draft.value.project.name, guid: draft.value.project.guid }
    notifyCommand(r, 'Added ' + draft.value.project.name)
  } catch (e) {
    errorToast(e)
  } finally {
    busy.value = false
  }
}

function again() {
  created.value = null
  draft.value = null
  pick.value = null
  q.value = ''
  hits.value = []
  step.value = 1
  router.replace({ query: {} })
}

async function undoCreated() {
  if (!created.value) return
  try {
    await undo(created.value.record.id)
    created.value = null
    step.value = 5
  } catch {
    return
  }
}

const canNext = computed(() => {
  if (step.value === 1) return !!pick.value && !matchNeeds.value
  if (step.value === 4)
    return (
      !!form.name.trim() &&
      !!form.setId &&
      !missingTemplates.value.length &&
      minAlt.value !== null &&
      minTime.value !== null &&
      !!priority.value
    )
  return true
})

const applyLine = computed(() => {
  const r = created.value?.record
  if (r) return r.status === 'queued' ? queuedText() : `It reaches the scheduler ${whenApplies(r)}.`
  if (shell.scheduler.reachable !== 'online')
    return `Scheduler API ${shell.scheduler.reachable}: ${queuedText()}`
  return `The scheduler creates it and allocates the ids; sent now, it applies ${whenApplies()}.`
})

function goStep(i: number) {
  if (i === 1 || pick.value) {
    if (i === 5 && !draft.value) makeDraft()
    step.value = i
  }
}
</script>

<template>
  <main class="page wide">
    <PageHead context="Plan" title="Add target">
      Find an object, check it against what you already have, frame it for the rig, split it into
      panels if it needs them, then pick exposures and a goal.
    </PageHead>

    <ol aria-label="Steps" class="steps">
      <li v-for="(s, i) in steps" :key="s">
        <button
          type="button"
          :aria-current="step === i + 1 ? 'step' : undefined"
          :class="{ on: step === i + 1 }"
          @click="goStep(i + 1)"
        >
          <span class="num" :class="{ done: step > i + 1 }">{{ i + 1 }}</span
          >{{ s }}
        </button>
      </li>
    </ol>

    <section v-if="step === 1" class="card" aria-labelledby="find-h">
      <h2 id="find-h">Find</h2>
      <div class="row" style="align-items: flex-end; gap: 0.75rem">
        <label class="field" style="flex: 1 1 22rem; font-size: 0.8125rem">
          <span>Name, catalogue ID or coordinates</span>
          <input
            v-model="q"
            class="input"
            type="search"
            autofocus
            style="height: 2.5rem; font-size: 0.9375rem"
          />
        </label>
        <p class="xsmall muted" style="margin: 0; flex: 1 1 18rem">
          Try cygnus, garlic, M 27, Sh2-155, Arp 273, LBN 437 or 20h45m +30.7. Names resolve through
          the catalogue store.
        </p>
      </div>
      <div
        v-if="allCats.length > 1"
        role="group"
        aria-label="Catalogues to show"
        class="row"
        style="gap: 0.375rem"
      >
        <button
          v-for="c in allCats"
          :key="c"
          type="button"
          class="btn sm"
          :aria-pressed="!catsOff[c]"
          :class="{ primary: !catsOff[c] }"
          @click="catsOff[c] = !catsOff[c]"
        >
          {{ c }}
        </button>
      </div>
      <div class="scroll-x" style="border: 1px solid var(--border); border-radius: 0.5rem">
        <table class="dgrid" style="min-width: 52rem">
          <caption class="xsmall muted" style="text-align: left; padding: 0.5rem 0.625rem">
            {{
              searching
                ? 'Searching…'
                : shownHits.length +
                  (shownHits.length === 1 ? ' result' : ' results') +
                  (q ? ' for “' + q + '”' : '')
            }}
          </caption>
          <thead>
            <tr>
              <th>Designation</th>
              <th>Name</th>
              <th>Also</th>
              <th>Type</th>
              <th>Size</th>
              <th>In your data</th>
              <th>Frame</th>
              <th><span class="sr-only">Choose</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="h in shownHits"
              :key="h.object.id"
              :style="{
                background: pick?.object.id === h.object.id ? 'var(--secondary)' : 'transparent',
              }"
            >
              <td style="font-weight: 600; white-space: nowrap">{{ h.object.designation }}</td>
              <td style="white-space: nowrap">{{ h.object.name }}</td>
              <td class="muted" style="white-space: nowrap">
                {{ (h.object.aliases ?? []).slice(0, 2).join(', ') || '—' }}
              </td>
              <td style="white-space: nowrap">{{ h.object.type }}</td>
              <td class="num" style="white-space: nowrap">{{ sizeText(h.object) }}</td>
              <td style="white-space: nowrap" :style="{ color: inDataText(h).tone }">
                {{ inDataText(h).text }}
              </td>
              <td style="white-space: nowrap">{{ fitText(h) }}</td>
              <td style="text-align: right">
                <button
                  type="button"
                  class="btn sm"
                  :aria-label="'Choose ' + h.object.designation"
                  @click="choose(h.object.id)"
                >
                  {{ pick?.object.id === h.object.id ? 'Chosen' : 'Choose' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="searchError" class="small" style="color: var(--bad); margin: 0">{{ searchError }}</p>
      <p v-else-if="q && !searching && !shownHits.length" class="empty">
        Nothing matches. Try another name, or coordinates.
      </p>

      <div
        v-if="pick && topMatch"
        role="group"
        aria-labelledby="match-h"
        class="match"
        :style="{ borderColor: topMatch.confidence < 0.9 ? 'var(--warn)' : 'var(--ok)' }"
      >
        <div class="spread">
          <h3 id="match-h" style="margin: 0; font-size: 0.9375rem; font-weight: 600">
            Name match: is {{ label(pick.object) }} your “{{ topMatch.subjectName }}”?
          </h3>
          <span
            class="small num"
            style="font-weight: 600"
            :style="{ color: topMatch.confidence < 0.9 ? 'var(--warn)' : 'var(--ok)' }"
            >{{ Math.round(topMatch.confidence * 100) }}% confident</span
          >
        </div>
        <ul class="small muted" style="margin: 0; padding-left: 1.25rem">
          <li>{{ topMatch.why }}</li>
          <li v-if="topMatch.separation">
            {{ topMatch.separation.toFixed(2) }}° between your coordinates and the catalogue's
          </li>
        </ul>
        <p v-if="topMatch.status === 'confirmed'" class="small" style="margin: 0">
          You confirmed this match before.
        </p>
        <fieldset
          style="
            border: 0;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
          "
        >
          <legend class="small" style="font-weight: 500; margin-bottom: 0.375rem">
            Decide before you go on
          </legend>
          <label v-for="[id, text] in matchOpts" :key="id" class="row" style="font-size: 0.875rem"
            ><input v-model="matchChoice" type="radio" name="match" :value="id" /> {{ text }}</label
          >
        </fieldset>
      </div>
      <p v-else-if="pick" class="small muted" style="margin: 0">
        {{ label(pick.object) }}: no project, stacker object or frame of yours matches by name or
        within 0.5°.
      </p>
    </section>

    <section v-if="step === 2 || step === 3" class="card" aria-labelledby="frame-h">
      <div class="spread">
        <h2 id="frame-h">
          {{ step === 2 ? 'Frame ' + (pick ? label(pick.object) : '') : 'Mosaic plan' }}
        </h2>
        <span v-if="pick" class="xsmall muted"
          >RA {{ (pick.object.ra / 15).toFixed(3) }} h · Dec {{ pick.object.dec.toFixed(2) }}° ·
          {{ frameText }}</span
        >
      </div>
      <FramePlanner
        v-if="pick"
        :object="{
          id: pick.object.id,
          name: pick.object.name,
          ra: pick.object.ra,
          dec: pick.object.dec,
          majorArcmin: pick.object.majorArcmin,
          minorArcmin: pick.object.minorArcmin,
          pa: pick.object.pa,
        }"
        :step="step === 2 ? 'frame' : 'mosaic'"
        :rotation="plan.rotation ?? undefined"
        :cols="plan.cols"
        :rows="plan.rows"
        :min-altitude="minAlt ?? undefined"
        @update:plan="onPlan"
      />
      <p v-if="step === 3" class="xsmall muted" style="margin: 0">
        Every panel gets the same goal, measured per panel, and the weakest one sets completion. New
        mosaics get the Panel Deficit rule at
        {{ snap?.defaults?.panelDeficitWeight ?? 'its on-weight' }} and are adopted as planned
        mosaics straight away. Dark hours use minimum altitude {{ minAlt ?? 'not set' }}°{{
          form.minAlt === null && usualAlt ? ' (your usual)' : ''
        }}; change it on the Exposures and goal step.
      </p>
    </section>

    <section v-if="step === 4" class="card" aria-labelledby="exp-h">
      <h2 id="exp-h">Exposures and goal</h2>
      <p class="small muted" style="margin: 0">
        {{ setNote }}
      </p>
      <div role="radiogroup" aria-label="Exposure set" class="sets">
        <button
          v-for="s in sets"
          :key="s.id"
          type="button"
          role="radio"
          :aria-checked="form.setId === s.id"
          class="setcard"
          :class="{ on: form.setId === s.id }"
          @click="form.setId = s.id"
        >
          <span style="font-weight: 600; font-size: 0.875rem">{{ s.name }}</span>
          <span class="xsmall muted">{{ s.items.map(itemText).join(' · ') }}</span>
          <span class="xsmall muted">{{ s.hint }}</span>
        </button>
      </div>
      <p v-if="missingTemplates.length" class="small" style="margin: 0; color: var(--bad)">
        The scheduler has no template called {{ missingTemplates.join(', ') }}. Add it on the PC or
        clone one in Templates first.
      </p>
      <div class="row" style="gap: 1.5rem; align-items: stretch">
        <fieldset class="box" style="flex: 1 1 24rem">
          <legend>Goal{{ panelCount > 1 ? ', per panel' : '' }}</legend>
          <label class="row" style="font-size: 0.875rem"
            ><input v-model="form.goalKind" type="radio" value="snr" /> Faint-signal SNR{{
              goalDefaults?.kind === 'snr' ? ', the default' : ''
            }}</label
          >
          <div class="row small" style="padding-left: 1.5rem">
            <label for="g-snr" class="muted">SNR at least</label>
            <input
              id="g-snr"
              v-model.number="form.snr"
              class="input num"
              type="number"
              min="3"
              max="50"
              :placeholder="goalDefaults ? String(goalDefaults.snr) : ''"
              style="width: 4.5rem; height: 2rem"
            />
            <span class="muted"
              >{{ form.snr === null && goalDefaults ? 'default · ' : '' }}in the
              {{ goalDefaults?.bandLowPercentile ?? '?' }}–{{
                goalDefaults?.bandHighPercentile ?? '?'
              }}th percentile band, half-stack noise</span
            >
          </div>
          <label class="row" style="font-size: 0.875rem"
            ><input v-model="form.goalKind" type="radio" value="depth" /> Depth</label
          >
          <div class="row small" style="padding-left: 1.5rem">
            <label for="g-depth" class="muted">Reach</label>
            <input
              id="g-depth"
              v-model.number="form.depth"
              class="input num"
              type="number"
              step="0.1"
              placeholder="per filter"
              style="width: 5.5rem; height: 2rem"
            />
            <span class="muted"
              >mag/arcsec² at SNR {{ goalDefaults?.depthSnr ?? '?' }} ·
              {{ form.depth === null ? depthDefaultText : 'the same depth for every filter' }}</span
            >
          </div>
          <label class="row small"
            ><input
              :checked="!!plateauStop"
              type="checkbox"
              @change="form.plateauStop = ($event.target as HTMLInputElement).checked"
            />
            Also stop a filter when +1 h gives less than
            {{ goalDefaults?.plateauGainPct ?? '?' }}%{{
              form.plateauStop === null && goalDefaults ? ' (default on)' : ''
            }}</label
          >
          <p class="xsmall muted" style="margin: 0">
            You can draw your own region for the faint band later, on the target's Goal tab.
          </p>
        </fieldset>
        <fieldset class="box grid2" style="flex: 1 1 20rem">
          <legend>Project</legend>
          <label class="field" style="grid-column: 1 / -1"
            ><span
              >Name{{
                panelCount > 1 ? ' · panels become “' + (form.name || '…') + ' Panel N”' : ''
              }}</span
            ><input v-model="form.name" class="input" type="text"
          /></label>
          <label class="field"
            ><span>Priority</span
            ><select
              class="input"
              :value="priority ?? ''"
              @change="form.priority = ($event.target as HTMLSelectElement).value"
            >
              <option v-if="!priority" value="" disabled>Choose</option>
              <option>High</option>
              <option>Normal</option>
              <option>Low</option>
            </select>
            <span class="xsmall muted">{{ usualText(usualPriority, '') }}</span></label
          >
          <label class="field"
            ><span>Minimum altitude (°)</span
            ><input
              class="input num"
              type="number"
              min="0"
              max="89"
              list="alt-used"
              :value="minAlt ?? ''"
              @change="form.minAlt = numOrNull($event)"
            />
            <datalist id="alt-used">
              <option v-for="v in altOptions" :key="v" :value="v" />
            </datalist>
            <span class="xsmall muted">{{ usualText(usualAlt, '°') }}</span></label
          >
          <label class="field"
            ><span>Minimum time (min)</span
            ><input
              class="input num"
              type="number"
              min="1"
              list="time-used"
              :value="minTime ?? ''"
              @change="form.minTime = numOrNull($event)"
            />
            <datalist id="time-used">
              <option v-for="v in timeOptions" :key="v" :value="v" />
            </datalist>
            <span class="xsmall muted">{{ usualText(usualTime, ' min') }}</span></label
          >
          <label class="field"
            ><span>Desired per plan (fallback count)</span
            ><input
              v-model.number="form.desired"
              class="input num"
              type="number"
              min="1"
              placeholder="from the set"
            />
            <span class="xsmall muted">{{
              form.desired === null
                ? 'Empty: each plan takes the median count your projects use for it.'
                : 'Every plan gets this count.'
            }}</span></label
          >
        </fieldset>
      </div>
    </section>

    <section v-if="step === 5" class="card" aria-labelledby="rev-h">
      <template v-if="!created">
        <h2 id="rev-h">Review and add</h2>
        <dl class="review">
          <template v-for="rv in review" :key="rv.k"
            ><dt class="muted">{{ rv.k }}</dt>
            <dd>{{ rv.v }}</dd></template
          >
        </dl>
        <p v-if="draftError" class="small" style="margin: 0; color: var(--bad)">{{ draftError }}</p>
        <div
          class="spread"
          style="align-items: center; border-top: 1px solid var(--border); padding-top: 1rem"
        >
          <p class="small muted" style="margin: 0; max-width: 60ch">
            {{ applyLine }} It shows in History and can be undone.
          </p>
          <div class="row">
            <button
              type="button"
              class="btn primary"
              style="height: 2.5rem"
              :disabled="!draft || busy"
              @click="addNow"
            >
              Add {{ form.name }}{{ panelCount > 1 ? ' · ' + panelCount + ' panels' : '' }}
            </button>
          </div>
        </div>
      </template>
      <div v-else role="status" style="display: flex; flex-direction: column; gap: 0.75rem">
        <div class="row">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ok)"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
          <h2 style="margin: 0; font-size: 1.0625rem">{{ created.name }} added</h2>
        </div>
        <p class="small muted" style="margin: 0">{{ applyLine }}</p>
        <div class="row">
          <RouterLink :to="{ name: 'targets' }" class="btn primary">See it in Targets</RouterLink>
          <button type="button" class="btn" @click="again">Add another</button>
          <button type="button" class="btn link" @click="undoCreated">Undo</button>
        </div>
      </div>
    </section>

    <div v-if="!created" class="row" style="justify-content: space-between">
      <button v-if="step > 1" type="button" class="btn" style="height: 2.5rem" @click="back">
        Back
      </button>
      <span style="flex: 1" />
      <button
        v-if="step < 5"
        type="button"
        class="btn primary"
        style="height: 2.5rem; padding: 0 1.5rem"
        :disabled="!canNext"
        @click="next"
      >
        {{ step === 1 && matchChoice === 'open' ? 'Open it' : 'Next' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.steps button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 2.25rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 0.875rem 0 0.375rem;
  font-size: 0.8125rem;
  background: transparent;
}
.steps button.on {
  border-color: var(--foreground);
  background: var(--secondary);
}
.steps .num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 999px;
  background: var(--secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.steps .num.done {
  background: var(--ok);
  color: var(--background);
}
.match {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.sets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
  gap: 0.75rem;
}
.setcard {
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  padding: 0.75rem;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.setcard.on {
  border-color: var(--foreground);
  background: var(--secondary);
}
.box {
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  margin: 0;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}
.box legend {
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 0 0.25rem;
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.review {
  margin: 0;
  display: grid;
  grid-template-columns: minmax(6rem, 10rem) minmax(0, 1fr);
  gap: 0.5rem 1rem;
  font-size: 0.875rem;
}
.review dd {
  margin: 0;
}
</style>
