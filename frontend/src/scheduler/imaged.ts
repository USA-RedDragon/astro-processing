export interface SubjectLike {
  key?: string
  subject?: string
  name: string
  projectId?: number
  status?: string
}

const linked = (s: SubjectLike) => s.status !== 'rejected' && s.status !== 'suggested'

export function subjectRoute(s: SubjectLike): string | null {
  if (s.projectId) return `/project/${s.projectId}`
  const key = s.key ?? s.subject ?? ''
  if (key.startsWith('object:') && s.name) return `/object/${encodeURIComponent(s.name)}`
  return null
}

export function imagedRoute(
  subjects: SubjectLike[] | null | undefined,
): { to: string; project: boolean } | null {
  const list = (subjects ?? []).filter(linked)
  const p = list.find((s) => s.projectId)
  if (p) return { to: subjectRoute(p)!, project: true }
  for (const s of list) {
    const to = subjectRoute(s)
    if (to) return { to, project: false }
  }
  return null
}
