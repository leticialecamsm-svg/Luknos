-- Fix contact_type enum: add plasterer (gesseiro) if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'contact_type'::regtype
      AND enumlabel = 'plasterer'
  ) THEN
    ALTER TYPE contact_type ADD VALUE 'plasterer';
  END IF;
END
$$;

-- Add new_prospection toggle and metadata fields
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS new_prospection BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prospection_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for prospection queries per user
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_prospection ON contacts(new_prospection, prospection_date);
