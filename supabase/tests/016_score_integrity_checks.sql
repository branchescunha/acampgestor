-- Execute only after applying 016 in an isolated database with disposable fixtures.
-- These checks supplement, but do not replace, authenticated RLS and write tests.
select count(*) as aggregate_mismatches
from (
  select camp_id, competition_team_id,
         sum(case when points > 0 then points else 0 end) as positive_points,
         -sum(case when points < 0 then points else 0 end) as penalty_points,
         sum(points) as total
  from public.score_events
  where competition_team_id is not null
  group by camp_id, competition_team_id
) expected
full join public.camp_score_totals actual
  on actual.camp_id = expected.camp_id
  and actual.competition_team_id = expected.competition_team_id
where expected.camp_id is null or actual.camp_id is null
   or expected.positive_points is distinct from actual.positive_points
   or expected.penalty_points is distinct from actual.penalty_points
   or expected.total is distinct from actual.total;

select has_table_privilege('anon', 'public.camp_score_totals', 'select') as anon_can_read_private_totals,
       has_table_privilege('anon', 'public.public_camp_score_totals', 'select') as anon_can_read_public_totals;

select table_name, column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('score_events', 'gymkhana_events', 'room_inspections')
  and column_name in ('id', 'camp_id', 'gymkhana_event_id', 'room_inspection_id')
order by table_name, column_name;
