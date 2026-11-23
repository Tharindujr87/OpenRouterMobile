-- Only run this if the first version of schema.sql created tables before failing.
-- It converts user-reference columns from text to uuid, matching auth.users.id.

create schema if not exists orm;
revoke all on schema orm from public;
grant usage on schema orm to authenticated, service_role;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    drop policy if exists "own profile" on public.profiles;
    alter table public.profiles drop constraint if exists profiles_id_fkey;
    alter table public.profiles alter column id type uuid using id::uuid;
    alter table public.profiles add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'backups') then
    drop policy if exists "own backup" on public.backups;
    alter table public.backups drop constraint if exists backups_user_id_fkey;
    alter table public.backups alter column user_id type uuid using user_id::uuid;
    alter table public.backups add constraint backups_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ai_usage') then
    drop policy if exists "own usage" on public.ai_usage;
    alter table public.ai_usage drop constraint if exists ai_usage_user_id_fkey;
    alter table public.ai_usage alter column user_id type uuid using user_id::uuid;
    alter table public.ai_usage add constraint ai_usage_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

drop function if exists public.ai_spend_this_month(text);
drop function if exists public.ai_spend_this_month(uuid);
create or replace function orm.ai_spend_this_month(uid uuid)
returns numeric
language sql
security invoker set search_path = public, pg_temp
as $$
  select coalesce(sum(estimated_cost), 0)
  from public.ai_usage
  where user_id = uid
    and created_at >= date_trunc('month', now());
$$;
revoke all on function orm.ai_spend_this_month(uuid) from public, anon;
grant execute on function orm.ai_spend_this_month(uuid) to authenticated, service_role;
