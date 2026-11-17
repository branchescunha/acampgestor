-- Read-only; safe to review the real schema without returning personal data.
select table_name, column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tribes', 'competition_teams', 'participants', 'score_events', 'gymkhana_events', 'room_inspections')
  and column_name in ('id', 'camp_id', 'tribe_id', 'competition_team_id', 'gymkhana_event_id', 'room_inspection_id', 'points', 'winning_team', 'points_per_member')
order by table_name, ordinal_position;

select c.relname as table_name, k.conname, pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('tribes', 'score_events', 'gymkhana_events', 'room_inspections')
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
