-- Objetivo: QUALQUER colaborador autenticado pode ler/editar QUALQUER orçamento,
-- negociação e atividade. (O bloqueio era uma política antiga "só o dono".)
-- Remove todas as políticas existentes dessas tabelas e recria uma única permissiva.

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('quotes', 'negotiations', 'activities')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE quotes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_all_auth"        ON quotes        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "negotiations_all_auth"  ON negotiations  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "activities_all_auth"    ON activities    FOR ALL TO authenticated USING (true) WITH CHECK (true);
