create index if not exists cash_counts_counted_by_idx on public.cash_counts (counted_by);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists orders_sale_id_idx on public.orders (sale_id);
create index if not exists owner_access_codes_user_id_idx on public.owner_access_codes (user_id);
