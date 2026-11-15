begin;

create or replace function public.create_confirmed_gestor_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conflicting_constraint text;
begin
  if new.email_confirmed_at is null or new.email is null then
    return new;
  end if;

  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  -- O UID vem do Auth. Autoconfirmação não comprova titularidade do e-mail.
  -- Metadados do cadastro nunca definem permissões ou vínculos por e-mail.
  begin
    insert into public.profiles (id, name, email, role, status)
    values (
      new.id,
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      lower(new.email),
      'gestor',
      'active'
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    get stacked diagnostics conflicting_constraint = constraint_name;
    if conflicting_constraint is distinct from 'profiles_email_unique_idx' then
      raise;
    end if;

    -- Preserva o Auth sem associar identidades ou conceder acesso operacional.
    insert into public.profiles (id, name, email, role, status)
    values (
      new.id,
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      null,
      'gestor',
      'suspended'
    )
    on conflict (id) do nothing;
    raise log 'AcampGestor: provisionamento suspenso por conflito de e-mail; requer revisão administrativa.';
  end;

  return new;
end;
$$;

revoke all
on function public.create_confirmed_gestor_profile()
from public, anon, authenticated;

drop trigger if exists acampgestor_confirmed_gestor_profile on auth.users;

create trigger acampgestor_confirmed_gestor_profile
after insert or update of email_confirmed_at on auth.users
for each row execute function public.create_confirmed_gestor_profile();

-- Mantem as assinaturas antigas, mas remove os efeitos mesmo em chamadas
-- privilegiadas. A Edge Function deve ser desativada ANTES de aplicar este SQL.
create or replace function public.accept_invitation(invitation_token uuid)
returns table (
  profile_id uuid, name text, email text, role text, status text,
  invitation_status text, accepted_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Convites desativados na V2.';
end;
$$;

create or replace function public.get_invitation_by_token(invitation_token uuid)
returns table (
  token uuid, name text, email text, role text, status text,
  created_at timestamptz, accepted_at timestamptz, canceled_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Convites desativados na V2.';
end;
$$;

create or replace function public.add_organization_member_by_email(
  target_organization_id uuid,
  member_email text,
  member_role text default 'manager'
)
returns table (
  id uuid, organization_id uuid, profile_id uuid, name text,
  email text, role text, status text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Associacao de membros desativada na V2.';
end;
$$;

revoke all on function public.accept_invitation(uuid)
from public, anon, authenticated, service_role;

revoke all on function public.get_invitation_by_token(uuid)
from public, anon, authenticated, service_role;

revoke all on function public.add_organization_member_by_email(uuid, text, text)
from public, anon, authenticated, service_role;

-- SELECT e dados historicos permanecem. Revogar a tabela nao remove ACLs de
-- colunas herdadas (como as do SQL 001); ambas precisam ser retiradas.
revoke insert, update, delete on public.access_requests, public.invitations
from public, anon, authenticated;

revoke update, delete on public.organization_members
from public, anon, authenticated;

do $$
declare
  target_table text;
  column_names text;
begin
  foreach target_table in array array['access_requests', 'invitations', 'organization_members'] loop
    select string_agg(format('%I', attname), ', ' order by attnum)
      into column_names
    from pg_catalog.pg_attribute
    where attrelid = format('public.%I', target_table)::regclass
      and attnum > 0 and not attisdropped;

    execute format('revoke update (%s) on public.%I from public, anon, authenticated',
      column_names, target_table);
    if target_table <> 'organization_members' then
      execute format('revoke insert (%s) on public.%I from public, anon, authenticated',
        column_names, target_table);
    end if;
  end loop;
end;
$$;

-- Policies restritivas complementam as policies antigas, sem apaga-las.
-- A criacao de organizacao ainda pode registrar apenas seu proprio owner inicial.
create or replace function public.can_create_initial_organization_membership(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations
    inner join public.profiles on profiles.id = auth.uid()
    where organizations.id = target_organization_id
      and organizations.created_by = auth.uid()
      and profiles.status = 'active'
      and profiles.role in ('admin', 'gestor')
      and not exists (
        select 1 from public.organization_members
        where organization_members.organization_id = target_organization_id
      )
  );
$$;

drop policy if exists "V2 only allows initial organization owner" on public.organization_members;
create policy "V2 only allows initial organization owner"
on public.organization_members
as restrictive for insert to public
with check (
  profile_id = auth.uid()
  and role = 'owner'
  and status = 'active'
  and public.can_create_initial_organization_membership(organization_id)
);

drop policy if exists "V2 freezes existing organization memberships" on public.organization_members;
create policy "V2 freezes existing organization memberships"
on public.organization_members
as restrictive for update to public
using (false)
with check (false);

-- Aborta a migration inteira se algum acampamento antigo usar uma rota reservada.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.camps'::regclass
      and conname = 'camps_v2_reserved_routes_check'
  ) then
    alter table public.camps
      add constraint camps_v2_reserved_routes_check
      check (slug is null or slug not in (
        'cadastro', 'gestor', 'forgot-password', 'reset-password'
      ));
  end if;
end;
$$;

-- Confere permissoes efetivas, incluindo grants herdados. Se algum acesso
-- sobreviver aos revokes, a transacao inteira deve abortar.
do $$
declare
  api_role text;
  legacy_function text;
  legacy_table text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.organization_members'::regclass and relrowsecurity
  ) then
    raise exception 'RLS de organization_members precisa estar ativo antes da 014.';
  end if;

  foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach legacy_function in array array[
      'public.accept_invitation(uuid)',
      'public.get_invitation_by_token(uuid)',
      'public.add_organization_member_by_email(uuid,text,text)'
    ] loop
      if has_function_privilege(api_role, legacy_function, 'EXECUTE') then
        raise exception 'RPC legado ainda executavel por %: %', api_role, legacy_function;
      end if;
    end loop;
  end loop;

  foreach api_role in array array['anon', 'authenticated'] loop
    foreach legacy_table in array array['public.access_requests', 'public.invitations'] loop
      if has_any_column_privilege(api_role, legacy_table, 'INSERT')
        or has_any_column_privilege(api_role, legacy_table, 'UPDATE')
        or has_table_privilege(api_role, legacy_table, 'DELETE') then
        raise exception 'Escrita legada ainda permitida para %: %', api_role, legacy_table;
      end if;
    end loop;
    if has_any_column_privilege(api_role, 'public.organization_members', 'UPDATE')
      or has_table_privilege(api_role, 'public.organization_members', 'DELETE') then
      raise exception 'Alteracao de membros ainda permitida para %', api_role;
    end if;
  end loop;
end;
$$;

commit;
