-- Supplier purchases: raise stock and keep a weighted-average cost_price. Purchases are NOT expenses
-- (their cost reaches profit through COGS when the goods are sold).
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_name text check (supplier_name is null or length(supplier_name) <= 120),
  purchased_on date not null default current_date,
  total numeric(12,2) not null default 0,
  note text check (note is null or length(note) <= 300),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists purchases_org_idx on public.purchases (organization_id, created_at desc);
create index if not exists purchases_created_by_idx on public.purchases (created_by);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(12,2) not null
);
create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_product_idx on public.purchase_items (product_id);

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
drop policy if exists purchases_select_managers on public.purchases;
create policy purchases_select_managers on public.purchases for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));
drop policy if exists purchase_items_select_managers on public.purchase_items;
create policy purchase_items_select_managers on public.purchase_items for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role, 'manager'::public.bizora_role]));
-- No insert/update/delete policies: rows are written only by bizora_record_purchase.

create or replace function public.bizora_record_purchase(p_org uuid, p_supplier text, p_items jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase uuid;
  v_item jsonb;
  v_product record;
  v_qty numeric;
  v_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
  v_total numeric := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not bizora_private.has_role(p_org, array['owner'::public.bizora_role, 'manager'::public.bizora_role]) then
    raise exception 'Permission denied';
  end if;
  if not bizora_private.org_subscription_ok(p_org) then raise exception 'SUBSCRIPTION_EXPIRED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'Invalid items';
  end if;

  insert into public.purchases (organization_id, supplier_name, note, created_by)
  values (p_org, nullif(trim(coalesce(p_supplier, '')), ''), nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_purchase;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 or v_cost is null or v_cost < 0 or v_cost > 10000000 then
      raise exception 'Invalid quantity or cost';
    end if;
    select id, name, stock_quantity, cost_price into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid and organization_id = p_org
    for update;
    if not found then raise exception 'Product not found'; end if;

    v_new_stock := v_product.stock_quantity + v_qty;
    v_new_cost := case when v_product.stock_quantity > 0 and v_product.cost_price > 0
      then round((v_product.stock_quantity * v_product.cost_price + v_qty * v_cost) / v_new_stock, 2)
      else v_cost end;

    update public.products set stock_quantity = v_new_stock, cost_price = v_new_cost
    where id = v_product.id and organization_id = p_org;

    insert into public.purchase_items (organization_id, purchase_id, product_id, product_name, quantity, unit_cost, line_total)
    values (p_org, v_purchase, v_product.id, v_product.name, v_qty, v_cost, round(v_qty * v_cost, 2));

    insert into public.stock_movements (organization_id, product_id, created_by, movement_type, quantity_change, quantity_after, reason, reference_id)
    values (p_org, v_product.id, auth.uid(), 'purchase', v_qty, v_new_stock, 'Purchase', v_purchase);

    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;

  update public.purchases set total = v_total where id = v_purchase;
  return v_purchase;
end $$;
revoke all on function public.bizora_record_purchase(uuid, text, jsonb, text) from public, anon;
grant execute on function public.bizora_record_purchase(uuid, text, jsonb, text) to authenticated;
