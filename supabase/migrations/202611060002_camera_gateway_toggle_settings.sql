create table if not exists public.camera_gateway_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  is_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.camera_gateway_settings enable row level security;
revoke all on public.camera_gateway_settings from anon, authenticated, public;
grant all on public.camera_gateway_settings to service_role;
comment on table public.camera_gateway_settings is 'Private organization-level switch for accepting camera gateway agent traffic. Service-role only.';
