-- Camera Gateway foundation. Safe additive migration; does not modify existing business rows.
create table if not exists public.camera_gateway_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  agent_name text not null check (length(trim(agent_name)) between 2 and 100),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','online','offline','disabled')),
  agent_version text,
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.camera_gateway_agents enable row level security;
revoke all on public.camera_gateway_agents from anon, authenticated, public;
grant all on public.camera_gateway_agents to service_role;
create index if not exists camera_gateway_agents_org_idx on public.camera_gateway_agents(organization_id);
create index if not exists camera_gateway_agents_status_seen_idx on public.camera_gateway_agents(status,last_seen_at desc);
