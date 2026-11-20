-- ISOLATED DATABASE ONLY. Never run in production, even with ROLLBACK.
-- Requires the existing Staging marker and migrations through 021.
begin;
do $$ begin
  if to_regclass('public.acampgestor_staging_marker') is null then
    raise exception 'Isolated database marker required; production forbidden';
  end if;
  if not exists(select 1 from public.acampgestor_staging_marker
    where project_ref ~ '^[a-z]{20}$' and project_ref <> 'zuxndxchkeynvjqustxk') then
    raise exception 'Invalid isolated database marker';
  end if;
end $$;

-- Fresh isolated baseline only. These fixtures reproduce the three production
-- FKs without copying legacy data; everything below is rolled back.
create table public.meal_checkpoints (tribe_id uuid references public.tribes(id) on delete cascade);
create table public.room_checks (tribe_id uuid references public.tribes(id) on delete cascade);
create table public.gymkhana_members (participant_id uuid references public.participants(id) on delete cascade);

insert into auth.users(id, email) values
 ('21000000-0000-4000-8000-000000000001', 'admin-021@example.invalid'),
 ('21000000-0000-4000-8000-000000000002', 'owner-021@example.invalid'),
 ('21000000-0000-4000-8000-000000000003', 'other-021@example.invalid');
insert into public.profiles(id, name, role, status) values
 ('21000000-0000-4000-8000-000000000001', 'Fixture ADMIN', 'admin', 'active'),
 ('21000000-0000-4000-8000-000000000002', 'Fixture owner', 'gestor', 'active'),
 ('21000000-0000-4000-8000-000000000003', 'Fixture other', 'gestor', 'active');
insert into public.camps(id, name, church_name, slug, public_ranking_enabled, created_by) values
 ('21000000-0000-4000-8000-000000000011', 'Fixture full', 'Fixture', 'fixture-full-021', true, '21000000-0000-4000-8000-000000000002'),
 ('21000000-0000-4000-8000-000000000012', 'Fixture empty', 'Fixture', 'fixture-empty-021', true, '21000000-0000-4000-8000-000000000003');
insert into public.organizations(id, name, type, created_by) values
 ('21000000-0000-4000-8000-000000000051', 'Fixture linked org', 'church', '21000000-0000-4000-8000-000000000001'),
 ('21000000-0000-4000-8000-000000000052', 'Fixture empty org', 'church', '21000000-0000-4000-8000-000000000001');
update public.camps set organization_id = '21000000-0000-4000-8000-000000000051' where id = '21000000-0000-4000-8000-000000000012';
insert into public.organization_members(organization_id, profile_id, role, status) values
 ('21000000-0000-4000-8000-000000000051', '21000000-0000-4000-8000-000000000002', 'manager', 'active');
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.delete_empty_organization('21000000-0000-4000-8000-000000000052');
do $$ declare rejected boolean := false; begin
  begin perform public.delete_empty_organization('21000000-0000-4000-8000-000000000051');
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'Organization deletion removed shared camp'; end if;
end $$;
reset role;
insert into public.competition_teams(id, camp_id, name) values
 ('21000000-0000-4000-8000-000000000021', '21000000-0000-4000-8000-000000000011', 'Fixture team');
insert into public.tribes(id, camp_id, competition_team_id, name, color, room_type) values
 ('21000000-0000-4000-8000-000000000031', '21000000-0000-4000-8000-000000000011', '21000000-0000-4000-8000-000000000021', 'Fixture room', '#ffffff', 'Masculino');
insert into public.participants(id, camp_id, competition_team_id, tribe_id, full_name) values
 ('21000000-0000-4000-8000-000000000041', '21000000-0000-4000-8000-000000000011', '21000000-0000-4000-8000-000000000021', '21000000-0000-4000-8000-000000000031', 'Fixture participant');

select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"21000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.save_camp_score('21000000-0000-4000-8000-000000000011', gen_random_uuid(), 'save', null,
 '{"competition_team_id":"21000000-0000-4000-8000-000000000021","participant_id":"21000000-0000-4000-8000-000000000041","type":"POINT","category":"Fixture","reason":"Fixture","points":10}');
select public.save_camp_result('21000000-0000-4000-8000-000000000011', gen_random_uuid(), 'gymkhana', 'save', null,
 '{"title":"Fixture game","awards":[{"competition_team_id":"21000000-0000-4000-8000-000000000021","points":5}]}');
select public.save_camp_result('21000000-0000-4000-8000-000000000011', gen_random_uuid(), 'inspection', 'save', null,
 '{"tribe_id":"21000000-0000-4000-8000-000000000031","inspection_day":"Sexta","inspection_period":"Noite","type":"PENALTY","points":2}');
do $$ declare rejected boolean := false; begin
  begin perform public.prepare_account_deletion('21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000003', 'EXCLUIR CONTA', '{}');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Authenticated user could forge a service-only actor'; end if;
  rejected := false;
  begin update public.camps set created_by = auth.uid() where id = '21000000-0000-4000-8000-000000000012';
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Organization member could take over camp ownership'; end if;
  rejected := false;
  begin perform public.delete_camp_permanently('21000000-0000-4000-8000-000000000012', 'Fixture empty');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Another owners camp could be deleted'; end if;
  rejected := false;
  begin perform public.delete_camp_permanently('21000000-0000-4000-8000-000000000011', 'wrong');
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Missing typed confirmation accepted'; end if;
end $$;

-- Inject a failure AFTER earlier deletes. The whole RPC must roll back.
reset role;

insert into public.meal_checkpoints values ('21000000-0000-4000-8000-000000000031');
insert into public.room_checks values ('21000000-0000-4000-8000-000000000031');
insert into public.gymkhana_members values ('21000000-0000-4000-8000-000000000041');
do $$ declare tab text; rejected boolean; begin
  foreach tab in array array['meal_checkpoints', 'room_checks', 'gymkhana_members'] loop
    rejected := false;
    begin perform public.delete_camp_permanently('21000000-0000-4000-8000-000000000011', 'Fixture full');
    exception when foreign_key_violation then rejected := true; end;
    if not rejected or not exists(select 1 from public.camps where id = '21000000-0000-4000-8000-000000000011')
      or not exists(select 1 from public.score_events where camp_id = '21000000-0000-4000-8000-000000000011') then
      raise exception 'Legacy dependency was cascaded or deletion was partial';
    end if;
    execute format('delete from public.%I', tab);
  end loop;
end $$;

create table public.fixture_unknown_dependency_021 (tribe_id uuid references public.tribes(id) on delete cascade);
do $$ declare rejected boolean := false; begin
  begin perform public.delete_camp_permanently('21000000-0000-4000-8000-000000000011', 'Fixture full');
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'Unknown dependency was accepted'; end if;
end $$;
drop table public.fixture_unknown_dependency_021;

create function public.fixture_reject_room_delete_021() returns trigger language plpgsql as $$
begin raise exception 'Fixture late delete failure'; end $$;
create trigger fixture_reject_room_delete_021 before delete on public.tribes
for each row execute function public.fixture_reject_room_delete_021();
set local role authenticated;
do $$ declare rejected boolean := false; begin
  begin perform public.delete_camp_permanently('21000000-0000-4000-8000-000000000011', 'Fixture full');
  exception when raise_exception then rejected := true; end;
  if not rejected or not exists(select 1 from public.score_events where camp_id = '21000000-0000-4000-8000-000000000011') then
    raise exception 'Failed camp deletion did not roll back';
  end if;
end $$;
reset role;
drop trigger fixture_reject_room_delete_021 on public.tribes;
drop function public.fixture_reject_room_delete_021();
set local role authenticated;
select public.delete_camp_permanently('21000000-0000-4000-8000-000000000011', 'Fixture full');
select public.delete_camp_permanently('21000000-0000-4000-8000-000000000011', 'Fixture full');
reset role;
do $$ declare tab text; linked boolean; begin
  foreach tab in array array['competition_teams','tribes','participants','score_events','gymkhana_events','room_inspections','camp_operation_audit','camp_operation_receipts'] loop
    execute format('select exists(select 1 from public.%I where camp_id = $1)', tab) into linked using '21000000-0000-4000-8000-000000000011'::uuid;
    if linked then raise exception 'Camp graph still has rows in %', tab; end if;
  end loop;
  if exists(select 1 from public.public_ranking_competition_teams where camp_id = '21000000-0000-4000-8000-000000000011') then raise exception 'Public ranking survived'; end if;
  if not exists(select 1 from public.camps where id = '21000000-0000-4000-8000-000000000012') then raise exception 'Other camp was removed'; end if;
end $$;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
delete from public.organization_members where organization_id = '21000000-0000-4000-8000-000000000051';
update public.profiles set status = 'suspended' where id = '21000000-0000-4000-8000-000000000002';
do $$ declare rejected boolean := false; begin
  begin perform public.preview_account_deletion('21000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Suspended account without pending deletion was authorized'; end if;
end $$;
update public.profiles set status = 'active' where id = '21000000-0000-4000-8000-000000000002';
do $$ declare rejected boolean := false; result jsonb; begin
  begin perform public.prepare_account_deletion('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000003','EXCLUIR CONTA','{}');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Gestor could delete another account'; end if;
  rejected := false;
  begin perform public.prepare_account_deletion('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','EXCLUIR CONTA','{}');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'ADMIN could be a deletion target'; end if;
  result := public.prepare_account_deletion('21000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000003','EXCLUIR CONTA',array['21000000-0000-4000-8000-000000000012'::uuid]);
  if result->>'state' <> 'pending_auth' then raise exception 'Missing durable pending state'; end if;
  if not exists(select 1 from public.profiles where id = '21000000-0000-4000-8000-000000000003' and status = 'suspended') then raise exception 'Pending user retains access'; end if;
  if not exists(select 1 from auth.users where id = '21000000-0000-4000-8000-000000000003') then raise exception 'Preparation deleted Auth directly'; end if;
  rejected := false;
  begin update public.profiles set status = 'active' where id = '21000000-0000-4000-8000-000000000003';
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Pending account was reactivated'; end if;
end $$;
-- SQL guard/cascade test only, NOT a real Auth Admin HTTP test.
delete from auth.users where id = '21000000-0000-4000-8000-000000000003';
do $$ begin
  if exists(select 1 from public.profiles where id = '21000000-0000-4000-8000-000000000003') then raise exception 'Profile survived Auth cascade'; end if;
  if not exists(select 1 from public.account_deletion_jobs where target_id = '21000000-0000-4000-8000-000000000003' and state = 'completed') then raise exception 'Auth completion not recorded'; end if;
  if not exists(select 1 from public.profiles where id = '21000000-0000-4000-8000-000000000001' and role = 'admin' and status = 'active') then raise exception 'ADMIN changed'; end if;
end $$;
rollback;
