begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- NULL preserves the exact six legacy slots without updating historical rows.
alter table public.camps add column inspection_schedule jsonb;

create function public.is_valid_inspection_schedule(schedule jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare slot jsonb; seen text[] := '{}'; slot_key text;
begin
  if schedule is null then return true; end if;
  if jsonb_typeof(schedule) is distinct from 'array' then return false; end if;
  if jsonb_array_length(schedule) > 21 then return false; end if;
  for slot in select value from jsonb_array_elements(schedule) loop
    if jsonb_typeof(slot) is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(slot)) <> 2
       or coalesce(slot->>'day', '') not in ('Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo')
       or coalesce(slot->>'period', '') not in ('Manhã', 'Tarde', 'Noite') then return false; end if;
    slot_key := (slot->>'day') || '/' || (slot->>'period');
    if slot_key = any(seen) then return false; end if;
    seen := array_append(seen, slot_key);
  end loop;
  return true;
end $$;
revoke all on function public.is_valid_inspection_schedule(jsonb) from public, anon;
grant execute on function public.is_valid_inspection_schedule(jsonb) to authenticated;
alter table public.camps add constraint camps_inspection_schedule_check
  check (public.is_valid_inspection_schedule(inspection_schedule));

create function public.preserve_used_inspection_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.inspection_schedule is not distinct from old.inspection_schedule then return new; end if;
  if new.inspection_schedule is null then
    raise exception 'An explicit inspection schedule cannot be reset to NULL' using errcode = '23514';
  end if;
  if not public.is_valid_inspection_schedule(new.inspection_schedule) then
    raise exception 'Invalid inspection schedule' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.room_inspections i
    where i.camp_id = old.id
      and i.inspection_day in ('Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo')
      and i.inspection_period in ('Manhã', 'Tarde', 'Noite')
      and not new.inspection_schedule @> jsonb_build_array(jsonb_build_object('day', i.inspection_day, 'period', i.inspection_period))
  ) then
    raise exception 'Inspection slots already used cannot be removed' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.preserve_used_inspection_slots() from public, anon, authenticated;
create trigger camps_preserve_used_inspection_slots before update of inspection_schedule on public.camps
for each row execute function public.preserve_used_inspection_slots();

create function public.validate_room_inspection_slot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare schedule jsonb;
begin
  -- Unchanged legacy labels remain editable; no slot is invented for history.
  if tg_op = 'UPDATE' and new.camp_id is not distinct from old.camp_id
     and new.tribe_id is not distinct from old.tribe_id
     and new.inspection_day is not distinct from old.inspection_day
     and new.inspection_period is not distinct from old.inspection_period then return new; end if;
  -- Serializes inspection creation against concurrent camp schedule changes.
  select inspection_schedule into schedule from public.camps where id = new.camp_id for share;
  if not found then raise exception 'Inspection camp not found' using errcode = '23514'; end if;
  if schedule is null then
    schedule := '[{"day":"Sexta","period":"Noite"},{"day":"Sábado","period":"Manhã"},{"day":"Sábado","period":"Tarde"},{"day":"Sábado","period":"Noite"},{"day":"Domingo","period":"Manhã"},{"day":"Domingo","period":"Tarde"}]'::jsonb;
  end if;
  if new.inspection_day is null or new.inspection_period is null
     or not schedule @> jsonb_build_array(jsonb_build_object('day', new.inspection_day, 'period', new.inspection_period)) then
    raise exception 'Inspection slot is not configured for this camp' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_room_inspection_slot() from public, anon, authenticated;
create trigger room_inspections_validate_slot before insert or update on public.room_inspections
for each row execute function public.validate_room_inspection_slot();

create function public.validate_room_type()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.room_type is not distinct from old.room_type then return new; end if;
  if new.room_type is null or new.room_type not in ('Masculino', 'Feminino') then
    raise exception 'Room type must be Masculino or Feminino' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_room_type() from public, anon, authenticated;
create trigger tribes_validate_room_type before insert or update of room_type on public.tribes
for each row execute function public.validate_room_type();

-- Existing grants, RLS, transactional RPCs and score attribution are unchanged.
commit;
