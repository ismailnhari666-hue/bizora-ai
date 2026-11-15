-- Idempotent order creation: a retried (offline-queued) request with the same client_ref returns the first order.
alter table public.orders add column if not exists client_ref uuid;
create unique index if not exists orders_client_ref_uidx on public.orders (organization_id, client_ref) where client_ref is not null;

drop function if exists public.bizora_create_order(uuid, text, text, text, jsonb);

create or replace function public.bizora_create_order(
  p_org uuid, p_customer text, p_table text, p_note text, p_items jsonb, p_client_ref uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_qty numeric;
  v_total numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_org is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Organisation et articles requis';
  end if;
  if not bizora_private.has_role(p_org, array['owner'::public.bizora_role, 'manager'::public.bizora_role, 'cashier'::public.bizora_role, 'staff'::public.bizora_role]) then
    raise exception 'Permission refusée';
  end if;

  if p_client_ref is not null then
    select id into v_order_id from public.orders
    where organization_id = p_org and client_ref = p_client_ref and created_by = auth.uid();
    if found then return v_order_id; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantité invalide'; end if;
    select id, name, unit_price into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and organization_id = p_org
      and is_active = true;
    if not found then raise exception 'Produit introuvable'; end if;
    v_total := v_total + (v_product.unit_price * v_qty);
  end loop;

  begin
    insert into public.orders (organization_id, created_by, customer_label, table_label, note, total, client_ref)
    values (p_org, auth.uid(), nullif(trim(coalesce(p_customer,'')),''), nullif(trim(coalesce(p_table,'')),''), nullif(trim(coalesce(p_note,'')),''), v_total, p_client_ref)
    returning id into v_order_id;
  exception when unique_violation then
    select id into v_order_id from public.orders
    where organization_id = p_org and client_ref = p_client_ref and created_by = auth.uid();
    if v_order_id is null then raise; end if;
    return v_order_id;
  end;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    select id, name, unit_price into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
      and organization_id = p_org
      and is_active = true;
    insert into public.order_items (organization_id, order_id, product_id, product_name, quantity, unit_price, line_total)
    values (p_org, v_order_id, v_product.id, v_product.name, v_qty, v_product.unit_price, v_qty * v_product.unit_price);
  end loop;

  return v_order_id;
end;
$function$;

revoke all on function public.bizora_create_order(uuid, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.bizora_create_order(uuid, text, text, text, jsonb, uuid) to authenticated;
