begin read only;
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

-- Any result requires review; the deletion RPC also refuses these dependencies.
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

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('profiles', 'camps', 'organization_members')
order by tablename, policyname;
commit;
