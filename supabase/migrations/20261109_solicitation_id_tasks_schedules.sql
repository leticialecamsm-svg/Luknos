-- Vincula tarefas e agendamentos a solicitações
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS solicitation_id UUID REFERENCES solicitations(id) ON DELETE SET NULL;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS solicitation_id UUID REFERENCES solicitations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_solicitation_id ON tasks(solicitation_id);
CREATE INDEX IF NOT EXISTS idx_schedules_solicitation_id ON schedules(solicitation_id);
