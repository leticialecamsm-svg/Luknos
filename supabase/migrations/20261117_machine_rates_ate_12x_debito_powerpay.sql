delete from payment_machine_rates where installments > 12;
insert into payment_machine_rates (machine, brand, kind, installments, fee_pct) values
('powerpay','visa_master','debit',1,0.79),('powerpay','elo','debit',1,0.79)
on conflict (machine, brand, kind, installments) do update set fee_pct = excluded.fee_pct, updated_at = now();
