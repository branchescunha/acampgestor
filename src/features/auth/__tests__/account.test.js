import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAccountName,
  validateAccountEmail,
  validateAccountPassword,
  accountEmail,
} from '../account.js'

test('account email uses authoritative Auth, never the profile copy', () => {
  assert.equal(
    accountEmail(
      { email: 'real@example.invalid' },
      { email: 'old@example.invalid' }
    ),
    'real@example.invalid'
  )
  assert.equal(accountEmail(null, { email: 'stale@example.invalid' }), '')
})

test('account validation rejects empty names, malformed emails and mismatched passwords', () => {
  assert.ok(validateAccountName('   '))
  assert.equal(validateAccountName('Andre'), '')
  for (const email of ['', 'a@', 'a b@example.invalid'])
    assert.ok(validateAccountEmail(email))
  assert.equal(validateAccountEmail('gestor@example.invalid'), '')
  assert.ok(validateAccountPassword('123', '123'))
  assert.ok(validateAccountPassword('abcdefgh', 'abcdefgi'))
  assert.equal(validateAccountPassword('Abc12345!', 'Abc12345!'), '')
})
