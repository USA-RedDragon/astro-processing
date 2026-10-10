export function unrecordedLights(t: { lights: number; recorded: number }): string {
  const n = Math.max(t.lights - t.recorded, 0);
  return `${n} of ${t.lights} ${t.lights === 1 ? 'light' : 'lights'} not recorded by Target Scheduler`;
}
