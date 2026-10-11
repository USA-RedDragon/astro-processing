import {
  CalibrationQuality,
  CalibrationSource,
  type CalibrationBasis,
  type CalibrationMatch,
  type CalibrationRow,
} from '../graphql/graphql';

export const fmt = (v: number): string => String(Math.round(v * 100) / 100).replace('-', '−');

export function rowKey(
  r: Pick<CalibrationRow, 'night' | 'filter' | 'exposure' | 'gain' | 'offset' | 'set_temp' | 'rotator'>,
): string {
  return [r.night, r.filter, r.exposure, r.gain, r.offset, r.set_temp, r.rotator].join('|');
}

type SummaryRow = Pick<CalibrationRow, 'lights'> & {
  flat: Pick<CalibrationMatch, 'quality'>;
  dark: Pick<CalibrationMatch, 'quality'>;
  bias: Pick<CalibrationMatch, 'quality'>;
};

export function coverageSummary(rows: SummaryRow[]): string {
  const sum = (keep: (r: SummaryRow) => boolean) => rows.filter(keep).reduce((t, r) => t + r.lights, 0);
  const total = sum(() => true);
  const flats = sum((r) => r.flat.quality === CalibrationQuality.Exact);
  const darks = sum((r) => r.dark.quality !== CalibrationQuality.Missing);
  const bias = sum((r) => r.bias.quality !== CalibrationQuality.Missing);
  return (
    `Lights with a flat from the same night, angle and gain: ${flats} / ${total}` +
    ` · with darks: ${darks} / ${total} · with bias: ${bias} / ${total}`
  );
}

export function darkText(
  r: Pick<CalibrationRow, 'exposure' | 'set_temp'>,
  m: Pick<CalibrationMatch, 'quality' | 'scaled' | 'temp_off' | 'set_temp' | 'exposure'>,
): string {
  if (m.quality === 'MISSING') return 'none';
  if (!m.scaled) return 'match';
  const parts = ['scaled'];
  if (r.set_temp == null || m.set_temp == null) parts.push('setpoint unknown');
  else if (m.temp_off) parts.push(`${fmt(m.temp_off)} °C off`);
  if (m.exposure != null && Math.abs(m.exposure - r.exposure) > 0.01 * r.exposure) {
    parts.push(`from ${fmt(m.exposure)} s`);
  }
  return parts.join(', ');
}

const basisNames: [keyof Omit<CalibrationBasis, '__typename'>, string][] = [
  ['night', 'date'],
  ['exposure', 'exposure'],
  ['gain', 'gain'],
  ['offset', 'offset'],
  ['set_temp', 'setpoint'],
  ['bin_x', 'binning'],
];

export function importedText(m: Pick<CalibrationMatch, 'source' | 'basis'>): string {
  if (m.source !== CalibrationSource.Imported) return '';
  const hand = basisNames.filter(([k]) => m.basis?.[k] === 'hand-entered').map(([, name]) => name);
  return hand.length > 0 ? `imported master; hand-entered: ${hand.join(', ')}` : 'imported master';
}

export function importedTitle(m: Pick<CalibrationMatch, 'source' | 'basis' | 'master' | 'header_error'>): string {
  if (m.source !== CalibrationSource.Imported) return '';
  const lines = [m.master ?? 'imported master'];
  for (const [k, name] of basisNames) {
    const b = m.basis?.[k];
    if (b) lines.push(`${name}: ${b}`);
  }
  if (m.header_error) lines.push(`header not read: ${m.header_error}`);
  return lines.join('\n');
}
