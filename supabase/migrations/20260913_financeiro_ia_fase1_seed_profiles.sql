-- Espelha os usuários ativos do Luknos em public.profiles (Luknos Financeiro
-- Inteligente). Mapeamento de papel:
--   admin Letícia Pimentel -> gestora        (dona do projeto, financeiro)
--   admin João             -> socio_gestor   (o outro admin do Luknos)
--   seller                 -> colaborador_venda
--   logistics               -> colaborador_logistica
--   qualquer outro (marketing, tr_fego_pago) -> colaborador (sem acesso especial)
-- Reexecutar é seguro: on conflict atualiza os dados sem duplicar.
insert into public.profiles (id, full_name, email, role, can_approve)
select
  u.id,
  u.name,
  u.email,
  case
    when u.id = '5c1300d8-519b-4157-9584-c71890c91004' then 'gestora'
    when u.id = '2068a35c-f77f-4405-ae95-b39272d2a957' then 'socio_gestor'
    when u.role = 'logistics' then 'colaborador_logistica'
    when u.role = 'seller'    then 'colaborador_venda'
    else 'colaborador'
  end as role,
  case
    when u.id in ('5c1300d8-519b-4157-9584-c71890c91004', '2068a35c-f77f-4405-ae95-b39272d2a957') then true
    else false
  end as can_approve
from public.users u
where u.active = true
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  can_approve = excluded.can_approve,
  updated_at = now();
