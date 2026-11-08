-- The owner is the only administration role. Manager/cashier/staff accounts use the worker workflow.
drop policy if exists branches_manage on public.branches;
create policy branches_manage on public.branches for all to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]))
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));
drop policy if exists branches_select_manager on public.branches;
create policy branches_select_owner on public.branches for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists cameras_manage on public.cameras;
create policy cameras_manage on public.cameras for all to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]))
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));
drop policy if exists cameras_select_manager on public.cameras;
create policy cameras_select_owner on public.cameras for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists camera_events_select_manager on public.camera_events;
create policy camera_events_select_owner on public.camera_events for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists camera_feature_settings_manage on public.camera_feature_settings;
create policy camera_feature_settings_manage on public.camera_feature_settings for all to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]))
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));
drop policy if exists camera_feature_settings_select_manager on public.camera_feature_settings;
create policy camera_feature_settings_select_owner on public.camera_feature_settings for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists camera_table_zones_manage on public.camera_table_zones;
create policy camera_table_zones_manage on public.camera_table_zones for all to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]))
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));
drop policy if exists camera_table_zones_select_manager on public.camera_table_zones;
create policy camera_table_zones_select_owner on public.camera_table_zones for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists audit_select_manager on public.audit_logs;
create policy audit_select_owner on public.audit_logs for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists daily_report_delivery_log_select_manager on public.daily_report_delivery_log;
create policy daily_report_delivery_log_select_owner on public.daily_report_delivery_log for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists daily_report_settings_insert_managers on public.daily_report_settings;
create policy daily_report_settings_insert_owner on public.daily_report_settings for insert to authenticated
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));
drop policy if exists daily_report_settings_update_managers on public.daily_report_settings;
create policy daily_report_settings_update_owner on public.daily_report_settings for update to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]))
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));
drop policy if exists daily_report_settings_select_manager on public.daily_report_settings;
create policy daily_report_settings_select_owner on public.daily_report_settings for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists membership_select_self_or_manager on public.memberships;
create policy membership_select_self_or_owner on public.memberships for select to authenticated
using (user_id = (select auth.uid()) or bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists sales_select_manager on public.sales;
create policy sales_select_owner on public.sales for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));
drop policy if exists sale_items_select_manager on public.sale_items;
create policy sale_items_select_owner on public.sale_items for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists stock_insert_manager on public.stock_movements;
create policy stock_insert_owner on public.stock_movements for insert to authenticated
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role])
  and exists (select 1 from public.products p where p.id = product_id and p.organization_id = stock_movements.organization_id));
drop policy if exists stock_select_manager on public.stock_movements;
create policy stock_select_owner on public.stock_movements for select to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]));

drop policy if exists products_manage on public.products;
create policy products_manage on public.products for all to authenticated
using (bizora_private.has_role(organization_id, array['owner'::public.bizora_role]))
with check (bizora_private.has_role(organization_id, array['owner'::public.bizora_role])
  and ((branch_id is null) or exists (
    select 1 from public.branches b
    where b.id = products.branch_id and b.organization_id = products.organization_id
  )));

-- Manager, cashier and staff accounts are not allowed to create sales.
do $block$
declare
  v_definition text;
  v_original text;
  v_restricted text;
begin
  select pg_get_functiondef('public.bizora_create_sale(uuid,uuid,jsonb,numeric,numeric,text,text)'::regprocedure)
  into v_definition;
  v_original := 'array[''owner'',''manager'']::public.bizora_role[]';
  v_restricted := 'array[''owner'']::public.bizora_role[]';
  if position(v_original in v_definition) = 0 then
    raise exception 'Expected owner/manager sales authorization check was not found; migration stopped safely.';
  end if;
  v_definition := replace(v_definition, v_original, v_restricted);
  execute v_definition;
end;
$block$;
