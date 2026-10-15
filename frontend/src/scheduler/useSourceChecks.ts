import { onScopeDispose, ref, watch } from 'vue'
import { getSourceChecks, runSourceChecks, type SourceChecks } from './api/discoveries'
import { latestOnly } from './latest'
import { isActive } from './vetting'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * useSourceChecks loads the automatic checks of the source id() names and,
 * while they are queued or running, asks again every `every` ms. A new id
 * drops any answer still on its way for the old one and stops its polling.
 */
export function useSourceChecks(id: () => number | null, every = 15000) {
  const checks = ref<SourceChecks | null>(null)
  const error = ref('')
  const runError = ref('')
  const loading = ref(false)
  const starting = ref(false)
  const req = latestOnly()
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    stop()
    if (isActive(checks.value)) timer = setTimeout(() => load(false), every)
  }

  async function load(fresh = true) {
    stop()
    const sid = id()
    if (fresh) {
      checks.value = null
      error.value = ''
      runError.value = ''
    }
    if (!sid) {
      req.cancel()
      loading.value = false
      return
    }
    const current = req.next()
    if (fresh) loading.value = true
    try {
      const c = await getSourceChecks(sid)
      if (!current()) return
      checks.value = c
      error.value = ''
    } catch (e) {
      if (!current()) return
      error.value = message(e)
    } finally {
      if (current()) {
        loading.value = false
        schedule()
      }
    }
  }

  async function run() {
    const sid = id()
    if (!sid || starting.value) return
    stop()
    starting.value = true
    runError.value = ''
    const current = req.next()
    try {
      const c = await runSourceChecks(sid)
      if (current()) {
        checks.value = c
        error.value = ''
      }
    } catch (e) {
      if (current()) runError.value = message(e)
    } finally {
      starting.value = false
      if (current()) schedule()
    }
  }

  watch(id, () => load(), { immediate: true })
  onScopeDispose(() => {
    stop()
    req.cancel()
  })

  return { checks, error, runError, loading, starting, reload: () => load(), run }
}
