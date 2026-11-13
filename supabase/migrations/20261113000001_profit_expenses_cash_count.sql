-- Net profit, expenses, cash count, and automatic sale creation when an order is completed.

-- 1) Cost snapshot on every sale line ------------------------------------------------
alter table public.sale_items add column if not exists unit_cost numeric(12,2);

create or replace function bizora_private.set_sale_item_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_cost is null and new.product_id is not null then
    select p.cost_price into new.unit_cost
    from public.products p
    where p.id = new.product_id and p.organization_id = new.organization_id;
  end if;
  return new;
end $$;

drop trigger if exists sale_items_set_cost on public.sale_items;
create trigger sale_items_set_cost
before insert on public.sale_items
for each row execute function bizora_private.set_sale_item_cost();

update public.sale_items si
set unit_cost = p.cost_price
from public.products p
where si.unit_cost is null and si.product_id = p.id and si.organization_id = p.organization_id;

-- 2) Expenses (owner only) ---------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  spent_on date not null default current_date,
  category text not null default 'other'
    check (category in ('rent','utilities','salaries','transport','marketing','supplies','other')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  note text check (note is null or length(note) <= 200),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists expenses_org_date_idx on public.expenses (organization_id, spent_on desc);
alter table public.expenses enable row level security;

drop policy if exists expenses_owner_all on public.expenses;
create policy expenses_owner_all on public.expenses for all to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]))
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

-- 3) Orders become sales when completed -------------------------------------------
alter table public.orders add column if not exists sale_id uuid references public.sales(id);
alter table public.orders add column if not exists payment_method text not null default 'cash'
  check (payment_method in ('cash','card','transfer','other'));

create or replace function bizora_private.order_completed_to_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale uuid;
  v_subtotal numeric(12,2);
  v_item record;
  v_before numeric;
  v_take numeric;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.sale_id is not null then
    return new;
  end if;

  select coalesce(sum(line_total), 0) into v_subtotal
  from public.order_items where order_id = new.id;
  if v_subtotal <= 0 then
    return new;
  end if;

  insert into public.sales (organization_id, branch_id, created_by, subtotal, total, payment_method, note)
  values (new.organization_id, new.branch_id, new.created_by, v_subtotal, v_subtotal, new.payment_method,
          'Order ' || new.id::text)
  returning id into v_sale;

  for v_item in select * from public.order_items where order_id = new.id
  loop
    insert into public.sale_items (organization_id, sale_id, product_id, product_name, quantity, unit_price, line_total)
    values (new.organization_id, v_sale, v_item.product_id, v_item.product_name,
            v_item.quantity, v_item.unit_price, v_item.line_total);

    if v_item.product_id is not null then
      select stock_quantity into v_before
      from public.products
      where id = v_item.product_id and organization_id = new.organization_id
      for update;
      if found then
        -- The goods are already served: never block the order, just floor the stock at zero.
        v_take := least(coalesce(v_before, 0), v_item.quantity);
        if v_take > 0 then
          update public.products set stock_quantity = stock_quantity - v_take
          where id = v_item.product_id and organization_id = new.organization_id;
          insert into public.stock_movements (organization_id, product_id, created_by, movement_type,
                                              quantity_change, quantity_after, reason, reference_id)
          values (new.organization_id, v_item.product_id, new.created_by, 'sale',
                  -v_take, v_before - v_take, 'Order ' || new.id::text, v_sale);
        end if;
      end if;
    end if;
  end loop;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (new.organization_id, coalesce(auth.uid(), new.created_by), 'sale.created', 'sale', v_sale);

  update public.orders set sale_id = v_sale where id = new.id;
  return new;
end $$;

drop trigger if exists orders_completed_to_sale on public.orders;
create trigger orders_completed_to_sale
after update of status on public.orders
for each row execute function bizora_private.order_completed_to_sale();

-- 4) Cash count --------------------------------------------------------------------
create table if not exists public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  counted_by uuid not null references auth.users(id),
  counted_by_email text,
  period_start timestamptz not null,
  expected_cash numeric(12,2) not null,
  counted_cash numeric(12,2) not null check (counted_cash >= 0),
  difference numeric(12,2) not null,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists cash_counts_org_idx on public.cash_counts (organization_id, created_at desc);
alter table public.cash_counts enable row level security;

drop policy if exists cash_counts_owner_select on public.cash_counts;
create policy cash_counts_owner_select on public.cash_counts for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));
-- No insert/update policy on purpose: rows are written only by bizora_submit_cash_count.

create or replace function public.bizora_submit_cash_count(p_org uuid, p_counted numeric, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_day_start timestamptz;
  v_last timestamptz;
  v_from timestamptz;
  v_expected numeric(12,2);
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not bizora_private.has_role(p_org, array['owner'::public.bizora_role, 'manager'::public.bizora_role,
                                              'cashier'::public.bizora_role, 'staff'::public.bizora_role]) then
    raise exception 'Permission denied';
  end if;
  if p_counted is null or p_counted < 0 or p_counted > 10000000 then raise exception 'Invalid amount'; end if;

  select timezone into v_tz from public.organizations where id = p_org;
  v_day_start := date_trunc('day', now() at time zone coalesce(v_tz, 'Africa/Casablanca'))
                 at time zone coalesce(v_tz, 'Africa/Casablanca');

  select max(created_at) into v_last from public.cash_counts
  where organization_id = p_org and counted_by = auth.uid() and created_at >= v_day_start;
  v_from := coalesce(v_last, v_day_start);

  select coalesce(sum(total), 0) into v_expected from public.sales
  where organization_id = p_org and created_by = auth.uid()
    and status = 'completed' and payment_method = 'cash' and created_at > v_from;

  insert into public.cash_counts (organization_id, counted_by, counted_by_email, period_start,
                                  expected_cash, counted_cash, difference, note)
  values (p_org, auth.uid(), auth.jwt() ->> 'email', v_from, v_expected, p_counted,
          p_counted - v_expected, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.bizora_submit_cash_count(uuid, numeric, text) from public, anon;
grant execute on function public.bizora_submit_cash_count(uuid, numeric, text) to authenticated;

-- 5) Profit summary (dates are local dates of the organization, both inclusive) ----
create or replace function bizora_private.profit_summary(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_revenue numeric;
  v_cogs numeric;
  v_expenses numeric;
  v_count bigint;
  v_missing bigint;
begin
  select coalesce(timezone, 'Africa/Casablanca') into v_tz from public.organizations where id = p_org;
  v_tz := coalesce(v_tz, 'Africa/Casablanca');
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;

  select coalesce(sum(subtotal - discount), 0), count(*) into v_revenue, v_count
  from public.sales
  where organization_id = p_org and status = 'completed' and created_at >= v_from and created_at < v_to;

  select coalesce(sum(si.quantity * coalesce(si.unit_cost, 0)), 0),
         count(*) filter (where coalesce(si.unit_cost, 0) = 0)
  into v_cogs, v_missing
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.organization_id = p_org and s.status = 'completed' and s.created_at >= v_from and s.created_at < v_to;

  select coalesce(sum(amount), 0) into v_expenses
  from public.expenses where organization_id = p_org and spent_on between p_from and p_to;

  return jsonb_build_object(
    'revenue', v_revenue,
    'sales_count', v_count,
    'cogs', v_cogs,
    'gross_profit', v_revenue - v_cogs,
    'expenses', v_expenses,
    'net_profit', v_revenue - v_cogs - v_expenses,
    'items_without_cost', v_missing
  );
end $$;
revoke all on function bizora_private.profit_summary(uuid, date, date) from public, anon, authenticated;

create or replace function public.bizora_profit_summary(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not bizora_private.has_role(p_org, array['owner'::public.bizora_role]) then
    raise exception 'Permission denied';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Invalid period';
  end if;
  return bizora_private.profit_summary(p_org, p_from, p_to);
end $$;
revoke all on function public.bizora_profit_summary(uuid, date, date) from public, anon;
grant execute on function public.bizora_profit_summary(uuid, date, date) to authenticated;

-- Same summary for the daily report job (service role only, no user check).
create or replace function public.bizora_profit_summary_service(p_org uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select bizora_private.profit_summary(p_org, p_from, p_to); $$;
revoke all on function public.bizora_profit_summary_service(uuid, date, date) from public, anon, authenticated;
grant execute on function public.bizora_profit_summary_service(uuid, date, date) to service_role;
