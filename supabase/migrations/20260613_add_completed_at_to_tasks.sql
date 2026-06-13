-- Add completed_at column to tasks table
ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for filtering and ordering by completed_at
CREATE INDEX idx_tasks_completed_at ON tasks(completed_at DESC);
