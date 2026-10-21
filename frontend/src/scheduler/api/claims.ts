import { api } from './client'

export type ClaimWhere = 'vsx' | 'tns' | 'simbad' | 'ads' | 'arxiv' | 'alerts' | 'vizier'

export interface ClaimRecord {
  name: string
  url: string
  published: string
}

export interface ClaimSource {
  where: ClaimWhere | string
  label: string
  looks_for: string
}

export type ClaimCheckState = 'checked' | 'failed' | 'not_checked'

export interface ClaimCheck {
  where: ClaimWhere | string
  state: ClaimCheckState
  note: string
  new: number
  known: number
}

export type MentionStatus = 'new' | 'known' | 'first_check_after_record'
export type MentionMark = '' | 'seen' | 'citing' | 'own'

export interface Mention {
  id: number
  where: ClaimWhere | string
  label: string
  title: string
  detail: string
  url: string
  dated: string | null
  first_seen: string
  status: MentionStatus
  mark: MentionMark
}

export interface StarClaims {
  source_id: number
  record: ClaimRecord | null
  last_checked: string | null
  new: number
  known: number
  checks: ClaimCheck[]
  mentions: Mention[]
}

export interface Claims {
  stars: number
  last_checked: string | null
  next_check: string | null
  running: boolean
  record: ClaimRecord | null
  new_count: number
  sources: ClaimSource[]
  per_star: StarClaims[]
}

export const getClaims = () => api.get<Claims>('/discoveries/claims')

export const markMention = (id: number, mark: Exclude<MentionMark, 'own'>) =>
  api.put<Mention>(`/discoveries/claims/mentions/${id}`, { mark })
