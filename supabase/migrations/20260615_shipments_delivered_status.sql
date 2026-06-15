-- Add 'delivered' to separation_status enum on shipments
ALTER TABLE shipments
  DROP CONSTRAINT IF EXISTS shipments_separation_status_check;

ALTER TABLE shipments
  ADD CONSTRAINT shipments_separation_status_check
  CHECK (separation_status IN ('queued','in_progress','completed','awaiting_material','delivered'));

-- Add 'logistics' role to users table if it has a check constraint
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','seller','logistics'));
