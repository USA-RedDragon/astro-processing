/**
 * Whether a sub is culled: under a typed threshold, or, with none, where the
 * stacker cuts it: its score under its own cut, or its clarity under the min
 * score whatever the sky.
 */
export function isCulled(
  score: number | null | undefined,
  cut: number | null | undefined,
  threshold: number | null,
  clarity?: number | null,
  minScore?: number | null,
): boolean {
  if (score == null) return false
  if (threshold !== null) return score < threshold
  if (cut != null && score < cut) return true
  return clarity != null && minScore != null && clarity < minScore
}

/** One cut, or the range of a group's per-sub cuts. Empty when none is known. */
export function cutRange(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null || high == null) return ''
  const a = low.toFixed(2)
  const b = high.toFixed(2)
  return a === b ? a : `${a} to ${b}`
}
