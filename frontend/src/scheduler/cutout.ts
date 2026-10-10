import { onUnmounted, ref, watch, type Ref } from 'vue'
import { API_BASE, query } from './api/client'

export interface CutoutParams {
  ra: number
  dec: number
  fov: number
  rotation?: number
  width: number
  height: number
}

export type CutoutState = 'idle' | 'loading' | 'ready' | 'limited' | 'failed'

export function cutoutUrl(p: CutoutParams): string {
  return (
    API_BASE +
    '/sky/cutout' +
    query({
      ra: (((p.ra % 360) + 360) % 360).toFixed(5),
      dec: p.dec.toFixed(5),
      fov: Math.min(30, Math.max(0.01, p.fov)).toFixed(3),
      rotation: p.rotation ?? 0,
      width: Math.round(p.width),
      height: Math.round(p.height),
    })
  )
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

export function useCutout(params: () => CutoutParams | null, target?: Ref<Element | null>) {
  const url = ref('')
  const state = ref<CutoutState>('idle')
  const retryIn = ref(0)
  const visible = ref(!target)
  let ctrl: AbortController | undefined
  let observer: IntersectionObserver | undefined

  async function load() {
    ctrl?.abort()
    const p = params()
    if (!p || !visible.value) return
    ctrl = new AbortController()
    const signal = ctrl.signal
    state.value = 'loading'
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(cutoutUrl(p), { signal })
        if (res.status === 429) {
          const wait = Math.min(60, Number(res.headers.get('Retry-After')) || 5)
          state.value = 'limited'
          retryIn.value = wait
          await sleep(wait * 1000, signal)
          state.value = 'loading'
          continue
        }
        if (!res.ok) {
          state.value = 'failed'
          return
        }
        const blob = await res.blob()
        if (url.value) URL.revokeObjectURL(url.value)
        url.value = URL.createObjectURL(blob)
        state.value = 'ready'
        return
      }
      state.value = 'failed'
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) state.value = 'failed'
    }
  }

  if (target) {
    watch(
      target,
      (el) => {
        observer?.disconnect()
        if (!el || typeof IntersectionObserver === 'undefined') {
          visible.value = !!el
          return
        }
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((x) => x.isIntersecting)) {
              visible.value = true
              observer?.disconnect()
            }
          },
          { rootMargin: '200px' },
        )
        observer.observe(el)
      },
      { immediate: true },
    )
  }

  watch([() => JSON.stringify(params()), visible], load, { immediate: true })

  onUnmounted(() => {
    ctrl?.abort()
    observer?.disconnect()
    if (url.value) URL.revokeObjectURL(url.value)
  })

  return { url, state, retryIn }
}
