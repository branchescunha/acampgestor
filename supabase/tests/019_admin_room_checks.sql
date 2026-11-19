-- READ ONLY. Structural verification only; not a functional/concurrency test.
begin read only;
set local statement_timeout = '15s';

with expected(table_name, trigger_name, function_name, trigger_type) as (values
 ('profiles','profiles_lock_access_changes','lock_profile_access_changes',26),
 ('profiles','profiles_require_active_admin','require_active_platform_admin',24),
 ('participants','participants_require_active_room','require_active_room_assignment',23),
 ('room_inspections','inspections_require_active_room','require_active_room_assignment',23)
)
select e.table_name, e.trigger_name,
       coalesce(t.tgenabled = 'O' and t.tgtype = e.trigger_type and p.proname = e.function_name, false) as installed_correctly,
       pg_get_triggerdef(t.oid) as definition
from expected e
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
left join pg_trigger t on t.tgrelid = c.oid and t.tgname = e.trigger_name
left join pg_proc p on p.oid = t.tgfoid;

with expected(name) as (values ('lock_profile_access_changes'),
 ('require_active_platform_admin'),('require_active_room_assignment'))
select e.name, p.oid is not null as present, p.prosecdef as security_definer,
       p.provolatile = 'v' as volatile, p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       owner.rolsuper or owner.rolbypassrls as owner_can_bypass_rls,
       pg_get_functiondef(p.oid) as definition
from expected e left join pg_namespace n on n.nspname = 'public'
left join pg_proc p on p.pronamespace = n.oid and p.proname = e.name and p.pronargs = 0
left join pg_roles owner on owner.oid = p.proowner;

select count(*) as active_admins from public.profiles where role = 'admin' and status = 'active';

select c.relname,
       not has_table_privilege('authenticated', c.oid, 'TRUNCATE') as authenticated_truncate_revoked,
       not (has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
         or has_any_column_privilege('anon', c.oid, 'INSERT,UPDATE,REFERENCES'))
         as anonymous_mutation_privileges_revoked,
       not exists(select 1 from aclexplode(c.relacl) a where a.grantee = 0
         and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'))
         and not exists(select 1 from pg_attribute col cross join lateral aclexplode(col.attacl) a
           where col.attrelid = c.oid and col.attnum > 0 and not col.attisdropped and a.grantee = 0
           and a.privilege_type in ('INSERT','UPDATE','REFERENCES')) as public_mutation_grants_revoked
from pg_class c where c.oid in ('public.profiles'::regclass,'public.tribes'::regclass,'public.participants'::regclass);

select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles','tribes','participants','room_inspections');

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
and tablename in ('profiles','tribes','participants','room_inspections')
and cmd in ('ALL','INSERT','UPDATE','DELETE')
order by tablename, cmd, policyname;

commit;
