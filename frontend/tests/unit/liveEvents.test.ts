import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeSource {
  static CLOSED = 2;
  readyState = 1;
  close() {
    this.readyState = FakeSource.CLOSED;
  }
  static last: FakeSource | null = null;
  static opened = 0;
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSource.last = this;
    FakeSource.opened++;
  }
  send(e: object) {
    this.onmessage?.({ data: JSON.stringify(e) });
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeSource.last = null;
  FakeSource.opened = 0;
  vi.stubGlobal('EventSource', FakeSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('onChange', () => {
  it('reloads once per burst for listed stacker events about the named targets', async () => {
    const { onChange } = await import('@/lib/events');
    const reload = vi.fn();
    const stop = onChange(['master', 'subs'], reload, 1000, () => ['M 31']);
    const s = FakeSource.last!;
    s.send({ type: 'master', object: 'M 33' });
    s.send({ type: 'preview', object: 'M 31' });
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
    s.send({ type: 'master', object: 'M 31' });
    s.send({ type: 'subs', object: 'M 31' });
    vi.advanceTimersByTime(1000);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
    s.send({ type: 'subs', object: 'M 31' });
    vi.advanceTimersByTime(1000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads for changed scheduler tables and after a reconnect', async () => {
    const { onChange } = await import('@/lib/events');
    const reload = vi.fn();
    onChange(['acquiredimage'], reload, 1000);
    const s = FakeSource.last!;
    s.send({ type: 'data', tables: ['project'] });
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
    s.send({ type: 'data', tables: ['acquiredimage'] });
    vi.advanceTimersByTime(1000);
    expect(reload).toHaveBeenCalledTimes(1);
    s.onopen?.();
    s.onerror?.();
    s.onopen?.();
    vi.advanceTimersByTime(1000);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe('scheduler events', () => {
  it('share the one stream and hear its reconnects', async () => {
    const live = await import('@/lib/events');
    const { onEvent, onReconnect } = await import('@/scheduler/api/events');
    live.watchStatus();
    const back = vi.fn();
    const subs = vi.fn();
    const command = vi.fn();
    onReconnect(back);
    onEvent('subs', subs);
    onEvent('command', command);
    const s = FakeSource.last!;
    expect(s.url).toBe('/events');
    expect(FakeSource.opened).toBe(1);
    s.send({ type: 'command', data: { status: 'applied' } });
    expect(command).toHaveBeenCalledWith({ type: 'command', data: { status: 'applied' } });
    expect(subs).not.toHaveBeenCalled();
    s.onopen?.();
    expect(back).not.toHaveBeenCalled();
    s.onerror?.();
    s.onopen?.();
    expect(back).toHaveBeenCalledTimes(1);
    s.send({ type: 'subs', object: 'M 31' });
    expect(subs).toHaveBeenCalledWith({ type: 'subs', object: 'M 31' });
  });
});

describe('stream recovery', () => {
  it('opens a new stream when the browser gives up on an error answer, then reloads', async () => {
    const { onReconnect } = await import('@/lib/events');
    const back = vi.fn();
    onReconnect(back);
    const first = FakeSource.last!;
    first.onopen?.();
    first.readyState = FakeSource.CLOSED;
    first.onerror?.();
    expect(FakeSource.opened).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(FakeSource.opened).toBe(2);
    FakeSource.last!.onopen?.();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
