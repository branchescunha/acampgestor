import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formSnapshot,
  hasUnsavedForms,
  resetRouteScroll,
} from '../../utils/navigation.js'

function form(values) {
  return {
    isConnected: true,
    elements: values.map(([name, value, type = 'text']) => ({
      name,
      value,
      type,
      disabled: false,
    })),
  }
}

test('dirty forms detect edits, reversions and removal without retaining passwords', () => {
  const target = form([
    ['name', 'Original'],
    ['password', '', 'password'],
  ])
  const baselines = new Map([[target, formSnapshot(target)]])
  assert.equal(hasUnsavedForms(baselines), false)
  target.elements[0].value = 'Edited'
  assert.equal(hasUnsavedForms(baselines), true)
  target.elements[0].value = 'Original'
  assert.equal(hasUnsavedForms(baselines), false)
  target.elements[1].value = 'secret-not-retained'
  assert.equal(hasUnsavedForms(baselines), true)
  assert.ok(!formSnapshot(target).includes('secret-not-retained'))
  target.isConnected = false
  assert.equal(hasUnsavedForms(baselines), false)
})

test('route scroll resets window and known internal containers instantly', () => {
  const calls = []
  const container = {
    scrollTo: (options) => calls.push(['container', options]),
  }
  resetRouteScroll(
    { scrollTo: (options) => calls.push(['window', options]) },
    { querySelectorAll: () => [container] }
  )
  assert.equal(calls.length, 2)
  for (const [, options] of calls)
    assert.deepEqual(options, { top: 0, left: 0, behavior: 'instant' })
})
