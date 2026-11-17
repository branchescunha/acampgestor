-- SUPABASE STAGING ONLY, after staging/000_legacy_baseline.sql and 001-017.
-- Run this WHOLE file in SQL Editor as postgres, never a selected fragment.
-- All fixtures and temporary test triggers roll back, including on disconnect.
begin;
do $$ begin
  if to_regclass('public.acampgestor_staging_marker') is null then
    raise exception 'Missing Staging marker: do not run against production';
  end if;
  if not exists (select 1 from public.acampgestor_staging_marker
                 where project_ref ~ '^[a-z]{20}$' and project_ref is distinct from 'zuxndxchkeynvjqustxk') then
    raise exception 'Invalid Staging marker';
  end if;
end $$;

insert into auth.users(id, email) values
 ('17000000-0000-0000-0000-000000000001', 'manager-a@example.invalid'),
 ('17000000-0000-0000-0000-000000000002', 'manager-b@example.invalid'),
 ('17000000-0000-0000-0000-000000000003', 'admin@example.invalid');
insert into public.profiles(id, name, role, status) values
 ('17000000-0000-0000-0000-000000000001', 'Fixture A', 'gestor', 'active'),
 ('17000000-0000-0000-0000-000000000002', 'Fixture B', 'gestor', 'active'),
 ('17000000-0000-0000-0000-000000000003', 'Fixture Admin', 'admin', 'active');
insert into public.camps(id, name, church_name, created_by, slug, public_ranking_enabled) values
 ('17000000-0000-0000-0000-000000000011', 'Fixture Camp A', 'Fixture', '17000000-0000-0000-0000-000000000001', 'fixture-v2-a', true),
 ('17000000-0000-0000-0000-000000000012', 'Fixture Camp B', 'Fixture', '17000000-0000-0000-0000-000000000002', 'fixture-v2-b', false);
insert into public.competition_teams(id, camp_id, name) values
 ('17000000-0000-0000-0000-000000000021', '17000000-0000-0000-0000-000000000011', 'Fixture A1'),
 ('17000000-0000-0000-0000-000000000022', '17000000-0000-0000-0000-000000000011', 'Fixture A2'),
 ('17000000-0000-0000-0000-000000000023', '17000000-0000-0000-0000-000000000012', 'Fixture B1'),
 ('17000000-0000-0000-0000-000000000024', '17000000-0000-0000-0000-000000000011', 'Fixture many scores');
insert into public.tribes(id, camp_id, competition_team_id, name, color, room_type) values
 ('17000000-0000-0000-0000-000000000031', '17000000-0000-0000-0000-000000000011', '17000000-0000-0000-0000-000000000021', 'Fixture Room A', '#ffffff', 'Misto'),
 ('17000000-0000-0000-0000-000000000032', '17000000-0000-0000-0000-000000000012', '17000000-0000-0000-0000-000000000023', 'Fixture Room B', '#ffffff', 'Outro');
insert into public.participants(id, full_name, camp_id, tribe_id, competition_team_id)
values('17000000-0000-0000-0000-000000000033', 'Fixture Participant A', '17000000-0000-0000-0000-000000000011',
       '17000000-0000-0000-0000-000000000031', '17000000-0000-0000-0000-000000000021');

insert into public.score_events(camp_id, competition_team_id, type, category, points, reason)
select '17000000-0000-0000-0000-000000000011'::uuid, '17000000-0000-0000-0000-000000000024'::uuid,
       'POINT', 'Fixture', 1, 'Fixture pagination' from generate_series(1, 1101);
insert into public.score_events(camp_id, competition_team_id, type, category, points, reason)
values('17000000-0000-0000-0000-000000000011', '17000000-0000-0000-0000-000000000024', 'PENALTY', 'Fixture', -101, 'Fixture penalty');

create function public.fixture_fail_score_017() returns trigger language plpgsql as $$ begin
  if current_setting('acampgestor.fail_score', true) = 'on' then raise exception 'Fixture injected failure'; end if;
  return new;
end $$;
create trigger fixture_fail_score_017 before insert on public.score_events
for each row execute function public.fixture_fail_score_017();

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  camp uuid := '17000000-0000-0000-0000-000000000011';
  token uuid := '17000000-0000-0000-0000-000000000041';
  payload jsonb := '{"title":"Fixture multi-award","awards":[{"competition_team_id":"17000000-0000-0000-0000-000000000021","points":10},{"competition_team_id":"17000000-0000-0000-0000-000000000022","points":-3}]}';
  first_response jsonb;
  result_id uuid;
  before_count bigint;
  rejected boolean;
begin
  if exists(select 1 from public.camps where id = '17000000-0000-0000-0000-000000000012')
     or exists(select 1 from public.competition_teams where id = '17000000-0000-0000-0000-000000000023')
     or exists(select 1 from public.tribes where id = '17000000-0000-0000-0000-000000000032') then
    raise exception 'RLS exposed another managers camp';
  end if;
  insert into public.competition_teams(id, camp_id, name)
    values('17000000-0000-0000-0000-000000000025', camp, 'Fixture CRUD team');
  insert into public.tribes(id, camp_id, competition_team_id, name, color)
    values('17000000-0000-0000-0000-000000000034', camp, '17000000-0000-0000-0000-000000000025', 'Fixture CRUD room', '#ffffff');
  insert into public.participants(id, camp_id, competition_team_id, tribe_id, full_name)
    values('17000000-0000-0000-0000-000000000035', camp, '17000000-0000-0000-0000-000000000025', '17000000-0000-0000-0000-000000000034', 'Fixture CRUD participant');
  update public.participants set full_name = 'Fixture updated' where id = '17000000-0000-0000-0000-000000000035';
  if (select full_name from public.participants where id = '17000000-0000-0000-0000-000000000035') is distinct from 'Fixture updated' then
    raise exception 'Authorized participant CRUD failed';
  end if;
  delete from public.participants where id = '17000000-0000-0000-0000-000000000035';
  delete from public.tribes where id = '17000000-0000-0000-0000-000000000034';
  delete from public.competition_teams where id = '17000000-0000-0000-0000-000000000025';
  rejected := false;
  begin
    insert into public.competition_teams(camp_id, name)
    values('17000000-0000-0000-0000-000000000012', 'Fixture forbidden');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'RLS accepted cross-camp creation'; end if;
  if (select total from public.camp_score_totals where camp_id = camp and competition_team_id = '17000000-0000-0000-0000-000000000024') is distinct from 1000 then raise exception 'Aggregate truncated more than 1000 scores'; end if;
  first_response := public.save_camp_result(camp, token, 'gymkhana', 'save', null, payload);
  result_id := (first_response->>'id')::uuid;
  if public.save_camp_result(camp, token, 'gymkhana', 'save', null, payload) is distinct from first_response then raise exception 'Retry did not replay'; end if;
  if (select count(*) from public.score_events where gymkhana_event_id = result_id) is distinct from 2 then raise exception 'Duplicate awards'; end if;
  if (select total from public.camp_score_totals where camp_id = camp and competition_team_id = '17000000-0000-0000-0000-000000000021') is distinct from 10 then raise exception 'Positive total mismatch'; end if;
  if (select total from public.camp_score_totals where camp_id = camp and competition_team_id = '17000000-0000-0000-0000-000000000022') is distinct from -3 then raise exception 'Penalty total mismatch'; end if;
  if exists (select 1 from public.score_events where gymkhana_event_id = result_id and created_by is distinct from auth.uid()) then raise exception 'Actor mismatch'; end if;

  rejected := false;
  begin
    perform public.save_camp_result(camp, token, 'gymkhana', 'save', null, payload || '{"title":"Changed"}');
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Token reuse accepted different payload'; end if;

  select count(*) into before_count from public.gymkhana_events where camp_id = camp;
  perform set_config('acampgestor.fail_score', 'on', true);
  rejected := false;
  begin
    perform public.save_camp_result(camp, '17000000-0000-0000-0000-000000000042', 'gymkhana', 'save', null, payload);
  exception when raise_exception then rejected := true; end;
  perform set_config('acampgestor.fail_score', 'off', true);
  if not rejected or (select count(*) from public.gymkhana_events where camp_id = camp) is distinct from before_count then raise exception 'Atomic rollback failed'; end if;
  first_response := public.save_camp_result(camp, '17000000-0000-0000-0000-000000000042', 'gymkhana', 'save', null, payload);
  perform public.save_camp_result(camp, '17000000-0000-0000-0000-000000000048', 'gymkhana', 'delete', (first_response->>'id')::uuid);

  perform public.save_camp_result(camp, '17000000-0000-0000-0000-000000000043', 'gymkhana', 'save', result_id,
    '{"title":"Updated fixture","awards":[{"competition_team_id":"17000000-0000-0000-0000-000000000021","points":20}]}');
  if (select total from public.camp_score_totals where camp_id = camp and competition_team_id = '17000000-0000-0000-0000-000000000021') is distinct from 20 then raise exception 'Update total mismatch'; end if;
  if (select count(*) from public.score_events where gymkhana_event_id = result_id and is_voided) is distinct from 2 then raise exception 'History was not preserved'; end if;
  perform public.save_camp_result(camp, '17000000-0000-0000-0000-000000000044', 'gymkhana', 'delete', result_id);
  if exists (select 1 from public.score_events where gymkhana_event_id = result_id and not is_voided) then raise exception 'Delete left active points'; end if;

  perform public.save_camp_result(camp, '17000000-0000-0000-0000-000000000045', 'inspection', 'save', null,
    '{"tribe_id":"17000000-0000-0000-0000-000000000031","inspection_day":"Sexta","inspection_period":"Noite","type":"POINT","points":7}');
  perform public.save_camp_score(camp, '17000000-0000-0000-0000-000000000046', 'save', null,
    '{"competition_team_id":"17000000-0000-0000-0000-000000000021","participant_id":"17000000-0000-0000-0000-000000000033","type":"PENALTY","category":"Outro","reason":"Fixture penalty","points":2}');
  if (select total from public.camp_score_totals where camp_id = camp and competition_team_id = '17000000-0000-0000-0000-000000000021') is distinct from 5 then raise exception 'Unified inspection/manual total mismatch'; end if;
  first_response := public.save_camp_score(camp, '17000000-0000-0000-0000-000000000046', 'save', null,
    '{"competition_team_id":"17000000-0000-0000-0000-000000000021","participant_id":"17000000-0000-0000-0000-000000000033","type":"PENALTY","category":"Outro","reason":"Fixture penalty","points":2}');
  if (select total from public.camp_score_totals where camp_id = camp and competition_team_id = '17000000-0000-0000-0000-000000000021') is distinct from 5 then raise exception 'Manual retry duplicated points'; end if;
  perform public.save_camp_result(camp, '17000000-0000-0000-0000-000000000049', 'inspection', 'save', null,
    '{"tribe_id":"17000000-0000-0000-0000-000000000031","inspection_day":"Sabado","inspection_period":"Noite","type":"PENALTY","points":3}');
  if (select total from public.camp_score_totals where camp_id = camp and competition_team_id = '17000000-0000-0000-0000-000000000021') is distinct from 2 then raise exception 'Inspection penalty not assigned to room team'; end if;
  if not exists(select 1 from public.camp_operation_audit where camp_id = camp and actor_id = auth.uid() and entity = 'score_events') then
    raise exception 'Missing score audit history';
  end if;
  if (select total from public.public_camp_score_totals where camp_id = camp and competition_team_id = '17000000-0000-0000-0000-000000000021') is distinct from 2 then
    raise exception 'Public/private aggregate mismatch';
  end if;

  rejected := false;
  begin
    perform public.save_camp_result('17000000-0000-0000-0000-000000000012', gen_random_uuid(), 'gymkhana', 'save', null, payload);
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Cross-camp access allowed'; end if;
  rejected := false;
  begin
    perform public.save_camp_result(camp, gen_random_uuid(), 'gymkhana', 'save', null,
      '{"title":"Fixture foreign team","awards":[{"competition_team_id":"17000000-0000-0000-0000-000000000023","points":10}]}');
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'Foreign team accepted in local camp'; end if;
  rejected := false;
  begin
    perform public.save_camp_result(camp, gen_random_uuid(), 'inspection', 'save', null,
      '{"tribe_id":"17000000-0000-0000-0000-000000000032","inspection_day":"Sexta","inspection_period":"Noite","type":"POINT","points":7}');
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'Foreign room accepted in local camp'; end if;
  rejected := false;
  begin
    insert into public.participants(full_name, camp_id, tribe_id, competition_team_id)
    values('Fixture mismatch', camp, '17000000-0000-0000-0000-000000000031', '17000000-0000-0000-0000-000000000022');
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'Mismatched participant room accepted'; end if;
  rejected := false;
  begin
    update public.participants set competition_team_id = '17000000-0000-0000-0000-000000000022'
    where id = '17000000-0000-0000-0000-000000000033';
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'Mismatched participant update accepted'; end if;
  rejected := false;
  begin
    update public.tribes set competition_team_id = '17000000-0000-0000-0000-000000000022'
    where id = '17000000-0000-0000-0000-000000000031';
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'Room with history changed teams'; end if;
  rejected := false;
  begin delete from public.participants where id = '17000000-0000-0000-0000-000000000033';
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'Participant history could be erased'; end if;
  rejected := false;
  begin delete from public.score_events where camp_id = camp;
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Direct historical delete allowed'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform public.save_camp_score('17000000-0000-0000-0000-000000000012', '17000000-0000-0000-0000-000000000047', 'save', null,
    '{"competition_team_id":"17000000-0000-0000-0000-000000000023","type":"POINT","category":"Outro","reason":"Fixture admin support","points":1}');
  if (select total from public.camp_score_totals where camp_id = '17000000-0000-0000-0000-000000000012' and competition_team_id = '17000000-0000-0000-0000-000000000023') is distinct from 1 then
    raise exception 'Admin access was not preserved';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  if exists (select 1 from public.public_camp_score_totals where camp_id = '17000000-0000-0000-0000-000000000012') then
    raise exception 'Private camp leaked into public ranking';
  end if;
end $$;
reset role;
rollback;
select 'PASS: SQL assertions completed; all fixtures rolled back' as result;
