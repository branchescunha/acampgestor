-- READ ONLY. Run manually before 019. No personal data is returned.
begin read only;
set local statement_timeout = '15s';

select current_setting('server_version') as server_version,
       current_setting('transaction_isolation') as isolation;

with expected(table_name, column_name, type_name) as (values
  ('profiles','id','uuid'), ('profiles','role','text'), ('profiles','status','text'),
  ('tribes','id','uuid'), ('tribes','camp_id','uuid'), ('tribes','is_active','bool'),
  ('participants','tribe_id','uuid'), ('participants','camp_id','uuid'),
  ('participants','is_active','bool'), ('room_inspections','tribe_id','uuid'),
  ('room_inspections','camp_id','uuid'), ('room_inspections','deleted_at','timestamptz')
)
select e.*, c.udt_name as actual_type, c.is_nullable,
       coalesce(c.udt_name = e.type_name, false) as compatible
from expected e left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = e.table_name and c.column_name = e.column_name
order by e.table_name, e.column_name;

select count(*) as active_admins from public.profiles where role = 'admin' and status = 'active';

select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('anon','authenticated');

select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls,
       owner.rolbypassrls as owner_bypasses_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_roles owner on owner.oid = c.relowner
where n.nspname = 'public' and c.relname in ('profiles','tribes','participants','room_inspections');

-- Inspect every effective write policy. A permissive extra policy can bypass another policy.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
and tablename in ('profiles','tribes','participants','room_inspections')
and cmd in ('ALL','INSERT','UPDATE','DELETE')
order by tablename, cmd, policyname;

select role_name,
       has_column_privilege(role_name, 'public.profiles','role','UPDATE') as update_profile_role,
       has_column_privilege(role_name, 'public.profiles','status','UPDATE') as update_profile_status,
       has_table_privilege(role_name, 'public.profiles','DELETE') as delete_profiles
from (values ('anon'),('authenticated')) roles(role_name);

-- ACL source is not effective row authorization. Include PUBLIC and inherited roles.
with relations as (
  select c.oid, c.relname, c.relowner, c.relacl from pg_class c
  where c.oid in ('public.profiles'::regclass,'public.tribes'::regclass,'public.participants'::regclass)
), acls as (
  select r.oid, r.relname, 0::smallint as attnum, null::text as column_name, a.*
  from relations r cross join lateral aclexplode(coalesce(r.relacl, acldefault('r', r.relowner))) a
  union all
  select r.oid, r.relname, c.attnum, c.attname::text, a.*
  from relations r join pg_attribute c on c.attrelid = r.oid and c.attnum > 0 and not c.attisdropped
  cross join lateral aclexplode(c.attacl) a
), scoped as (
  select a.*, case when grantee = 0 then true else pg_has_role('anon', grantee, 'USAGE') end as inherited_by_anon
  from acls a
)
select 'V2_019_ACL_STATE=' || jsonb_build_object(
  'sources', (select jsonb_agg(jsonb_build_object('table', relname, 'column', column_name,
    'grantee', case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee) end,
    'grantor', pg_get_userbyid(grantor), 'privilege', privilege_type,
    'grant_option', is_grantable, 'inherited_by_anon', inherited_by_anon)
    order by relname, attnum, grantee, privilege_type) from scoped),
  'anonymous_acl_needs_hardening', exists(select 1 from scoped where inherited_by_anon
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')),
  'unexpected_inherited_mutation_grants', exists(select 1 from scoped where inherited_by_anon
    and grantee not in (0, 'anon'::regrole::oid)
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')),
  'anonymous_permissive_write_policies', (select count(*) from pg_policy p
    where p.polrelid in (select oid from relations) and p.polpermissive and p.polcmd in ('*','a','w','d')
    and exists(select 1 from unnest(p.polroles) r(role_id)
      where case when role_id = 0 then true else pg_has_role('anon', role_id, 'USAGE') end)),
  'public_only_dml_dependencies', (select count(*) from scoped a
    cross join (values ('authenticated'::regrole::oid),('service_role'::regrole::oid)) r(role_id)
    where a.grantee = 0 and a.privilege_type in ('INSERT','UPDATE','DELETE')
    and not exists(select 1 from acls b where b.oid = a.oid and b.grantee <> 0
      and b.privilege_type = a.privilege_type and (b.attnum = 0 or b.attnum = a.attnum)
      and pg_has_role(r.role_id, b.grantee, 'USAGE')))
)::text;

select c.relname, con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles','participants','tribes','room_inspections')
and con.contype in ('f','c') order by c.relname, con.conname;

select c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
and c.relname in ('profiles','participants','tribes','room_inspections')
order by c.relname, t.tgname;

select count(*) as existing_019_triggers
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and t.tgname in ('profiles_lock_access_changes',
 'profiles_require_active_admin','participants_require_active_room','inspections_require_active_room');

select p.oid::regprocedure as function_name, p.prosecdef, p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_platform_admin','can_manage_camp',
 'create_confirmed_gestor_profile','save_camp_score','save_camp_result',
 'accept_invitation','get_invitation_by_token','add_organization_member_by_email');

commit;
