// One shared connection to the backend's event stream: rendered previews,
// updated masters, what the stacker is working on, the observatory
// scheduler's state and commands.
import { reactive } from 'vue';

export interface Worker {
  object: string;
  filter: string;
  stage: string;
  done: number;
  total: number;
  started: string;
}

export interface Backlog {
  lights_pending: number;
  lights_done: number;
  dead: number;
  previews_pending: number;
}

export interface LiveEvent {
  id?: number;
  // preview, master and mosaic come from the stacker, frames when it indexes
  // new files, subs when it measures or triages a target's lights; data
  // from the backend when scheduler tables change; scheduler and command
  // carry the observatory scheduler's state and commands in data.
  type: 'preview' | 'master' | 'mosaic' | 'frames' | 'subs' | 'data' | 'scheduler' | 'command';
  object?: string;
  filter?: string;
  key?: string;
  tables?: string[];
  data?: unknown;
  time: string;
}

export const status = reactive({
  connected: false,
  workers: [] as Worker[],
  backlog: null as Backlog | null,
});

const handlers = new Set<(e: LiveEvent) => void>();
const reconnectHandlers = new Set<() => void>();
let source: EventSource | null = null;
let dropped = false;
// How long to wait before opening a new stream after the browser gave up.
const RECONNECT_MS = 5000;

function connect() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/events');
  source.onopen = () => {
    status.connected = true;
    if (dropped) {
      // The browser reconnects with the last event ID and the backend
      // replays what it still holds; refetch in case it held too little.
      dropped = false;
      reconnectHandlers.forEach((h) => h());
    }
  };
  source.onerror = () => {
    status.connected = false;
    dropped = true;
    // The browser retries a dropped stream itself, but gives up for good
    // when the server answers with an error (a 502 during a deploy, say).
    if (source?.readyState === EventSource.CLOSED) {
      source.close();
      source = null;
      setTimeout(connect, RECONNECT_MS);
    }
  };
  source.onmessage = (m) => {
    let e;
    try {
      e = JSON.parse(m.data);
    } catch {
      return;
    }
    if (e.type === 'status') {
      status.workers = e.workers ?? [];
      status.backlog = e.backlog ?? null;
      return;
    }
    handlers.forEach((h) => h(e as LiveEvent));
  };
}

// onEvent calls h for each preview and master event; it returns a function
// that stops it.
export function onEvent(h: (e: LiveEvent) => void): () => void {
  connect();
  handlers.add(h);
  return () => handlers.delete(h);
}

// throttle returns run, which calls fn once delay ms after the first call
// in a burst, and stop, which cancels a pending call.
export function throttle(fn: () => void, delay: number): { run: () => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    run: () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, delay);
    },
    stop: () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

// onChange calls reload, at most every delay ms, when any of the scheduler
// tables change (a "data" event), when the stacker sends an event whose
// type is listed (such as "frames" or "master"), and after the stream
// reconnects. objects, if given, limits stacker events to those about the
// targets it names. It returns a function that stops it.
export function onChange(
  tables: string[],
  reload: () => void,
  delay = 3000,
  objects?: () => string[],
): () => void {
  const t = throttle(reload, delay);
  const stopEvents = onEvent((e) => {
    if (e.type === 'data') {
      if ((e.tables ?? []).some((x) => tables.includes(x))) t.run();
      return;
    }
    if (!tables.includes(e.type)) return;
    if (objects && e.object && !objects().includes(e.object)) return;
    t.run();
  });
  const stopReconnect = onReconnect(t.run);
  return () => {
    stopEvents();
    stopReconnect();
    t.stop();
  };
}

// onReconnect calls h after the stream comes back from a drop.
export function onReconnect(h: () => void): () => void {
  connect();
  reconnectHandlers.add(h);
  return () => reconnectHandlers.delete(h);
}

// watchStatus starts the connection so status stays current.
export function watchStatus() {
  connect();
}

export const stageLabels: Record<string, string> = {
  starting: 'Starting',
  calibrating: 'Calibrating',
  registering: 'Aligning',
  adding: 'Adding to master',
  rebuilding: 'Rebuilding master',
  publishing: 'Saving',
  assembling: 'Assembling mosaic',
  linear_fit: 'LinearFit',
};
