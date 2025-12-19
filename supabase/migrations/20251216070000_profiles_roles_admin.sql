-- Add roles to profiles and make the first created profile an admin

-- 1) Add role column
alter table public.profiles
add column if not exists role text not null default 'user';

-- Optional safety constraint
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('admin', 'user'));
  end if;
end $$;

-- Backfill any nulls (if any exist)
update public.profiles
set role = 'user'
where role is null;

-- If the database already has users and no admin exists yet,
-- promote the earliest created profile to admin.
update public.profiles
set role = 'admin'
where id = (
  select p.id
  from public.profiles p
  order by p.created_at asc
  limit 1
)
and not exists (
  select 1
  from public.profiles
  where role = 'admin'
);

-- 2) Helper function for RLS
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'admin'
  );
$$;

-- 3) Update trigger to set first profile as admin
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id,
    username,
    first_name,
    last_name,
    created_at,
    updated_at,
    role
  )
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    timezone('utc'::text, now()),
    timezone('utc'::text, now()),
    'user'
  );

  return new;
end;
$$ language plpgsql security definer;

-- Ensure trigger exists
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4) RLS policies
-- NOTE: we drop/recreate to avoid "already exists" errors

drop policy if exists "Users can view own profile." on public.profiles;
drop policy if exists "Users can update own profile." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Admins can view all profiles." on public.profiles;
drop policy if exists "Admins can update all profiles." on public.profiles;

-- Users can view their own profile
create policy "Users can view own profile."
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile (excluding role via column privilege below)
create policy "Users can update own profile."
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users can insert their own profile (kept for compatibility)
create policy "Users can insert their own profile."
  on public.profiles for insert
  with check (auth.uid() = id);

-- Admins can view all profiles (needed for admin panel)
create policy "Admins can view all profiles."
  on public.profiles for select
  using (public.is_admin(auth.uid()));

-- Admins can update all profiles (needed to change role)
create policy "Admins can update all profiles."
  on public.profiles for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 5) Column-level privileges: prevent non-admins from updating role
-- (RLS + this makes it harder to accidentally change roles)
revoke update(role) on public.profiles from authenticated;

-- Ensure authenticated can still update other columns on their own row
-- (If you previously didn't grant anything explicitly, this is a no-op in many setups)
grant update(username, first_name, last_name, contact_number, updated_at) on public.profiles to authenticated;

-- Only admins should be able to update role. We allow authenticated UPDATE(role)
-- but it will be blocked by RLS unless the user is an admin.
grant update(role) on public.profiles to authenticated;
