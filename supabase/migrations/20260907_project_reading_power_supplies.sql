-- Leitura de Projeto — posicionamento de fonte (12V) por fita, e deslocamento
-- da cota (pra poder empurrar a medida na tela sem alterar o comprimento
-- real medido).
alter table public.plan_measurements add column if not exists cota_offset numeric not null default 16;

create table public.plan_power_supplies (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.project_plans(id) on delete cascade,
  measurement_id uuid not null references public.plan_measurements(id) on delete cascade, -- a fita que essa fonte alimenta
  page int not null default 1,
  x numeric not null,
  y numeric not null,
  watts numeric not null, -- potência escolhida (sugerida pelo catálogo 12V, ou ajustada pelo usuário)
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.plan_power_supplies (plan_id);
create index on public.plan_power_supplies (measurement_id);
alter table public.plan_power_supplies enable row level security;
create policy "staff_all_plan_power_supplies" on public.plan_power_supplies
  for all using (public.wa_is_staff()) with check (public.wa_is_staff());
