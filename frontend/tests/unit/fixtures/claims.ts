import type { Claims, Mention, StarClaims } from '@/scheduler/api/claims'

export const sources = [
  { where: 'vsx', label: 'VSX', looks_for: 'any entry within 10"' },
  { where: 'tns', label: 'TNS', looks_for: 'transient reports within 10"' },
  { where: 'simbad', label: 'SIMBAD', looks_for: 'object and its references within 5"' },
  { where: 'ads', label: 'ADS', looks_for: 'papers naming the star' },
  { where: 'arxiv', label: 'arXiv', looks_for: 'new preprints naming the star' },
  { where: 'alerts', label: 'ATels and Gaia alerts', looks_for: 'new reports within 10"' },
  { where: 'vizier', label: 'VizieR', looks_for: 'new tables with a variable within 5"' },
]

export const record = {
  name: 'Zenodo',
  url: 'https://doi.example/record',
  published: '2026-10-21T00:12:24Z',
}

export function mention(over: Partial<Mention> = {}): Mention {
  return {
    id: 1,
    where: 'vsx',
    label: 'VSX',
    title: 'made-up entry',
    detail: 'Made-up detail line.',
    url: 'https://vsx.example/1',
    dated: '2026-10-23T15:00:00Z',
    first_seen: '2026-10-25T08:10:00Z',
    status: 'new',
    mark: '',
    ...over,
  }
}

export function starClaims(over: Partial<StarClaims> = {}): StarClaims {
  return {
    source_id: 101,
    record: null,
    last_checked: '2026-10-25T08:10:00Z',
    new: 0,
    known: 0,
    checks: sources.map((s) => ({ where: s.where, state: 'checked', note: '', new: 0, known: 0 })),
    mentions: [],
    ...over,
  }
}

export function claims(over: Partial<Claims> = {}): Claims {
  return {
    stars: 3,
    last_checked: '2026-10-25T08:10:00Z',
    next_check: '2026-11-01T08:00:00Z',
    running: false,
    record,
    new_count: 0,
    sources,
    per_star: [],
    ...over,
  }
}
