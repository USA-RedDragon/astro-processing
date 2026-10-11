import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import MastersCard from '@/components/MastersCard.vue';
import { localNorm } from '@/lib/localNorm';
import type { FilterMaster } from '@/graphql/graphql';

const base = { local_norm: null, local_norm_subs: null, local_norm_uneven: null, local_norm_threshold: 0.1 };

describe('localNorm', () => {
  it('says it ran, on how many subs, and the coverage that decided it', () => {
    expect(localNorm({ ...base, local_norm: true, local_norm_subs: 9, local_norm_uneven: 0.234 })).toBe(
      'Local normalization on 9 subs: 23% of the frame under 90% coverage, runs above 10%',
    );
  });

  it('says it was off with the coverage under the threshold', () => {
    expect(localNorm({ ...base, local_norm: false, local_norm_subs: 0, local_norm_uneven: 0.0165 })).toBe(
      'Local normalization off: 1.7% of the frame under 90% coverage, runs above 10%',
    );
  });

  it('does not guess for a master stacked before it was recorded', () => {
    expect(localNorm(base)).toBe('Local normalization not recorded yet');
    expect(localNorm({ ...base, local_norm_uneven: 0.05 })).toBe(
      'Local normalization, subs not counted yet: 5.0% of the frame under 90% coverage, runs above 10%',
    );
    expect(localNorm({ ...base, local_norm: false, local_norm_subs: 0 })).toBe(
      'Local normalization off; coverage not measured yet',
    );
  });

  it('shows nothing for a stacker that does not report it', () => {
    expect(localNorm({ ...base, local_norm_threshold: null })).toBe('');
  });
});

describe('MastersCard local normalization', () => {
  const master = (filter: string, extra: Partial<FilterMaster>): FilterMaster => ({
    filter,
    subs: 12,
    exposure_hours: 1,
    effective_hours: 0.8,
    width: 100,
    height: 100,
    updated_at: '2026-10-10T08:45:06Z',
    master_url: 'https://example.invalid/m.fit',
    preview_url: 'https://example.invalid/p.jpg',
    linear_url: 'https://example.invalid/l.bin',
    ...extra,
  });

  it('shows the line per master, and none for an older stacker', async () => {
    const el = document.createElement('div');
    const app = createApp({
      render: () => h(MastersCard, {
        masters: [
          master('Red', { local_norm: true, local_norm_subs: 9, local_norm_uneven: 0.23, local_norm_threshold: 0.1 }),
          master('Blue', {}),
        ],
      }),
    });
    app.mount(el);
    await nextTick();
    const lines = el.querySelectorAll('[data-testid="local-norm"]');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toContain('Local normalization on 9 subs');
    app.unmount();
  });
});
