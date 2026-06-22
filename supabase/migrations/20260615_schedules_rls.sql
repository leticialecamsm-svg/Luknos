-- Políticas RLS para schedules (leitura estava bloqueada: INSERT passava mas SELECT não)
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules_select_auth" ON schedules;
CREATE POLICY "schedules_select_auth" ON schedules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "schedules_insert_auth" ON schedules;
CREATE POLICY "schedules_insert_auth" ON schedules
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "schedules_update_auth" ON schedules;
CREATE POLICY "schedules_update_auth" ON schedules
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "schedules_delete_auth" ON schedules;
CREATE POLICY "schedules_delete_auth" ON schedules
  FOR DELETE TO authenticated USING (true);
