import {
  CalibrationSource,
  type CalibrationBasis,
  type CalibrationMatch,
  type CalibrationRow,
  type DarkLibrary,
  type DarkLibraryGap,
} from '../graphql/graphql';

const fmt = (v: number): string => String(Math.round(v * 100) / 100).replace('-', '−');

function list(values: string[]): string {
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

export function ladderText(lib: Pick<DarkLibrary, 'ladder' | 'set_temp_exact_c' | 'set_temp_scale_max_c'>): string {
  if (lib.ladder.length === 0) return 'Not reported: the stacker did not send its dark ladder.';
  let text = `Configured dark ladder: ${lib.ladder.map(fmt).join(', ')} °C.`;
  if (lib.set_temp_exact_c != null) {
    text += ` A dark set counts at a setpoint when within ${fmt(lib.set_temp_exact_c)} °C of it.`;
  }
  if (lib.set_temp_scale_max_c != null) {
    text += ` Lights use the darks with the nearest setpoint up to ${fmt(lib.set_temp_scale_max_c)} °C away, scaled.`;
  }
  return text;
}

export function minFramesText(lib: Pick<DarkLibrary, 'min_frames'>): string {
  if (lib.min_frames == null) return 'Not reported: the stacker did not send its minimum frames per set.';
  return `The stacker builds a master from ${lib.min_frames} or more frames and sets no recommended count.`;
}

export function captureText(gaps: Pick<DarkLibraryGap, 'exposure' | 'set_temp'>[]): string {
  if (gaps.length === 0) return '';
  const exposures = [...new Set(gaps.filter((g) => g.exposure != null).map((g) => g.exposure as number))].sort(
    (a, b) => a - b,
  );
  const setpoints = [...new Set(gaps.map((g) => g.set_temp))].sort((a, b) => a - b);
  const parts = exposures.map((e) => `${fmt(e)} s`);
  if (gaps.some((g) => g.exposure == null)) parts.push('lights with no recorded exposure');
  return `The lights in the gaps need darks of ${list(parts)} at ${list(setpoints.map(fmt))} °C.`;
}

export function otherExposuresText(g: Pick<DarkLibraryGap, 'other_exposures'>): string {
  if (g.other_exposures.length === 0) return 'none';
  return `${list(g.other_exposures.map((e) => `${fmt(e)} s`))}, scaled`;
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
