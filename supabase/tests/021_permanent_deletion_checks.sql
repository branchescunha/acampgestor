begin read only;
select public.permanent_deletion_ready() as migration_021_ready,
  public.account_management_ready() as migration_020_preserved,
  not has_function_privilege('anon', 'public.delete_camp_permanently(uuid,text)', 'execute') as anon_camp_delete_denied,
  has_function_privilege('authenticated', 'public.delete_camp_permanently(uuid,text)', 'execute') as authenticated_rpc_available,
  not has_table_privilege('authenticated', 'public.camps', 'DELETE') as direct_camp_delete_revoked,
  (select count(*) from public.profiles where role = 'admin' and status = 'active') as active_admins;

select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_execute
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
  'delete_camp_permanently', 'delete_camp_data_internal', 'lock_permanent_deletion',
  'assert_camp_deletion_graph', 'camp_deletion_counts', 'preview_account_deletion',
  'prepare_account_deletion', 'guard_pending_account_deletion',
  'guard_account_auth_deletion', 'finish_account_auth_deletion', 'permanent_deletion_ready', 'account_deletion_status');

select relname, relrowsecurity,
  has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
  has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE') as client_access
from pg_class where oid in ('public.account_deletion_jobs'::regclass, 'public.camp_deletion_receipts'::regclass);
select state, count(*) as operations from public.account_deletion_jobs group by state;
commit;
