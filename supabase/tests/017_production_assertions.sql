-- Post-installation checks only. No fixtures, DML or data changes.
do $$
declare relation text; client_role text; signature text; relation_oid regclass;
begin
  perform 'public.camp_operation_receipts'::regclass, 'public.camp_operation_audit'::regclass;
  if (select count(*) from information_schema.columns where table_schema = 'public'
      and ((table_name = 'tribes' and column_name = 'competition_team_id' and udt_name = 'uuid')
        or (table_name = 'gymkhana_events' and column_name = 'awards' and udt_name = 'jsonb')
        or (table_name in ('gymkhana_events', 'room_inspections') and column_name = 'deleted_at' and udt_name = 'timestamptz')
        or (table_name = 'score_events' and column_name in ('created_by', 'operation_id', 'voided_by') and udt_name = 'uuid')
        or (table_name = 'score_events' and column_name = 'is_voided' and udt_name = 'bool')
        or (table_name = 'score_events' and column_name = 'voided_at' and udt_name = 'timestamptz'))) <> 9 then
    raise exception 'Unified model columns missing or incompatible';
  end if;
  if (select count(*) from pg_constraint where contype = 'f' and convalidated
      and ((conrelid = 'public.tribes'::regclass and conname = 'tribes_team_camp_fk')
        or (conrelid = 'public.participants'::regclass and conname = 'participants_competition_team_camp_fk'))) <> 2 then
    raise exception 'Room/team or participant/team constraints missing';
  end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal and t.tgenabled in ('O', 'A')
      and (c.relname, t.tgname) in (
        ('tribes', 'tribes_prevent_camp_change'), ('tribes', 'tribes_enforce_room_team'),
        ('participants', 'participants_check_group_camp'), ('participants', 'participants_preserve_score_history'),
        ('score_events', 'score_events_set_identity'), ('score_events', 'score_events_audit_change'),
        ('gymkhana_events', 'gymkhana_events_audit_change'), ('room_inspections', 'room_inspections_audit_change'))) <> 8 then
    raise exception 'Unified model triggers missing or disabled';
  end if;
  foreach relation in array array['score_events', 'gymkhana_events', 'room_inspections'] loop
    relation_oid := ('public.' || relation)::regclass;
    if not (select relrowsecurity from pg_class where oid = relation_oid) then
      raise exception 'RLS is disabled on %', relation;
    end if;
    if (select count(*) from pg_policy where polrelid = relation_oid and not polpermissive and polcmd = '*'
        and ((polname = 'Enforce result camp isolation' and polroles = array['authenticated'::regrole::oid]
              and pg_get_expr(polqual, polrelid) like '%can_manage_camp(camp_id)%'
              and pg_get_expr(polwithcheck, polrelid) like '%can_manage_camp(camp_id)%')
          or (polname = 'Block anonymous result access' and polroles = array['anon'::regrole::oid]
              and pg_get_expr(polqual, polrelid) = 'false' and pg_get_expr(polwithcheck, polrelid) = 'false'))) <> 2 then
      raise exception 'Required restrictive policies missing on %', relation;
    end if;
    foreach client_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(client_role, relation_oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
         or has_any_column_privilege(client_role, relation_oid, 'INSERT,UPDATE') then
        raise exception 'Unexpected direct write privilege: % on %', client_role, relation;
      end if;
    end loop;
  end loop;
  foreach signature in array array[
    'public.save_camp_score(uuid,uuid,text,uuid,jsonb)',
    'public.save_camp_result(uuid,uuid,text,text,uuid,jsonb)'
  ] loop
    if not has_function_privilege('authenticated', signature, 'EXECUTE')
       or has_function_privilege('anon', signature, 'EXECUTE') then
      raise exception 'Unexpected RPC privilege: %', signature;
    end if;
    if (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = signature::regprocedure) is distinct from true then
      raise exception 'Unexpected RPC security configuration: %', signature;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.check_camp_operation(uuid,uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.check_camp_operation(uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'Internal authorization helper is exposed';
  end if;
  if has_table_privilege('anon', 'public.camp_score_totals', 'SELECT')
     or not has_table_privilege('authenticated', 'public.camp_score_totals', 'SELECT')
     or not has_table_privilege('anon', 'public.public_camp_score_totals', 'SELECT') then
    raise exception 'Unexpected aggregate privileges';
  end if;
  if (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.camp_score_totals'::regclass) is distinct from true then
    raise exception 'Private totals must use invoker security';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public'
      and table_name in ('camp_score_totals', 'public_camp_score_totals') and column_name = 'participants_count') <> 2 then
    raise exception 'Unified aggregate columns missing';
  end if;
end $$;
-- Resolve/plan the frontend projection without returning application data.
select competition_team_id, positive_points, penalty_points, total, participants_count
from public.camp_score_totals where false;
select competition_team_id, positive_points, penalty_points, total, participants_count
from public.public_camp_score_totals where false;
select 'V2_MIGRATIONS_VERIFIED' as deployment_gate;
