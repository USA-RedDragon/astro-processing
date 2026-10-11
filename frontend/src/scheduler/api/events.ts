import { onEvent as onLiveEvent, onReconnect as onLiveReconnect } from '@/lib/events'

type Handler = (data: never) => void

// The scheduler pages share the app's one event stream (/events), which
// relays everything the stacker sends: its scheduler state and commands as
// well as previews, masters and subs.

/** onEvent calls h with each message of the given type, or every message for '*'. */
export function onEvent(type: string, h: Handler): () => void {
  return onLiveEvent((e) => {
    if (type === '*' || e.type === type) h(e as never)
  })
}

/**
 * onReconnect calls h after the stream comes back from a drop, when events
 * sent while it was down may have been missed.
 */
export function onReconnect(h: () => void): () => void {
  return onLiveReconnect(h)
}
