-- Leitura de Projeto — lâmpada embutida no item de legenda (spot que já vem
-- com a lâmpada especificada, com seu próprio nome/temperatura/ângulo,
-- separado da temperatura geral do corpo da luminária).
alter table public.plan_legend_items
  add column if not exists has_lamp boolean not null default false,
  add column if not exists lamp_name text,
  add column if not exists lamp_color_temp_k numeric,
  add column if not exists lamp_angle_deg numeric;
