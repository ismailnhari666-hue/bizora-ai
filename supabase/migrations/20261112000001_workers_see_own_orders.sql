-- Owners see every order of the organization; any other member (manager, cashier, staff)
-- only sees the orders they created themselves, plus the items of those orders.
-- Order creation goes through bizora_create_order (SECURITY DEFINER), so it is not affected.

drop policy if exists orders_select_member on public.orders;
drop policy if exists orders_select_scoped on public.orders;
create policy orders_select_scoped on public.orders for select to authenticated
using (
  bizora_private.has_role(organization_id, array['owner'::public.bizora_role])
  or (created_by = (select auth.uid()) and bizora_private.is_member(organization_id))
);

drop policy if exists order_items_select_member on public.order_items;
drop policy if exists order_items_select_scoped on public.order_items;
create policy order_items_select_scoped on public.order_items for select to authenticated
using (
  bizora_private.has_role(organization_id, array['owner'::public.bizora_role])
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and o.created_by = (select auth.uid())
      and bizora_private.is_member(o.organization_id)
  )
);
