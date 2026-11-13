-- Per-organization on/off switches for the owner's modules. A missing key means "enabled".
alter table public.organizations
  add column if not exists enabled_modules jsonb not null default '{}'::jsonb;

create or replace function public.bizora_set_module(p_org uuid, p_key text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_key not in ('products','sales','orders','reports','finance','users') then
    raise exception 'invalid module';
  end if;
  if p_enabled is null then
    raise exception 'invalid value';
  end if;
  if auth.uid() is null or not bizora_private.has_role(p_org, array['owner'::public.bizora_role]) then
    raise exception 'not allowed';
  end if;
  update public.organizations
  set enabled_modules = coalesce(enabled_modules, '{}'::jsonb) || jsonb_build_object(p_key, p_enabled)
  where id = p_org
  returning enabled_modules into v_result;
  return v_result;
end $$;

revoke all on function public.bizora_set_module(uuid, text, boolean) from public, anon;
grant execute on function public.bizora_set_module(uuid, text, boolean) to authenticated;
