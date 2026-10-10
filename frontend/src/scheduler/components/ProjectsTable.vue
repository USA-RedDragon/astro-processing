<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  basisText,
  getPlanning,
  measureText,
  pct,
  r1,
  readinessText,
  r2,
  seasonLabel,
  PRIORITY_INDEX,
  STATE_INDEX,
  type Project,
  type Snapshot,
} from '../api/planning'
import { editEntity, submitCommand } from '../api/commands'
import { errorToast, notifyCommand, shell, showToast, whenApplies } from '../shell'
import { onEvent } from '../api/events'
import { ago } from '../format'
import { matchesFilter, type ProjectFilter } from '../projects'

const props = defineProps<{ filter: ProjectFilter; order?: (string | number)[] }>()

const router = useRouter()
const snap = ref<Snapshot | null>(null)
const loading = ref(true)
const loadError = ref('')
const sel = reactive<Record<number, boolean>>({})
const bulkPri = ref('High')

async function load() {
  try {
    snap.value = await getPlanning()
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

let off: (() => void) | undefined
onMounted(() => {
  load()
  off = onEvent('command', (e: { data?: { status?: string } }) => {
    if (e.data?.status === 'applied') load()
  })
})
onUnmounted(() => off?.())

const projects = computed(() => snap.value?.projects ?? [])

const rows = computed(() => {
  const shown = projects.value.filter((p) =>
    matchesFilter(props.filter, {
      name: p.name,
      description: p.description,
      priority: p.priority,
      state: p.state,
      isMosaic: p.isMosaic,
      targetNames: p.targets.map((t) => t.name),
    }),
  )
  const order = props.order
  if (!order?.length) return shown
  const at = new Map(order.map((id, i) => [String(id), i]))
  const rank = (p: Project) => at.get(String(p.id)) ?? order.length
  return [...shown].sort((a, b) => rank(a) - rank(b))
})

const selected = computed(() => projects.value.filter((p) => sel[p.id]))
const allChecked = computed(() => rows.value.length > 0 && rows.value.every((r) => sel[r.id]))
const targetCount = computed(() => rows.value.reduce((a, p) => a + p.targets.length, 0))

function toggleAll(e: Event) {
  const v = (e.target as HTMLInputElement).checked
  rows.value.forEach((r) => (sel[r.id] = v))
}

function clearSel() {
  Object.keys(sel).forEach((k) => delete sel[Number(k)])
}

function pendingFor(p: Project): string {
  const w = shell.waiting.find((c) =>
    (c.objects ?? []).some(
      (o) =>
        (o.entity === 'project' && (o.id === p.id || (!!o.guid && o.guid === p.guid))) ||
        (o.entity === 'target' && p.targets.some((t) => t.id === o.id)),
    ),
  )
  if (!w) return ''
  return w.status === 'queued' ? 'queued' : 'applies ' + whenApplies(w)
}

const adoptTitle = computed(() => {
  const g = projects.value.flatMap((p) => p.targets.flatMap((t) => t.goals))[0]?.defaultGoal
  return g
    ? `The stacker's default goal, faint-signal SNR ${g.snr} per filter${g.plateauStop ? ' with the plateau stop' : ''}. Each filter then finishes on its goal; the desired counts are not used`
    : 'Use the stacker\'s default goal per filter. Each filter then finishes on its goal; the desired counts are not used'
})

function kindLabel(p: Project): string {
  if (p.isMosaic) return `${p.targets.length} panels`
  return p.targets.length === 1 ? 'Single' : `${p.targets.length} targets`
}

function weakestText(p: Project): string {
  const w = p.weakest
  if (!w) return p.targets.length ? 'No enabled exposure plans' : 'No targets'
  const m = p.isMosaic && p.weakestTarget ? /(Panel\s*\d+)\s*$/i.exec(p.weakestTarget) : null
  const prefix = (m ? m[1] + ' ' : '') + w.filter + ' · '
  const g = w.progress
  if (g && g.kind === 'depth' && !g.unmeasured)
    return `${prefix}${r1(g.achieved)} of ${r1(g.goal)} mag/arcsec²`
  if (g && g.kind === 'snr') return `${prefix}SNR ${r1(g.achieved)} of ${r1(g.goal)}`
  const ready = readinessText(w)
  if (ready) return prefix + ready
  if (g?.unmeasured) return prefix + g.unmeasured
  const meas = w.measurement ? ` · measured SNR ${r1(w.measurement.snr)}` : ' · ' + measureText(w)
  return `${prefix}${w.accepted}/${w.desired} ${basisText(w.completionBasis)}${meas}`
}

async function setField(p: Project, field: 'priority' | 'state', value: unknown) {
  const v = String(value)
  const map = field === 'priority' ? PRIORITY_INDEX : STATE_INDEX
  const before = map[field === 'priority' ? p.priority : p.state]
  const after = map[v]
  if (before === after || after === undefined) return
  try {
    const r = await editEntity('project.edit', {
      id: p.id,
      guid: p.guid,
      name: p.name,
      changes: [{ field, before, after }],
    })
    if (field === 'priority') p.priority = v
    else p.state = v
    notifyCommand(r)
  } catch (e) {
    errorToast(e)
    load()
  }
}

async function applyBulkPri() {
  const after = PRIORITY_INDEX[bulkPri.value]
  const changing = selected.value.filter((p) => p.priority !== bulkPri.value)
  if (!changing.length) {
    showToast({
      text: 'Nothing to change',
      sub: `Every selected project is already ${bulkPri.value}.`,
    })
    return
  }
  const items = changing.map((p) => ({
    id: p.id,
    guid: p.guid,
    name: p.name,
    changes: [{ field: 'priority', before: PRIORITY_INDEX[p.priority], after }],
  }))
  try {
    const r = await submitCommand('project.batchedit', { items })
    changing.forEach((p) => (p.priority = bulkPri.value))
    notifyCommand(r)
  } catch (e) {
    errorToast(e)
  }
}

async function adoptGoals() {
  const goals = selected.value.flatMap((p) =>
    p.targets
      .filter((t) => t.guid)
      .flatMap((t) =>
        t.goals
          .filter((g) => !g.goalSet)
          .map((g) => ({
            target_id: t.id,
            target_guid: t.guid,
            target_name: t.name,
            filter: g.filter,
            before: null,
            after: { kind: 0, snr_goal: g.defaultGoal.snr, plateau_stop: g.defaultGoal.plateauStop },
          })),
      ),
  )
  if (!goals.length) {
    showToast({
      text: 'Nothing to change',
      sub: 'Every selected project already finishes on goals.',
    })
    return
  }
  const one = selected.value.length === 1 ? selected.value[0] : null
  try {
    const r = await submitCommand('goal.edit', {
      project_id: one?.id ?? 0,
      project_name: one ? one.name : `${selected.value.length} projects`,
      goals,
    })
    notifyCommand(r)
    await load()
  } catch (e) {
    errorToast(e)
  }
}

function applySet() {
  const ids = selected.value.flatMap((p) => p.targets.map((t) => t.id))
  router.push({ name: 'templates', query: { targets: ids.join(',') } })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="selected.length"
      role="region"
      aria-label="Bulk edit"
      class="flex flex-wrap items-center gap-3 rounded-xl border border-foreground bg-card px-5 py-3.5"
    >
      <div class="mr-auto min-w-0">
        <div class="font-semibold">{{ selected.length }} selected</div>
        <div class="text-xs text-muted-foreground">
          {{ selected.map((p) => p.name).join(', ') }}
        </div>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="text-muted-foreground">Priority</span>
        <Select v-model="bulkPri">
          <SelectTrigger class="w-[7.5rem]" aria-label="Priority to set">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Normal">Normal</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" @click="applyBulkPri">Set priority</Button>
      <Button
        variant="outline"
:title="adoptTitle"
        @click="adoptGoals"
      >
        Finish on goals
      </Button>
      <Button @click="applySet">Apply an exposure set…</Button>
      <Button variant="link" size="sm" class="px-0" @click="clearSel">Clear</Button>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>
          {{ rows.length }} {{ rows.length === 1 ? 'project' : 'projects' }} ·
          {{ targetCount }} targets
        </CardTitle>
        <CardDescription>
          Change priority or state right in the row; it applies when the current exposure ends.
          Progress is the least complete exposure plan, counted as Target Scheduler counts it:
          a filter with a goal against its goal, a filter without one against its desired count.
          For a mosaic, its least complete panel.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <p v-if="loading" class="py-4 text-sm text-muted-foreground">
          Loading the scheduler's projects…
        </p>
        <p v-else-if="loadError" class="py-4 text-sm text-destructive break-words">
          Could not load the scheduler's projects: {{ loadError }}
        </p>
        <div v-else class="rounded-md border">
          <Table class="min-w-[60rem] tabular-nums">
            <TableHeader>
              <TableRow>
                <TableHead class="w-8">
                  <input
                    type="checkbox"
                    class="size-4 accent-primary align-middle"
                    :checked="allChecked"
                    aria-label="Select every shown project"
                    @change="toggleAll"
                  />
                </TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Exposure set</TableHead>
                <TableHead class="min-w-[11rem]">Toward goal</TableHead>
                <TableHead>Season</TableHead>
                <TableHead>Last sub</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="p in rows"
                :key="p.id"
                :data-state="sel[p.id] ? 'selected' : undefined"
              >
                <TableCell class="align-top">
                  <input
                    v-model="sel[p.id]"
                    type="checkbox"
                    class="size-4 accent-primary align-middle"
                    :aria-label="'Select ' + p.name"
                  />
                </TableCell>
                <TableCell class="align-top">
                  <RouterLink
                    :to="`/project/${p.id}`"
                    class="font-semibold underline-offset-4 hover:underline"
                  >
                    {{ p.name }}
                  </RouterLink>
                  <div class="text-xs text-muted-foreground">
                    {{ kindLabel(p)
                    }}<span v-if="pendingFor(p)" class="text-[var(--warn)]">
                      · edit {{ pendingFor(p) }}</span
                    >
                  </div>
                </TableCell>
                <TableCell class="align-top">
                  <Select
                    :model-value="p.priority"
                    @update:model-value="(v) => setField(p, 'priority', v)"
                  >
                    <SelectTrigger size="sm" class="w-[7rem]" :aria-label="'Priority of ' + p.name">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Normal">Normal</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell class="align-top">
                  <Select
                    :model-value="p.state"
                    @update:model-value="(v) => setField(p, 'state', v)"
                  >
                    <SelectTrigger size="sm" class="w-[7rem]" :aria-label="'State of ' + p.name">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                      <SelectItem v-if="p.state === 'Draft'" value="Draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell
                  class="align-top whitespace-normal min-w-[9rem] max-w-[16rem] break-words"
                >
                  {{ p.exposureSet }}
                </TableCell>
                <TableCell class="align-top whitespace-normal min-w-[11rem] max-w-[18rem]">
                  <div class="flex items-center gap-2">
                    <Progress
                      :model-value="Math.round(Math.min(1, p.progress) * 100)"
                      class="h-1.5"
                    />
                    <span class="w-11 text-right font-semibold">
                      {{ pct(Math.min(1, p.progress)) }}
                    </span>
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {{ weakestText(p) }}<span v-if="!p.goalDriven"> · finishes on counts</span>
                  </div>
                </TableCell>
                <TableCell class="align-top">
                  <Badge
                    variant="outline"
                    :class="
                      seasonLabel(p.season).cls === 'violet'
                        ? 'border-transparent bg-[var(--violet-bg)] text-[var(--violet)]'
                        : ''
                    "
                  >
                    {{ seasonLabel(p.season).label }}
                  </Badge>
                  <div class="text-xs text-muted-foreground">
                    Novelty {{ r2(p.novelty) }} · Rarity {{ r2(p.rarity) }}
                  </div>
                </TableCell>
                <TableCell class="align-top text-muted-foreground">
                  {{ p.lastSub ? ago(p.lastSub, shell.now) : 'No subs yet' }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p
          v-if="!loading && !loadError && rows.length === 0"
          class="py-4 text-sm text-muted-foreground"
        >
          No project matches these filters.
        </p>
        <p class="text-xs text-muted-foreground">
          Novelty and Rarity are worked out here with Target Scheduler's formulas from its own
          data. Open a project's Scoring tab to see how they add up.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
