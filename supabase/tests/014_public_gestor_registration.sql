-- Somente em Supabase local isolado, com os SQLs 001 a 014 aplicados.
-- Todos os dados de teste são revertidos ao final. Não executar em produção.
begin;

-- O SQL simula Auth autoconfirmado; não testa configuração nem login HTTP real.
do $$
declare
  api_role text;
  legacy_function text;
  legacy_table text;
begin
  foreach api_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach legacy_function in array array[
      'public.accept_invitation(uuid)',
      'public.get_invitation_by_token(uuid)',
      'public.add_organization_member_by_email(uuid,text,text)'
    ] loop
      if has_function_privilege(api_role, legacy_function, 'EXECUTE') then
        raise exception 'RPC legado continua acessivel: % / %', api_role, legacy_function;
      end if;
    end loop;
  end loop;
  foreach api_role in array array['anon', 'authenticated'] loop
    foreach legacy_table in array array['public.access_requests', 'public.invitations'] loop
      if has_any_column_privilege(api_role, legacy_table, 'INSERT')
        or has_any_column_privilege(api_role, legacy_table, 'UPDATE')
        or has_table_privilege(api_role, legacy_table, 'DELETE') then
        raise exception 'Escrita legada continua acessivel: % / %', api_role, legacy_table;
      end if;
    end loop;
  end loop;

  -- Mesmo o executor privilegiado deve encontrar corpos de RPC sem efeitos.
  begin
    perform public.accept_invitation('74000000-0000-4000-8000-000000000001');
    raise exception 'Aceite legado ainda pode executar.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_invitation_by_token('74000000-0000-4000-8000-000000000001');
    raise exception 'Consulta de convite ainda pode executar.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_organization_member_by_email(
      '71000000-0000-4000-8000-000000000001', 'v2-other@example.invalid', 'owner');
    raise exception 'Associacao por e-mail ainda pode executar.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    insert into public.access_requests (name, email, church_name, status)
    values ('Legado', 'v2-legacy@example.invalid', 'Exemplo', 'pending');
    raise exception 'Solicitacao anonima continua habilitada por grant de coluna.';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('70000000-0000-4000-8000-000000000001', 'v2-unverified@example.invalid', null,
   '{"name":"Gestor público","role":"admin","status":"active"}'::jsonb),
  ('70000000-0000-4000-8000-000000000002', 'v2-suspended@example.invalid', now(), '{}'::jsonb),
  ('70000000-0000-4000-8000-000000000003', 'v2-admin@example.invalid', now(), '{}'::jsonb),
  ('70000000-0000-4000-8000-000000000004', 'v2-other@example.invalid', now(), '{}'::jsonb),
  ('70000000-0000-4000-8000-000000000005', 'v2-conflict@example.invalid', null, '{"role":"admin"}'::jsonb),
  ('70000000-0000-4000-8000-000000000006', 'v2-pending@example.invalid', null, '{}'::jsonb),
  ('70000000-0000-4000-8000-000000000007', 'v2-autoconfirm@example.invalid', now(),
   '{"name":"Diretoria","role":"admin","status":"suspended"}'::jsonb);

do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000007'
      and name = 'Diretoria' and role = 'gestor' and status = 'active'
  ) then
    raise exception 'Auth autoconfirmado não provisionou GESTOR ou aceitou permissões dos metadados.';
  end if;
end;
$$;

-- Simula e-mail desatualizado de outro profile, sem duplicar identidades em Auth.
update public.profiles set email = 'v2-conflict@example.invalid'
where id = '70000000-0000-4000-8000-000000000004';

update auth.users set email_confirmed_at = now()
where id = '70000000-0000-4000-8000-000000000005';

do $$
begin
  if not exists (
    select 1 from auth.users
    where id = '70000000-0000-4000-8000-000000000005' and email_confirmed_at is not null
  ) or not exists (
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000005'
      and role = 'gestor' and status = 'suspended' and email is null
  ) then
    raise exception 'Conflito deve confirmar Auth e suspender o novo profile sem e-mail.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000004'
      and email = 'v2-conflict@example.invalid' and role = 'gestor' and status = 'active'
  ) then
    raise exception 'Conflito alterou o profile de outra identidade.';
  end if;
end;
$$;

update public.profiles set email = 'v2-other@example.invalid'
where id = '70000000-0000-4000-8000-000000000004';

-- Liberar o e-mail não deve ativar automaticamente um profile em quarentena.
update auth.users set email_confirmed_at = now()
where id = '70000000-0000-4000-8000-000000000005';

do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000005'
      and status = 'suspended' and email is null
  ) then
    raise exception 'Provisionamento repetido reativou um profile em quarentena.';
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from public.profiles where id = '70000000-0000-4000-8000-000000000001') then
    raise exception 'Usuário não confirmado recebeu um profile.';
  end if;
end;
$$;

update auth.users set email_confirmed_at = now()
where id = '70000000-0000-4000-8000-000000000001';

update auth.users set email_confirmed_at = now()
where id = '70000000-0000-4000-8000-000000000001';

update public.profiles set status = 'suspended'
where id = '70000000-0000-4000-8000-000000000002';

update public.profiles set role = 'admin'
where id = '70000000-0000-4000-8000-000000000003';

update auth.users set email_confirmed_at = now()
where id in ('70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000003');

do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000001'
      and role = 'gestor' and status = 'active'
      and email = 'v2-unverified@example.invalid'
  ) then
    raise exception 'Confirmação não criou o profile GESTOR esperado.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000003' and role = 'admin'
  ) then
    raise exception 'Profile ADMIN existente foi alterado.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000002' and status = 'suspended'
  ) then
    raise exception 'Profile suspenso foi reativado.';
  end if;
end;
$$;

insert into public.organizations (id, name, created_by)
values ('71000000-0000-4000-8000-000000000001', 'Organização de terceiro', '70000000-0000-4000-8000-000000000004');

insert into public.organization_members (organization_id, profile_id, role, status)
values ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000004', 'owner', 'active');

insert into public.camps (id, name, church_name, created_by, organization_id, public_ranking_enabled)
values ('72000000-0000-4000-8000-000000000001', 'Outro acampamento', 'Organização de terceiro',
  '70000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000001', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);

-- O cadastro administrativo de organizacoes pode manter o proprio owner inicial.
insert into public.organizations (id, name, created_by)
values ('71000000-0000-4000-8000-000000000002', 'Organizacao propria', auth.uid());
insert into public.organization_members (organization_id, profile_id, role, status)
values ('71000000-0000-4000-8000-000000000002', auth.uid(), 'owner', 'active');

do $$
begin
  -- A policy permissiva antiga de owner nao pode permitir outra conta.
  begin
    insert into public.organization_members (organization_id, profile_id, role, status)
    values ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000004', 'manager', 'active');
    raise exception 'Owner adicionou outra conta diretamente.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.organization_members set status = 'suspended'
    where organization_id = '71000000-0000-4000-8000-000000000002';
    raise exception 'Owner alterou um vinculo legado.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_organization_member_by_email(
      '71000000-0000-4000-8000-000000000002', 'v2-other@example.invalid', 'owner');
    raise exception 'Owner executou RPC de associacao.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
begin
  update public.profiles set role = 'admin' where id = auth.uid();
  if found then raise exception 'GESTOR conseguiu promover o próprio profile.'; end if;

  if exists (select 1 from public.camps where id = '72000000-0000-4000-8000-000000000001') then
    raise exception 'GESTOR leu acampamento privado de terceiro.';
  end if;

  begin
    insert into public.profiles (id, name, role, status)
    values (auth.uid(), 'Admin indevido', 'admin', 'active');
    raise exception 'Cadastro público conseguiu inserir profile privilegiado.';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.camps (name, church_name, created_by)
    values ('Titular falso', 'Exemplo', '70000000-0000-4000-8000-000000000004');
    raise exception 'GESTOR conseguiu criar acampamento em nome de terceiro.';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.camps (name, church_name, created_by, organization_id)
    values ('Vínculo indevido', 'Organização de terceiro', auth.uid(), '71000000-0000-4000-8000-000000000001');
    raise exception 'GESTOR conseguiu usar organização de terceiro.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

insert into public.camps (id, name, church_name, slug, created_by, organization_id)
values ('72000000-0000-4000-8000-000000000002', 'Meu primeiro acampamento',
  'Organização de terceiro', 'qa-v2-registration-camp', auth.uid(), null);

do $$
begin
  if not exists (
    select 1 from public.camps
    where id = '72000000-0000-4000-8000-000000000002'
      and created_by = auth.uid() and organization_id is null
  ) then
    raise exception 'GESTOR não conseguiu criar e ler o próprio acampamento independente.';
  end if;
end;
$$;

reset role;

-- Outro gestor ativo não pode ler nem alterar o camp independente recém-criado.
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000004', true);

do $$
begin
  if exists (select 1 from public.camps where id = '72000000-0000-4000-8000-000000000002') then
    raise exception 'Outro gestor leu o primeiro camp independente.';
  end if;
  update public.camps set name = 'Alteração indevida'
  where id = '72000000-0000-4000-8000-000000000002';
  if found then raise exception 'Outro gestor alterou camp independente.'; end if;
end;
$$;

reset role;
set local role authenticated;

-- Suspensão normal, conflito de e-mail e ausência de confirmação negam operações.
do $$
declare
  blocked_id uuid;
begin
  foreach blocked_id in array array[
    '70000000-0000-4000-8000-000000000002'::uuid,
    '70000000-0000-4000-8000-000000000005'::uuid,
    '70000000-0000-4000-8000-000000000006'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', blocked_id::text, true);
    if public.is_active_gestor() or public.is_platform_admin()
      or public.can_manage_camp('72000000-0000-4000-8000-000000000002') then
      raise exception 'Usuário bloqueado recebeu permissão operacional.';
    end if;
    begin
      insert into public.camps (name, church_name, created_by)
      values ('Camp indevido', 'Exemplo', blocked_id);
      raise exception 'Usuário bloqueado criou camp.';
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000003', true);

insert into public.organizations (id, name, created_by)
values ('71000000-0000-4000-8000-000000000003', 'Organizacao do admin', auth.uid());
insert into public.organization_members (organization_id, profile_id, role, status)
values ('71000000-0000-4000-8000-000000000003', auth.uid(), 'owner', 'active');

do $$
begin
  begin
    insert into public.organization_members (organization_id, profile_id, role, status)
    values ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000004', 'owner', 'active');
    raise exception 'Policy antiga de ADMIN permitiu associar outra conta.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.invitations (name, email, role, created_by)
    values ('Convite legado', 'v2-legacy@example.invalid', 'admin', auth.uid());
    raise exception 'ADMIN conseguiu criar um convite legado.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.access_requests set status = 'approved', reviewed_by = auth.uid();
    raise exception 'ADMIN conseguiu revisar solicitacoes legadas.';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.organization_members
      where organization_id in (
        '71000000-0000-4000-8000-000000000001',
        '71000000-0000-4000-8000-000000000002',
        '71000000-0000-4000-8000-000000000003'
      )) <> 3 then
    raise exception 'Vinculos existentes ou owners iniciais foram alterados.';
  end if;

  if not public.is_platform_admin() then
    raise exception 'ADMIN perdeu permissão após provisionamento repetido.';
  end if;
  if not exists (select 1 from public.camps where id = '72000000-0000-4000-8000-000000000002') then
    raise exception 'ADMIN perdeu supervisão de camps.';
  end if;

  update public.profiles
  set email = 'v2-conflict@example.invalid', status = 'active'
  where id = '70000000-0000-4000-8000-000000000005';
  if not found then
    raise exception 'ADMIN não conseguiu recuperar explicitamente o profile em quarentena.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000005'
      and role = 'gestor' and status = 'active' and email = 'v2-conflict@example.invalid'
  ) then
    raise exception 'Recuperação administrativa alterou a identidade ou o papel indevidamente.';
  end if;
end;
$$;

reset role;
rollback;
