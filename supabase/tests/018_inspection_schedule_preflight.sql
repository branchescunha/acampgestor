-- READ ONLY, before 018. No identifiers or personal data are returned.
select current_setting('server_version') as postgres_version,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'camps' and column_name = 'inspection_schedule') as schedule_already_exists,
  to_regprocedure('public.is_valid_inspection_schedule(jsonb)') is not null as validator_already_exists,
  to_regprocedure('public.save_camp_result(uuid,uuid,text,text,uuid,jsonb)') is not null as transactional_rpc_exists;

select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('camps', 'tribes', 'competition_teams', 'room_inspections');

select count(*) as inspections_with_unmapped_legacy_slot from public.room_inspections
where inspection_day is null or inspection_period is null
  or inspection_day not in ('Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo')
  or inspection_period not in ('Manhã', 'Tarde', 'Noite');

select inspection_day, inspection_period, count(*) as inspections_count
from public.room_inspections group by inspection_day, inspection_period order by inspection_day, inspection_period;

select count(*) as legacy_room_types_preserved from public.tribes
where room_type is null or room_type not in ('Masculino', 'Feminino');

select conname, pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid = 'public.tribes'::regclass and conname = 'tribes_team_camp_fk';
