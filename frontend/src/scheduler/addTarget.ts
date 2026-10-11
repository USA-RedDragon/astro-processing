export function landingStep(queryStep: unknown, matchNeeds: boolean): number {
  if (matchNeeds) return 1
  if (queryStep === 'frame') return 2
  if (queryStep === 'mosaic') return 3
  return 1
}

export function matchSummary(
  match: { subjectName: string; status: string } | null,
  choice: string,
): string {
  if (!match) return 'No project, target or stacker object of yours matches.'
  switch (choice) {
    case 'different':
      return `Not the same as ${match.subjectName}`
    case 'link':
      return `Same object as ${match.subjectName}, its stacker data linked to the new project`
    case 'separate':
      return `Same object as ${match.subjectName}, kept separate`
  }
  return match.status === 'confirmed'
    ? `Same object as ${match.subjectName}, confirmed before`
    : `Not decided for ${match.subjectName}`
}

export function chooseLayout(
  f: { options: { id: string; recommended: boolean }[]; chosen?: { id: string } | null },
  fixedGrid: boolean,
  current: string,
): string {
  if (fixedGrid && f.chosen) return f.chosen.id
  const ids = f.options.map((x) => x.id)
  if (ids.includes(current)) return current
  return f.options.find((x) => x.recommended)?.id ?? ids[0] ?? ''
}
