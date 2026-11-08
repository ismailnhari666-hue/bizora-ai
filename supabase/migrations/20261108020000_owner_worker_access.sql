-- Bizora Digital: owner access codes and worker/admin data separation.
create table if not exists public.owner_access_codes (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  updated_at timestamptz not null default now()
);
alter table public.owner_access_codes enable row level security;
revoke all on table public.owner_access_codes from anon, authenticated;
grant all on table public.owner_access_codes to service_role;

create table if not exists public.owner_code_login_limits (
  ip_hash text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);
alter table public.owner_code_login_limits enable row level security;
revoke all on table public.owner_code_login_limits from anon, authenticated;
grant all on table public.owner_code_login_limits to service_role;

create or replace function public.bizora_owner_code_rate_limit(p_ip_hash text, p_success boolean default null)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  v_attempts integer;
  v_blocked_until timestamptz;
begin
  if p_ip_hash is null or length(p_ip_hash) < 32 then return false; end if;
  if p_success is null then
    select blocked_until into v_blocked_until from public.owner_code_login_limits where ip_hash = p_ip_hash;
    return not found or v_blocked_until is null or v_blocked_until <= now();
  end if;
  if p_success then
    delete from public.owner_code_login_limits where ip_hash = p_ip_hash;
    return true;
  end if;
  insert into public.owner_code_login_limits(ip_hash, attempts, window_started_at)
  values (p_ip_hash, 1, now())
  on conflict (ip_hash) do update
  set attempts = case when public.owner_code_login_limits.window_started_at <= now() - interval '15 minutes'
                      then 1 else public.owner_code_login_limits.attempts + 1 end,
      window_started_at = case when public.owner_code_login_limits.window_started_at <= now() - interval '15 minutes'
                               then now() else public.owner_code_login_limits.window_started_at end,
      blocked_until = case when public.owner_code_login_limits.window_started_at <= now() - interval '15 minutes'
                           then null else public.owner_code_login_limits.blocked_until end
  returning attempts, blocked_until into v_attempts, v_blocked_until;
  if v_attempts >= 5 then
    update public.owner_code_login_limits set blocked_until = now() + interval '15 minutes' where ip_hash = p_ip_hash;
    return false;
  end if;
  return v_blocked_until is null or v_blocked_until <= now();
end;
$function$;
revoke all on function public.bizora_owner_code_rate_limit(text, boolean) from public, anon, authenticated;
grant execute on function public.bizora_owner_code_rate_limit(text, boolean) to service_role;

drop policy if exists cameras_select_member on public.cameras;
create policy cameras_select_manager on public.cameras for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists camera_events_select_member on public.camera_events;
create policy camera_events_select_manager on public.camera_events for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists camera_feature_settings_select_member on public.camera_feature_settings;
create policy camera_feature_settings_select_manager on public.camera_feature_settings for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists camera_table_zones_select_member on public.camera_table_zones;
create policy camera_table_zones_select_manager on public.camera_table_zones for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists membership_select_org on public.memberships;
create policy membership_select_self_or_manager on public.memberships for select to authenticated
using (user_id = (select auth.uid()) or bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists sales_select_member on public.sales;
create policy sales_select_manager on public.sales for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists sale_items_select_member on public.sale_items;
create policy sale_items_select_manager on public.sale_items for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists stock_select_manager on public.stock_movements;
create policy stock_select_manager on public.stock_movements for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists daily_report_settings_select_member on public.daily_report_settings;
create policy daily_report_settings_select_manager on public.daily_report_settings for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));

drop policy if exists branches_select_member on public.branches;
create policy branches_select_manager on public.branches for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));
