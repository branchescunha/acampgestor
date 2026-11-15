import assert from 'node:assert/strict'
import test from 'node:test'
import { getSupportUrl } from '../support.js'

test('support link accepts only an absolute HTTPS URL without credentials', () => {
  assert.equal(getSupportUrl(' https://support.example.test/contact '), 'https://support.example.test/contact')
  for (const value of [undefined, '', 'http://example.test', 'javascript:alert(1)', '//example.test', 'https://user:pass@example.test']) {
    assert.equal(getSupportUrl(value), '')
  }
})
