import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAcampGestorStore } from '../helpers/inMemoryAcampGestor.js'
import { createAccountHandler } from '../../supabase/functions/manage-user-account/handler.mjs'

const adminId = '22000000-0000-4000-8000-000000000001'
const gestorId = '22000000-0000-4000-8000-000000000002'

// HTTP handler integration with adapters, NOT an emulation of PostgreSQL/RLS.
function harness({ actorId = adminId, ready = true, authFailure = false } = {}) {
  const store = new InMemoryAcampGestorStore({ qaRunId: 'QA-DELETE-021' })
  store.createProfile({ id: adminId, email: 'admin@example.invalid', role: 'admin', status: 'active' })
  store.createProfile({ id: gestorId, email: 'gestor@example.invalid', role: 'gestor', status: 'active' })
  const calls = []
  let pending = false
  let complete = false
  const backend = {
    from() {
      return {
        select() { return this },
        eq(key, value) { this.id = value; return this },
        async maybeSingle() { return { data: store.findById('profiles', this.id) } },
      }
    },
    async rpc(name, params) {
      calls.push({ name, params })
      if (name === 'permanent_deletion_ready') return { data: ready }
      if (name === 'preview_account_deletion') return { data: { camps: [], blockers: [], state: pending ? 'pending_auth' : 'preview' } }
      if (name === 'account_deletion_status') return { data: complete ? 'completed' : 'pending_auth' }
      if (params.p_target_id !== gestorId) return { error: { code: '42501' } }
      if (name === 'prepare_account_deletion') { pending = true; return { data: { state: 'pending_auth', target_id: gestorId } } }
      throw new Error('Unexpected RPC')
    },
    auth: { admin: { async deleteUser(id, soft) {
      calls.push({ deleteId: id, soft })
      if (authFailure) return { error: { message: 'synthetic Auth failure' } }
      complete = true
      return {}
    } } },
  }
  const handler = createAccountHandler({
    auth: { auth: { getUser: async () => ({ data: { user: { id: actorId, email: 'fixture@example.invalid' } } }) } },
    backend, deletionEnabled: true, verifyPassword: async () => actorId,
  })
  const request = (body, token = 'fixture') => handler(new Request('https://fixture.invalid', {
    method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))
  return { request, calls }
}

test('account deletion HTTP integration rejects anonymous users and absent migration without writes', async () => {
  const { request, calls } = harness({ ready: false })
  assert.equal((await request({ action: 'delete-user', targetId: gestorId }, '')).status, 401)
  assert.equal(calls.length, 0)
  assert.equal((await request({ action: 'delete-user', targetId: gestorId })).status, 503)
  assert.deepEqual(calls.map(call => call.name), ['permanent_deletion_ready'])
})
test('ADMIN orchestration requires the prepared SQL identity and a committed completion receipt', async () => {
  const { request, calls } = harness()
  const response = await request({ action: 'delete-user', targetId: gestorId, confirmation: 'EXCLUIR CONTA', campIds: [] })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).state, 'completed')
  assert.deepEqual(calls.map(call => call.name || 'auth-delete'), ['permanent_deletion_ready', 'prepare_account_deletion', 'auth-delete', 'account_deletion_status'])
  assert.equal(calls[1].params.p_actor_id, adminId)
  assert.equal(calls[2].deleteId, gestorId)
})
test('GESTOR administrative deletion is denied; self deletion binds identity rather than supplied target', async () => {
  const { request, calls } = harness({ actorId: gestorId })
  assert.equal((await request({ action: 'delete-user', targetId: adminId, confirmation: 'EXCLUIR CONTA' })).status, 403)
  assert.equal(calls.some(call => call.deleteId), false)
  const result = await request({ action: 'delete-self', targetId: adminId, confirmation: 'EXCLUIR CONTA', password: 'Fixture-password123!' })
  assert.equal(result.status, 200)
  assert.equal(calls.find(call => call.name === 'prepare_account_deletion').params.p_target_id, gestorId)
})
test('intermediate Auth failure is explicit, redacted and cannot be reported as successful completion', async () => {
  const { request } = harness({ authFailure: true })
  const response = await request({ action: 'delete-user', targetId: gestorId, confirmation: 'EXCLUIR CONTA' })
  const body = await response.json()
  assert.equal(response.status, 409)
  assert.equal(body.pending, true)
  assert.equal(body.success, undefined)
  assert.doesNotMatch(JSON.stringify(body), /synthetic Auth failure/)
})
