-- ── Módulo de Marketing ────────────────────────────────────────────────────────

-- 1. Adiciona o papel 'marketing' ao enum user_role
-- (rodar isoladamente — ALTER TYPE ADD VALUE não pode estar na mesma transação que o uso)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'marketing';

-- 2. Linhas editoriais (autocomplete com criação)
CREATE TABLE IF NOT EXISTS marketing_editorial_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Postagens
CREATE TABLE IF NOT EXISTS marketing_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('story','reels','carousel')),
  post_date DATE,
  editorial_line_id UUID REFERENCES marketing_editorial_lines(id) ON DELETE SET NULL,
  roteiro_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','posted')),
  capture_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_posts_post_date ON marketing_posts(post_date);
CREATE INDEX IF NOT EXISTS idx_marketing_posts_status ON marketing_posts(status);

-- 4. Participantes (colaboradores do sistema) — N:N
CREATE TABLE IF NOT EXISTS marketing_post_participants (
  post_id UUID NOT NULL REFERENCES marketing_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

-- 5. RLS — admin e marketing podem ler/escrever
ALTER TABLE marketing_editorial_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_post_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mkt_lines_all ON marketing_editorial_lines;
CREATE POLICY mkt_lines_all ON marketing_editorial_lines FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','marketing'))
);

DROP POLICY IF EXISTS mkt_posts_all ON marketing_posts;
CREATE POLICY mkt_posts_all ON marketing_posts FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','marketing'))
);

DROP POLICY IF EXISTS mkt_participants_all ON marketing_post_participants;
CREATE POLICY mkt_participants_all ON marketing_post_participants FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','marketing'))
);
