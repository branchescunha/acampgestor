import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  canDeleteCamp,
  deleteCamp,
  permanentDeletionEnabled,
} from '../permanentDeletion.js'

test('camp deletion is disabled until installation and requires ownership, not shared organization membership', () => {
  assert.equal(permanentDeletionEnabled, false)
  const camp = { id: 'camp-a', created_by: 'owner' }
  assert.equal(
    canDeleteCamp(camp, { id: 'owner', role: 'gestor', status: 'active' }),
    true
  )
  assert.equal(
    canDeleteCamp(camp, { id: 'other', role: 'gestor', status: 'active' }),
    false
  )
  assert.equal(
    canDeleteCamp(camp, { id: 'owner', role: 'gestor', status: 'suspended' }),
    false
  )
  assert.equal(
    canDeleteCamp(camp, { id: 'admin', role: 'admin', status: 'active' }),
    true
  )
  assert.equal(canDeleteCamp(null, { role: 'admin', status: 'active' }), false)
})
test('camp deletion uses one RPC, explicit camp identity and confirmation, without client cascades', async () => {
  const calls = []
  const client = {
    rpc: async (...args) => {
      calls.push(args)
      return { data: { deleted: true } }
    },
  }
  await deleteCamp(client, { id: 'a', name: 'Camp A' })
  assert.deepEqual(calls, [
    ['delete_camp_permanently', { p_camp_id: 'a', p_confirmation: 'Camp A' }],
  ])
  await assert.rejects(
    deleteCamp(
      { rpc: async () => ({ error: { code: '23503' } }) },
      { id: 'a' }
    ),
    /outro acampamento/
  )
})
test('021 contracts preserve audit guards, protect ADMIN and restrict forged actor RPCs', () => {
  const sql = readFileSync(
    new URL(
      '../../../../supabase/sql/021_permanent_deletion.sql',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(sql, /^begin;/)
  assert.match(sql, /commit;\s*$/)
  assert.doesNotMatch(
    sql,
    /disable trigger|disable row level security|delete from auth\.users|drop .*cascade/i
  )
  assert.match(sql, /child\.camp_id is distinct from \$1/)
  assert.doesNotMatch(sql, /then new\.created_by/)
  assert.match(sql, /to_jsonb\(new\)->>'created_by'/)
  assert.match(sql, /target\.role <> 'gestor'/)
  assert.match(sql, /Only active ADMIN may change camp ownership/)
  assert.match(sql, /job\.actor_id = actor\.id\)\)\)\) is distinct from true/)
  assert.match(sql, /role = 'gestor' and status = 'suspended'/)
  assert.match(
    sql,
    /revoke all on function public\.prepare_account_deletion\(uuid, uuid, text, uuid\[\]\) from public, anon, authenticated/
  )
  const score = sql.indexOf('delete from public.score_events')
  const participant = sql.indexOf('delete from public.participants')
  const room = sql.indexOf('delete from public.tribes')
  const audit = sql.indexOf('delete from public.camp_operation_audit')
  assert.ok(score < participant && participant < room && room < audit)
})
