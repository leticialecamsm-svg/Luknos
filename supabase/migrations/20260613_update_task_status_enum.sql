-- Update task status from 'pending' to 'paused'

-- First, replace any existing 'pending' values with 'paused'
UPDATE tasks SET status = 'paused' WHERE status = 'pending';

-- If the column uses an enum type, we need to handle it differently
-- This migration handles both ENUM and VARCHAR WITH CHECK scenarios

DO $$
DECLARE
  col_type text;
BEGIN
  -- Get the column type
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'tasks' AND column_name = 'status';

  -- If it's an enum, create new enum and migrate
  IF col_type = 'USER-DEFINED' THEN
    -- Create new enum type with 'paused' instead of 'pending'
    CREATE TYPE task_status_new AS ENUM ('todo', 'doing', 'paused', 'done');

    -- Change the column type
    ALTER TABLE tasks ALTER COLUMN status TYPE task_status_new USING status::text::task_status_new;

    -- Drop the old enum type
    DROP TYPE IF EXISTS task_status CASCADE;

    -- Rename the new type to the original name
    ALTER TYPE task_status_new RENAME TO task_status;
  END IF;
END $$;
