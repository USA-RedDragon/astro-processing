import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import ProjectCard from '@/components/ProjectCard.vue';
import type { Project } from '@/graphql/graphql';

const project = (cover: Project['cover']) => ({
  id: '4', name: 'Galaxy Cluster', state: 'INACTIVE', priority: 'LOW', is_mosaic: true, targets: [],
  stats: { imaging: { desired_images: 0, accepted_images: 0, rejected_images: 0, acquired_images: 0 } },
  cover,
}) as unknown as Project;

const cover = (sig: string) => ({
  palette: 'RGB', filter: '', mosaic: true, preview_url: `https://s3.example/p.jpg?sig=${sig}`,
  updated_at: '2026-10-10T23:16:20Z',
}) as Project['cover'];

afterEach(() => vi.unstubAllGlobals());

describe('ProjectCard', () => {
  it('gives outline badges a background so they read over the cover picture', async () => {
    const el = document.createElement('div');
    const app = createApp({ render: () => h(ProjectCard, { project: project(cover('a')), planningState: 'ok' }) });
    app.mount(el);
    await nextTick();
    const outline = [...el.querySelectorAll('[data-slot="badge"]')].filter((b) => /Mosaic|LOW|INACTIVE/.test(b.textContent ?? ''));
    expect(outline).toHaveLength(3);
    for (const b of outline) expect(b.className).toContain('bg-background');
    app.unmount();
  });

  it('moves to a newly signed cover URL of an unchanged cover', async () => {
    const loads: (() => void)[] = [];
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      set src(_: string) { loads.push(() => this.onload?.()); }
    });
    const props = reactive({ project: project(cover('a')), planningState: 'ok' });
    const el = document.createElement('div');
    const app = createApp({ render: () => h(ProjectCard, props) });
    app.mount(el);
    await nextTick();
    const src = () => el.querySelector('img')!.getAttribute('src');
    expect(src()).toContain('sig=a');
    props.project.cover = cover('b');
    await nextTick();
    loads.forEach((l) => l());
    await nextTick();
    expect(src()).toContain('sig=b');
    app.unmount();
  });

  it('shows a plain box instead of a picture while the cover waits for data', async () => {
    const waiting = { palette: '', filter: '', mosaic: true, preview_url: '', updated_at: '2026-10-10T23:16:20Z',
      waiting: true } as Project['cover'];
    const el = document.createElement('div');
    const app = createApp({ render: () => h(ProjectCard, { project: project(waiting), planningState: 'ok' }) });
    app.mount(el);
    await nextTick();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('Cover waits for more data');
    expect(el.textContent).not.toContain('Cover:');
    app.unmount();
  });

  it('names the filter of a single-filter cover', async () => {
    const single = { palette: '', filter: 'Ha', mosaic: false, preview_url: 'https://s3.example/h.jpg',
      updated_at: '2026-10-10T23:16:20Z', waiting: false } as Project['cover'];
    const el = document.createElement('div');
    const app = createApp({ render: () => h(ProjectCard, { project: project(single), planningState: 'ok' }) });
    app.mount(el);
    await nextTick();
    expect(el.querySelector('img')!.getAttribute('src')).toBe('https://s3.example/h.jpg');
    expect(el.textContent).toContain('Cover: Ha');
    expect(el.textContent).not.toContain('Cover waits for more data');
    app.unmount();
  });
});
