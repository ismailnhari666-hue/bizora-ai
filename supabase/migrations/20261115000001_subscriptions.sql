-- Subscriptions: 14-day free trial per shop, then paid_until managed by the platform admin.

alter table public.organizations
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '14 days'),
  add column if not exists paid_until timestamptz;

-- Organizations that exist at migration time belong to the founder (test data): keep them active.
update public.organizations set paid_until = '2099-01-01' where paid_until is null;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

insert into public.platform_admins (user_id)
select m.user_id from public.memberships m
join public.organizations o on o.id = m.organization_id
where m.role = 'owner'
order by o.created_at limit 1
on conflict do nothing;

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null check (action in ('extend','suspend','extend_trial')),
  amount integer,
  paid_until timestamptz,
  trial_ends_at timestamptz,
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_org_idx on public.subscription_events (organization_id, created_at desc);
alter table public.subscription_events enable row level security;
revoke all on public.subscription_events from anon, authenticated;

create or replace function bizora_private.org_subscription_ok(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select coalesce(paid_until, 'epoch'::timestamptz) > now() or trial_ends_at > now()
                   from public.organizations where id = p_org), false);
$$;
revoke all on function bizora_private.org_subscription_ok(uuid) from public, anon, authenticated;

create or replace function bizora_private.require_active_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not bizora_private.org_subscription_ok(new.organization_id) then
    raise exception 'SUBSCRIPTION_EXPIRED' using hint = 'The subscription of this shop has expired.';
  end if;
  return new;
end $$;
revoke all on function bizora_private.require_active_subscription() from public, anon, authenticated;

drop trigger if exists sales_require_subscription on public.sales;
create trigger sales_require_subscription before insert on public.sales
for each row execute function bizora_private.require_active_subscription();
drop trigger if exists orders_require_subscription on public.orders;
create trigger orders_require_subscription before insert on public.orders
for each row execute function bizora_private.require_active_subscription();
drop trigger if exists products_require_subscription on public.products;
create trigger products_require_subscription before insert on public.products
for each row execute function bizora_private.require_active_subscription();
drop trigger if exists expenses_require_subscription on public.expenses;
create trigger expenses_require_subscription before insert on public.expenses
for each row execute function bizora_private.require_active_subscription();

-- Platform admin API --------------------------------------------------------------------
create or replace function public.bizora_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.platform_admins where user_id = auth.uid()); $$;
revoke all on function public.bizora_is_platform_admin() from public, anon;
grant execute on function public.bizora_is_platform_admin() to authenticated;

create or replace function public.bizora_admin_list_orgs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.bizora_is_platform_admin() then raise exception 'Permission denied'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'business_type', o.business_type, 'created_at', o.created_at,
      'trial_ends_at', o.trial_ends_at, 'paid_until', o.paid_until,
      'owner_email', (select u.email from public.memberships m join auth.users u on u.id = m.user_id
                      where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1),
      'members', (select count(*) from public.memberships m where m.organization_id = o.id and m.is_active),
      'status', case when coalesce(o.paid_until, 'epoch'::timestamptz) > now() then 'active'
                     when o.trial_ends_at > now() then 'trial' else 'expired' end
    ) order by o.created_at desc) from public.organizations o), '[]'::jsonb);
end $$;
revoke all on function public.bizora_admin_list_orgs() from public, anon;
grant execute on function public.bizora_admin_list_orgs() to authenticated;

create or replace function public.bizora_admin_extend(p_org uuid, p_months integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_until timestamptz;
begin
  if auth.uid() is null or not public.bizora_is_platform_admin() then raise exception 'Permission denied'; end if;
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'Invalid months'; end if;
  update public.organizations
     set paid_until = greatest(coalesce(paid_until, now()), now()) + (p_months || ' months')::interval
   where id = p_org returning paid_until into v_until;
  if v_until is null then raise exception 'Organization not found'; end if;
  insert into public.subscription_events (organization_id, actor_id, action, amount, paid_until, note)
  values (p_org, auth.uid(), 'extend', p_months, v_until, nullif(trim(coalesce(p_note, '')), ''));
  return jsonb_build_object('paid_until', v_until);
end $$;
revoke all on function public.bizora_admin_extend(uuid, integer, text) from public, anon;
grant execute on function public.bizora_admin_extend(uuid, integer, text) to authenticated;

create or replace function public.bizora_admin_extend_trial(p_org uuid, p_days integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_until timestamptz;
begin
  if auth.uid() is null or not public.bizora_is_platform_admin() then raise exception 'Permission denied'; end if;
  if p_days is null or p_days < 1 or p_days > 60 then raise exception 'Invalid days'; end if;
  update public.organizations
     set trial_ends_at = greatest(trial_ends_at, now()) + (p_days || ' days')::interval
   where id = p_org returning trial_ends_at into v_until;
  if v_until is null then raise exception 'Organization not found'; end if;
  insert into public.subscription_events (organization_id, actor_id, action, amount, trial_ends_at, note)
  values (p_org, auth.uid(), 'extend_trial', p_days, v_until, nullif(trim(coalesce(p_note, '')), ''));
  return jsonb_build_object('trial_ends_at', v_until);
end $$;
revoke all on function public.bizora_admin_extend_trial(uuid, integer, text) from public, anon;
grant execute on function public.bizora_admin_extend_trial(uuid, integer, text) to authenticated;

create or replace function public.bizora_admin_suspend(p_org uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.bizora_is_platform_admin() then raise exception 'Permission denied'; end if;
  update public.organizations set paid_until = now(), trial_ends_at = now() where id = p_org;
  if not found then raise exception 'Organization not found'; end if;
  insert into public.subscription_events (organization_id, actor_id, action, paid_until, trial_ends_at, note)
  values (p_org, auth.uid(), 'suspend', now(), now(), nullif(trim(coalesce(p_note, '')), ''));
  return jsonb_build_object('suspended', true);
end $$;
revoke all on function public.bizora_admin_suspend(uuid, text) from public, anon;
grant execute on function public.bizora_admin_suspend(uuid, text) to authenticated;
