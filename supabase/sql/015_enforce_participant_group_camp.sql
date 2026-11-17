begin;

-- Existing records are preserved; new or changed links must belong to the same camp.
create or replace function public.check_participant_group_camp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tribe_id is not null and not exists (
    select 1 from public.tribes
    where id = new.tribe_id and camp_id = new.camp_id
  ) then
    raise exception 'Participant group must belong to the same camp'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists participants_check_group_camp on public.participants;
create trigger participants_check_group_camp
before insert or update of tribe_id, camp_id on public.participants
for each row execute function public.check_participant_group_camp();

-- A group cannot be moved after creation, including through direct API calls.
create or replace function public.prevent_group_camp_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.camp_id is distinct from old.camp_id then
    raise exception 'Moving a group between camps is not permitted'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tribes_prevent_camp_change on public.tribes;
create trigger tribes_prevent_camp_change
before update of camp_id on public.tribes
for each row execute function public.prevent_group_camp_change();

commit;
