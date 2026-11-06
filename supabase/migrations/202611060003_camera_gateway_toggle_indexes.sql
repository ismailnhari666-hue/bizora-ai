create index if not exists camera_gateway_agents_branch_id_idx on public.camera_gateway_agents(branch_id);
create index if not exists camera_gateway_agents_created_by_idx on public.camera_gateway_agents(created_by);
create index if not exists camera_gateway_settings_updated_by_idx on public.camera_gateway_settings(updated_by);
