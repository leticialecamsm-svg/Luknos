-- Permite que QUALQUER colaborador autenticado atualize qualquer orçamento e negociação.
-- (Antes a RLS restringia a edição ao dono, bloqueando colegas.)
-- Mantemos o cliente autenticado nas actions para o trigger de atividades ter auth.uid().

-- QUOTES: update liberado para autenticados
DROP POLICY IF EXISTS "quotes_update_collab" ON quotes;
CREATE POLICY "quotes_update_collab" ON quotes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- NEGOTIATIONS: insert/update/select liberados para autenticados
DROP POLICY IF EXISTS "negotiations_write_collab" ON negotiations;
CREATE POLICY "negotiations_write_collab" ON negotiations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
