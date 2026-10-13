-- Conclusão do orçamento (data em que status virou "done") e endereço de
-- entrega para a Separação (quando delivery_type = 'delivery').

alter table quotes      add column if not exists completed_at timestamptz;
alter table shipments   add column if not exists address      text;
