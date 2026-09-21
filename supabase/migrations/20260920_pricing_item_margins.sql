-- Margens por item (a planilha tem maquininha, comissão e lucro em cada linha).
alter table public.purchase_invoice_items
  add column if not exists maquininha numeric(6,4),
  add column if not exists comissao numeric(6,4),
  add column if not exists lucro numeric(6,4);

update public.purchase_invoice_items i
   set maquininha = v.maquininha, comissao = v.comissao, lucro = v.lucro
  from public.purchase_invoices v
 where v.id = i.invoice_id and i.maquininha is null;
