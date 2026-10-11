import type { ExposurePick, GoalKind, PickGoal, Template } from './api/planning'

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

export function pickRequestGoal(
  touched: boolean,
  kind: GoalKind,
  snr: number | null,
  depth: number | null,
): Partial<PickGoal> {
  if (!touched) return { snr: snr ?? 0, depth: depth ?? 0 }
  return { kind, snr: snr ?? 0, depth: kind === 'depth' ? (depth ?? 0) : 0 }
}

export function pickDefaultGoal(
  p: Pick<ExposurePick, 'goal' | 'goalBasis'> | null | undefined,
): { kind: GoalKind; basis: string } | null {
  const kind = p?.goal?.kind
  if (kind !== 'snr' && kind !== 'depth') return null
  return { kind, basis: p?.goalBasis && p.goalBasis !== 'chosen' ? p.goalBasis : '' }
}

export function templateLength(
  templates: Pick<Template, 'id' | 'defaultExposure'>[] | null | undefined,
  id: number | null | undefined,
): number | null {
  const t = (templates ?? []).find((x) => x.id === id)
  return t && t.defaultExposure > 0 ? t.defaultExposure : null
}

export function pickPlans(
  rows: { template: { id: number } | null }[],
  templates: Pick<Template, 'id' | 'defaultExposure'>[] | null | undefined,
): { templateId: number; exposure: number }[] | null {
  const out: { templateId: number; exposure: number }[] = []
  for (const r of rows) {
    const exposure = templateLength(templates, r.template?.id)
    if (!r.template || exposure === null) return null
    out.push({ templateId: r.template.id, exposure })
  }
  return out.length ? out : null
}
