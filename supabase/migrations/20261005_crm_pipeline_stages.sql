-- CRM: etapas de venda (colunas do Kanban) + etapa de cada conversa.
-- Aditiva: conversas existentes ficam com stage_id NULL e aparecem na
-- primeira coluna (menor position) até serem movidas.

create table if not exists public.crm_stages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- nome único sem diferenciar maiúscula/minúscula nem espaços nas pontas
create unique index if not exists crm_stages_name_uniq on public.crm_stages (lower(btrim(name)));

alter table public.crm_conversations
  add column if not exists stage_id uuid references public.crm_stages(id) on delete set null;
create index if not exists crm_conversations_stage_idx on public.crm_conversations (stage_id);

alter table public.crm_stages enable row level security;
create policy crm_stages_select on public.crm_stages for select using (wa_is_staff());
create policy crm_stages_insert on public.crm_stages for insert with check (wa_is_admin());
create policy crm_stages_update on public.crm_stages for update using (wa_is_admin());
create policy crm_stages_delete on public.crm_stages for delete using (wa_is_admin());

drop trigger if exists trg_crm_stages_updated_at on public.crm_stages;
create trigger trg_crm_stages_updated_at before update on public.crm_stages
  for each row execute function public.wa_set_updated_at();

insert into public.crm_stages (name, color, position)
select * from (values
  ('Novo contato',      '#3b82f6', 0),
  ('Em conversa',       '#8b5cf6', 1),
  ('Orçamento enviado', '#f59e0b', 2),
  ('Negociação',        '#06b6d4', 3),
  ('Fechado',           '#22c55e', 4),
  ('Perdido',           '#ef4444', 5)
) v(name, color, position)
where not exists (select 1 from public.crm_stages);
