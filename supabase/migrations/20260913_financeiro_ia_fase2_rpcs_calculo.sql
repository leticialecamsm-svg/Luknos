-- Fase 2, itens 8 e 9: RPCs de cálculo (painel de caixa do dia, projeção
-- semanal/mensal, DRE, breakdown por categoria) que alimentam as telas
-- '/', '/fluxo-semanal', '/visao-mensal' e '/dre'. Ver docs/FUNCTIONS.md.
--
-- transaction_cash_events() é um helper [EXTENSÃO] que unifica lançamentos
-- sem parcela (due_date/amount da própria transaction) com parcelas de
-- lançamentos parcelados (due_date/amount de cada transaction_installments) --
-- sem isso, um lançamento em 3x contaria o valor total na data da 1ª parcela
-- em vez de cada parcela na sua própria data.

create or replace function public.transaction_cash_events()
returns table (
  transaction_id uuid,
  direction text,
  description text,
  amount numeric,
  due_date date,
  status text,
  is_complete boolean,
  category_id uuid,
  supplier_id uuid,
  cost_center_id uuid,
  bank_account_id uuid
)
language sql
stable
as $$
  select t.id, t.direction, t.description, t.amount, t.due_date, t.status, t.is_complete,
         t.category_id, t.supplier_id, t.cost_center_id, t.bank_account_id
  from public.transactions t
  where not exists (select 1 from public.transaction_installments i where i.transaction_id = t.id)
  union all
  select t.id, t.direction, t.description, i.amount, i.due_date, i.status, t.is_complete,
         t.category_id, t.supplier_id, t.cost_center_id, t.bank_account_id
  from public.transaction_installments i
  join public.transactions t on t.id = i.transaction_id;
$$;

revoke execute on function public.transaction_cash_events() from public;
grant execute on function public.transaction_cash_events() to authenticated;

create or replace function public.get_daily_cash_panel(target_date date default current_date)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_consolidated numeric;
  v_due numeric;
  v_receivable numeric;
  v_items json;
begin
  select coalesce(sum(current_balance), 0) into v_consolidated from public.bank_accounts;

  select coalesce(sum(amount), 0) into v_due
  from public.transaction_cash_events()
  where direction = 'a_pagar' and due_date = target_date and status <> 'pago';

  select coalesce(sum(amount), 0) into v_receivable
  from public.transaction_cash_events()
  where direction = 'a_receber' and due_date = target_date and status <> 'pago';

  select coalesce(json_agg(json_build_object(
    'transaction_id', e.transaction_id,
    'direction', e.direction,
    'description', e.description,
    'amount', e.amount,
    'status', e.status,
    'category', c.name,
    'supplier', s.name,
    'cost_center', cc.name,
    'bank_account', ba.name
  ) order by e.direction, e.description), '[]'::json) into v_items
  from public.transaction_cash_events() e
  left join public.categories c on c.id = e.category_id
  left join public.suppliers s on s.id = e.supplier_id
  left join public.cost_centers cc on cc.id = e.cost_center_id
  left join public.bank_accounts ba on ba.id = e.bank_account_id
  where e.due_date = target_date;

  return json_build_object(
    'consolidated_balance', v_consolidated,
    'total_due_today', v_due,
    'total_receivable_today', v_receivable,
    'remaining', v_consolidated + v_receivable - v_due,
    'items', v_items
  );
end;
$$;

revoke execute on function public.get_daily_cash_panel(date) from public;
grant execute on function public.get_daily_cash_panel(date) to authenticated;

create or replace function public.get_cashflow_projection(start_date date, end_date date)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_opening numeric;
  v_result json;
begin
  select coalesce(sum(current_balance), 0) into v_opening from public.bank_accounts;

  with days as (
    select generate_series(start_date, end_date, interval '1 day')::date as day
  ),
  agg as (
    select
      d.day,
      coalesce(sum(e.amount) filter (where e.direction = 'a_receber' and e.status <> 'pago' and e.is_complete), 0) as expected_in,
      coalesce(sum(e.amount) filter (where e.direction = 'a_pagar' and e.status <> 'pago' and e.is_complete), 0) as expected_out
    from days d
    left join public.transaction_cash_events() e on e.due_date = d.day
    group by d.day
  ),
  running as (
    select
      day,
      expected_in,
      expected_out,
      v_opening + coalesce(sum(expected_in - expected_out) over (order by day rows between unbounded preceding and 1 preceding), 0) as opening_balance,
      v_opening + coalesce(sum(expected_in - expected_out) over (order by day rows between unbounded preceding and current row), 0) as closing_balance
    from agg
  )
  select json_agg(json_build_object(
    'date', day,
    'opening_balance', opening_balance,
    'expected_in', expected_in,
    'expected_out', expected_out,
    'closing_balance', closing_balance
  ) order by day) into v_result
  from running;

  return v_result;
end;
$$;

revoke execute on function public.get_cashflow_projection(date, date) from public;
grant execute on function public.get_cashflow_projection(date, date) to authenticated;

create or replace function public.get_monthly_summary(target_month date)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_start date := date_trunc('month', target_month)::date;
  v_end date := (date_trunc('month', target_month) + interval '1 month - 1 day')::date;
  v_payable numeric;
  v_receivable numeric;
begin
  select coalesce(sum(amount), 0) into v_payable
  from public.transaction_cash_events()
  where direction = 'a_pagar' and is_complete and due_date between v_start and v_end;

  select coalesce(sum(amount), 0) into v_receivable
  from public.transaction_cash_events()
  where direction = 'a_receber' and is_complete and due_date between v_start and v_end;

  return json_build_object(
    'total_payable', v_payable,
    'total_receivable', v_receivable,
    'needed_sales_to_break_even', greatest(v_payable - v_receivable, 0),
    'projected_result', v_receivable - v_payable
  );
end;
$$;

revoke execute on function public.get_monthly_summary(date) from public;
grant execute on function public.get_monthly_summary(date) to authenticated;

create or replace function public.get_dre(start_date date, end_date date, p_cost_center_id uuid default null)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_revenue numeric;
  v_expenses numeric;
  v_by_category json;
  v_by_cost_center json;
begin
  select coalesce(sum(e.amount), 0) into v_revenue
  from public.transaction_cash_events() e
  where e.direction = 'a_receber' and e.is_complete and e.due_date between start_date and end_date
    and (p_cost_center_id is null or e.cost_center_id = p_cost_center_id);

  select coalesce(sum(e.amount), 0) into v_expenses
  from public.transaction_cash_events() e
  where e.direction = 'a_pagar' and e.is_complete and e.due_date between start_date and end_date
    and (p_cost_center_id is null or e.cost_center_id = p_cost_center_id);

  select coalesce(json_agg(json_build_object('category_name', cat, 'total', total) order by total desc), '[]'::json) into v_by_category
  from (
    select coalesce(c.name, 'Sem categoria') as cat, sum(e.amount) as total
    from public.transaction_cash_events() e
    left join public.categories c on c.id = e.category_id
    where e.direction = 'a_pagar' and e.is_complete and e.due_date between start_date and end_date
      and (p_cost_center_id is null or e.cost_center_id = p_cost_center_id)
    group by c.name
  ) t;

  select coalesce(json_agg(json_build_object('cost_center_name', cc, 'total', total) order by total desc), '[]'::json) into v_by_cost_center
  from (
    select coalesce(cc.name, 'Sem centro de custo') as cc, sum(e.amount) as total
    from public.transaction_cash_events() e
    left join public.cost_centers cc on cc.id = e.cost_center_id
    where e.direction = 'a_pagar' and e.is_complete and e.due_date between start_date and end_date
      and (p_cost_center_id is null or e.cost_center_id = p_cost_center_id)
    group by cc.name
  ) t;

  return json_build_object(
    'revenue', v_revenue,
    'expenses_by_category', v_by_category,
    'expenses_by_cost_center', v_by_cost_center,
    'total_expenses', v_expenses,
    'result', v_revenue - v_expenses
  );
end;
$$;

revoke execute on function public.get_dre(date, date, uuid) from public;
grant execute on function public.get_dre(date, date, uuid) to authenticated;

create or replace function public.get_category_breakdown(start_date date, end_date date)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_result json;
begin
  select coalesce(json_agg(json_build_object(
    'category_name', cat,
    'kind', kind,
    'total', total,
    'percentage', case when kind_total = 0 then 0 else round(total / kind_total * 100, 1) end
  ) order by kind, total desc), '[]'::json) into v_result
  from (
    select
      coalesce(c.name, 'Sem categoria') as cat,
      coalesce(c.kind, e.direction) as kind,
      sum(e.amount) as total,
      sum(sum(e.amount)) over (partition by coalesce(c.kind, e.direction)) as kind_total
    from public.transaction_cash_events() e
    left join public.categories c on c.id = e.category_id
    where e.is_complete and e.due_date between start_date and end_date
    group by c.name, coalesce(c.kind, e.direction)
  ) t;

  return v_result;
end;
$$;

revoke execute on function public.get_category_breakdown(date, date) from public;
grant execute on function public.get_category_breakdown(date, date) to authenticated;
