-- AutoTestCase Generator schema
-- Run in Supabase SQL editor (or via `supabase db push`)

create extension if not exists "pgcrypto";

create table if not exists public.test_runs (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  page_title text,
  created_at timestamptz not null default now(),
  raw_result jsonb not null,
  element_summary jsonb
);

create index if not exists test_runs_created_at_idx
  on public.test_runs (created_at desc);

-- MVP: no auth. Service role bypasses RLS, so we keep RLS enabled
-- with no public policies — clients can only read/write through the
-- server (API routes) which uses the service-role key.
alter table public.test_runs enable row level security;
