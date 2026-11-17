begin;

-- Requires 013, 015 and 016. No historical record is deleted.
alter table public.tribes add column if not exists competition_team_id uuid;
-- Room labels are free text; keep existing labels while accepting new ones.
alter table public.tribes drop constraint if exists tribes_room_type_check;
alter table public.gymkhana_events
  add column if not exists awards jsonb,
  add column if not exists deleted_at timestamptz;
alter table public.room_inspections add column if not exists deleted_at timestamptz;
alter table public.score_events
  add column if not exists is_voided boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.tribes'::regclass and conname = 'tribes_team_camp_fk') then
    alter table public.tribes add constraint tribes_team_camp_fk
      foreign key (competition_team_id, camp_id)
      references public.competition_teams(id, camp_id) on delete restrict;
  end if;
end $$;
create index if not exists tribes_camp_team_idx on public.tribes(camp_id, competition_team_id);

-- Room/team relationships are intentionally assigned by a manager, never guessed.
create or replace function public.enforce_room_team()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.participants where tribe_id = old.id)
       or exists (select 1 from public.score_events where tribe_id = old.id)
       or exists (select 1 from public.room_inspections where tribe_id = old.id) then
      raise exception 'Room has participants or history' using errcode = '23503';
    end if;
    return old;
  end if;
  if new.camp_id is null or new.competition_team_id is null
     or not exists (select 1 from public.competition_teams where id = new.competition_team_id and camp_id = new.camp_id) then
    raise exception 'Room requires a team in the same camp' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.competition_team_id is not null
     and old.competition_team_id is distinct from new.competition_team_id
     and (exists (select 1 from public.participants where tribe_id = old.id)
          or exists (select 1 from public.score_events where tribe_id = old.id)
          or exists (select 1 from public.room_inspections where tribe_id = old.id)) then
    raise exception 'Room with participants or history cannot change teams' using errcode = '23514';
  end if;
  if exists (select 1 from public.participants where tribe_id = new.id
             and competition_team_id is not null and competition_team_id <> new.competition_team_id) then
    raise exception 'Resolve participant team conflicts before assigning this room' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.enforce_room_team() from public, anon, authenticated;
drop trigger if exists tribes_enforce_room_team on public.tribes;
create trigger tribes_enforce_room_team before insert or update or delete on public.tribes
for each row execute function public.enforce_room_team();

create or replace function public.check_participant_group_camp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare room_camp uuid; room_team uuid;
begin
  if tg_op = 'UPDATE' and new.camp_id is not distinct from old.camp_id
     and new.tribe_id is not distinct from old.tribe_id
     and new.competition_team_id is not distinct from old.competition_team_id then
    return new;
  end if;
  select camp_id, competition_team_id into room_camp, room_team
  from public.tribes where id = new.tribe_id for share;
  if new.camp_id is null or new.tribe_id is null or new.competition_team_id is null
     or room_camp is distinct from new.camp_id or room_team is distinct from new.competition_team_id then
    raise exception 'Participant requires a room belonging to their team and camp' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.check_participant_group_camp() from public, anon, authenticated;
drop trigger if exists participants_check_group_camp on public.participants;
create trigger participants_check_group_camp before insert or update on public.participants
for each row execute function public.check_participant_group_camp();

create or replace function public.preserve_participant_score_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.score_events where participant_id = old.id) then
    raise exception 'Participant has score history; deactivate instead' using errcode = '23503';
  end if;
  return old;
end $$;
revoke all on function public.preserve_participant_score_history() from public, anon, authenticated;
drop trigger if exists participants_preserve_score_history on public.participants;
create trigger participants_preserve_score_history before delete on public.participants
for each row execute function public.preserve_participant_score_history();

create table if not exists public.camp_operation_receipts (
  camp_id uuid not null references public.camps(id),
  operation_id uuid not null,
  actor_id uuid not null,
  request jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (camp_id, operation_id)
);
alter table public.camp_operation_receipts enable row level security;
revoke all on public.camp_operation_receipts from public, anon, authenticated;

create table if not exists public.camp_operation_audit (
  id bigint generated always as identity primary key,
  camp_id uuid,
  actor_id uuid,
  entity text not null,
  action text not null,
  previous_record jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.camp_operation_audit enable row level security;
revoke all on public.camp_operation_audit from public, anon, authenticated;
grant select on public.camp_operation_audit to authenticated;
drop policy if exists "Managers read camp operation audit" on public.camp_operation_audit;
create policy "Managers read camp operation audit" on public.camp_operation_audit for select to authenticated
using (public.can_manage_camp(camp_id));

create or replace function public.audit_camp_result_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.camp_operation_audit(camp_id, actor_id, entity, action, previous_record)
  values(old.camp_id, auth.uid(), tg_table_name, tg_op, to_jsonb(old));
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.audit_camp_result_change() from public, anon, authenticated;
drop trigger if exists score_events_audit_change on public.score_events;
create trigger score_events_audit_change before update or delete on public.score_events
for each row execute function public.audit_camp_result_change();
drop trigger if exists gymkhana_events_audit_change on public.gymkhana_events;
create trigger gymkhana_events_audit_change before update or delete on public.gymkhana_events
for each row execute function public.audit_camp_result_change();
drop trigger if exists room_inspections_audit_change on public.room_inspections;
create trigger room_inspections_audit_change before update or delete on public.room_inspections
for each row execute function public.audit_camp_result_change();

-- Serializes retries within a camp; receipt and writes share one transaction.
create or replace function public.check_camp_operation(p_camp_id uuid, p_operation_id uuid, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare receipt public.camp_operation_receipts%rowtype;
begin
  if p_camp_id is null or auth.uid() is null or public.can_manage_camp(p_camp_id) is distinct from true then
    raise exception 'Camp access denied' using errcode = '42501';
  end if;
  if p_operation_id is null then raise exception 'Operation id is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_camp_id::text, 0));
  select * into receipt from public.camp_operation_receipts
    where camp_id = p_camp_id and operation_id = p_operation_id;
  if found then
    if receipt.actor_id <> auth.uid() or receipt.request <> p_request then
      raise exception 'Operation id was already used with a different request' using errcode = '22023';
    end if;
    return receipt.response;
  end if;
  return null;
end $$;
revoke all on function public.check_camp_operation(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.save_camp_result(
  p_camp_id uuid, p_operation_id uuid, p_kind text, p_action text,
  p_record_id uuid default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  request jsonb := jsonb_build_object('kind', p_kind, 'action', p_action, 'id', p_record_id, 'payload', p_payload);
  response jsonb;
  result_id uuid := p_record_id;
  room_id uuid;
  team_id uuid;
  amount integer;
  award jsonb;
  v_awards jsonb;
  v_title text;
  category text;
begin
  response := public.check_camp_operation(p_camp_id, p_operation_id, request);
  if response is not null then return response; end if;
  if p_kind is null or p_kind not in ('gymkhana', 'inspection') or p_action is null or p_action not in ('save', 'delete') then
    raise exception 'Invalid result operation' using errcode = '22023';
  end if;
  if p_action = 'delete' and result_id is null then raise exception 'Result id is required' using errcode = '22023'; end if;
  if result_id is not null then
    if p_kind = 'gymkhana' then
      perform 1 from public.gymkhana_events where id = result_id and camp_id = p_camp_id and deleted_at is null for update;
    else
      perform 1 from public.room_inspections where id = result_id and camp_id = p_camp_id and deleted_at is null for update;
    end if;
    if not found then raise exception 'Result not found in this camp' using errcode = '42501'; end if;
  end if;

  if p_action = 'delete' then
    if p_kind = 'gymkhana' then
      update public.gymkhana_events set deleted_at = now() where id = result_id and camp_id = p_camp_id;
    else
      update public.room_inspections set deleted_at = now() where id = result_id and camp_id = p_camp_id;
    end if;
  elsif p_kind = 'gymkhana' then
    v_title := nullif(btrim(p_payload->>'title'), '');
    v_awards := p_payload->'awards';
    if v_title is null or jsonb_typeof(v_awards) is distinct from 'array' then raise exception 'Title and awards required' using errcode = '22023'; end if;
    if jsonb_array_length(v_awards) = 0 or
       (select count(*) <> count(distinct value->>'competition_team_id') from jsonb_array_elements(v_awards)) then
      raise exception 'Awards require distinct teams' using errcode = '22023';
    end if;
    for award in select value from jsonb_array_elements(v_awards) loop
      if coalesce(award->>'points', '') !~ '^-?[0-9]+$' then raise exception 'Integer points required' using errcode = '22023'; end if;
      amount := (award->>'points')::integer;
      team_id := (award->>'competition_team_id')::uuid;
      if team_id is null or not exists (select 1 from public.competition_teams where id = team_id and camp_id = p_camp_id and status = 'active') then
        raise exception 'Team does not belong to this camp or is inactive' using errcode = '23514';
      end if;
    end loop;
    if result_id is null then
      insert into public.gymkhana_events(camp_id, title, winning_team, winning_competition_team_id, points_per_member, notes, awards)
      values(p_camp_id, v_title, v_awards->0->>'competition_team_id', (v_awards->0->>'competition_team_id')::uuid,
             (v_awards->0->>'points')::integer, nullif(btrim(p_payload->>'notes'), ''), v_awards) returning id into result_id;
    else
      update public.gymkhana_events set title = v_title,
        winning_team = v_awards->0->>'competition_team_id', winning_competition_team_id = (v_awards->0->>'competition_team_id')::uuid,
        points_per_member = (v_awards->0->>'points')::integer, notes = nullif(btrim(p_payload->>'notes'), ''), awards = v_awards
      where id = result_id and camp_id = p_camp_id;
    end if;
  else
    room_id := (p_payload->>'tribe_id')::uuid;
    select competition_team_id into team_id from public.tribes where id = room_id and camp_id = p_camp_id for share;
    if team_id is null then raise exception 'Room requires a team in this camp' using errcode = '23514'; end if;
    if coalesce(p_payload->>'points', '') !~ '^-?[0-9]+$' or coalesce(p_payload->>'type', '') not in ('POINT', 'PENALTY') then
      raise exception 'Invalid inspection points or type' using errcode = '22023';
    end if;
    amount := (case when p_payload->>'type' = 'PENALTY' then -1 else 1 end * abs((p_payload->>'points')::bigint))::integer;
    if nullif(btrim(p_payload->>'inspection_day'), '') is null or nullif(btrim(p_payload->>'inspection_period'), '') is null then
      raise exception 'Inspection day and period required' using errcode = '22023';
    end if;
    if result_id is null then
      insert into public.room_inspections(camp_id, tribe_id, inspection_day, inspection_period, type, points, notes, has_photo)
      values(p_camp_id, room_id, p_payload->>'inspection_day', p_payload->>'inspection_period', p_payload->>'type', amount,
             nullif(btrim(p_payload->>'notes'), ''), coalesce((p_payload->>'has_photo')::boolean, false)) returning id into result_id;
    else
      update public.room_inspections set tribe_id = room_id, inspection_day = p_payload->>'inspection_day',
        inspection_period = p_payload->>'inspection_period', type = p_payload->>'type', points = amount,
        notes = nullif(btrim(p_payload->>'notes'), ''), has_photo = coalesce((p_payload->>'has_photo')::boolean, false)
      where id = result_id and camp_id = p_camp_id;
    end if;
  end if;

  update public.score_events set is_voided = true, voided_at = now(), voided_by = auth.uid()
  where camp_id = p_camp_id and not is_voided
    and ((p_kind = 'gymkhana' and gymkhana_event_id = result_id) or (p_kind = 'inspection' and room_inspection_id = result_id));

  if p_action = 'save' and p_kind = 'gymkhana' then
    for award in select value from jsonb_array_elements(v_awards) loop
      amount := (award->>'points')::integer;
      insert into public.score_events(camp_id, competition_team_id, type, category, points, reason, notes, gymkhana_event_id)
      values(p_camp_id, (award->>'competition_team_id')::uuid, case when amount < 0 then 'PENALTY' else 'POINT' end,
             'Gincana', amount, v_title, nullif(btrim(p_payload->>'notes'), ''), result_id);
    end loop;
  elsif p_action = 'save' then
    category := 'Inspeção ' || (p_payload->>'inspection_day') || ' - ' || (p_payload->>'inspection_period');
    insert into public.score_events(camp_id, tribe_id, competition_team_id, type, category, points, reason, notes, room_inspection_id)
    values(p_camp_id, room_id, team_id, p_payload->>'type', category, amount, category, nullif(btrim(p_payload->>'notes'), ''), result_id);
  end if;
  response := jsonb_build_object('id', result_id);
  insert into public.camp_operation_receipts(camp_id, operation_id, actor_id, request, response)
  values(p_camp_id, p_operation_id, auth.uid(), request, response);
  return response;
end $$;
revoke all on function public.save_camp_result(uuid, uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.save_camp_result(uuid, uuid, text, text, uuid, jsonb) to authenticated;

create or replace function public.save_camp_score(
  p_camp_id uuid, p_operation_id uuid, p_action text,
  p_record_id uuid default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  request jsonb := jsonb_build_object('kind', 'score', 'action', p_action, 'id', p_record_id, 'payload', p_payload);
  response jsonb;
  result_id uuid := p_record_id;
  team_id uuid;
  participant_id uuid;
  amount integer;
begin
  response := public.check_camp_operation(p_camp_id, p_operation_id, request);
  if response is not null then return response; end if;
  if p_action is null or p_action not in ('save', 'delete') then raise exception 'Invalid action' using errcode = '22023'; end if;
  if p_record_id is not null then
    perform 1 from public.score_events where id = p_record_id and camp_id = p_camp_id and not is_voided
      and gymkhana_event_id is null and room_inspection_id is null for update;
    if not found then raise exception 'Manual score not found in this camp' using errcode = '42501'; end if;
  elsif p_action = 'delete' then raise exception 'Score id required' using errcode = '22023';
  end if;
  if p_action = 'save' then
    team_id := (p_payload->>'competition_team_id')::uuid;
    participant_id := nullif(p_payload->>'participant_id', '')::uuid;
    if not exists (select 1 from public.competition_teams where id = team_id and camp_id = p_camp_id and status = 'active') then
      raise exception 'Invalid team for this camp' using errcode = '23514';
    end if;
    if participant_id is not null then
      perform 1 from public.participants p where p.id = participant_id and p.camp_id = p_camp_id and p.competition_team_id = team_id for share;
      if not found then raise exception 'Participant does not belong to this team and camp' using errcode = '23514'; end if;
    end if;
    if coalesce(p_payload->>'points', '') !~ '^-?[0-9]+$' or (p_payload->>'points')::bigint = 0
       or coalesce(p_payload->>'type', '') not in ('POINT', 'PENALTY')
       or nullif(btrim(p_payload->>'category'), '') is null or nullif(btrim(p_payload->>'reason'), '') is null then
      raise exception 'Integer nonzero points, type, category and reason required' using errcode = '22023';
    end if;
    amount := (case when p_payload->>'type' = 'PENALTY' then -1 else 1 end * abs((p_payload->>'points')::bigint))::integer;
  end if;
  if p_record_id is not null then
    update public.score_events set is_voided = true, voided_at = now(), voided_by = auth.uid() where id = p_record_id and camp_id = p_camp_id;
  end if;
  if p_action = 'save' then
    insert into public.score_events(camp_id, competition_team_id, participant_id, type, category, points, reason, notes, operation_id)
    values(p_camp_id, team_id, participant_id, p_payload->>'type', p_payload->>'category', amount,
           btrim(p_payload->>'reason'), nullif(btrim(p_payload->>'notes'), ''), p_operation_id) returning id into result_id;
  end if;
  response := jsonb_build_object('id', result_id);
  insert into public.camp_operation_receipts(camp_id, operation_id, actor_id, request, response)
  values(p_camp_id, p_operation_id, auth.uid(), request, response);
  return response;
end $$;
revoke all on function public.save_camp_score(uuid, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.save_camp_score(uuid, uuid, text, uuid, jsonb) to authenticated;

-- Frontend writes must use the atomic functions; existing SELECT policies stay intact.
revoke all on public.score_events, public.gymkhana_events, public.room_inspections from public, anon, authenticated;
do $$
declare relation text; columns text;
begin
  foreach relation in array array['score_events', 'gymkhana_events', 'room_inspections'] loop
    select string_agg(quote_ident(attname), ', ') into columns from pg_attribute
    where attrelid = ('public.' || relation)::regclass and attnum > 0 and not attisdropped;
    execute format('revoke insert (%s), update (%s) on public.%I from public, anon, authenticated', columns, columns, relation);
  end loop;
end $$;
grant select on public.score_events, public.gymkhana_events, public.room_inspections to authenticated;

-- Include historical room scores once the room has an explicit team assignment.
create or replace view public.public_ranking_competition_score_events with (security_barrier = true) as
select s.camp_id, coalesce(s.competition_team_id, r.competition_team_id) as competition_team_id, s.points
from public.score_events s
left join public.tribes r on r.id = s.tribe_id and r.camp_id = s.camp_id
join public.competition_teams t on t.id = coalesce(s.competition_team_id, r.competition_team_id) and t.camp_id = s.camp_id
join public.camps c on c.id = s.camp_id
where not s.is_voided and t.status = 'active' and c.public_ranking_enabled and c.slug is not null;

create or replace view public.camp_score_totals with (security_invoker = true, security_barrier = true) as
select t.camp_id, t.id as competition_team_id,
  coalesce(s.positive_points, 0::bigint) as positive_points,
  coalesce(s.penalty_points, 0::bigint) as penalty_points,
  coalesce(s.total, 0::bigint) as total,
  (select count(*) from public.participants p where p.camp_id = t.camp_id and p.competition_team_id = t.id and p.is_active) as participants_count
from public.competition_teams t
left join (
  select e.camp_id, coalesce(e.competition_team_id, r.competition_team_id) as team_id,
    sum(case when e.points > 0 then e.points else 0 end) as positive_points,
    -sum(case when e.points < 0 then e.points else 0 end) as penalty_points, sum(e.points) as total
  from public.score_events e left join public.tribes r on r.id = e.tribe_id and r.camp_id = e.camp_id
  where not e.is_voided group by e.camp_id, coalesce(e.competition_team_id, r.competition_team_id)
) s on s.camp_id = t.camp_id and s.team_id = t.id;

create or replace view public.public_camp_score_totals with (security_barrier = true) as
select t.camp_id, t.id as competition_team_id,
  coalesce(s.positive_points, 0::bigint) as positive_points,
  coalesce(s.penalty_points, 0::bigint) as penalty_points,
  coalesce(s.total, 0::bigint) as total,
  (select count(*) from public.public_ranking_competition_participants p where p.camp_id = t.camp_id and p.competition_team_id = t.id) as participants_count
from public.public_ranking_competition_teams t
left join (
  select camp_id, competition_team_id,
    sum(case when points > 0 then points else 0 end) as positive_points,
    -sum(case when points < 0 then points else 0 end) as penalty_points, sum(points) as total
  from public.public_ranking_competition_score_events group by camp_id, competition_team_id
) s on s.camp_id = t.camp_id and s.competition_team_id = t.id;

commit;
