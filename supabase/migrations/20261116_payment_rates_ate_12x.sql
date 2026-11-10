insert into payment_method_rates (method_key, label, machine_fee_pct, max_discount_pct, sort_order) values
('credit_7x','7x',6.06,0,10),('credit_8x','8x',6.74,0,11),('credit_9x','9x',7.43,0,12),
('credit_10x','10x',8.11,0,13),('credit_11x','11x',8.80,0,14),('credit_12x','12x',9.48,0,15)
on conflict (method_key) do nothing;
