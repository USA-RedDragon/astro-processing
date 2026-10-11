export interface Latest {
  next(): () => boolean
  cancel(): void
}

export function latestOnly(): Latest {
  let seq = 0
  return {
    next() {
      const mine = ++seq
      return () => mine === seq
    },
    cancel() {
      seq++
    },
  }
}
