-- Update task status enum from 'pending' to 'paused'

-- First, create new enum type with 'paused' instead of 'pending'
CREATE TYPE task_status_new AS ENUM ('todo', 'doing', 'paused', 'done');

-- Update any existing 'pending' values to 'paused'
UPDATE tasks SET status = 'paused'::text WHERE status = 'pending';

-- Change the column type
ALTER TABLE tasks ALTER COLUMN status TYPE task_status_new USING status::text::task_status_new;

-- Drop the old enum type
DROP TYPE IF EXISTS task_status CASCADE;

-- Rename the new type to the original name
ALTER TYPE task_status_new RENAME TO task_status;
