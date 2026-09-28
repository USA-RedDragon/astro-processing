// One shared connection to the backend's event stream: rendered previews,
// updated masters, and what the stacker is working on.
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
  id: number;
  type: 'preview' | 'master';
  object: string;
  filter?: string;
  key?: string;
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
};
