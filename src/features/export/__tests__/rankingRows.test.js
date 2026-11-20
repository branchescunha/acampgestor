import assert from 'node:assert/strict'
import test from 'node:test'
import { withRankingPositions } from '../rankingRows.js'

test('Excel positions match active ranking while preserving inactive team history', () => {
  const inactive = { id: 'old', total: 100, isActive: false }
  const first = { id: 'active-1', total: 50, isActive: true }
  const second = { id: 'active-2', total: 20, isActive: true }
  const rows = withRankingPositions([inactive, first, second])
  assert.deepEqual(rows, [
    { ...first, position: 1 },
    { ...second, position: 2 },
    { ...inactive, position: null },
  ])
  assert.equal(inactive.position, undefined)
})

test('an entirely inactive or empty ranking assigns no competitive positions', () => {
  assert.deepEqual(withRankingPositions([]), [])
  assert.deepEqual(withRankingPositions([{ id: 'old', isActive: false }]), [
    { id: 'old', isActive: false, position: null },
  ])
})
