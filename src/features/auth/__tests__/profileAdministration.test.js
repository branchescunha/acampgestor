import assert from 'node:assert/strict'
import test from 'node:test'
import { createManagedProfile } from '../profileAdministration.js'

const requested = {
  id: 'auth-user',
  name: 'Novo gestor',
  email: 'gestor@example.test',
  role: 'gestor',
  status: 'active',
}

function profileClient({ reads = [], insertError = null }) {
  const inserts = []
  let readCount = 0
  return {
    inserts,
    get readCount() {
      return readCount
    },
    from(table) {
      assert.equal(table, 'profiles')
      return {
        select() {
          return {
            eq(field, value) {
              assert.equal(field, 'id')
              assert.equal(value, requested.id)
              return {
                async maybeSingle() {
                  return reads[readCount++] || { data: null, error: null }
                },
              }
            },
          }
        },
        async insert(payload) {
          inserts.push(payload)
          return { error: insertError }
        },
        update() {
          assert.fail('Creation must never overwrite an existing profile')
        },
        upsert() {
          assert.fail('Creation must never upsert profiles')
        },
      }
    },
  }
}

test('administrative creation inserts a profile only when its Auth UID has no profile', async () => {
  const client = profileClient({})
  assert.deepEqual(await createManagedProfile(client, requested), {
    created: true,
  })
  assert.deepEqual(client.inserts, [requested])
})

test('automatically provisioned ADMIN or suspended profile is returned without changing its role or status', async () => {
  for (const fields of [
    { role: 'admin', status: 'active' },
    { role: 'gestor', status: 'suspended' },
  ]) {
    const existing = Object.freeze({ ...requested, ...fields })
    const client = profileClient({ reads: [{ data: existing, error: null }] })
    assert.deepEqual(await createManagedProfile(client, requested), {
      created: false,
      profile: existing,
    })
    assert.equal(client.inserts.length, 0)
  }
})

test('a concurrently provisioned profile is recovered by UID without retrying or overwriting it', async () => {
  const existing = { ...requested, role: 'admin', status: 'suspended' }
  const client = profileClient({
    reads: [
      { data: null, error: null },
      { data: existing, error: null },
    ],
    insertError: { code: '23505' },
  })
  assert.deepEqual(await createManagedProfile(client, requested), {
    created: false,
    profile: existing,
  })
  assert.equal(client.inserts.length, 1)
})

test('an email conflict with a different UID remains an error and never links identities by email', async () => {
  const conflict = { code: '23505', message: 'Email conflict' }
  const client = profileClient({ insertError: conflict })
  await assert.rejects(
    createManagedProfile(client, requested),
    (error) => error === conflict
  )
  assert.equal(client.readCount, 2)
})

test('failed UID lookup aborts administrative creation before writing', async () => {
  const denied = { code: '42501', message: 'Denied' }
  const client = profileClient({ reads: [{ data: null, error: denied }] })
  await assert.rejects(
    createManagedProfile(client, requested),
    (error) => error === denied
  )
  assert.equal(client.inserts.length, 0)
})
