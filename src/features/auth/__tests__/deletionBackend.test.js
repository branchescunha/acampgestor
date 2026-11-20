import test from 'node:test'
import assert from 'node:assert/strict'
import { handleAccountDeletion } from '../../../../supabase/functions/manage-user-account/deletion.mjs'

const actorId = '10000000-0000-4000-8000-000000000001'
const targetId = '10000000-0000-4000-8000-000000000002'
function setup({
  role = 'admin',
  state = 'pending_auth',
  failure = false,
} = {}) {
  const calls = []
  const backend = {
    async rpc(name, payload) {
      calls.push({ name, payload })
      return {
        data:
          name === 'account_deletion_status'
            ? failure
              ? 'pending_auth'
              : 'completed'
            : name === 'preview_account_deletion'
              ? { camps: [], counts: {}, blockers: [] }
              : { state, target_id: targetId },
      }
    },
    auth: {
      admin: {
        async deleteUser(id, soft) {
          calls.push({ id, soft })
          return failure ? { error: { message: 'private detail' } } : {}
        },
      },
    },
  }
  const reply = (status, body) => ({ status, body })
  const actor = { id: actorId, role, status: 'active' }
  const identity = { id: actorId, email: 'fixture@example.invalid' }
  const run = (body) =>
    handleAccountDeletion({
      body,
      actor,
      identity,
      backend,
      reply,
      verifyPassword: async () => actorId,
    })
  return { run, calls, backend }
}
test('gestor cannot choose another account or invoke administrative deletion', async () => {
  const { run, calls } = setup({ role: 'gestor' })
  assert.equal(
    (
      await run({
        action: 'delete-user',
        targetId,
        confirmation: 'EXCLUIR CONTA',
      })
    ).status,
    403
  )
  assert.equal(calls.length, 0)
})
test('self deletion uses verified identity, password reauthentication and explicit confirmation', async () => {
  const { run, calls } = setup({ role: 'gestor' })
  assert.equal(
    (await run({ action: 'delete-self', targetId, confirmation: 'wrong' }))
      .status,
    400
  )
  assert.equal(calls.length, 0)
  await run({
    action: 'delete-self',
    targetId,
    confirmation: 'EXCLUIR CONTA',
    password: 'only-in-fixture',
  })
  assert.equal(calls[0].payload.p_target_id, actorId)
})
test('Auth failure reports pending deletion, never success or private SDK details', async () => {
  const { run, calls } = setup({ failure: true })
  const result = await run({
    action: 'delete-user',
    targetId,
    confirmation: 'EXCLUIR CONTA',
  })
  assert.equal(result.status, 409)
  assert.equal(result.body.pending, true)
  assert.doesNotMatch(JSON.stringify(result.body), /private detail/)
  assert.equal(calls[1].id, targetId)
  assert.equal(calls[1].soft, false)
})
test('completed receipt is idempotent and does not repeat Auth deletion', async () => {
  const { run, calls } = setup({ state: 'completed' })
  const result = await run({
    action: 'delete-user',
    targetId,
    confirmation: 'EXCLUIR CONTA',
  })
  assert.equal(result.status, 200)
  assert.equal(calls.length, 1)
})
test('ADMIN cannot delete own ADMIN account through gestor flow', async () => {
  const { run, calls } = setup()
  assert.equal(
    (await run({ action: 'delete-self', confirmation: 'EXCLUIR CONTA' }))
      .status,
    403
  )
  assert.equal(calls.length, 0)
})
test('preview is read-only and does not call the Auth deletion API', async () => {
  const { run, calls } = setup()
  const result = await run({ action: 'preview-delete-user', targetId })
  assert.equal(result.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'preview_account_deletion')
})
test('failed password verification prevents all data cleanup', async () => {
  let called = false
  const result = await handleAccountDeletion({
    body: {
      action: 'delete-self',
      confirmation: 'EXCLUIR CONTA',
      password: 'invalid',
    },
    actor: { id: actorId, role: 'gestor' },
    identity: { id: actorId },
    backend: {
      rpc() {
        called = true
      },
    },
    verifyPassword: async () => null,
    reply: (status, body) => ({ status, body }),
  })
  assert.equal(result.status, 403)
  assert.equal(called, false)
})
test('SQL denial or failed preparation never calls Auth delete', async () => {
  let deleted = false
  const result = await handleAccountDeletion({
    body: { action: 'delete-user', targetId, confirmation: 'EXCLUIR CONTA' },
    actor: { id: actorId, role: 'admin', status: 'active' },
    identity: { id: actorId },
    backend: {
      rpc: async () => ({ error: { code: '42501' } }),
      auth: {
        admin: {
          deleteUser() {
            deleted = true
          },
        },
      },
    },
    reply: (status, body) => ({ status, body }),
  })
  assert.equal(result.status, 403)
  assert.equal(deleted, false)
})
test('a lost Auth response is reconciled by the committed SQL receipt', async () => {
  const { run, backend } = setup()
  backend.auth.admin.deleteUser = async () => {
    throw new Error('network timeout')
  }
  const result = await run({
    action: 'delete-user',
    targetId,
    confirmation: 'EXCLUIR CONTA',
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.state, 'completed')
})
test('even a successful Auth response cannot bypass missing completion evidence', async () => {
  const { run, backend } = setup()
  const rpc = backend.rpc
  backend.rpc = async (name, params) =>
    name === 'account_deletion_status'
      ? { error: { message: 'unavailable' } }
      : rpc(name, params)
  const result = await run({
    action: 'delete-user',
    targetId,
    confirmation: 'EXCLUIR CONTA',
  })
  assert.equal(result.status, 409)
  assert.equal(result.body.pending, true)
})
