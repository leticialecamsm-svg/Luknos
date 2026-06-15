-- Add commission_rate to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 0;

-- Commissions table (one per closed sale that has a partner with commission_rate > 0)
CREATE TABLE IF NOT EXISTS commissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  quote_id      UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quote_value   DECIMAL(12,2) NOT NULL,   -- final_value at time of closing
  rate          DECIMAL(5,2) NOT NULL,    -- commission_rate snapshot
  amount        DECIMAL(12,2) NOT NULL,   -- quote_value * rate / 100
  due_date      DATE NOT NULL,            -- closed_at + 30 days
  status        VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','paid','overdue')),
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quote_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_contact  ON commissions(contact_id);
CREATE INDEX IF NOT EXISTS idx_commissions_due_date ON commissions(due_date);
CREATE INDEX IF NOT EXISTS idx_commissions_status   ON commissions(status);
