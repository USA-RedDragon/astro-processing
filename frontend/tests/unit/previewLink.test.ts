import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import PreviewLink, { clearPreviewCache, signedUntil } from '@/components/PreviewLink.vue';

const link = (sig: string, date = '20261011T120000Z') =>
  `https://s3.example/p/sub.jpg?X-Amz-Date=${date}&X-Amz-Expires=3600&X-Amz-Signature=${sig}`;

function mount(props: { url?: string; missing?: string }) {
  const state = reactive({ fileName: 'sub_0001.fits', ...props });
  const stale = vi.fn();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp({ render: () => h(PreviewLink, { ...state, onStale: stale }) });
  app.mount(el);
  const button = () => el.querySelector('button')!;
  const img = () => document.body.querySelector('img');
  const text = () => document.body.textContent ?? '';
  const done = () => {
    app.unmount();
    el.remove();
  };
  return { state, stale, button, img, text, done };
}

beforeEach(() => {
  clearPreviewCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T12:10:00Z'));
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('signedUntil', () => {
  it('reads the expiry from the presigned parameters', () => {
    expect(signedUntil(link('a'))).toBe(Date.UTC(2026, 9, 11, 13, 0, 0));
    expect(signedUntil('https://s3.example/p/sub.jpg')).toBe(0);
    expect(signedUntil('not a url')).toBe(0);
  });
});

describe('PreviewLink', () => {
  it('says why there is no preview on hover', async () => {
    const v = mount({ missing: 'the stacker has not rendered a preview of it yet' });
    v.button().dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(v.img()).toBeNull();
    expect(v.text()).toContain('No preview: the stacker has not rendered a preview of it yet');
    v.done();
  });

  it('loads only on hover, then reuses the link that loaded while it is valid', async () => {
    const v = mount({ url: link('a') });
    expect(v.img()).toBeNull();
    v.button().dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(v.text()).toContain('Loading preview');
    v.img()!.dispatchEvent(new Event('load'));
    await nextTick();
    expect(v.text()).not.toContain('Loading preview');
    v.button().dispatchEvent(new MouseEvent('mouseleave'));
    v.state.url = link('b');
    await nextTick();
    v.button().dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(v.img()!.getAttribute('src')).toContain('Signature=a');
    v.button().dispatchEvent(new MouseEvent('mouseleave'));
    vi.setSystemTime(new Date('2026-10-11T12:56:00Z'));
    v.button().dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(v.img()!.getAttribute('src')).toContain('Signature=b');
    v.done();
  });

  it('asks once for a new link when the preview fails, then says it is gone', async () => {
    const v = mount({ url: link('a') });
    v.button().dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    v.img()!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(v.stale).toHaveBeenCalledTimes(1);
    expect(v.text()).toContain('Fetching a new one');
    v.state.url = link('b');
    await nextTick();
    expect(v.img()!.getAttribute('src')).toContain('Signature=b');
    v.img()!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(v.stale).toHaveBeenCalledTimes(1);
    expect(v.text()).toContain('may be gone from storage');
    v.done();
  });

  it('opens full screen on a tap where the screen cannot hover', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const v = mount({ url: link('a') });
    v.button().dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(v.img()).toBeNull();
    v.button().click();
    await nextTick();
    expect(v.img()!.getAttribute('src')).toContain('Signature=a');
    expect(v.text()).toContain('Tap anywhere to close');
    v.done();
  });
});
