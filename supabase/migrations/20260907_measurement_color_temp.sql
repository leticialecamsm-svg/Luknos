-- Leitura de Projeto — tonalidade de cor da fita de LED (2700K/3000K/4000K/6500K).
alter table public.plan_measurements
  add column if not exists color_temp_k numeric;
