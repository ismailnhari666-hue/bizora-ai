-- Workers can change order status only; they cannot alter order totals or ownership.
revoke update on table public.orders from authenticated;
grant update(status, updated_at) on table public.orders to authenticated;

-- The worker/cashier role is limited to order operations, not sales creation.
do $block$
declare
  v_definition text;
  v_original text;
  v_restricted text;
begin
  select pg_get_functiondef('public.bizora_create_sale(uuid,uuid,jsonb,numeric,numeric,text,text)'::regprocedure)
  into v_definition;
  v_original := 'array[''owner'',''manager'',''cashier'']::public.bizora_role[]';
  v_restricted := 'array[''owner'',''manager'']::public.bizora_role[]';
  if position(v_original in v_definition) = 0 then
    raise exception 'Expected sales authorization check was not found; migration stopped safely.';
  end if;
  v_definition := replace(v_definition, v_original, v_restricted);
  execute v_definition;
end;
$block$;
