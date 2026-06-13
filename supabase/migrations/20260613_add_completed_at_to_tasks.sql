-- Add completed_at column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill: tarefas já concluídas recebem completed_at baseado em updated_at
UPDATE tasks
SET completed_at = COALESCE(updated_at, created_at)
WHERE status = 'done' AND completed_at IS NULL;

-- Add index for filtering and ordering by completed_at
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at DESC);
