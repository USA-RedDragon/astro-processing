import type { FilterMaster } from '../graphql/graphql';

type LocalNormFields = Pick<
  FilterMaster,
  'local_norm' | 'local_norm_subs' | 'local_norm_uneven' | 'local_norm_threshold'
>;

function percent(share: number): string {
  const p = share * 100;
  return `${p < 10 ? p.toFixed(1) : p.toFixed(0)}%`;
}

/**
 * Says whether the stacker matched a master's sub skies by local
 * normalization, and the coverage that decided it. Empty for a stacker
 * that doesn't report it.
 */
export function localNorm(m: LocalNormFields): string {
  if (m.local_norm_threshold == null) return '';
  if (m.local_norm == null && m.local_norm_uneven == null) return 'Local normalization not recorded yet';
  let ran = 'Local normalization, subs not counted yet';
  if (m.local_norm === true) {
    ran = `Local normalization on ${m.local_norm_subs} ${m.local_norm_subs === 1 ? 'sub' : 'subs'}`;
  } else if (m.local_norm === false) {
    ran = 'Local normalization off';
  }
  if (m.local_norm_uneven == null) return `${ran}; coverage not measured yet`;
  return `${ran}: ${percent(m.local_norm_uneven)} of the frame under 90% coverage, runs above ${percent(m.local_norm_threshold)}`;
}
