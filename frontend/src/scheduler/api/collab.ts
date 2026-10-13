import { api } from './client'
import type { CommandRecord } from './commands'

export interface CollabSwitchStatus {
  configured: boolean
  desired: { on: boolean; setBy: string; setAt: string } | null
  readBack: { present: boolean; value: string | null; at: string | null; error?: string }
  matches: boolean
  reachable: boolean
  ninaError?: string
  ninaStarted?: string
  checkedAt: string | null
  running: string[]
  lastSendAt: string | null
  lastSend?: string
}

export const getCollabSwitch = () => api.get<CollabSwitchStatus>('/collab-switch')

export const setCollabSwitch = (on: boolean) =>
  api.post<{ status: CollabSwitchStatus; record: CommandRecord }>('/collab-switch', { on })

export const readCollabSwitch = () => api.post<CollabSwitchStatus>('/collab-switch/read')

export type CollabPill = {
  label: string
  short: string
  tone: 'info' | 'warn' | 'bad' | 'muted'
} | null

export function collabPill(s: CollabSwitchStatus | null): CollabPill {
  if (!s || (!s.configured && !s.desired)) return null
  if (!s.desired) return { label: 'Collab: not set', short: 'Collab not set', tone: 'muted' }
  if (s.configured && s.checkedAt && !s.reachable)
    return { label: 'Collab: NINA not answering', short: 'Collab ?', tone: 'bad' }
  if (s.readBack.at && !s.readBack.present)
    return { label: 'Collab: not in the sequence', short: 'Collab missing', tone: 'bad' }
  if (!s.desired.on)
    return s.readBack.present && !s.matches
      ? { label: 'Collab: paused, not confirmed', short: 'Collab paused?', tone: 'warn' }
      : { label: 'Collab: paused', short: 'Collab paused', tone: 'warn' }
  if (!s.matches) return { label: 'Collab: on, not confirmed', short: 'Collab on?', tone: 'warn' }
  return { label: 'Collab: on, preempting', short: 'Collab on', tone: 'info' }
}

export function runningText(running: string[]): string {
  if (!running.length) return 'Nothing is running'
  const last = running[running.length - 1]!
  if (running.includes('Collab')) {
    return last === 'Collab' || last === 'Starfront collaboration'
      ? 'Starfront collaboration'
      : `Starfront collaboration · ${last}`
  }
  if (running.some((n) => n.startsWith('Target Scheduler'))) return 'Target Scheduler'
  return last
}

export function constantText(s: CollabSwitchStatus): string {
  if (!s.configured) return 'Not set up: the stacker has no address for NINA (scheduler.nina-url).'
  if (!s.readBack.at) return s.readBack.error ? `Not read: ${s.readBack.error}` : 'Not read yet'
  if (!s.readBack.present)
    return 'Not in the running sequence: it has no Powerups constant named collab, so the switch cannot work until a sequence with it runs'
  return `collab = ${s.readBack.value}`
}
