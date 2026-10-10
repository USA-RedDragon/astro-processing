export function isCulled(
  score: number | null | undefined,
  cut: number | null | undefined,
  threshold: number | null,
): boolean {
  if (score == null) return false
  if (threshold === null) return cut != null && score < cut
  return score < threshold
}
