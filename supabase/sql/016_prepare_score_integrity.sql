begin;

-- Existing records have unknown authors and remain unchanged.
alter table public.score_events
  add column if not exists created_by uuid,
  add column if not exists operation_id uuid;

create unique index if not exists score_events_camp_operation_unique_idx
  on public.score_events (camp_id, operation_id)
  where operation_id is not null;

create or replace function public.set_score_event_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.operation_id := old.operation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists score_events_set_identity on public.score_events;
create trigger score_events_set_identity
before insert or update on public.score_events
for each row execute function public.set_score_event_identity();

-- RLS on score_events is evaluated as the querying authenticated user.
create or replace view public.camp_score_totals
with (security_invoker = true, security_barrier = true)
as
select camp_id, competition_team_id,
       sum(case when points > 0 then points else 0 end) as positive_points,
       -sum(case when points < 0 then points else 0 end) as penalty_points,
       sum(points) as total
from public.score_events
where competition_team_id is not null
group by camp_id, competition_team_id;

revoke all on public.camp_score_totals from public, anon;
grant select on public.camp_score_totals to authenticated;

-- This view exposes only aggregates of the already public ranking data.
create or replace view public.public_camp_score_totals
with (security_barrier = true)
as
select camp_id, competition_team_id,
       sum(case when points > 0 then points else 0 end) as positive_points,
       -sum(case when points < 0 then points else 0 end) as penalty_points,
       sum(points) as total
from public.public_ranking_competition_score_events
group by camp_id, competition_team_id;

revoke all on public.public_camp_score_totals from public;
grant select on public.public_camp_score_totals to anon, authenticated;

commit;
