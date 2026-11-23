-- ORM personal assistant: Supabase schema.
-- Run this in the Supabase SQL editor (or with the Supabase CLI) before deploying.
-- auth.users.id is a uuid, so every column that references it must also be uuid.

create schema if not exists orm;
revoke all on schema orm from public;
grant usage on schema orm to authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  memory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  device text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_cost numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.backups enable row level security;
alter table public.ai_usage enable row level security;

-- Tables are no longer exposed to the Data API automatically.
grant select, insert, update, delete on public.profiles, public.backups to authenticated;
grant select on public.ai_usage to authenticated;
grant insert on public.ai_usage to service_role;
revoke all on public.profiles, public.backups, public.ai_usage from anon;

create index if not exists ai_usage_user_id_created_at_idx
  on public.ai_usage (user_id, created_at desc);

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "own backup" on public.backups;
create policy "own backup" on public.backups
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own usage" on public.ai_usage;
create policy "own usage" on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Trigger function stays in a private schema and is not callable by clients.
drop function if exists public.handle_new_user();
create or replace function orm.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'ORM user'))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function orm.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function orm.handle_new_user();

-- Monthly spend cap. SECURITY INVOKER: RLS on ai_usage still applies.
create or replace function orm.ai_spend_this_month(uid uuid)
returns numeric
language sql
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(estimated_cost), 0)
  from public.ai_usage
  where user_id = uid
    and created_at >= date_trunc('month', now());
$$;
revoke all on function orm.ai_spend_this_month(uuid) from public, anon;
grant execute on function orm.ai_spend_this_month(uuid) to authenticated, service_role;
