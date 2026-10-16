import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import {
  type ActivityItem,
  bytes,
  failure,
  fraction,
  indeterminate,
  notes,
  plural,
  progressText,
  shown,
  stackingItems,
  stateText,
} from '@/lib/activity';
import { clock, shortDate } from '@/scheduler/format';

const now = Date.UTC(2026, 9, 16, 4, 20);
const iso = (ms: number) => new Date(ms).toISOString();

const item = (o: Partial<ActivityItem>): ActivityItem => ({
  id: o.kind ?? 'x',
  kind: 'x',
  label: 'X',
  state: 'running',
  done: 0,
  total: 0,
  queued: 0,
  ...o,
});

describe('activity helpers', () => {
  it('words measured progress with the unit, bytes and details', () => {
    expect(progressText(item({ done: 412, total: 794, unit: 'nights' }))).toBe('412 of 794 nights');
    expect(progressText(item({ done: 0, total: 1, unit: 'sectors' }))).toBe('0 of 1 sector');
    expect(progressText(item({ done: 1, total: 3, unit: 'bodies' }))).toBe('1 of 3 bodies');
    expect(progressText(item({ done: 120e6, total: 2.3e9, unit: 'bytes' }))).toBe('120.0 MB of 2.30 GB');
    expect(progressText(item({ done: 5e6, total: 0, unit: 'bytes' }))).toBe('5.0 MB so far');
    expect(progressText(item({ done: 160, total: 200, unit: 'tenths', detail: 'now −6.0 °C, target −10.0 °C' }))).toBe(
      'now −6.0 °C, target −10.0 °C',
    );
    expect(progressText(item({}))).toBe('');
    expect(bytes(512)).toBe('512 bytes');
    expect(plural(1, 'flat sets')).toBe('flat set');
    expect(plural(2, 'body')).toBe('bodies');
  });

  it('gives a fraction only when a total is known, and an indeterminate bar only while running', () => {
    expect(fraction(item({ done: 1, total: 4 }))).toBe(25);
    expect(fraction(item({ done: 9, total: 4 }))).toBe(100);
    expect(fraction(item({ total: 0 }))).toBeNull();
    expect(indeterminate(item({ total: 0 }))).toBe(true);
    expect(indeterminate(item({ total: 0, state: 'queued' }))).toBe(false);
    expect(indeterminate(item({ done: 1, total: 2 }))).toBe(false);
  });

  it('notes the queue and the next automatic run in the site zone', () => {
    const next = now + 57 * 60000;
    const it = item({ queued: 2, queue_unit: 'targets', next_run: iso(next) });
    expect(notes(it, now)).toEqual(['2 targets queued', `next automatic run at ${clock(next)}`]);
    expect(notes(item({ queued: 1, queue_unit: 'stars' }), now)).toEqual(['1 star queued']);
    const later = now + 20 * 86400000;
    expect(notes(item({ next_run: iso(later) }), now)).toEqual([`next automatic run at ${shortDate(later)} ${clock(later)}`]);
  });

  it('words failures and the state', () => {
    const at = now - 3600000;
    const f = item({ state: 'failed', last_failed: iso(at), last_error: 'ran out of its time limit' });
    expect(failure(f, now)).toBe(`Failed at ${clock(at)}: ran out of its time limit`);
    expect(failure(item({ last_error: 'old' }), now)).toBe('');
    expect(stateText(f)).toBe('Failed');
    expect(stateText(item({ done: 1, total: 3 }))).toBe('33%');
    expect(stateText(item({}))).toBe('Running');
    expect(stateText(item({ state: 'queued' }))).toBe('Waiting');
  });

  it('lists failed, then running, then queued work and hides idle work', () => {
    const list = shown([
      item({ id: 'a', state: 'queued' }),
      item({ id: 'b', state: 'idle' }),
      item({ id: 'c', state: 'running' }),
      item({ id: 'd', state: 'failed' }),
    ]);
    expect(list.map((i) => i.id)).toEqual(['d', 'c', 'a']);
  });

  it('shows stacking workers and the sub backlog as items', () => {
    const items = stackingItems(
      [{ object: 'M 31', filter: 'Red', stage: 'registering', done: 3, total: 10, started: iso(now) }],
      { lights_pending: 5, lights_done: 15, dead: 2, previews_pending: 0 },
    );
    expect(items[0]).toMatchObject({ label: 'Stacking', current: 'M 31 · Red: Aligning', done: 3, total: 10 });
    expect(items[1]).toMatchObject({ label: 'Subs to check', done: 15, total: 20, state: 'running', warning: '2 subs failed 5 times' });
    expect(stackingItems([], { lights_pending: 0, lights_done: 9, dead: 0, previews_pending: 0 })).toEqual([]);
  });
});

class FakeSource {
  static last: FakeSource | null = null;
  static CLOSED = 2;
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  constructor() {
    FakeSource.last = this;
  }
  close() {}
  send(e: object) {
    this.onmessage?.({ data: JSON.stringify(e) });
  }
}

describe('ProcessingIndicator', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('EventSource', FakeSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('spins while any work is busy and lists every item with a bar', async () => {
    const { default: ProcessingIndicator } = await import('@/components/ProcessingIndicator.vue');
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp(ProcessingIndicator);
    app.mount(el);
    expect(el.querySelector('button')).toBeNull();
    FakeSource.last!.send({
      type: 'activity',
      data: {
        items: [
          { id: 'discoveries', kind: 'discoveries', label: 'Discoveries re-check', state: 'running', done: 412, total: 794, unit: 'nights', queued: 0 },
          {
            id: 'vetting:pod',
            kind: 'vetting',
            label: 'Vetting',
            state: 'running',
            done: 0,
            total: 0,
            current: 'Andromeda field: starting',
            queued: 2,
            queue_unit: 'targets',
          },
          { id: 'tess', kind: 'tess', label: 'TESS light curves', state: 'idle', done: 0, total: 0, queued: 0 },
          {
            id: 'vsx',
            kind: 'catalog-mirror-vsx',
            label: 'VSX catalogue mirror',
            state: 'failed',
            done: 0,
            total: 0,
            queued: 0,
            last_error: 'failed too many times',
          },
        ],
      },
    });
    await nextTick();
    const button = el.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('What is processing');
    expect(button.querySelector('.animate-spin')).not.toBeNull();
    button.click();
    await nextTick();
    const rows = [...el.querySelectorAll('[role="listitem"]')];
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['catalog-mirror-vsx', 'discoveries', 'vetting']);
    for (const r of rows) {
      expect(r.querySelector('[role="progressbar"], [data-slot="progress"]')).not.toBeNull();
    }
    expect(rows[1].textContent).toContain('412 of 794 nights');
    expect(rows[2].querySelector('.indeterminate')).not.toBeNull();
    expect(rows[2].textContent).toContain('2 targets queued');
    expect(rows[0].textContent).toContain('Failed: failed too many times');
    app.unmount();
    el.remove();
  });

  it('shows a warning button when work failed and nothing is busy', async () => {
    const { default: ProcessingIndicator } = await import('@/components/ProcessingIndicator.vue');
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp(ProcessingIndicator);
    app.mount(el);
    FakeSource.last!.send({
      type: 'activity',
      data: { items: [{ id: 'v', kind: 'vetting', label: 'Vetting', state: 'failed', done: 0, total: 0, queued: 0 }] },
    });
    await nextTick();
    const button = el.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Background work that failed');
    expect(button.querySelector('.animate-spin')).toBeNull();
    app.unmount();
    el.remove();
  });
});
