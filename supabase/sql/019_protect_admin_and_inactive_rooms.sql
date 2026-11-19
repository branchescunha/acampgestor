begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
lock table public.profiles in share row exclusive mode;

-- Apply only after reviewing the preflight in docs/v2-mobile-and-account-safety.md.
do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin' and status = 'active') then
    raise exception 'At least one active platform admin is required';
  end if;
end $$;

-- ACLs and RLS are independent. Keep SELECT and authenticated/backend DML unchanged.
do $$
declare
  target regclass;
  columns_list text;
  authenticated_before jsonb;
  authenticated_after jsonb;
begin
  foreach target in array array['public.profiles'::regclass, 'public.tribes'::regclass,
      'public.participants'::regclass] loop
    select jsonb_agg(jsonb_build_array(r.role_name,
      has_table_privilege(r.role_name, target, 'SELECT'),
      has_table_privilege(r.role_name, target, 'INSERT'),
      has_table_privilege(r.role_name, target, 'UPDATE'),
      has_table_privilege(r.role_name, target, 'DELETE'),
      (select jsonb_agg(jsonb_build_array(a.attnum,
        has_column_privilege(r.role_name, target, a.attnum, 'SELECT'),
        has_column_privilege(r.role_name, target, a.attnum, 'INSERT'),
        has_column_privilege(r.role_name, target, a.attnum, 'UPDATE')) order by a.attnum)
       from pg_attribute a where a.attrelid = target and a.attnum > 0 and not a.attisdropped)
    ) order by r.role_name) into authenticated_before
    from (values ('authenticated'), ('service_role')) r(role_name);

    -- REVOKE without CASCADE: unexpected dependent grants must stop the transaction.
    execute format('revoke insert, update, delete, truncate, references, trigger, maintain on table %s from public, anon', target);
    select string_agg(format('%I', attname), ', ' order by attnum) into columns_list
    from pg_attribute where attrelid = target and attnum > 0 and not attisdropped;
    execute format('revoke insert (%1$s), update (%1$s), references (%1$s) on table %2$s from public, anon', columns_list, target);
    -- TRUNCATE bypasses RLS and UPDATE/DELETE triggers; it is not an application CRUD operation.
    execute format('revoke truncate on table %s from authenticated', target);

    if has_table_privilege('anon', target, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       or has_any_column_privilege('anon', target, 'INSERT,UPDATE,REFERENCES') then
      raise exception 'Anonymous mutation privileges remain on %; inspect inherited roles', target;
    end if;
    if has_table_privilege('authenticated', target, 'TRUNCATE') then
      raise exception 'Authenticated TRUNCATE privilege remains on %; inspect inherited roles', target;
    end if;

    select jsonb_agg(jsonb_build_array(r.role_name,
      has_table_privilege(r.role_name, target, 'SELECT'),
      has_table_privilege(r.role_name, target, 'INSERT'),
      has_table_privilege(r.role_name, target, 'UPDATE'),
      has_table_privilege(r.role_name, target, 'DELETE'),
      (select jsonb_agg(jsonb_build_array(a.attnum,
        has_column_privilege(r.role_name, target, a.attnum, 'SELECT'),
        has_column_privilege(r.role_name, target, a.attnum, 'INSERT'),
        has_column_privilege(r.role_name, target, a.attnum, 'UPDATE')) order by a.attnum)
       from pg_attribute a where a.attrelid = target and a.attnum > 0 and not a.attisdropped)
    ) order by r.role_name) into authenticated_after
    from (values ('authenticated'), ('service_role')) r(role_name);
    if authenticated_before is distinct from authenticated_after then
      raise exception 'Revoking PUBLIC would change authenticated/backend DML on %; review explicit grants first', target;
    end if;
  end loop;
end $$;

-- Lock admin rows too: advisory locks alone do not refresh REPEATABLE READ snapshots.
create or replace function public.lock_profile_access_changes()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('acampgestor:profiles:active-admin', 0));
  perform id from public.profiles
  where role = 'admin' and status = 'active'
  order by id
  for update;
  -- Refresh authorization after waiting; RLS remains mandatory for client writes.
  if auth.uid() is not null and not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  ) then
    raise exception 'Active platform admin required' using errcode = '42501';
  end if;
  return null;
end $$;

create or replace function public.require_active_platform_admin()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where role = 'admin' and status = 'active') then
    raise exception 'The last active platform admin cannot be removed or suspended' using errcode = '23514';
  end if;
  return null;
end $$;

revoke all on function public.lock_profile_access_changes() from public, anon, authenticated;
revoke all on function public.require_active_platform_admin() from public, anon, authenticated;

drop trigger if exists profiles_lock_access_changes on public.profiles;
create trigger profiles_lock_access_changes before update or delete on public.profiles
for each statement execute function public.lock_profile_access_changes();
drop trigger if exists profiles_require_active_admin on public.profiles;
create trigger profiles_require_active_admin after update or delete on public.profiles
for each statement execute function public.require_active_platform_admin();

-- Existing assignments and result cancellations remain editable; new room usage must be active.
create or replace function public.require_active_room_assignment()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare must_check boolean;
begin
  if tg_op = 'INSERT' then
    must_check := true;
  else
    must_check := new.tribe_id is distinct from old.tribe_id
      or new.camp_id is distinct from old.camp_id;
    if tg_table_name = 'participants' then
      must_check := must_check or (new.is_active is true and old.is_active is not true);
    elsif tg_table_name = 'room_inspections' then
      must_check := must_check or (new.deleted_at is null and old.deleted_at is not null);
    end if;
  end if;
  if must_check and new.tribe_id is not null then
    perform 1 from public.tribes
    where id = new.tribe_id and camp_id = new.camp_id and is_active is not false for share;
    if not found then
      raise exception 'Select an active room in the same camp' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.require_active_room_assignment() from public, anon, authenticated;
drop trigger if exists participants_require_active_room on public.participants;
create trigger participants_require_active_room before insert or update on public.participants
for each row execute function public.require_active_room_assignment();
drop trigger if exists inspections_require_active_room on public.room_inspections;
create trigger inspections_require_active_room before insert or update on public.room_inspections
for each row execute function public.require_active_room_assignment();

commit;
