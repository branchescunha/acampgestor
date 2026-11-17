-- STAGING NOVO E VAZIO SOMENTE. Nunca executar em producao.
-- Definicoes legadas conferidas no backup de schema de 2026-11-13 (PG 17.6).
-- camp_id e competition_team_id serao acrescentados por 003 e 013.
begin;
do $$
declare staging_ref text := 'REPLACE_WITH_STAGING_PROJECT_REF';
begin
  if staging_ref = 'REPLACE_WITH_STAGING_PROJECT_REF'
     or staging_ref = 'zuxndxchkeynvjqustxk'
     or staging_ref !~ '^[a-z]{20}$' then
    raise exception 'Informe o project ref do Staging, nunca o de producao';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
     or exists (select 1 from auth.users) then
    raise exception 'A baseline exige public vazio e nenhum usuario Auth';
  end if;
  create table public.acampgestor_staging_marker(project_ref text primary key);
  insert into public.acampgestor_staging_marker values(staging_ref);
end $$;
alter table public.acampgestor_staging_marker enable row level security;
revoke all on public.acampgestor_staging_marker from public, anon, authenticated;

create table public.tribes (
  id uuid primary key default gen_random_uuid(),
  name text not null, color text not null, symbol text,
  room_name text, room_type text, leader_name text,
  is_active boolean default true, created_at timestamptz default now(),
  constraint tribes_room_type_check check (room_type in ('UPA Boys', 'UPA Girls', 'UMP Boys', 'UMP Girls'))
);
create table public.participants (
  id uuid primary key default gen_random_uuid(), full_name text not null,
  age integer, gender text, group_type text, phone text, guardian_phone text,
  food_restriction text, notes text, is_board_member boolean default false,
  is_active boolean default true,
  tribe_id uuid references public.tribes(id) on delete set null,
  created_at timestamptz default now(), gymkhana_team text, birth_date date,
  church text, cpf text, address text, shirt_size text,
  constraint participants_gender_check check (gender in ('Masculino', 'Feminino')),
  constraint participants_group_type_check check (group_type in ('UPA', 'UMP'))
);
create table public.gymkhana_events (
  id uuid primary key default gen_random_uuid(), title text not null,
  winning_team text not null, points_per_member integer not null,
  notes text, created_at timestamptz default now()
);
create table public.gymkhana_settings (
  id integer primary key default 1,
  team_a_name text not null default 'Equipe A',
  team_b_name text not null default 'Equipe B',
  updated_at timestamptz default now(),
  constraint single_gymkhana_settings check (id = 1)
);
create table public.room_inspections (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid references public.tribes(id) on delete cascade,
  points integer not null, notes text, created_at timestamptz default now(),
  inspection_day text, inspection_period text, type text,
  has_photo boolean default false
);
create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid references public.tribes(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  type text not null, category text not null, points integer not null,
  reason text, notes text, created_at timestamptz default now(),
  gymkhana_event_id uuid references public.gymkhana_events(id) on delete cascade,
  room_inspection_id uuid references public.room_inspections(id) on delete cascade,
  constraint score_events_type_check check (type in ('POINT', 'PENALTY'))
);
-- Permissoes e policies operacionais sao instaladas pelas migrations 004/005/013.
-- Nao reproduzir os grants anonimos amplos do schema legado.
commit;
