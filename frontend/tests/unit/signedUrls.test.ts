import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import MastersCard from '@/components/MastersCard.vue';
import { onReconnectOrUrlsAging, onUrlsAging, samePicture, SIGNED_URL_REFRESH_MS } from '@/lib/signedUrls';
import type { FilterMaster } from '@/graphql/graphql';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('onReconnectOrUrlsAging', () => {
  it('refreshes before the stacker\'s one-hour signatures expire, until stopped', () => {
    vi.useFakeTimers();
    expect(SIGNED_URL_REFRESH_MS).toBeLessThan(60 * 60 * 1000);
    const refresh = vi.fn();
    const stop = onReconnectOrUrlsAging(refresh);
    vi.advanceTimersByTime(SIGNED_URL_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(SIGNED_URL_REFRESH_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('onUrlsAging', () => {
  it('refreshes on the signature clock only, until stopped', () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const stop = onUrlsAging(refresh);
    vi.advanceTimersByTime(SIGNED_URL_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(SIGNED_URL_REFRESH_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('MastersCard', () => {
  it('moves to a newly signed preview URL of an unchanged master', async () => {
    const loads: (() => void)[] = [];
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      set src(_: string) { loads.push(() => this.onload?.()); }
    });
    const master = (sig: string) => ({
      filter: 'Blue', subs: 145, exposure_hours: 16.25, effective_hours: 11.25, width: 6248, height: 4176,
      updated_at: '2026-10-10T08:52:09Z', master_url: `https://s3.example/master.fit?sig=${sig}`,
      preview_url: `https://s3.example/preview.jpg?sig=${sig}`,
    }) as unknown as FilterMaster;
    const props = reactive({ masters: [master('a')] });
    const el = document.createElement('div');
    const app = createApp({ render: () => h(MastersCard, props) });
    app.mount(el);
    await nextTick();
    const src = () => el.querySelector('img')!.getAttribute('src');
    expect(src()).toContain('sig=a');
    props.masters = [master('b')];
    await nextTick();
    expect(src()).toContain('sig=a');
    loads.forEach((l) => l());
    await nextTick();
    expect(src()).toContain('sig=b');
    app.unmount();
  });
});

const signed = (sig: string, at: string) =>
  `https://s3.example/preview.jpg?X-Amz-Date=${at}&X-Amz-Expires=3600&X-Amz-Signature=${sig}`;

describe('samePicture', () => {
  it('keeps a link to an unchanged picture while it lasts past the next refresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T12:10:00Z'));
    const a = signed('a', '20261011T120000Z');
    const b = signed('b', '20261011T120900Z');
    expect(samePicture(a, 't1', b, 't1')).toBe(true);
    expect(samePicture(a, 't1', b, 't2')).toBe(false);
    expect(samePicture(a, 't1', 'https://s3.example/other.jpg?X-Amz-Signature=b', 't1')).toBe(false);
    expect(samePicture(undefined, undefined, b, 't1')).toBe(false);
    vi.setSystemTime(new Date('2026-10-11T12:16:00Z'));
    expect(samePicture(a, 't1', b, 't1')).toBe(false);
  });
});

describe('MastersCard re-signing', () => {
  it('keeps showing an unchanged master instead of downloading it under a new signature', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T12:01:00Z'));
    const loads: string[] = [];
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      set src(u: string) { loads.push(u); }
    });
    const master = (sig: string, at: string, updated: string) => ({
      filter: 'Blue', subs: 145, exposure_hours: 16.25, effective_hours: 11.25, width: 6248, height: 4176,
      updated_at: updated, master_url: 'https://s3.example/master.fit', preview_url: signed(sig, at),
    }) as unknown as FilterMaster;
    const props = reactive({ masters: [master('a', '20261011T120000Z', 'u1')] });
    const el = document.createElement('div');
    const app = createApp({ render: () => h(MastersCard, props) });
    app.mount(el);
    await nextTick();
    props.masters = [master('b', '20261011T120100Z', 'u1')];
    await nextTick();
    expect(loads).toHaveLength(0);
    expect(el.querySelector('img')!.getAttribute('src')).toContain('Signature=a');
    props.masters = [master('c', '20261011T120100Z', 'u2')];
    await nextTick();
    expect(loads).toHaveLength(1);
    app.unmount();
  });
});
