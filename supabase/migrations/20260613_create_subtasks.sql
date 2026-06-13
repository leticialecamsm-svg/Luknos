-- Criar tabela de subtarefas
CREATE TABLE IF NOT EXISTS subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX idx_subtasks_position ON subtasks(task_id, position);

-- RLS
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- Política: usuário vê subtarefas das suas próprias tarefas
CREATE POLICY "Users can view subtasks of their tasks"
  ON subtasks FOR SELECT
  USING (
    task_id IN (
      SELECT id FROM tasks WHERE user_id = auth.uid()
    )
  );

-- Política: usuário pode inserir subtarefas nas suas tarefas
CREATE POLICY "Users can insert subtasks on their tasks"
  ON subtasks FOR INSERT
  WITH CHECK (
    task_id IN (
      SELECT id FROM tasks WHERE user_id = auth.uid()
    )
  );

-- Política: usuário pode atualizar subtarefas das suas tarefas
CREATE POLICY "Users can update subtasks of their tasks"
  ON subtasks FOR UPDATE
  USING (
    task_id IN (
      SELECT id FROM tasks WHERE user_id = auth.uid()
    )
  );

-- Política: usuário pode deletar subtarefas das suas tarefas
CREATE POLICY "Users can delete subtasks of their tasks"
  ON subtasks FOR DELETE
  USING (
    task_id IN (
      SELECT id FROM tasks WHERE user_id = auth.uid()
    )
  );
