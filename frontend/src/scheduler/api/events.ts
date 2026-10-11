import { API_BASE } from './client'

type Handler = (data: never) => void

const handlers = new Map<string, Set<Handler>>()
const reconnectHandlers = new Set<() => void>()
let source: EventSource | null = null
let dropped = false

function ensure() {
  if (source || typeof EventSource === 'undefined') return
  source = new EventSource(API_BASE + '/events')
  source.onopen = () => {
    if (!dropped) return
    dropped = false
    reconnectHandlers.forEach((h) => h())
  }
  source.onerror = () => {
    dropped = true
  }
  source.onmessage = (ev) => {
    let data: { type?: string }
    try {
      data = JSON.parse(ev.data)
    } catch {
      return
    }
    const set = handlers.get(data?.type ?? '')
    if (set) set.forEach((h) => h(data as never))
    const any = handlers.get('*')
    if (any) any.forEach((h) => h(data as never))
  }
}

export function onEvent(type: string, h: Handler): () => void {
  ensure()
  let set = handlers.get(type)
  if (!set) {
    set = new Set()
    handlers.set(type, set)
  }
  set.add(h)
  return () => set!.delete(h)
}

// onReconnect calls h after the stream comes back from a drop, when events
// sent while it was down may have been missed.
export function onReconnect(h: () => void): () => void {
  ensure()
  reconnectHandlers.add(h)
  return () => reconnectHandlers.delete(h)
}
