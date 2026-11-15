import assert from 'node:assert/strict'
import test from 'node:test'
import { registerGestor, validateRegistration } from '../registration.js'

const form = {
  name: 'Gestor de exemplo',
  email: 'gestor@example.test',
  password: 'secure-password-123',
  confirmPassword: 'secure-password-123',
}

test('registration rejects missing name, invalid email and weak or mismatched passwords', () => {
  assert.ok(validateRegistration({ ...form, name: ' ' }))
  assert.ok(validateRegistration({ ...form, email: 'invalid' }))
  assert.ok(
    validateRegistration({
      ...form,
      password: '12345',
      confirmPassword: '12345',
    })
  )
  assert.equal(
    validateRegistration({
      ...form,
      password: '123456',
      confirmPassword: '123456',
    }),
    ''
  )
  assert.ok(
    validateRegistration({
      ...form,
      password: '        ',
      confirmPassword: '        ',
    })
  )
  assert.ok(validateRegistration({ ...form, confirmPassword: 'different' }))
  assert.equal(validateRegistration(form), '')
})

test('public registration sends only identity fields and never accepts a supplied role', async () => {
  let payload
  const auth = {
    async signUp(value) {
      payload = value
      return {
        data: {
          user: { id: 'new-user' },
          session: { user: { id: 'new-user' } },
        },
        error: null,
      }
    },
  }
  await registerGestor(
    auth,
    {
      ...form,
      name: '  Gestor de exemplo  ',
      email: ' GESTOR@example.test ',
      role: 'admin',
      status: 'active',
    }
  )
  assert.deepEqual(payload, {
    email: 'gestor@example.test',
    password: 'secure-password-123',
    options: {
      data: { name: 'Gestor de exemplo' },
    },
  })
})

test('invalid registration never contacts Auth', async () => {
  const auth = {
    signUp() {
      assert.fail('Auth should not be called')
    },
  }
  await assert.rejects(
    registerGestor(auth, { ...form, name: '' })
  )
})

test('registration surfaces Auth errors without issuing profile writes', async () => {
  const failure = new Error('Email rate limit reached')
  const auth = {
    async signUp() {
      return { data: null, error: failure }
    },
  }
  await assert.rejects(
    registerGestor(auth, form),
    failure
  )
})

test('registration accepts and returns the immediate Auth session without signing out', async () => {
  const session = { user: { id: 'new-user' } }
  const auth = {
    async signUp() {
      return { data: { user: { id: 'new-user' }, session }, error: null }
    },
    signOut() {
      assert.fail('An immediate registration session must be preserved')
    },
  }
  assert.equal(await registerGestor(auth, form), session)
})

test('registration does not claim immediate access when Confirm email is still enabled', async () => {
  const auth = {
    async signUp() {
      return { data: { user: { id: 'new-user' }, session: null }, error: null }
    },
  }
  await assert.rejects(
    registerGestor(auth, form),
    (error) => error.code === 'signup_confirmation_required'
  )
})

test('registration rejects inconsistent identity in the returned session', async () => {
  const auth = {
    async signUp() {
      return {
        data: {
          user: { id: 'new-user' },
          session: { user: { id: 'other-user' } },
        },
        error: null,
      }
    },
  }
  await assert.rejects(registerGestor(auth, form), /validar a sessão/)
})
