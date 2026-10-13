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

export const MIN_FOV = 0.01
export const MAX_FOV = 120

export function snapFov(fov: number): number {
  const f = Math.min(MAX_FOV, Math.max(MIN_FOV, fov))
  const snapped = 2 ** (Math.ceil(Math.log2(f) * 8 - 1e-9) / 8)
  return Math.min(MAX_FOV, Math.round(snapped * 1000) / 1000)
}

export function cutoutUrl(p: CutoutParams): string {
  return (
    API_BASE +
    '/sky/cutout' +
    query({
      ra: (((p.ra % 360) + 360) % 360).toFixed(3),
      dec: p.dec.toFixed(3),
      fov: Math.min(MAX_FOV, Math.max(MIN_FOV, p.fov)).toFixed(3),
      rotation: (p.rotation ?? 0).toFixed(1),
      width: Math.round(p.width),
      height: Math.round(p.height),
    })
  )
}

const MAX_PARALLEL = 4
const KEEP = 200
let running = 0
const waiting: { go: () => void }[] = []
const done = new Map<string, string>()
interface Job {
  promise: Promise<string>
  users: number
  ctrl: AbortController
}
const pending = new Map<string, Job>()

export class CutoutLimited extends Error {
  constructor(readonly wait: number) {
    super('The sky survey is busy')
  }
}

const aborted = () => new DOMException('aborted', 'AbortError')

function slot(signal: AbortSignal): Promise<() => void> {
  const release = () => {
    const next = waiting.shift()
    if (next) next.go()
    else running--
  }
  if (signal.aborted) return Promise.reject(aborted())
  if (running < MAX_PARALLEL) {
    running++
    return Promise.resolve(release)
  }
  return new Promise((resolve, reject) => {
    const stop = () => {
      const i = waiting.indexOf(w)
      if (i >= 0) waiting.splice(i, 1)
      reject(aborted())
    }
    const w = {
      go: () => {
        signal.removeEventListener('abort', stop)
        resolve(release)
      },
    }
    waiting.push(w)
    signal.addEventListener('abort', stop, { once: true })
  })
}

function remember(src: string, url: string) {
  done.set(src, url)
  while (done.size > KEEP) {
    const [k, v] = done.entries().next().value as [string, string]
    done.delete(k)
    URL.revokeObjectURL(v)
  }
}

function start(src: string): Job {
  const ctrl = new AbortController()
  const promise = (async () => {
    const release = await slot(ctrl.signal)
    try {
      const res = await fetch(src, { signal: ctrl.signal })
      if (res.status === 429)
        throw new CutoutLimited(
          Math.min(60, Math.max(2, Number(res.headers.get('Retry-After')) || 5)),
        )
      if (!res.ok) throw new Error(`cutout ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      remember(src, url)
      return url
    } finally {
      release()
    }
  })()
  const job = { promise, users: 0, ctrl }
  pending.set(src, job)
  void promise
    .catch(() => undefined)
    .finally(() => {
      if (pending.get(src) === job) pending.delete(src)
    })
  return job
}

export function fetchCutout(src: string, signal?: AbortSignal): Promise<string> {
  const hit = done.get(src)
  if (hit) {
    done.delete(src)
    done.set(src, hit)
    return Promise.resolve(hit)
  }
  const job = pending.get(src) ?? start(src)
  if (!signal) return job.promise
  if (signal.aborted) return Promise.reject(aborted())
  job.users++
  return new Promise<string>((resolve, reject) => {
    const leave = () => {
      if (--job.users === 0 && pending.get(src) === job) {
        pending.delete(src)
        job.ctrl.abort()
      }
      reject(aborted())
    }
    signal.addEventListener('abort', leave, { once: true })
    job.promise.then(
      (v) => {
        signal.removeEventListener('abort', leave)
        job.users--
        resolve(v)
      },
      (e: unknown) => {
        signal.removeEventListener('abort', leave)
        job.users--
        reject(e)
      },
    )
  })
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    const stop = () => {
      clearTimeout(t)
      resolve(false)
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', stop)
      resolve(true)
    }, ms)
    signal.addEventListener('abort', stop, { once: true })
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
    const src = cutoutUrl(p)
    state.value = 'loading'
    let failures = 0
    for (;;) {
      try {
        const got = await fetchCutout(src, signal)
        if (signal.aborted) return
        url.value = got
        state.value = 'ready'
        return
      } catch (e) {
        if (signal.aborted) return
        if (e instanceof CutoutLimited) {
          state.value = 'limited'
          retryIn.value = e.wait
          if (!(await sleep(e.wait * 1000, signal))) return
          state.value = 'loading'
          continue
        }
        if (++failures >= 2) {
          state.value = 'failed'
          return
        }
        if (!(await sleep(5000, signal))) return
      }
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
  })

  return { url, state, retryIn }
}
