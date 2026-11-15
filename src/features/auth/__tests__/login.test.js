import assert from 'node:assert/strict'
import test from 'node:test'
import { getLoginRedirectPath } from '../login.js'

test('ADMIN keeps platform access after login', () => {
  assert.equal(getLoginRedirectPath(null, 'admin'), '/admin')
  assert.equal(
    getLoginRedirectPath('/admin/usuarios', 'admin'),
    '/admin/usuarios'
  )
  assert.equal(getLoginRedirectPath('/camp/gestor', 'admin'), '/admin')
})

test('GESTOR returns to an allowed camp or Meus Acampamentos instead of the platform panel', () => {
  assert.equal(getLoginRedirectPath(null, 'gestor'), '/gestor')
  assert.equal(getLoginRedirectPath('/admin/usuarios', 'gestor'), '/gestor')
  assert.equal(
    getLoginRedirectPath('/camp/gestor/participantes', 'gestor'),
    '/camp/gestor/participantes'
  )
})

test('login redirects reject external URLs, backslashes and control characters', () => {
  for (const path of [
    'https://example.test',
    '//example.test',
    '/\\example.test/gestor',
    '/camp/gestor\n',
    {},
  ]) {
    assert.equal(getLoginRedirectPath(path, 'gestor'), '/gestor')
    assert.equal(getLoginRedirectPath(path, 'admin'), '/admin')
  }
})

test('a session without an active profile reaches the screen that permits logout', () => {
  assert.equal(getLoginRedirectPath(null, ''), '/gestor')
  assert.equal(getLoginRedirectPath('/admin', ''), '/gestor')
})
