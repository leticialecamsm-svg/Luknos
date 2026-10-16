-- Lote 1 da feature "Solicitações" — ajustes pedidos pela Letícia depois de
-- revisar a Solicitação #558 no preview. Tudo aditivo, nenhuma migration já
-- aplicada é tocada.

-- ── Bug #6: "previsão de entrega informada ao cliente" em Compra de material ──
alter table purchase_checklist_items add column if not exists expected_delivery_date date;

-- ── Bug #3: handle_quote_done não propagava solicitation_id p/ negotiations novas ──
-- handle_quote_done já existe no banco (fora das migrations deste repo,
-- confirmado via advisor scan + pg_get_functiondef) e insere a linha de
-- negotiations só com quote_id quando um orçamento vira "done". Como
-- quotes.solicitation_id já existe (20260929_solicitations_core.sql), toda
-- negociação criada automaticamente a partir daqui em diante deve nascer já
-- linkada à Solicitação do orçamento — o backfill (20260930) só corrigiu o
-- histórico, não esse fluxo pra frente. CREATE OR REPLACE mantém 100% do
-- comportamento anterior (insert on conflict do nothing) e só acrescenta o
-- solicitation_id no insert, com um update de reforço caso a linha já
-- exista (ex.: upsert de updateTemperature chegou primeiro) e ainda esteja
-- sem solicitation_id.
create or replace function public.handle_quote_done()
returns trigger
language plpgsql
security definer
as $function$
begin
  if new.status = 'done' and old.status != 'done' then
    insert into public.negotiations (quote_id, solicitation_id)
    values (new.id, new.solicitation_id)
    on conflict (quote_id) do update
      set solicitation_id = coalesce(public.negotiations.solicitation_id, excluded.solicitation_id);
  end if;
  return new;
end;
$function$;
