/** formatExposure shows hours of exposure, in minutes under an hour so short stacks don't read as nothing. */
export function formatExposure(hours: number): string {
  if (hours >= 1) return `${hours.toFixed(1)} h`;
  const min = hours * 60;
  return `${min >= 10 ? Math.round(min) : min.toFixed(1)} min`;
}
