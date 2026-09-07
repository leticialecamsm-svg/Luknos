-- Leitura de Projeto — quando um perfil é marcado, o sistema já cria
-- automaticamente uma fita com a mesma metragem (todo perfil tem fita, nem
-- toda fita tem perfil). Esse campo guarda o vínculo entre os dois.
alter table public.plan_measurements
  add column if not exists linked_measurement_id uuid references public.plan_measurements(id) on delete set null;
