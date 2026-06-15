-- Add all missing values to contact_type enum
DO $$
DECLARE
  missing text[] := ARRAY['architect','engineer','designer','electrician','plasterer','carpenter','client','other'];
  v text;
BEGIN
  FOREACH v IN ARRAY missing LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'contact_type'::regtype AND enumlabel = v
    ) THEN
      EXECUTE format('ALTER TYPE contact_type ADD VALUE %L', v);
    END IF;
  END LOOP;
END
$$;
