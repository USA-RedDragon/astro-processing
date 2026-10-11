export function landingStep(queryStep: unknown, matchNeeds: boolean): number {
  if (matchNeeds) return 1
  if (queryStep === 'frame') return 2
  if (queryStep === 'mosaic') return 3
  return 1
}
