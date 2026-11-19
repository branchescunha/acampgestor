begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
lock table public.profiles in share row exclusive mode;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_require_active_admin' and tgenabled = 'O')
     or not exists (select 1 from public.profiles where role = 'admin' and status = 'active') then
    raise exception 'Migration 019 and an active ADMIN are required';
  end if;
end $$;

-- Retain 019 serialization. The row guard permits only narrowly scoped self-service.
create or replace function public.lock_profile_access_changes()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('acampgestor:profiles:active-admin', 0));
  perform id from public.profiles where role = 'admin' and status = 'active' order by id for update;
  if auth.uid() is not null and not exists (
    select 1 from public.profiles where id = auth.uid() and status = 'active' and role in ('admin', 'gestor')
  ) then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  return null;
end $$;

create or replace function public.guard_profile_account_changes()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_platform_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.id = auth.uid() and old.role = 'gestor' and old.status = 'active' then
    if to_jsonb(new) - array['name', 'updated_at'] = to_jsonb(old) - array['name', 'updated_at']
      and new.name is not null and length(btrim(new.name)) between 1 and 200 then
      return new;
    end if;
    if to_jsonb(new) - array['email', 'updated_at'] = to_jsonb(old) - array['email', 'updated_at']
      and new.email is not distinct from (select lower(email) from auth.users where id = new.id) then
      return new;
    end if;
  end if;
  raise exception 'Only own name or an Auth-confirmed email mirror may change' using errcode = '42501';
end $$;

revoke all on function public.lock_profile_access_changes() from public, anon, authenticated;
revoke all on function public.guard_profile_account_changes() from public, anon, authenticated;
drop trigger if exists profiles_guard_account_changes on public.profiles;
create trigger profiles_guard_account_changes before update or delete on public.profiles
for each row execute function public.guard_profile_account_changes();

drop policy if exists "Active gestors can update own name" on public.profiles;
create policy "Active gestors can update own name" on public.profiles for update to authenticated
using (id = auth.uid() and public.is_active_gestor())
with check (id = auth.uid() and role = 'gestor' and status = 'active');

drop policy if exists "Account changes require authorized actor" on public.profiles;
create policy "Account changes require authorized actor" on public.profiles as restrictive for update to authenticated
using (public.is_platform_admin() or (id = auth.uid() and public.is_active_gestor()))
with check (public.is_platform_admin() or (id = auth.uid() and role = 'gestor' and status = 'active'));
grant update (name, updated_at) on public.profiles to authenticated;

-- Auth + profile mirror share a transaction: an email uniqueness conflict aborts both.
create or replace function public.sync_profile_auth_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email), updated_at = now()
    where id = new.id and email is distinct from lower(new.email);
  end if;
  return new;
end $$;
revoke all on function public.sync_profile_auth_email() from public, anon, authenticated;
drop trigger if exists acampgestor_sync_profile_auth_email on auth.users;
create trigger acampgestor_sync_profile_auth_email after update of email on auth.users
for each row execute function public.sync_profile_auth_email();

-- Only Auth Admin API can write raw_app_meta_data. The Edge binds a short-lived
-- intent to the verified actor/target; authorize it again INSIDE the Auth write.
create or replace function public.guard_admin_auth_operation()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare intent jsonb; actor_id uuid; expiry timestamptz;
begin
  intent := new.raw_app_meta_data -> 'acampgestor_admin_operation';
  if intent is null or intent is not distinct from (old.raw_app_meta_data -> 'acampgestor_admin_operation') then
    return new;
  end if;
  actor_id := (intent ->> 'actor_id')::uuid;
  expiry := to_timestamp((intent ->> 'expires_at')::double precision);
  if actor_id is null or expiry is null or (intent ->> 'target_id')::uuid is distinct from new.id
    or coalesce(intent ->> 'action', '') not in ('reset-password', 'update-email')
    or intent ->> 'request_id' is null then
    raise exception 'Invalid administrative Auth operation' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('acampgestor:profiles:active-admin', 0));
  perform id from public.profiles where role = 'admin' and status = 'active' order by id for update;
  perform 1 from public.profiles where id = actor_id and role = 'admin' and status = 'active';
  if not found or expiry < clock_timestamp() or expiry > clock_timestamp() + interval '2 minutes' then
    raise exception 'Active ADMIN and current operation required' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = new.id and role = 'gestor' for update;
  if not found then raise exception 'Existing GESTOR required' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function public.guard_admin_auth_operation() from public, anon, authenticated;
drop trigger if exists acampgestor_guard_admin_auth_operation on auth.users;
create trigger acampgestor_guard_admin_auth_operation before update on auth.users
for each row execute function public.guard_admin_auth_operation();

create or replace function public.account_management_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
    and tgname = 'acampgestor_guard_admin_auth_operation' and tgenabled = 'O' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_guard_account_changes' and tgenabled = 'O' and not tgisinternal);
$$;
revoke all on function public.account_management_ready() from public, anon, authenticated;
grant execute on function public.account_management_ready() to service_role;

create or replace function public.delete_empty_organization(target_organization_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare dependency record; linked boolean; referenced_column text; parent_column text;
begin
  if not public.is_platform_admin() then
    raise exception 'Active platform ADMIN required' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active' for share;
  if not found then raise exception 'Active platform ADMIN required' using errcode = '42501'; end if;
  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then raise exception 'Organization not found' using errcode = 'P0002'; end if;
  perform id from public.organization_members where organization_id = target_organization_id order by id for update;
  -- Inspect every real FK, including future history tables; never rely on CASCADE.
  for dependency in select conrelid, conkey, confkey from pg_constraint
    where contype = 'f' and confrelid = 'public.organizations'::regclass
      and conrelid <> 'public.organization_members'::regclass loop
    if cardinality(dependency.conkey) <> 1 or cardinality(dependency.confkey) <> 1 then
      raise exception 'Unsupported organization relationship; review before deletion' using errcode = '23503';
    end if;
    select attname into referenced_column from pg_attribute
    where attrelid = dependency.conrelid and attnum = dependency.conkey[1];
    select attname into parent_column from pg_attribute
    where attrelid = 'public.organizations'::regclass and attnum = dependency.confkey[1];
    if parent_column <> 'id' then raise exception 'Unsupported organization key' using errcode = '23503'; end if;
    execute format('select exists (select 1 from %s where %I = $1)', dependency.conrelid::regclass, referenced_column)
      into linked using target_organization_id;
    if linked then raise exception 'Organization has camps or linked history; deletion blocked' using errcode = '23503'; end if;
  end loop;
  -- Membership IDs may themselves be referenced by history. Block those too,
  -- including FKs configured as CASCADE or SET NULL.
  for dependency in select conrelid, conkey, confkey from pg_constraint
    where contype = 'f' and confrelid = 'public.organization_members'::regclass loop
    if cardinality(dependency.conkey) <> 1 or cardinality(dependency.confkey) <> 1 then
      raise exception 'Unsupported membership relationship' using errcode = '23503';
    end if;
    select attname into referenced_column from pg_attribute
    where attrelid = dependency.conrelid and attnum = dependency.conkey[1];
    select attname into parent_column from pg_attribute
    where attrelid = 'public.organization_members'::regclass and attnum = dependency.confkey[1];
    if parent_column <> 'id' then raise exception 'Unsupported membership key' using errcode = '23503'; end if;
    execute format('select exists (select 1 from %s linked join public.organization_members member on linked.%I = member.id where member.organization_id = $1)', dependency.conrelid::regclass, referenced_column)
      into linked using target_organization_id;
    if linked then raise exception 'Organization memberships have linked history' using errcode = '23503'; end if;
  end loop;
  delete from public.organization_members where organization_id = target_organization_id;
  delete from public.organizations where id = target_organization_id;
end $$;
revoke all on function public.delete_empty_organization(uuid) from public, anon;
grant execute on function public.delete_empty_organization(uuid) to authenticated;

-- No historical backfill, signup, ADMIN promotion or account deletion.
commit;
