-- Fase 2: RPCs de acompanhamento do redesign (fn_set_screen_status,
-- fn_redesign_summary), usadas pelo /theme-admin/progress mais adiante.
create or replace function public.fn_set_screen_status(p_screen_slug text, p_new_status text)
returns public.redesign_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_screen_id uuid;
  v_theme_id uuid;
  v_row public.redesign_progress;
begin
  if not public.is_redesign_admin() then
    raise exception 'forbidden';
  end if;
  if p_new_status not in ('pending', 'in_progress', 'done', 'reviewed') then
    raise exception 'invalid_status: %', p_new_status;
  end if;

  select id into v_screen_id from public.screen_registry where screen_slug = p_screen_slug;
  if v_screen_id is null then
    raise exception 'screen_not_found: %', p_screen_slug;
  end if;

  select id into v_theme_id from public.themes where is_active = true order by created_at desc limit 1;
  if v_theme_id is null then
    raise exception 'no_active_theme';
  end if;

  update public.redesign_progress
  set status = p_new_status,
      reviewed_by = case when p_new_status = 'reviewed' then auth.uid() else reviewed_by end
  where screen_id = v_screen_id and theme_id = v_theme_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.fn_set_screen_status(text, text) from public;
grant execute on function public.fn_set_screen_status(text, text) to authenticated;

create or replace function public.fn_redesign_summary()
returns table (status text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select rp.status, count(*)
  from public.redesign_progress rp
  join public.themes t on t.id = rp.theme_id
  where t.is_active = true
  group by rp.status;
$$;

revoke execute on function public.fn_redesign_summary() from public;
grant execute on function public.fn_redesign_summary() to authenticated;
