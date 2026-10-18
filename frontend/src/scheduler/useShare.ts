import { onScopeDispose, ref, watch } from 'vue'
import { getShare, type Share } from './api/binaries'
import { latestOnly } from './latest'

/**
 * useShare loads the shareable picture of the source id() names and, while it
 * is still being made, asks again every `every` ms. A new id drops any answer
 * still on its way for the old one and stops its polling.
 */
export function useShare(id: () => number | null, every = 15000) {
  const share = ref<Share | null>(null)
  const error = ref('')
  const loading = ref(false)
  const req = latestOnly()
  let timer: ReturnType<typeof setTimeout> | undefined

  function stop() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  async function load(fresh = true) {
    stop()
    const sid = id()
    if (fresh) {
      share.value = null
      error.value = ''
    }
    if (!sid) {
      req.cancel()
      loading.value = false
      return
    }
    const current = req.next()
    if (fresh) loading.value = true
    try {
      const s = await getShare(sid)
      if (!current()) return
      share.value = s
      error.value = ''
    } catch (e) {
      if (!current()) return
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (current()) {
        loading.value = false
        if (share.value?.state === 'pending') timer = setTimeout(() => load(false), every)
      }
    }
  }

  watch(id, () => load(), { immediate: true })
  onScopeDispose(() => {
    stop()
    req.cancel()
  })

  return { share, error, loading, reload: () => load() }
}
