import type { GlobalSettings } from './api/scheduling'
import { SETTINGS, settingError, type SettingSpec } from './projectSettings'

export type GlobalKey = keyof GlobalSettings

export const GLOBAL_SETTINGS: (SettingSpec & { key: GlobalKey })[] = SETTINGS.filter(
  (s): s is SettingSpec & { key: GlobalKey } => s.key !== 'useCustomHorizon' && s.key !== 'horizonOffset',
)

export function globalErrors(
  v: GlobalSettings,
  minimumAltitude: number,
): Partial<Record<GlobalKey, string>> {
  const out: Partial<Record<GlobalKey, string>> = {}
  for (const s of GLOBAL_SETTINGS) {
    const e = settingError(s, v[s.key], minimumAltitude)
    if (e) out[s.key] = e
  }
  return out
}

export function globalChanged(saved: GlobalSettings, draft: Partial<GlobalSettings>): boolean {
  return GLOBAL_SETTINGS.some((s) => draft[s.key] !== undefined && draft[s.key] !== saved[s.key])
}
