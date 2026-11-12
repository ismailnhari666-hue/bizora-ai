-- Business type per organization (restaurant, cafe, clothing, shoes, supermarket, small shop).
-- Additive and idempotent. Report/WhatsApp tables already exist in the live database
-- (migrations 20261104*), so they are intentionally not recreated here.

alter table public.organizations
  add column if not exists business_type text not null default 'restaurant';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_business_type_check'
  ) then
    alter table public.organizations
      add constraint organizations_business_type_check
      check (business_type in ('restaurant','cafe','clothing','shoes','supermarket','small_shop'));
  end if;
end $$;

create or replace function public.bizora_set_business_type(p_org uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_type not in ('restaurant','cafe','clothing','shoes','supermarket','small_shop') then
    raise exception 'invalid business type';
  end if;
  if not bizora_private.has_role(p_org, array['owner'::public.bizora_role, 'manager'::public.bizora_role]) then
    raise exception 'not allowed';
  end if;
  update public.organizations set business_type = p_type where id = p_org;
end $$;

revoke all on function public.bizora_set_business_type(uuid, text) from public, anon;
grant execute on function public.bizora_set_business_type(uuid, text) to authenticated;
