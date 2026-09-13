-- Seed do tema viver-de-ia: ja ativo desde a Fase 1 porque os tokens
-- alimentam o shell/loader imediatamente; a "virada" formal para as telas
-- de negocio via feature_flags/publish-theme fica para a Fase 3.
insert into themes (slug, display_name, is_active, version, primary_color, accent_color)
values ('viver-de-ia', 'Viver de IA', true, '1.0.0', '#111827', '#cba455')
on conflict (slug) do nothing;

insert into design_tokens (theme_id, token_key, token_category, token_value, description)
select t.id, v.token_key, v.token_category, v.token_value, v.description
from themes t
cross join (values
  ('color.background.base', 'color', '#111827', 'Fundo base escuro'),
  ('color.background.surface', 'color', '#1f2937', 'Fundo de cards/superficies'),
  ('color.accent.gold', 'color', '#cba455', 'Dourado de marca (acao/destaque)'),
  ('color.accent.gold.hover', 'color', '#b8934a', 'Dourado hover/pressed'),
  ('color.text.primary', 'color', '#f9fafb', 'Texto principal sobre fundo escuro'),
  ('color.text.muted', 'color', '#9ca3af', 'Texto secundario'),
  ('color.border.subtle', 'color', '#374151', 'Bordas e divisores'),
  ('color.feedback.success', 'color', '#22c55e', 'Estados de sucesso'),
  ('color.feedback.error', 'color', '#ef4444', 'Estados de erro'),
  ('color.feedback.warning', 'color', '#f59e0b', 'Estados de alerta'),
  ('font.family.base', 'typography', 'Inter', 'Fonte base do sistema'),
  ('font.size.base', 'typography', '0.875rem', 'Tamanho de texto padrao'),
  ('font.weight.bold', 'typography', '700', 'Peso para titulos/destaques'),
  ('spacing.unit', 'spacing', '0.25rem', 'Unidade base de espacamento'),
  ('radius.base', 'radius', '0.75rem', 'Raio padrao de cards/botoes/inputs'),
  ('shadow.card', 'shadow', '0 1px 3px rgba(0,0,0,0.4)', 'Sombra padrao de card sobre fundo escuro')
) as v(token_key, token_category, token_value, description)
where t.slug = 'viver-de-ia'
on conflict (theme_id, token_key) do nothing;

insert into component_specs (theme_id, component_key, component_group, spec_json, is_external_embed)
select t.id, v.component_key, v.component_group, v.spec_json::jsonb, v.is_external_embed
from themes t
cross join (values
  ('loader.page', 'overlay', '{"background":"color.background.base","accent":"color.accent.gold"}', false)
) as v(component_key, component_group, spec_json, is_external_embed)
where t.slug = 'viver-de-ia'
on conflict (theme_id, component_key) do nothing;

insert into feature_flags (flag_key, is_enabled)
values ('theme.viver-de-ia.enabled', false)
on conflict (flag_key) do nothing;

insert into screen_registry (screen_slug, module_name, route_path, has_external_embed)
values
  ('loader', 'Loader', '/loader', false),
  ('quotes', 'Vendas/Orcamentos', '/quotes', false),
  ('negotiations', 'Negociacoes', '/negotiations', false),
  ('purchases', 'Compras', '/purchases', false),
  ('finance', 'Financeiro legado', '/finance', true),
  ('financeiro-ia', 'Financeiro Inteligente', '/financeiro-ia', true),
  ('shipping', 'Logistica/Expedicao', '/shipping', false),
  ('partners', 'Parceiros e comissoes', '/partners', false),
  ('hr', 'RH', '/hr', false),
  ('bot-whatsapp', 'Robo WhatsApp', '/bot-collaborators', true),
  ('marketing', 'Marketing/Editorial', '/marketing', false),
  ('schedules', 'Agenda', '/schedules', false),
  ('tasks', 'Tarefas', '/dashboard/tasks', false),
  ('site-leads', 'Site/Leads', '/site-leads', false),
  ('reports', 'Relatorios', '/reports', true),
  ('admin-users', 'Admin de usuarios', '/admin/users', false),
  ('admin-goals', 'Admin de metas', '/admin/goals', false)
on conflict (screen_slug) do nothing;

insert into redesign_progress (screen_id, theme_id, status)
select s.id, t.id, case when s.screen_slug = 'loader' then 'done' else 'pending' end
from screen_registry s
cross join themes t
where t.slug = 'viver-de-ia'
on conflict (screen_id, theme_id) do nothing;
