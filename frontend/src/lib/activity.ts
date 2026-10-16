import { clock, shortDate, toDate } from '@/scheduler/format';
import type { Backlog, Worker } from '@/lib/events';

export type ActivityState = 'running' | 'queued' | 'idle' | 'failed';

export interface ActivityItem {
  id: string;
  kind: string;
  label: string;
  state: ActivityState;
  done: number;
  total: number;
  unit?: string;
  detail?: string;
  current?: string;
  queued: number;
  queue_unit?: string;
  started?: string;
  next_run?: string;
  last_finished?: string;
  last_failed?: string;
  last_error?: string;
  warning?: string;
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

// stackingItems shows the stacker's workers and its sub backlog in the same
// shape as the other background work.
export function stackingItems(workers: Worker[], backlog: Backlog | null): ActivityItem[] {
  const out: ActivityItem[] = workers.map((w) => ({
    id: `stacking:${w.object}:${w.filter}`,
    kind: 'stacking',
    label: 'Stacking',
    state: 'running',
    done: w.done,
    total: w.total,
    unit: 'subs',
    current: `${w.object} · ${w.filter}: ${stageLabels[w.stage] ?? w.stage}`,
    queued: 0,
    started: w.started,
  }));
  if (backlog && backlog.lights_pending > 0) {
    out.push({
      id: 'stacking:backlog',
      kind: 'stacking-backlog',
      label: 'Subs to check',
      state: workers.length > 0 ? 'running' : 'queued',
      done: backlog.lights_done,
      total: backlog.lights_done + backlog.lights_pending,
      unit: 'subs',
      queued: 0,
      warning: backlog.dead > 0 ? `${backlog.dead} ${plural(backlog.dead, 'sub')} failed 5 times` : undefined,
    });
  }
  return out;
}

const busyStates: ActivityState[] = ['running', 'queued'];

export function isBusy(it: ActivityItem): boolean {
  return busyStates.includes(it.state);
}

// shown is the work worth listing: busy or failed, busy first.
export function shown(items: ActivityItem[]): ActivityItem[] {
  const rank: Record<ActivityState, number> = { failed: 0, running: 1, queued: 2, idle: 3 };
  return items
    .filter((it) => it.state !== 'idle')
    .map((it, i) => ({ it, i }))
    .sort((a, b) => rank[a.it.state] - rank[b.it.state] || a.i - b.i)
    .map(({ it }) => it);
}

// fraction is done of total as a percentage, or null when nothing
// measurable is known.
export function fraction(it: ActivityItem): number | null {
  if (!(it.total > 0)) return null;
  return Math.min(100, Math.max(0, (100 * it.done) / it.total));
}

// indeterminate says whether the bar can only show that work runs.
export function indeterminate(it: ActivityItem): boolean {
  return it.state === 'running' && fraction(it) === null;
}

const irregular: Record<string, string> = { bodies: 'body', 'flat sets': 'flat set' };

export function plural(n: number, unit: string): string {
  if (n === 1) {
    if (irregular[unit]) return irregular[unit];
    return unit.endsWith('s') ? unit.slice(0, -1) : unit;
  }
  if (unit.endsWith('s')) return unit;
  return unit.endsWith('y') ? unit.slice(0, -1) + 'ies' : unit + 's';
}

const num = (n: number) => Math.round(n).toLocaleString('en-US');

export function bytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kB`;
  return `${n} bytes`;
}

// progressText is the measured progress in words, empty when there is none.
export function progressText(it: ActivityItem): string {
  if (it.detail) return it.detail;
  if (it.unit === 'bytes') {
    if (it.total > 0) return `${bytes(it.done)} of ${bytes(it.total)}`;
    return it.done > 0 ? `${bytes(it.done)} so far` : '';
  }
  if (!(it.total > 0)) return '';
  return `${num(it.done)} of ${num(it.total)} ${plural(it.total, it.unit ?? '')}`.trim();
}

// when is a time in the site's zone, with the date when it is not within
// the next or last day.
export function when(v: string | undefined, now: number): string {
  const d = toDate(v);
  if (!d) return '';
  if (Math.abs(d.getTime() - now) < 20 * 3600 * 1000) return clock(d);
  return `${shortDate(d)} ${clock(d)}`;
}

// notes are the short facts after the progress: queue, next run.
export function notes(it: ActivityItem, now: number): string[] {
  const out: string[] = [];
  if (it.queued > 0) {
    out.push(`${num(it.queued)} ${it.queue_unit ? plural(it.queued, it.queue_unit) + ' ' : ''}queued`);
  }
  if (it.next_run) {
    out.push(`next automatic run at ${when(it.next_run, now)}`);
  }
  return out;
}

// failure is the last failure in words, for failed items.
export function failure(it: ActivityItem, now: number): string {
  if (it.state !== 'failed') return '';
  const at = when(it.last_failed, now);
  const why = it.last_error || 'failed';
  return at ? `Failed at ${at}: ${why}` : `Failed: ${why}`;
}

export function stateText(it: ActivityItem): string {
  const pct = fraction(it);
  switch (it.state) {
    case 'running':
      return pct === null ? 'Running' : `${Math.floor(pct)}%`;
    case 'queued':
      return 'Waiting';
    case 'failed':
      return 'Failed';
    default:
      return '';
  }
}
