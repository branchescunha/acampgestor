import assert from 'node:assert/strict'
import test from 'node:test'
import { describeRegistrationError, registerGestor, validateRegistration } from '../registration.js'

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

test('registration distinguishes disabled signup, provider, rate limits and provisioning errors', () => {
  for (const [code, expected] of [
    ['signup_disabled', /temporariamente desativado/],
    ['email_provider_disabled', /e-mail.*indisponível/],
    ['over_request_rate_limit', /Aguarde/],
    ['over_email_send_rate_limit', /Aguarde/],
    ['weak_password', /senha.*requisitos/],
    ['unexpected_failure', /preparar a conta.*suporte/],
    ['signup_confirmation_required', /confirmação.*suporte/],
  ]) {
    const result = describeRegistrationError({ code, status: 422, message: 'private server details' })
    assert.match(result.message, expected)
    assert.equal(result.code, code)
    assert.equal(result.status, 422)
    assert.doesNotMatch(JSON.stringify(result), /private server details/)
  }
})

test('registration errors do not enumerate accounts or expose arbitrary server details', () => {
  const fallback = describeRegistrationError(null)
  for (const code of ['user_already_exists', 'email_exists', 'validation_failed', 'unknown_private_value']) {
    const result = describeRegistrationError({ code, status: 400, message: 'private@example.test token=secret' })
    assert.equal(result.message, fallback.message)
    assert.doesNotMatch(JSON.stringify(result), /private@example|token=secret|unknown_private/)
  }
})

test('registration reports network failures without exposing network details', () => {
  const result = describeRegistrationError({ name: 'AuthRetryableFetchError', message: 'sensitive URL' })
  assert.match(result.message, /conexão/)
  assert.equal(result.code, 'network_error')
  assert.doesNotMatch(JSON.stringify(result), /sensitive URL/)
})

test('Auth service failures are not mislabeled as a local connectivity problem', () => {
  const result = describeRegistrationError({ name: 'AuthRetryableFetchError', status: 500, message: 'private database failure' })
  assert.equal(result.code, 'service_unavailable')
  assert.match(result.message, /serviço de cadastro.*indisponível/)
  assert.doesNotMatch(JSON.stringify(result), /private database failure/)
})

test('a registration with a previously deleted email accepts only the new Auth identity', async () => {
  const session = { user: { id: 'new-independent-uid' } }
  let calls = 0
  const auth = {
    async signUp() {
      calls++
      return { data: { user: { id: 'new-independent-uid' }, session }, error: null }
    },
  }
  assert.equal(await registerGestor(auth, form), session)
  assert.equal(calls, 1)
  assert.notEqual(session.user.id, 'deleted-uid')
})

test('existing email and profile provisioning failures are not reported as successful registrations', async () => {
  for (const code of ['user_already_exists', 'unexpected_failure']) {
    const auth = { async signUp() { return { data: null, error: { code, status: 422 } } } }
    await assert.rejects(registerGestor(auth, form), (error) => error.code === code)
  }
})
