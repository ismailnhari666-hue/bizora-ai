-- Workers sign in with a personal code issued by the owner (no email/password).
create table if not exists public.worker_access_codes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists worker_access_codes_user_id_idx on public.worker_access_codes (user_id);
alter table public.worker_access_codes enable row level security;
-- No policies on purpose: only the bizora-access Edge Function (service role) reads or writes this table.
revoke all on public.worker_access_codes from anon, authenticated;
