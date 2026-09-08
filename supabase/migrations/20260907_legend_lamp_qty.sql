-- Leitura de Projeto — quantidade de lâmpadas por luminária (spot duplo,
-- triplo etc. levam mais de uma lâmpada cada).
alter table public.plan_legend_items
  add column if not exists lamp_qty integer not null default 1 check (lamp_qty >= 1);
