import { SITE_TZ } from '@/scheduler/format';

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: SITE_TZ,
  timeZoneName: 'short',
});

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFmt.format(d);
}

export function formatRA(raHours: number): string {
  const total = ((Math.round(raHours * 3600) % 86400) + 86400) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${m}m ${s}s`;
}

export function formatDec(dec: number): string {
  // Format declination in degrees, arcminutes, arcseconds
  const sign = dec >= 0 ? '+' : '-';
  const absDec = Math.abs(dec);
  const d = Math.floor(absDec);
  const m = Math.floor((absDec - d) * 60);
  const s = Math.round(((absDec - d) * 60 - m) * 60);
  return `${sign}${d}° ${m}' ${s}"`;
}
