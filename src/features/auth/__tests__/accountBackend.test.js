import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAccountHandler } from '../../../../supabase/functions/manage-user-account/handler.mjs'

const adminId = '10000000-0000-4000-8000-000000000001'
const gestorId = '10000000-0000-4000-8000-000000000002'
function setup(role = 'admin', status = 'active') {
  const writes = []
  const profiles = [
    { id: adminId, role, status, name: 'Admin' },
    {
      id: gestorId,
      role: 'gestor',
      status: 'suspended',
      name: 'Gestor',
      email: 'stale@example.invalid',
    },
  ]
  const backend = {
    rpc: async () => ({ data: true }),
    from() {
      return {
        select() {
          return this
        },
        eq(key, value) {
          this.id = value
          return this
        },
        maybeSingle() {
          return Promise.resolve({
            data: profiles.find((profile) => profile.id === this.id),
          })
        },
        order() {
          return this
        },
        range() {
          return Promise.resolve({ data: profiles })
        },
      }
    },
    auth: {
      admin: {
        async listUsers() {
          return {
            data: {
              users: profiles.map((profile) => ({
                id: profile.id,
                email: 'real@example.invalid',
              })),
            },
          }
        },
        async getUserById(id) {
          return { data: { user: { id, email: 'real@example.invalid' } } }
        },
        async updateUserById(id, payload) {
          writes.push({ id, payload })
          return { data: { user: { id } } }
        },
      },
    },
  }
  const auth = {
    auth: { getUser: async () => ({ data: { user: { id: adminId } } }) },
  }
  const handler = createAccountHandler({
    auth,
    backend,
    selfEmailEnabled: false,
  })
  const request = (body) =>
    handler(
      new Request('https://fixture.invalid', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer fixture',
          'Content-Type': 'application/json',
          Origin: 'https://acampgestor.vercel.app',
        },
        body: JSON.stringify(body),
      })
    )
  return { request, writes, handler, backend, auth, profiles }
}

test('privileged account operations reject gestor, suspended admin and unconfirmed requests', async () => {
  for (const [role, status] of [
    ['gestor', 'active'],
    ['admin', 'suspended'],
  ]) {
    const { request, writes } = setup(role, status)
    assert.equal(
      (
        await request({
          action: 'reset-password',
          targetId: gestorId,
          password: 'Password123!',
          confirmed: true,
        })
      ).status,
      403
    )
    assert.equal(writes.length, 0)
  }
  const { request, writes } = setup()
  assert.equal(
    (
      await request({
        action: 'reset-password',
        targetId: gestorId,
        password: 'Password123!',
      })
    ).status,
    400
  )
  assert.equal(writes.length, 0)
})

test('administrative recovery updates only the selected gestor Auth account, never role/status', async () => {
  const { request, writes } = setup()
  const response = await request({
    action: 'reset-password',
    targetId: gestorId,
    password: 'Password123!',
    confirmed: true,
  })
  assert.equal(response.status, 200)
  assert.equal(writes[0].id, gestorId)
  assert.equal(writes[0].payload.password, 'Password123!')
  assert.deepEqual(Object.keys(writes[0].payload).sort(), [
    'app_metadata',
    'password',
  ])
  assert.equal(
    writes[0].payload.app_metadata.acampgestor_admin_operation.actor_id,
    adminId
  )
  assert.equal(
    writes[0].payload.app_metadata.acampgestor_admin_operation.target_id,
    gestorId
  )
  assert.ok(!(await response.text()).includes('Password123!'))
  assert.equal(
    (
      await request({
        action: 'reset-password',
        targetId: adminId,
        password: 'Password123!',
        confirmed: true,
      })
    ).status,
    403
  )
})

test('email correction uses UID and Auth Admin API without creating or linking identities', async () => {
  const { request, writes } = setup()
  assert.equal(
    (
      await request({
        action: 'update-email',
        targetId: gestorId,
        email: 'new@example.invalid',
        confirmed: true,
      })
    ).status,
    200
  )
  assert.equal(writes[0].id, gestorId)
  assert.equal(writes[0].payload.email, 'new@example.invalid')
  assert.equal(writes[0].payload.email_confirm, true)
  assert.deepEqual(Object.keys(writes[0].payload).sort(), [
    'app_metadata',
    'email',
    'email_confirm',
  ])
  assert.equal(
    (
      await request({
        action: 'update-email',
        targetId: gestorId,
        email: 'invalid',
        confirmed: true,
      })
    ).status,
    400
  )
})

test('listing returns Auth email and refuses unauthenticated requests', async () => {
  const { request, handler } = setup()
  const response = await request({ action: 'list-users' })
  const { users } = await response.json()
  assert.equal(users[1].email, 'real@example.invalid')
  assert.equal(
    (
      await handler(
        new Request('https://fixture.invalid', { method: 'POST', body: '{}' })
      )
    ).status,
    401
  )
})

test('020 retains last-admin protection, limits own edits and deletes organizations only through a guarded RPC', () => {
  const sql = readFileSync(
    new URL(
      '../../../../supabase/sql/020_account_and_organization_management.sql',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(sql, /^begin;/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /profiles_require_active_admin/)
  assert.match(sql, /to_jsonb\(new\) - array\['name', 'updated_at'\]/)
  assert.match(sql, /auth\.users where id = new\.id/)
  assert.match(sql, /contype = 'f'/)
  assert.match(sql, /public\.is_platform_admin\(\)/)
  assert.match(
    sql,
    /acampgestor_guard_admin_auth_operation before update on auth\.users/
  )
  assert.match(sql, /id = actor_id and role = 'admin' and status = 'active'/)
  assert.match(sql, /id = new\.id and role = 'gestor' for update/)
  assert.match(
    sql,
    /public\.organization_members where organization_id = target_organization_id order by id for update/
  )
  assert.doesNotMatch(
    sql,
    /grant delete|disable row level security|drop.*cascade/i
  )
  assert.match(sql, /commit;\s*$/)
})

test('account management refuses missing SQL guards and lists unprovisioned Auth identities without granting access', async () => {
  const { request, backend, writes } = setup()
  backend.rpc = async () => ({ error: { code: 'PGRST202' } })
  assert.equal(
    (
      await request({
        action: 'reset-password',
        targetId: gestorId,
        password: 'Password123!',
        confirmed: true,
      })
    ).status,
    503
  )
  assert.equal(writes.length, 0)
  backend.rpc = async () => ({ data: true })
  backend.auth.admin.listUsers = async () => ({
    data: {
      users: [
        { id: gestorId, email: 'real@example.invalid' },
        {
          id: '10000000-0000-4000-8000-000000000003',
          email: 'pending@example.invalid',
        },
      ],
    },
  })
  const { users } = await (await request({ action: 'list-users' })).json()
  assert.equal(users[1].hasProfile, false)
  assert.equal(users[1].role, null)
  assert.equal(users[1].status, null)
  assert.ok(users.some((user) => user.id === adminId && user.authMissing))
})

test('administrative access is rechecked after looking up the target identity', async () => {
  const { request, writes, backend, profiles } = setup()
  backend.auth.admin.getUserById = async (id) => {
    profiles[0].status = 'suspended'
    return { data: { user: { id } } }
  }
  assert.equal(
    (
      await request({
        action: 'reset-password',
        targetId: gestorId,
        password: 'Password123!',
        confirmed: true,
      })
    ).status,
    403
  )
  assert.equal(writes.length, 0)
})

test('Auth failures and email conflicts are redacted; unsupported deletion cannot execute', async () => {
  const { request, backend, auth } = setup()
  assert.equal(
    (
      await request({
        action: 'delete-user',
        targetId: gestorId,
        confirmed: true,
      })
    ).status,
    400
  )
  backend.auth.admin.updateUserById = async () => ({
    error: { message: 'private SDK details' },
  })
  const conflict = await request({
    action: 'update-email',
    targetId: gestorId,
    email: 'taken@example.invalid',
    confirmed: true,
  })
  assert.equal(conflict.status, 409)
  assert.ok(!(await conflict.text()).includes('private SDK details'))
  auth.auth.getUser = async () => ({ error: { message: 'invalid JWT' } })
  assert.equal((await request({ action: 'list-users' })).status, 401)
})
