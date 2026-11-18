-- READ ONLY after 018. Structural/pure validation checks, not RPC write tests.
begin read only;
do $$
declare slots jsonb;
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'camps'
      and column_name = 'inspection_schedule' and udt_name = 'jsonb' and is_nullable = 'YES') <> 1 then
    raise exception 'Missing nullable inspection_schedule JSONB column';
  end if;
  if not exists(select 1 from pg_constraint where conrelid = 'public.camps'::regclass and conname = 'camps_inspection_schedule_check' and convalidated) then
    raise exception 'Missing validated schedule constraint';
  end if;
  select jsonb_agg(jsonb_build_object('day', day, 'period', period)) into slots
  from unnest(array['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']) day
  cross join unnest(array['Manhã', 'Tarde', 'Noite']) period;
  if public.is_valid_inspection_schedule(slots) is distinct from true
     or public.is_valid_inspection_schedule(null) is distinct from true
     or public.is_valid_inspection_schedule('[]') is distinct from true
     or public.is_valid_inspection_schedule('[{"day":"Segunda","period":"Noite"}]') is distinct from true
     or public.is_valid_inspection_schedule('[{"day":"Segunda","period":"Noite"},{"day":"Segunda","period":"Noite"}]') is distinct from false
     or public.is_valid_inspection_schedule('[{"day":"Feriado","period":"Noite"}]') is distinct from false
     or public.is_valid_inspection_schedule('[{"day":"Sexta","period":"Madrugada"}]') is distinct from false
     or public.is_valid_inspection_schedule('{}') is distinct from false then
    raise exception 'Schedule validation cases failed';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled in ('O', 'A') and
      ((tgrelid = 'public.camps'::regclass and tgname = 'camps_preserve_used_inspection_slots')
       or (tgrelid = 'public.room_inspections'::regclass and tgname = 'room_inspections_validate_slot')
       or (tgrelid = 'public.tribes'::regclass and tgname = 'tribes_validate_room_type'))) <> 3 then
    raise exception 'Missing schedule/room validation triggers';
  end if;
  if (select count(*) from pg_class where oid in ('public.camps'::regclass, 'public.tribes'::regclass, 'public.room_inspections'::regclass) and relrowsecurity) <> 3 then
    raise exception 'RLS must stay enabled';
  end if;
  if has_table_privilege('anon', 'public.room_inspections', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.room_inspections', 'INSERT,UPDATE,DELETE')
     or has_any_column_privilege('authenticated', 'public.room_inspections', 'INSERT,UPDATE')
     or not has_function_privilege('authenticated', 'public.save_camp_result(uuid,uuid,text,text,uuid,jsonb)', 'EXECUTE') then
    raise exception 'Existing inspection RPC-only permissions changed';
  end if;
end $$;
select count(*) as invalid_camp_schedules from public.camps where not public.is_valid_inspection_schedule(inspection_schedule);
select 'V2_INSPECTION_SCHEDULE_VERIFIED' as result;
rollback;
