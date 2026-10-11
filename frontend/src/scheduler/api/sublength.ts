import { ApiError, api, query } from './client'

export type Bucket = 'dark' | 'low' | 'mid' | 'bright'

export type SubLengthMode = 'off' | 'dry-run' | 'on'

export interface SubLengthCandidate {
  exposure: number
  darks: boolean
  read_noise_share: number
  duty_cycle: number
  kept: number
  efficiency: number
  sky_to_read_noise: number
  saturated_share: number | null
  blocked?: string
  relative_snr_rate: number
}

export interface SubLengthRow {
  target_guid: string
  target: string
  objects: string[] | null
  object: string
  project: string
  filter: string
  gain: number
  offset: number
  bucket: Bucket
  exposure: number
  ideal: number
  current: number
  sky_limited: number
  sky_rate: number
  sky_subs: number
  sky_source: string
  read_noise_e: number
  e_per_adu: number
  overhead: number
  saturation_cap: number
  snr_rate_change: number
  ideal_snr_rate_gain: number
  candidates: SubLengthCandidate[] | null
  basis: string
  tolerance?: number
}

export interface SubLengthResult {
  computed_at: string | null
  mode: SubLengthMode
  rows: SubLengthRow[] | null
  site: SubLengthRow[] | null
  reason?: string
}

export interface SubLengthState {
  result: SubLengthResult | null
  error: string
}

export async function getSubLengths(
  params: { object?: string; target_guid?: string } = {},
  signal?: AbortSignal,
): Promise<SubLengthState> {
  try {
    const result = await api.get<SubLengthResult>('/sublength' + query(params), signal)
    return { result, error: '' }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { result: null, error: '' }
    return { result: null, error: e instanceof Error ? e.message : String(e) }
  }
}
