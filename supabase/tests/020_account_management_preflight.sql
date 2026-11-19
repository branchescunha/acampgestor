begin read only;
select
  current_setting('server_version') as postgres_version,
  (select count(*) from public.profiles where role = 'admin' and status = 'active') as active_admins,
  (select count(*) from pg_trigger where not tgisinternal and tgrelid = 'public.profiles'::regclass
    and tgname in ('profiles_lock_access_changes', 'profiles_require_active_admin') and tgenabled = 'O') = 2 as protections_019_installed,
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) as profiles_rls,
  (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'profiles'
    and indexname = 'profiles_email_unique_idx') = 1 as profile_email_index,
  (select atttypid = 'jsonb'::regtype from pg_attribute where attrelid = 'auth.users'::regclass
    and attname = 'raw_app_meta_data' and not attisdropped) as auth_app_metadata_jsonb,
  not has_any_column_privilege('anon', 'public.profiles', 'INSERT,UPDATE')
    and not has_table_privilege('anon', 'public.profiles', 'DELETE,TRUNCATE') as anonymous_profile_writes_revoked,
  (select count(*) from public.profiles p left join auth.users u on u.id = p.id where u.id is null) as orphan_profiles,
  (select count(*) from public.profiles p join auth.users u on u.id = p.id
    join public.profiles other on other.id <> p.id and lower(other.email) = lower(u.email)
    where u.email is not null) as conflicting_auth_email_mirrors;

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
  and not tgisinternal order by tgname;

select conrelid::regclass as referencing_table, confrelid::regclass as referenced_table,
  conname, pg_get_constraintdef(oid) as definition
from pg_constraint where contype = 'f' and confrelid in ('public.organizations'::regclass, 'public.organization_members'::regclass)
order by referenced_table, referencing_table, conname;

select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'organizations', 'organization_members')
order by tablename, policyname;
commit;
