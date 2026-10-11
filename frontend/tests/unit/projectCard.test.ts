import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
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
});
