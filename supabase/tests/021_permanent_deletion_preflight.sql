begin read only;
-- Review only these exact legacy FK shapes; other dependencies still block.
with reviewed_legacy_fk as (
  select c.oid from pg_constraint c
  join pg_attribute child on child.attrelid = c.conrelid and child.attnum = c.conkey[1]
  join pg_attribute parent on parent.attrelid = c.confrelid and parent.attnum = c.confkey[1]
  where c.contype = 'f' and cardinality(c.conkey) = 1 and cardinality(c.confkey) = 1 and parent.attname = 'id'
    and ((c.confrelid = 'public.tribes'::regclass and child.attname = 'tribe_id'
      and c.conrelid in (to_regclass('public.meal_checkpoints'), to_regclass('public.room_checks')))
      or (c.confrelid = 'public.participants'::regclass and child.attname = 'participant_id'
        and c.conrelid = to_regclass('public.gymkhana_members')))
)
select 'V2_021_REVIEWED_LEGACY_FK', c.conrelid::regclass, c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c where c.oid in (select oid from reviewed_legacy_fk);

select current_setting('server_version') as postgres_version,
  public.account_management_ready() as migration_020_ready,
  (select count(*) from public.profiles where role = 'admin' and status = 'active') as active_admins,
  to_regclass('public.account_deletion_jobs') is null as migration_021_not_installed,
  exists(select 1 from pg_constraint where contype = 'f' and conrelid = 'public.profiles'::regclass
    and confrelid = 'auth.users'::regclass and confdeltype = 'c') as profile_auth_cascade,
  (select count(*) = 3 from pg_class where oid in ('public.camps'::regclass, 'public.profiles'::regclass, 'public.organization_members'::regclass) and relrowsecurity) as required_rls,
  (select count(*) = 2 from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal and tgenabled = 'O'
    and tgname in ('profiles_lock_access_changes', 'profiles_require_active_admin')) as last_admin_guards;

-- Review actual FKs and custom triggers before authorizing installation. No PII.
select conrelid::regclass as child_table, confrelid::regclass as parent_table,
  conname, pg_get_constraintdef(oid) as definition
from pg_constraint where contype = 'f' and confrelid in (
  'public.camps'::regclass, 'public.competition_teams'::regclass, 'public.tribes'::regclass,
  'public.participants'::regclass, 'public.score_events'::regclass,
  'public.gymkhana_events'::regclass, 'public.room_inspections'::regclass,
  'auth.users'::regclass, 'public.profiles'::regclass, 'public.organization_members'::regclass)
order by parent_table, child_table, conname;

select tgrelid::regclass as table_name, tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger where not tgisinternal and tgrelid in (
  'public.camps'::regclass, 'public.tribes'::regclass, 'public.participants'::regclass,
  'public.score_events'::regclass, 'public.room_inspections'::regclass,
  'public.gymkhana_events'::regclass, 'public.profiles'::regclass, 'auth.users'::regclass)
order by table_name, tgname;

-- Report all dependencies outside the deletion graph, including preserved legacy.
select c.conrelid::regclass as unreviewed_child, c.conname
from pg_constraint c where c.contype = 'f' and c.confrelid in (
  'public.camps'::regclass, 'public.competition_teams'::regclass, 'public.tribes'::regclass,
  'public.participants'::regclass, 'public.score_events'::regclass,
  'public.gymkhana_events'::regclass, 'public.gymkhana_settings'::regclass,
  'public.room_inspections'::regclass, 'public.camp_operation_receipts'::regclass,
  'public.camp_operation_audit'::regclass)
and c.conrelid not in (
  'public.camps'::regclass, 'public.competition_teams'::regclass, 'public.tribes'::regclass,
  'public.participants'::regclass, 'public.score_events'::regclass,
  'public.gymkhana_events'::regclass, 'public.gymkhana_settings'::regclass,
  'public.room_inspections'::regclass, 'public.camp_operation_receipts'::regclass,
  'public.camp_operation_audit'::regclass);

-- Production has these three legacy tables. Inventory counts only, never PII.
-- Linked rows are preserved and block the affected camp, not installation.
select 'V2_021_LEGACY_INVENTORY', 'public.meal_checkpoints' as legacy_table,
  count(*) as total_records, count(parent.id) as linked_records,
  count(distinct parent.camp_id) as affected_camps,
  count(*) filter (where parent.id is null) as orphan_records
from public.meal_checkpoints child left join public.tribes parent on parent.id = child.tribe_id
union all
select 'V2_021_LEGACY_INVENTORY', 'public.room_checks', count(*), count(parent.id),
  count(distinct parent.camp_id), count(*) filter (where parent.id is null)
from public.room_checks child left join public.tribes parent on parent.id = child.tribe_id
union all
select 'V2_021_LEGACY_INVENTORY', 'public.gymkhana_members', count(*), count(parent.id),
  count(distinct parent.camp_id), count(*) filter (where parent.id is null)
from public.gymkhana_members child left join public.participants parent on parent.id = child.participant_id;

select 'V2_021_LEGACY_AFFECTED_CAMP', parent.camp_id, 'public.meal_checkpoints', count(*)
from public.meal_checkpoints child join public.tribes parent on parent.id = child.tribe_id group by parent.camp_id
union all
select 'V2_021_LEGACY_AFFECTED_CAMP', parent.camp_id, 'public.room_checks', count(*)
from public.room_checks child join public.tribes parent on parent.id = child.tribe_id group by parent.camp_id
union all
select 'V2_021_LEGACY_AFFECTED_CAMP', parent.camp_id, 'public.gymkhana_members', count(*)
from public.gymkhana_members child join public.participants parent on parent.id = child.participant_id group by parent.camp_id;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('profiles', 'camps', 'organization_members')
order by tablename, policyname;

select n.nspname as schema_name, c.relname as table_name, a.attname as column_name,
  format_type(a.atttypid, a.atttypmod) as column_type, a.attnotnull
from pg_attribute a join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where a.attnum > 0 and not a.attisdropped and a.attrelid in (
  'public.camps'::regclass, 'public.profiles'::regclass,
  'public.organizations'::regclass, 'public.organization_members'::regclass,
  'public.camp_operation_receipts'::regclass, 'public.camp_operation_audit'::regclass)
order by schema_name, table_name, a.attnum;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('profiles', 'camps', 'organization_members')
order by table_name, grantee, privilege_type;

-- Machine-readable gates. Catalog inspection above remains mandatory.
with reviewed_legacy_fk as (
  select c.oid from pg_constraint c
  join pg_attribute child on child.attrelid = c.conrelid and child.attnum = c.conkey[1]
  join pg_attribute parent on parent.attrelid = c.confrelid and parent.attnum = c.confkey[1]
  where c.contype = 'f' and cardinality(c.conkey) = 1 and cardinality(c.confkey) = 1 and parent.attname = 'id'
    and ((c.confrelid = 'public.tribes'::regclass and child.attname = 'tribe_id'
      and c.conrelid in (to_regclass('public.meal_checkpoints'), to_regclass('public.room_checks')))
      or (c.confrelid = 'public.participants'::regclass and child.attname = 'participant_id'
        and c.conrelid = to_regclass('public.gymkhana_members')))
)
select 'V2_021_PREFLIGHT_GATES', jsonb_build_object(
  'migration_020_ready', public.account_management_ready() is true,
  'active_admin_present', exists(select 1 from public.profiles where role = 'admin' and status = 'active'),
  'required_rls', (select count(*) = 3 from pg_class where oid in (
    'public.camps'::regclass, 'public.profiles'::regclass, 'public.organization_members'::regclass) and relrowsecurity),
  'last_admin_guards', (select count(*) = 2 from pg_trigger where tgrelid = 'public.profiles'::regclass
    and not tgisinternal and tgenabled = 'O' and tgname in ('profiles_lock_access_changes', 'profiles_require_active_admin')),
  'profile_auth_cascade', exists(select 1 from pg_constraint where contype = 'f'
    and conrelid = 'public.profiles'::regclass and confrelid = 'auth.users'::regclass and confdeltype = 'c'),
  'can_create_public_objects', has_schema_privilege('public', 'CREATE'),
  'can_create_auth_trigger', has_table_privilege('auth.users', 'TRIGGER'),
  'new_tables_absent', to_regclass('public.account_deletion_jobs') is null and to_regclass('public.camp_deletion_receipts') is null,
  'new_functions_absent', not exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace
    and proname = any(array['lock_permanent_deletion', 'camp_deletion_counts', 'assert_camp_deletion_graph',
      'delete_camp_data_internal', 'delete_camp_permanently', 'preview_account_deletion', 'prepare_account_deletion',
      'guard_pending_account_deletion', 'guard_account_auth_deletion', 'finish_account_auth_deletion',
      'account_deletion_status', 'permanent_deletion_ready'])),
  'new_triggers_absent', not exists(select 1 from pg_trigger where not tgisinternal
    and tgrelid in ('public.camps'::regclass, 'public.profiles'::regclass, 'auth.users'::regclass)
    and tgname = any(array['camps_guard_pending_owner', 'profiles_guard_pending_deletion',
      'auth_guard_pending_deletion', 'auth_require_prepared_account_deletion', 'auth_finish_account_deletion'])),
  'new_policy_absent', not exists(select 1 from pg_policy where polrelid = 'public.camps'::regclass
    and polname = 'Camp deletion requires dedicated RPC'),
  'camp_dependencies_reviewed', not exists(select 1 from pg_constraint where contype = 'f'
    and oid not in (select oid from reviewed_legacy_fk)
    and confrelid = any(array['public.camps'::regclass, 'public.competition_teams'::regclass, 'public.tribes'::regclass,
      'public.participants'::regclass, 'public.score_events'::regclass, 'public.gymkhana_events'::regclass,
      'public.gymkhana_settings'::regclass, 'public.room_inspections'::regclass,
      'public.camp_operation_receipts'::regclass, 'public.camp_operation_audit'::regclass])
    and conrelid <> all(array['public.camps'::regclass, 'public.competition_teams'::regclass, 'public.tribes'::regclass,
      'public.participants'::regclass, 'public.score_events'::regclass, 'public.gymkhana_events'::regclass,
      'public.gymkhana_settings'::regclass, 'public.room_inspections'::regclass,
      'public.camp_operation_receipts'::regclass, 'public.camp_operation_audit'::regclass]))
);
commit;
