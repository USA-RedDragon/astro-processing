import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeSource {
  static last: FakeSource | null = null;
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSource.last = this;
  }
  send(e: object) {
    this.onmessage?.({ data: JSON.stringify(e) });
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeSource.last = null;
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
  it('calls reconnect handlers only after the stream drops and comes back', async () => {
    const { onEvent, onReconnect } = await import('@/scheduler/api/events');
    const back = vi.fn();
    const subs = vi.fn();
    onReconnect(back);
    onEvent('subs', subs);
    const s = FakeSource.last!;
    expect(s.url).toBe('/api/v1/events');
    s.onopen?.();
    expect(back).not.toHaveBeenCalled();
    s.onerror?.();
    s.onopen?.();
    expect(back).toHaveBeenCalledTimes(1);
    s.send({ type: 'subs', object: 'M 31' });
    expect(subs).toHaveBeenCalledWith({ type: 'subs', object: 'M 31' });
  });
});
