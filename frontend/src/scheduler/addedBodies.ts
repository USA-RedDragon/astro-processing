import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getBodies, type BodyTable } from './api/comets'
import { listCommands, type CommandRecord } from './api/commands'
import { onEvent } from './api/events'
import { addStates, designationKey } from './comets'

export function useAddedBodies() {
  const records = ref<CommandRecord[]>([])
  const tables = ref<BodyTable[]>([])

  async function loadAdded() {
    const [cmds, bodies] = await Promise.allSettled([
      listCommands({ category: 'created', limit: 500 }),
      getBodies(),
    ])
    if (cmds.status === 'fulfilled') records.value = cmds.value
    if (bodies.status === 'fulfilled') tables.value = bodies.value.tables ?? []
  }

  function upsert(r: CommandRecord) {
    const i = records.value.findIndex((x) => x.id === r.id)
    if (i >= 0) records.value[i] = r
    else records.value = [r, ...records.value]
  }

  let off: (() => void) | undefined
  onMounted(() => {
    loadAdded()
    off = onEvent('command', (e: { data?: CommandRecord }) => {
      const r = e.data
      if (r && (r.kind === 'project.create' || r.kind === 'project.delete')) upsert(r)
    })
  })
  onUnmounted(() => off?.())

  const states = computed(() => addStates(records.value, tables.value))
  const stateOf = (designation: string) => states.value.get(designationKey(designation))
  function failure(designation: string): string {
    const st = stateOf(designation)
    return st?.state === 'failed' ? st.message : ''
  }

  return { upsert, stateOf, failure }
}
