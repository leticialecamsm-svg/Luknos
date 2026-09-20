-- Linhas ainda sem imposto preenchido (ICMS e FECOEP zerados, ex.: nota recém
-- lançada na planilha) não entram como referência: senão a nota mais recente
-- "vence" e preenche 0%.
create or replace view public.pricing_tax_profiles with (security_invoker = true) as
with base as (
  select
    p.pricing_supplier_id as supplier_id,
    i.ncm,
    upper(coalesce(i.tipo_icms, '')) as tipo,
    coalesce(p.uf_origem, '') as uf,
    p.data_emissao,
    i.valor_icms / i.valor_total as icms,
    i.valor_fecoep / i.valor_total as fecoep,
    i.ipi_percent as ipi,
    dense_rank() over (
      partition by p.pricing_supplier_id, i.ncm, upper(coalesce(i.tipo_icms, '')), coalesce(p.uf_origem, '')
      order by p.data_emissao desc nulls last
    ) as rk
  from public.purchase_invoice_items i
  join public.purchase_invoices p on p.id = i.invoice_id
  where p.pricing_supplier_id is not null and i.valor_total > 0 and i.ncm is not null
    and (i.valor_icms > 0 or i.valor_fecoep > 0)
)
select
  supplier_id, ncm, tipo, uf,
  count(*)::int as n,
  percentile_cont(0.5) within group (order by icms) filter (where rk = 1) as icms_pct,
  percentile_cont(0.5) within group (order by fecoep) filter (where rk = 1) as fecoep_pct,
  percentile_cont(0.5) within group (order by ipi) filter (where rk = 1) as ipi_pct,
  max(data_emissao) as last_date
from base
group by supplier_id, ncm, tipo, uf;
