-- Read-only; safe to review the real schema without returning personal data.
-- Run as postgres in SQL Editor. This file performs no installation or fixtures.
select current_setting('server_version') as postgres_version,
  to_regprocedure('public.can_manage_camp(uuid)') is not null as has_authorization_helper,
  to_regclass('public.public_ranking_competition_teams') is not null as has_public_teams,
  to_regclass('public.public_ranking_competition_participants') is not null as has_public_participants,
  to_regclass('public.public_ranking_competition_score_events') is not null as has_public_scores;

-- If any target already exists, compare its definition instead of assuming IF NOT EXISTS validates it.
select table_name, column_name, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'tribes' and column_name = 'competition_team_id')
    or (table_name = 'score_events' and column_name in ('created_by', 'operation_id', 'is_voided', 'voided_at', 'voided_by'))
    or (table_name = 'gymkhana_events' and column_name in ('awards', 'deleted_at'))
    or (table_name = 'room_inspections' and column_name = 'deleted_at'))
order by table_name, column_name;

select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'
  and tablename in ('competition_teams', 'tribes', 'score_events')
order by tablename, indexname;

select c.relname, c.relkind, c.relrowsecurity, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('camps', 'competition_teams', 'tribes', 'participants',
  'score_events', 'gymkhana_events', 'room_inspections', 'camp_score_totals',
  'public_camp_score_totals', 'camp_operation_receipts', 'camp_operation_audit')
order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('competition_teams', 'tribes', 'participants',
  'score_events', 'gymkhana_events', 'room_inspections') order by tablename, policyname;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result, p.prosecdef, p.proconfig, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('can_manage_camp', 'check_participant_group_camp',
  'prevent_group_camp_change', 'set_score_event_identity', 'enforce_room_team',
  'save_camp_score', 'save_camp_result', 'check_camp_operation') order by p.proname;

select event_object_table, trigger_name, event_manipulation, action_statement
from information_schema.triggers where trigger_schema = 'public'
  and event_object_table in ('tribes', 'participants', 'score_events', 'gymkhana_events', 'room_inspections')
order by event_object_table, trigger_name;
select table_name, column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tribes', 'competition_teams', 'participants', 'score_events', 'gymkhana_events', 'room_inspections')
  and column_name in ('id', 'camp_id', 'tribe_id', 'competition_team_id', 'gymkhana_event_id', 'room_inspection_id', 'points', 'winning_team', 'points_per_member')
order by table_name, ordinal_position;

select c.relname as table_name, k.conname, pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('competition_teams', 'participants', 'tribes', 'score_events', 'gymkhana_events', 'room_inspections')
order by c.relname, k.conname;

select count(*) as rooms_without_team
from public.tribes r where nullif(to_jsonb(r)->>'competition_team_id', '') is null;

select count(*) as rooms_with_mixed_participant_teams
from (
  select camp_id, tribe_id from public.participants
  where tribe_id is not null and competition_team_id is not null
  group by camp_id, tribe_id having count(distinct competition_team_id) > 1
) conflicts;

select count(*) as scores_pending_room_team_assignment
from public.score_events e join public.tribes r on r.id = e.tribe_id and r.camp_id = e.camp_id
where e.competition_team_id is null and nullif(to_jsonb(r)->>'competition_team_id', '') is null;

-- IDs only: no participant names, contacts or score reasons.
select r.camp_id, r.id as room_id,
  (select count(*) from public.participants p where p.tribe_id = r.id and p.camp_id = r.camp_id) as participants_count,
  (select count(distinct p.competition_team_id) from public.participants p where p.tribe_id = r.id and p.camp_id = r.camp_id) as participant_team_count,
  (select count(*) from public.score_events e where e.tribe_id = r.id and e.camp_id = r.camp_id and e.competition_team_id is null) as pending_score_count
from public.tribes r
where nullif(to_jsonb(r)->>'competition_team_id', '') is null
order by r.camp_id, r.id;

select e.camp_id, e.id as score_id, e.tribe_id as room_id, e.points,
  case when e.tribe_id is null then 'NO_ROOM_OR_TEAM'
       when r.id is null then 'MISSING_OR_FOREIGN_ROOM'
       else 'ROOM_WITHOUT_TEAM' end as association_required
from public.score_events e
left join public.tribes r on r.id = e.tribe_id and r.camp_id = e.camp_id
where e.competition_team_id is null
  and nullif(to_jsonb(r)->>'competition_team_id', '') is null
order by e.camp_id, e.id;

-- Must be zero. New room/team FK validates any pre-existing assignments.
select count(*) as invalid_existing_room_teams
from public.tribes r
left join public.competition_teams t
  on t.id::text = nullif(to_jsonb(r)->>'competition_team_id', '') and t.camp_id = r.camp_id
where nullif(to_jsonb(r)->>'competition_team_id', '') is not null and t.id is null;

select count(*) as participant_room_camp_conflicts
from public.participants p left join public.tribes r on r.id = p.tribe_id
where p.tribe_id is not null and (r.id is null or r.camp_id is distinct from p.camp_id);

-- Must be zero if operation_id already exists; safe before 016 too.
select count(*) as duplicate_score_operation_keys from (
  select camp_id, to_jsonb(e)->>'operation_id' from public.score_events e
  where to_jsonb(e)->>'operation_id' is not null and camp_id is not null
  group by camp_id, to_jsonb(e)->>'operation_id' having count(*) > 1
) duplicates;
