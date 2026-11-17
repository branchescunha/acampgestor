-- READ-ONLY. Execute after 017; metadata checks do not prove effective RLS.
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'camps', 'competition_teams', 'tribes', 'participants', 'score_events',
  'gymkhana_events', 'room_inspections', 'camp_operation_audit', 'camp_operation_receipts'
) order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in (
  'camps', 'competition_teams', 'tribes', 'participants', 'score_events',
  'gymkhana_events', 'room_inspections', 'camp_operation_audit', 'camp_operation_receipts'
) order by tablename, policyname;

select role_name, relation,
  has_table_privilege(role_name, 'public.' || relation, 'INSERT') as can_insert,
  has_any_column_privilege(role_name, 'public.' || relation, 'INSERT') as can_insert_any_column,
  has_table_privilege(role_name, 'public.' || relation, 'UPDATE') as can_update,
  has_any_column_privilege(role_name, 'public.' || relation, 'UPDATE') as can_update_any_column,
  has_table_privilege(role_name, 'public.' || relation, 'DELETE') as can_delete
from unnest(array['anon', 'authenticated']) role_name
cross join unnest(array['score_events', 'gymkhana_events', 'room_inspections', 'camp_operation_receipts']) relation;

select role_name,
  has_function_privilege(role_name, 'public.save_camp_score(uuid,uuid,text,uuid,jsonb)', 'EXECUTE') as score_rpc,
  has_function_privilege(role_name, 'public.save_camp_result(uuid,uuid,text,text,uuid,jsonb)', 'EXECUTE') as result_rpc,
  has_function_privilege(role_name, 'public.check_camp_operation(uuid,uuid,jsonb)', 'EXECUTE') as internal_helper,
  has_table_privilege(role_name, 'public.camp_score_totals', 'SELECT') as private_totals,
  has_table_privilege(role_name, 'public.public_camp_score_totals', 'SELECT') as public_totals
from unnest(array['anon', 'authenticated']) role_name;

select event_object_table, trigger_name, event_manipulation, action_timing
from information_schema.triggers where trigger_schema = 'public'
  and event_object_table in ('tribes', 'participants', 'score_events', 'gymkhana_events', 'room_inspections')
order by event_object_table, trigger_name, event_manipulation;
