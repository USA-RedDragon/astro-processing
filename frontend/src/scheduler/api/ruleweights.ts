import { api } from './client'
import type { CommandRecord } from './commands'

export type WeightsFor = 'all' | 'mosaic' | 'single'

export interface GlobalRule {
  key: string
  rule: string
  label: string
  defaultWeight: number
  new: boolean
  switch: boolean
  for: WeightsFor
  mosaicOnly: boolean
  description: string
}

export interface WeightDiff {
  key: string
  rule: string
  project: number | null
  global: number
}

export interface ProjectWeights {
  id: number
  guid: string
  name: string
  state: string
  isMosaic: boolean
  diffs: WeightDiff[]
}

export interface GlobalWeights {
  rules: GlobalRule[]
  weights: Record<string, number>
  basis: 'saved' | 'projects' | 'defaults'
  savedAt?: string
  savedBy?: string
  saved: Record<string, number>
  projects: number
  mosaics: number
  differing: ProjectWeights[]
}

export interface ApplyResult {
  global?: CommandRecord
  projects: CommandRecord[]
  failed: string[]
  weights: GlobalWeights
}

export const getRuleWeights = () => api.get<GlobalWeights>('/planning/rule-weights')

export const previewRuleWeights = (weights: Record<string, number>) =>
  api.post<GlobalWeights>('/planning/rule-weights/preview', { weights })

export const applyRuleWeights = (body: {
  weights?: Record<string, number>
  projectIds?: number[]
}) => api.post<ApplyResult>('/planning/rule-weights/apply', body)
