-- Leitura de Projeto — tipo de instalação do produto de legenda (embutir/
-- sobrepor, igual já existe pro perfil) e ponto de instalação do perfil/fita
-- (subdivisão dentro do ambiente: sanca, marcenaria, cortineiro...).
alter table public.plan_legend_items
  add column if not exists mount_type text check (mount_type in ('embutir', 'sobrepor'));

alter table public.plan_measurements
  add column if not exists installation_location text;
