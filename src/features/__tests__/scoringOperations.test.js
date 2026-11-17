import test from 'node:test'
import assert from 'node:assert/strict'
import { createOperationGuard, isValidOperationPoints } from '../scoringOperations.js'

test('guard rejects simultaneous operations and allows retry after release', () => {
  const guard = createOperationGuard()
  assert.equal(guard.acquire(), true)
  assert.equal(guard.acquire(), false)
  guard.release()
  assert.equal(guard.acquire(), true)
})

test('gymkhana requires positive finite points', () => {
  for (const value of ['', '0', '-1', 'Infinity', 'NaN']) {
    assert.equal(isValidOperationPoints(value), false)
  }
  assert.equal(isValidOperationPoints('5'), true)
})

test('inspection keeps zero and signed amounts but rejects non-finite values', () => {
  assert.equal(isValidOperationPoints('0', { allowZero: true }), true)
  assert.equal(isValidOperationPoints('-5', { allowZero: true }), true)
  assert.equal(isValidOperationPoints('Infinity', { allowZero: true }), false)
  assert.equal(isValidOperationPoints('', { allowZero: true }), false)
})
