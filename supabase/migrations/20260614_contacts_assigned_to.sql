-- Add assigned_to (responsible user) to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);
