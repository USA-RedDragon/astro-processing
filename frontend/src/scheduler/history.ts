import type { CommandFilter, CommandRecord } from './api/commands'

export type HistoryWho = 'all' | 'web' | 'app'
export type HistoryWhen = '14d' | '24h' | 'all'

export interface HistoryFilters {
  who: HistoryWho
  when: HistoryWhen
  category: string
  q: string
}

export const HISTORY_PAGE = 100

const WINDOW_MS: Record<HistoryWhen, number> = {
  '24h': 24 * 3600 * 1000,
  '14d': 14 * 24 * 3600 * 1000,
  all: 0,
}

export function historySince(when: HistoryWhen, now: number): string | undefined {
  const w = WINDOW_MS[when]
  return w ? new Date(now - w).toISOString() : undefined
}

function destinationOf(who: HistoryWho): CommandRecord['destination'] | undefined {
  if (who === 'web') return 'observatory'
  if (who === 'app') return 'app'
  return undefined
}

export function historyQuery(
  f: HistoryFilters,
  now: number,
  older?: CommandRecord,
): CommandFilter {
  return {
    category: f.category || undefined,
    q: f.q.trim() || undefined,
    destination: destinationOf(f.who),
    since: historySince(f.when, now),
    before: older?.created_at,
    before_id: older?.id,
    limit: HISTORY_PAGE,
  }
}

export function historyMatches(r: CommandRecord, f: HistoryFilters, now: number): boolean {
  const dest = destinationOf(f.who)
  if (dest && r.destination !== dest) return false
  if (f.category && r.category !== f.category) return false
  const since = historySince(f.when, now)
  if (since && new Date(r.created_at).getTime() < new Date(since).getTime()) return false
  const s = f.q.trim().toLowerCase()
  if (s) {
    const text = [r.title, r.author, ...(r.objects ?? []).map((o) => o.name)]
      .join(' ')
      .toLowerCase()
    if (!text.includes(s)) return false
  }
  return true
}

export function appendOlder(have: CommandRecord[], page: CommandRecord[]): CommandRecord[] {
  const seen = new Set(have.map((r) => r.id))
  return have.concat(page.filter((r) => !seen.has(r.id)))
}
