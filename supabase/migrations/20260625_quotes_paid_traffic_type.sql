ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS paid_traffic_type VARCHAR(20)
    CHECK (paid_traffic_type IN ('final_client', 'new_partner'));
