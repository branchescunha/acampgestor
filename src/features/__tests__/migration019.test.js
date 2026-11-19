import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
const sql = read('supabase/sql/019_protect_admin_and_inactive_rooms.sql')

test('019 serializes profile changes and locks active admin rows against stale snapshots', () => {
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /from public\.profiles\s+where role = 'admin' and status = 'active'\s+order by id\s+for update/i)
  assert.match(sql, /before update or delete on public\.profiles\s+for each statement/i)
  assert.match(sql, /after update or delete on public\.profiles\s+for each statement/i)
})

test('019 preserves old room links and rejects new use and reactivation of inactive rooms', () => {
  assert.match(sql, /new\.tribe_id is distinct from old\.tribe_id/)
  assert.match(sql, /new\.is_active is true and old\.is_active is not true/)
  assert.match(sql, /new\.deleted_at is null and old\.deleted_at is not null/)
  assert.match(sql, /is_active is not false for share/)
})

test('019 rechecks a signed-in administrator after acquiring locks without replacing RLS', () => {
  assert.match(sql, /auth\.uid\(\) is not null and not exists[\s\S]*?id = auth\.uid\(\) and role = 'admin' and status = 'active'/)
  assert.ok(sql.indexOf('for update;') < sql.indexOf('id = auth.uid()'))
})

test('019 stays transactional, does not replace RLS or grant trigger function execution', () => {
  assert.match(sql, /^begin;/)
  assert.match(sql, /lock table public\.profiles in share row exclusive mode;/)
  assert.match(sql, /commit;\s*$/)
  assert.equal((sql.match(/revoke all on function[\s\S]*?from public, anon, authenticated;/g) || []).length, 3)
  assert.doesNotMatch(sql, /^\s*(?:delete from|update public\.|insert into|create policy|grant|alter table)/im)
})

test('019 operational verification scripts contain no write statements', () => {
  for (const path of ['supabase/tests/019_admin_room_preflight.sql', 'supabase/tests/019_admin_room_checks.sql']) {
    const source = read(path)
    assert.match(source, /begin read only;/i)
    assert.doesNotMatch(source, /^\s*(?:delete|update|insert|alter|create|drop|grant|revoke|truncate|call|do)\b/im)
  }
})

test('019 revokes anonymous and PUBLIC mutation grants without granting new authenticated rights', () => {
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger, maintain on table %s from public, anon/i)
  assert.match(sql, /foreach target in array array\['public\.profiles'::regclass, 'public\.tribes'::regclass,\s*'public\.participants'::regclass\]/)
  assert.match(sql, /revoke insert \(%1\$s\), update \(%1\$s\), references \(%1\$s\)/i)
  assert.match(sql, /has_table_privilege\('anon', target, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'\)/)
  assert.match(sql, /has_any_column_privilege\('anon', target, 'INSERT,UPDATE,REFERENCES'\)/)
  assert.match(sql, /authenticated_before is distinct from authenticated_after/)
  assert.match(sql, /revoke truncate on table %s from authenticated/)
  assert.match(sql, /has_table_privilege\('authenticated', target, 'TRUNCATE'\)/)
  assert.doesNotMatch(sql, /revoke select|^\s*grant\b/im)
})

test('019 preflight distinguishes ACL grants, inherited sources and applicable RLS policies', () => {
  const preflight = read('supabase/tests/019_admin_room_preflight.sql')
  assert.match(preflight, /aclexplode/)
  assert.match(preflight, /attacl/)
  assert.match(preflight, /pg_has_role\('anon'/)
  assert.match(preflight, /anonymous_permissive_write_policies/)
  assert.match(preflight, /anonymous_acl_needs_hardening/)
  assert.match(preflight, /V2_019_ACL_STATE=/)
  assert.match(read('supabase/tests/019_admin_room_checks.sql'), /anonymous_mutation_privileges_revoked/)
})
