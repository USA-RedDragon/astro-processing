import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import MosaicCard from '@/components/MosaicCard.vue';
import type { Mosaic } from '@/graphql/graphql';

describe('MosaicCard', () => {
  it('does not show the preview canvas size as the mosaic size', async () => {
    const mosaic = {
      filter: 'Blue', panels: 4, panels_total: 4, width: 2255, height: 1516,
      updated_at: '2026-10-09T21:42:27Z', master_url: 'https://s3.example/mosaic.fit',
      preview_url: 'https://s3.example/preview.jpg', linear_url: '', crop: null,
    } as unknown as Mosaic;
    const el = document.createElement('div');
    const app = createApp({ render: () => h(MosaicCard, { mosaics: [mosaic], project: '' }) });
    app.mount(el);
    await nextTick();
    expect(el.textContent).toContain('4 of 4 panels');
    expect(el.textContent).not.toContain('2255');
    app.unmount();
  });
});
