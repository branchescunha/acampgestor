begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$ begin
  if public.account_management_ready() is distinct from true
    or not exists(select 1 from public.profiles where role = 'admin' and status = 'active')
    or (select count(*) from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal and tgenabled = 'O'
      and tgname in ('profiles_lock_access_changes', 'profiles_require_active_admin')) <> 2
    or not exists(select 1 from pg_constraint where contype = 'f'
      and conrelid = 'public.profiles'::regclass and confrelid = 'auth.users'::regclass and confdeltype = 'c') then
    raise exception 'Migration 020, active ADMIN and Auth-profile CASCADE are required';
  end if;
end $$;

-- Receipts deliberately have no FK to Auth: retries must survive Auth removal.
create table public.account_deletion_jobs (
  target_id uuid primary key,
  actor_id uuid not null,
  state text not null check (state in ('pending_auth', 'completed')),
  summary jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from public, anon, authenticated;

create table public.camp_deletion_receipts (
  camp_id uuid primary key,
  actor_id uuid not null,
  removed jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.camp_deletion_receipts enable row level security;
revoke all on public.camp_deletion_receipts from public, anon, authenticated;

-- Same order as the last-ADMIN guard. Table locks also cover legacy direct writes
-- and prevent records from being moved between camps during graph validation.
create function public.lock_permanent_deletion()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('lock_timeout', '5s', true);
  perform pg_advisory_xact_lock(hashtextextended('acampgestor:profiles:active-admin', 0));
  lock table public.profiles, public.organizations, public.organization_members,
    public.camps, public.competition_teams, public.tribes, public.participants,
    public.gymkhana_settings, public.gymkhana_events, public.room_inspections,
    public.score_events, public.camp_operation_receipts, public.camp_operation_audit
    in share row exclusive mode;
end $$;

create function public.camp_deletion_counts(p_camp_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb := '{}'::jsonb; tab text; amount bigint;
begin
  foreach tab in array array['competition_teams', 'tribes', 'participants', 'score_events',
    'gymkhana_events', 'gymkhana_settings', 'room_inspections', 'camp_operation_receipts', 'camp_operation_audit'] loop
    execute format('select count(*) from public.%I where camp_id = $1', tab) into amount using p_camp_id;
    result := result || jsonb_build_object(tab, amount);
  end loop;
  return result;
end $$;

-- Validate real FKs, not only the relationships recorded in old migrations.
-- Unknown dependents and cross-camp references fail closed, even with CASCADE.
create function public.assert_camp_deletion_graph(p_camp_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare fk record; child_name text; parent_name text; predicate text; linked boolean;
  allowed oid[] := array['public.camps'::regclass::oid, 'public.competition_teams'::regclass::oid,
    'public.tribes'::regclass::oid, 'public.participants'::regclass::oid,
    'public.score_events'::regclass::oid, 'public.gymkhana_events'::regclass::oid,
    'public.gymkhana_settings'::regclass::oid, 'public.room_inspections'::regclass::oid,
    'public.camp_operation_receipts'::regclass::oid, 'public.camp_operation_audit'::regclass::oid];
begin
  for fk in select * from pg_constraint where contype = 'f' and confrelid = any(allowed) loop
    if not (fk.conrelid = any(allowed)) then
      raise exception 'Unreviewed camp dependency: %', fk.conrelid::regclass using errcode = '23503';
    end if;
    predicate := '';
    for i in 1..cardinality(fk.conkey) loop
      select attname into child_name from pg_attribute where attrelid = fk.conrelid and attnum = fk.conkey[i];
      select attname into parent_name from pg_attribute where attrelid = fk.confrelid and attnum = fk.confkey[i];
      predicate := predicate || case when i > 1 then ' and ' else '' end || format('child.%I = parent.%I', child_name, parent_name);
    end loop;
    execute format('select exists(select 1 from %s child join %s parent on %s where %s = $1 and child.camp_id is distinct from $1)',
      fk.conrelid::regclass, fk.confrelid::regclass, predicate,
      case when fk.confrelid = 'public.camps'::regclass then 'parent.id' else 'parent.camp_id' end)
      into linked using p_camp_id;
    if linked then raise exception 'Cross-camp dependent prevents deletion' using errcode = '23503'; end if;
  end loop;
end $$;

create function public.delete_camp_data_internal(p_camp_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare removed jsonb;
begin
  perform public.assert_camp_deletion_graph(p_camp_id);
  removed := public.camp_deletion_counts(p_camp_id);
  -- Existing audit triggers remain enabled. Their generated rows are deleted LAST.
  delete from public.score_events where camp_id = p_camp_id;
  delete from public.room_inspections where camp_id = p_camp_id;
  delete from public.gymkhana_events where camp_id = p_camp_id;
  delete from public.gymkhana_settings where camp_id = p_camp_id;
  delete from public.participants where camp_id = p_camp_id;
  delete from public.tribes where camp_id = p_camp_id;
  delete from public.competition_teams where camp_id = p_camp_id;
  delete from public.camp_operation_receipts where camp_id = p_camp_id;
  delete from public.camp_operation_audit where camp_id = p_camp_id;
  delete from public.camps where id = p_camp_id;
  return removed;
end $$;

create function public.delete_camp_permanently(p_camp_id uuid, p_confirmation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare camp public.camps%rowtype; actor public.profiles%rowtype; receipt public.camp_deletion_receipts%rowtype; removed jsonb;
begin
  perform public.lock_permanent_deletion();
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status <> 'active' or actor.role not in ('admin', 'gestor') then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  select * into receipt from public.camp_deletion_receipts where camp_id = p_camp_id;
  if found then
    if receipt.actor_id <> actor.id and actor.role <> 'admin' then raise exception 'Camp access denied' using errcode = '42501'; end if;
    return jsonb_build_object('deleted', true, 'removed', receipt.removed);
  end if;
  select * into camp from public.camps where id = p_camp_id for update;
  if not found or (actor.role <> 'admin' and camp.created_by <> actor.id) then
    raise exception 'Only the owner or ADMIN may delete this camp' using errcode = '42501';
  end if;
  if p_confirmation is distinct from camp.name then raise exception 'Type the exact camp name' using errcode = '22023'; end if;
  removed := public.delete_camp_data_internal(camp.id);
  insert into public.camp_deletion_receipts(camp_id, actor_id, removed) values(camp.id, actor.id, removed);
  return jsonb_build_object('deleted', true, 'removed', removed);
end $$;

-- Bypass of the RPC must not be possible through a legacy table grant/policy.
revoke delete on public.camps from public, anon, authenticated;
create policy "Camp deletion requires dedicated RPC" on public.camps as restrictive for delete to authenticated using (false);

create function public.preview_account_deletion(p_actor_id uuid, p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; target public.profiles%rowtype;
  job public.account_deletion_jobs%rowtype; camp record; fk record; col text; parent_col text; linked boolean;
  camps jsonb := '[]'::jsonb; blockers jsonb := '[]'::jsonb;
begin
  select * into actor from public.profiles where id = p_actor_id;
  select * into job from public.account_deletion_jobs where target_id = p_target_id;
  if ((actor.role = 'admin' and actor.status = 'active')
    or (actor.role = 'gestor' and actor.id = p_target_id and (actor.status = 'active' or (job.state = 'pending_auth' and job.actor_id = actor.id)))) is distinct from true then
    raise exception 'Account deletion denied' using errcode = '42501';
  end if;
  if job.target_id is not null then return job.summary || jsonb_build_object('state', job.state); end if;
  select * into target from public.profiles where id = p_target_id;
  if target.id is null or target.role <> 'gestor' then raise exception 'Only GESTOR accounts may be deleted' using errcode = '42501'; end if;
  for camp in select * from public.camps where created_by = target.id order by id loop
    camps := camps || jsonb_build_array(jsonb_build_object('id', camp.id, 'name', camp.name, 'counts', public.camp_deletion_counts(camp.id)));
    if exists(select 1 from public.organization_members where organization_id = camp.organization_id and profile_id <> target.id) then
      blockers := blockers || jsonb_build_array('Acampamento em organização compartilhada: resolva os vínculos antes de excluir a conta.');
    end if;
  end loop;
  -- Preserve shared organizations, invitations, reviews and any unknown FK.
  -- Their owners/references must be resolved explicitly, never reassigned by email.
  for fk in select * from pg_constraint where contype = 'f'
    and confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and connamespace <> 'auth'::regnamespace loop
    if cardinality(fk.conkey) <> 1 or cardinality(fk.confkey) <> 1 then
      blockers := blockers || jsonb_build_array('Relacionamento de identidade não reconhecido.'); continue;
    end if;
    select attname into col from pg_attribute where attrelid = fk.conrelid and attnum = fk.conkey[1];
    select attname into parent_col from pg_attribute where attrelid = fk.confrelid and attnum = fk.confkey[1];
    if parent_col <> 'id' then
      blockers := blockers || jsonb_build_array('Chave de identidade não reconhecida.'); continue;
    end if;
    if (fk.conrelid = 'public.profiles'::regclass and col = 'id' and fk.confdeltype = 'c')
      or (fk.conrelid = 'public.camps'::regclass and col = 'created_by')
      or (fk.conrelid = 'public.organization_members'::regclass and col = 'profile_id') then continue; end if;
    execute format('select exists(select 1 from %s where %I = $1)', fk.conrelid::regclass, col) into linked using target.id;
    if linked then blockers := blockers || jsonb_build_array(format('Vínculo que precisa de revisão: %s.%I', fk.conrelid::regclass, col)); end if;
  end loop;
  if exists(select 1 from public.organization_members m where m.profile_id = target.id and m.role = 'owner'
    and not exists(select 1 from public.organization_members other where other.organization_id = m.organization_id and other.profile_id <> target.id and other.role = 'owner' and other.status = 'active')) then
    blockers := blockers || jsonb_build_array('A conta é o único responsável por uma organização. Resolva ou exclua a organização vazia pelo ADMIN.');
  end if;
  if exists(select 1 from pg_constraint where contype = 'f' and confrelid = 'public.organization_members'::regclass) then
    blockers := blockers || jsonb_build_array('Há dependências de memberships que precisam de revisão antes da remoção.');
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists(select 1 from storage.objects where to_jsonb(objects)->>''owner_id'' = $1 or to_jsonb(objects)->>''owner'' = $1)'
      into linked using target.id::text;
    if linked then blockers := blockers || jsonb_build_array('Arquivos Storage pertencem à conta; resolva-os antes da exclusão.'); end if;
  end if;
  return jsonb_build_object('target_id', target.id, 'state', 'preview', 'camps', camps, 'blockers', blockers);
end $$;

create function public.prepare_account_deletion(p_actor_id uuid, p_target_id uuid, p_confirmation text, p_camp_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare plan jsonb; camp jsonb; expected uuid[]; supplied uuid[]; job public.account_deletion_jobs%rowtype;
begin
  perform public.lock_permanent_deletion();
  plan := public.preview_account_deletion(p_actor_id, p_target_id);
  if p_confirmation is distinct from 'EXCLUIR CONTA' then raise exception 'Explicit account confirmation required' using errcode = '22023'; end if;
  select * into job from public.account_deletion_jobs where target_id = p_target_id for update;
  if found then
    if job.state = 'pending_auth' then
      update public.account_deletion_jobs set actor_id = p_actor_id where target_id = p_target_id;
    end if;
    return jsonb_build_object('state', job.state, 'target_id', job.target_id);
  end if;
  if jsonb_array_length(plan->'blockers') > 0 then raise exception 'Resolve shared dependencies before deleting the account' using errcode = '23503'; end if;
  select coalesce(array_agg((value->>'id')::uuid order by value->>'id'), '{}'::uuid[]) into expected from jsonb_array_elements(plan->'camps');
  select coalesce(array_agg(distinct id order by id), '{}'::uuid[]) into supplied from unnest(p_camp_ids) as id;
  if supplied is distinct from expected then raise exception 'Camp list changed; review the preview again' using errcode = '22023'; end if;
  for camp in select value from jsonb_array_elements(plan->'camps') loop
    perform public.delete_camp_data_internal((camp->>'id')::uuid);
  end loop;
  delete from public.organization_members where profile_id = p_target_id;
  -- Historical UUIDs in other camps remain unchanged; never erase their audit.
  update public.profiles set status = 'suspended', updated_at = now() where id = p_target_id and role = 'gestor';
  insert into public.account_deletion_jobs(target_id, actor_id, state, summary)
    values(p_target_id, p_actor_id, 'pending_auth', plan);
  return jsonb_build_object('state', 'pending_auth', 'target_id', p_target_id);
end $$;

-- Pending deletion must not be undone by a concurrent ADMIN edit or old session.
create function public.guard_pending_account_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare account_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('acampgestor:profiles:active-admin', 0));
  if tg_table_name = 'camps' and tg_op = 'UPDATE'
    and to_jsonb(new)->>'created_by' is distinct from to_jsonb(old)->>'created_by'
    and auth.uid() is not null and public.is_platform_admin() is distinct from true then
    raise exception 'Only active ADMIN may change camp ownership' using errcode = '42501';
  end if;
  if tg_table_schema = 'auth' and to_jsonb(new) - array['last_sign_in_at', 'updated_at'] = to_jsonb(old) - array['last_sign_in_at', 'updated_at'] then
    return new;
  end if;
  account_id := (case when tg_table_name = 'camps' then to_jsonb(new)->>'created_by' else to_jsonb(new)->>'id' end)::uuid;
  if exists(select 1 from public.account_deletion_jobs where target_id = account_id) then
    raise exception 'Account deletion is pending or completed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger camps_guard_pending_owner before insert or update of created_by on public.camps
for each row execute function public.guard_pending_account_deletion();
create trigger profiles_guard_pending_deletion before update on public.profiles
for each row execute function public.guard_pending_account_deletion();
create trigger auth_guard_pending_deletion before update on auth.users
for each row execute function public.guard_pending_account_deletion();

-- GoTrue invokes this in the SAME transaction as the Auth deletion and profile
-- cascade. Direct SQL deletion is not an exposed RPC. Last-ADMIN guards stay on.
create function public.guard_account_auth_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare job public.account_deletion_jobs%rowtype; fk record; col text; linked boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('acampgestor:profiles:active-admin', 0));
  select * into job from public.account_deletion_jobs where target_id = old.id for update;
  if job.target_id is null or job.state <> 'pending_auth'
    or not exists(select 1 from public.profiles where id = old.id and role = 'gestor' and status = 'suspended')
    or not (job.actor_id = old.id or exists(select 1 from public.profiles where id = job.actor_id and role = 'admin' and status = 'active')) then
    raise exception 'Prepared GESTOR deletion required; ADMIN deletion forbidden' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = old.id for update;
  -- Recheck at the actual Auth DELETE, not just during the earlier preparation.
  -- Parent row locks prevent concurrent FK children from appearing after this.
  for fk in select * from pg_constraint where contype = 'f'
    and confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and connamespace <> 'auth'::regnamespace loop
    if cardinality(fk.conkey) <> 1 or cardinality(fk.confkey) <> 1 then
      raise exception 'Unreviewed identity dependency' using errcode = '23503';
    end if;
    select attname into col from pg_attribute where attrelid = fk.conrelid and attnum = fk.conkey[1];
    if fk.conrelid = 'public.profiles'::regclass and col = 'id' and fk.confdeltype = 'c' then continue; end if;
    execute format('select exists(select 1 from %s where %I = $1)', fk.conrelid::regclass, col) into linked using old.id;
    if linked then raise exception 'New identity dependency prevents Auth deletion' using errcode = '23503'; end if;
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'select exists(select 1 from storage.objects where to_jsonb(objects)->>''owner_id'' = $1 or to_jsonb(objects)->>''owner'' = $1)'
      into linked using old.id::text;
    if linked then raise exception 'Storage ownership prevents Auth deletion' using errcode = '23503'; end if;
  end if;
  return old;
end $$;
create trigger auth_require_prepared_account_deletion before delete on auth.users
for each row execute function public.guard_account_auth_deletion();

create function public.finish_account_auth_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.account_deletion_jobs set state = 'completed', completed_at = now() where target_id = old.id and state = 'pending_auth';
  return old;
end $$;
create trigger auth_finish_account_deletion after delete on auth.users
for each row execute function public.finish_account_auth_deletion();

create function public.account_deletion_status(p_actor_id uuid, p_target_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare job public.account_deletion_jobs%rowtype;
begin
  select * into job from public.account_deletion_jobs where target_id = p_target_id;
  if job.target_id is null or (
    (p_actor_id = p_target_id and job.actor_id = p_actor_id)
    or exists(select 1 from public.profiles where id = p_actor_id and role = 'admin' and status = 'active')) is distinct from true then
    raise exception 'Deletion receipt access denied' using errcode = '42501';
  end if;
  if job.state = 'completed' and (exists(select 1 from auth.users where id = p_target_id)
    or exists(select 1 from public.profiles where id = p_target_id)) then
    raise exception 'Identity removal has not completed' using errcode = '23514';
  end if;
  return job.state;
end $$;

create function public.permanent_deletion_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) = 7 from pg_trigger where not tgisinternal and tgenabled = 'O'
    and (tgrelid, tgname::text) in (
      ('public.profiles'::regclass, 'profiles_lock_access_changes'),
      ('public.profiles'::regclass, 'profiles_require_active_admin'),
      ('public.profiles'::regclass, 'profiles_guard_pending_deletion'),
      ('public.camps'::regclass, 'camps_guard_pending_owner'),
      ('auth.users'::regclass, 'auth_guard_pending_deletion'),
      ('auth.users'::regclass, 'auth_require_prepared_account_deletion'),
      ('auth.users'::regclass, 'auth_finish_account_deletion')))
    and exists(select 1 from pg_policy where polrelid = 'public.camps'::regclass
      and polname = 'Camp deletion requires dedicated RPC' and not polpermissive);
$$;

-- No helper or account RPC is callable by an end-user with forged actor IDs.
revoke all on function public.lock_permanent_deletion() from public, anon, authenticated;
revoke all on function public.camp_deletion_counts(uuid) from public, anon, authenticated;
revoke all on function public.assert_camp_deletion_graph(uuid) from public, anon, authenticated;
revoke all on function public.delete_camp_data_internal(uuid) from public, anon, authenticated;
revoke all on function public.preview_account_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.prepare_account_deletion(uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.guard_pending_account_deletion() from public, anon, authenticated;
revoke all on function public.guard_account_auth_deletion() from public, anon, authenticated;
revoke all on function public.finish_account_auth_deletion() from public, anon, authenticated;
revoke all on function public.permanent_deletion_ready() from public, anon, authenticated;
revoke all on function public.account_deletion_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_camp_permanently(uuid, text) from public, anon;
grant execute on function public.delete_camp_permanently(uuid, text) to authenticated;
grant execute on function public.preview_account_deletion(uuid, uuid) to service_role;
grant execute on function public.prepare_account_deletion(uuid, uuid, text, uuid[]) to service_role;
grant select on public.account_deletion_jobs to service_role;
grant execute on function public.permanent_deletion_ready() to service_role;
grant execute on function public.account_deletion_status(uuid, uuid) to service_role;

commit;
