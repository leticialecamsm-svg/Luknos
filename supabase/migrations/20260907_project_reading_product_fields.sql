-- Leitura de Projeto — campos de produto por medição: modelo do perfil/fita
-- (reaproveitado por autocomplete entre medições do mesmo plano, sem
-- catálogo separado), tipo de instalação do perfil (embutir/sobrepor),
-- tamanho da barra comercial do perfil (2m ou 3m — mistura de tamanhos fica
-- pra uma versão futura), tensão da fita (12V/24V) e embalagem (rolo de 5m
-- ou vendida no metro).
alter table public.plan_measurements
  add column if not exists product_model text,
  add column if not exists mount_type text check (mount_type in ('embutir', 'sobrepor')),
  add column if not exists bar_size numeric check (bar_size in (2, 3)),
  add column if not exists voltage text check (voltage in ('12V', '24V')),
  add column if not exists packaging text check (packaging in ('rolo_5m', 'metro'));
