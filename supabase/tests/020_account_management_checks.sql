begin read only;
select
  to_regprocedure('public.delete_empty_organization(uuid)') is not null as organization_rpc_installed,
  (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and (
    (tgrelid = 'public.profiles'::regclass and tgname in ('profiles_lock_access_changes', 'profiles_require_active_admin', 'profiles_guard_account_changes'))
    or (tgrelid = 'auth.users'::regclass and tgname in ('acampgestor_sync_profile_auth_email', 'acampgestor_guard_admin_auth_operation')))) = 5 as required_triggers_installed,
  public.account_management_ready() as auth_transaction_guard_ready,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles'
    and policyname in ('Active gestors can update own name', 'Account changes require authorized actor')) = 2 as self_service_policies_installed,
  (select count(*) from public.profiles where role = 'admin' and status = 'active') as active_admins,
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) as profiles_rls;

select proname, prosecdef, proconfig,
  has_function_privilege('anon', oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', oid, 'execute') as authenticated_execute
from pg_proc where pronamespace = 'public'::regnamespace
and proname in ('guard_profile_account_changes', 'sync_profile_auth_email', 'delete_empty_organization', 'guard_admin_auth_operation', 'account_management_ready');
commit;
