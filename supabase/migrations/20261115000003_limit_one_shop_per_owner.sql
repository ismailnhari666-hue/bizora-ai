create or replace function public.bizora_create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Organization name must contain at least 2 characters';
  end if;
  -- One free trial per owner: extra shops are created by the platform admin.
  if not exists (select 1 from public.platform_admins where user_id = v_user)
     and exists (select 1 from public.memberships where user_id = v_user and role = 'owner') then
    raise exception 'ORG_LIMIT' using hint = 'Each owner can create one shop.';
  end if;

  insert into public.organizations(name, created_by)
  values (trim(p_name), v_user)
  returning id into v_org;

  insert into public.memberships(organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  return v_org;
end;
$function$;
