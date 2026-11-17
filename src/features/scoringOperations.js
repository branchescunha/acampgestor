export function createOperationGuard() {
  let busy = false

  return {
    acquire() {
      if (busy) return false
      busy = true
      return true
    },
    release() {
      busy = false
    },
  }
}

export function isValidOperationPoints(value, { allowZero = false } = {}) {
  if (value === '' || value == null) return false
  const points = Number(value)
  return Number.isFinite(points) && (allowZero || points > 0)
}
