-- Add referral_code to profiles and ensure it is auto-generated for all users

create extension if not exists pgcrypto;

alter table public.profiles
add column if not exists referral_code text;

-- Generate a unique short code
create or replace function public.generate_unique_referral_code()
returns text
language plpgsql
as $$
declare
  code text;
begin
  loop
    code := substring(encode(gen_random_bytes(8), 'hex') from 1 for 10);
    exit when not exists (select 1 from public.profiles p where p.referral_code = code);
  end loop;
  return code;
end;
$$;

-- Backfill existing users
update public.profiles
set referral_code = public.generate_unique_referral_code()
where referral_code is null;

-- Enforce uniqueness
create unique index if not exists profiles_referral_code_key on public.profiles(referral_code);

-- Allow resolving a referrer by referral_code without exposing profiles via RLS
create or replace function public.get_referrer_id_by_code(code text)
returns uuid
language sql
stable
security definer
as $$
  select p.id
  from public.profiles p
  where p.referral_code = code
  limit 1;
$$;

grant execute on function public.get_referrer_id_by_code(text) to anon, authenticated;

-- Ensure new users get a referral code (and default role user)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Use safe defaults so auth.signUp won't fail if metadata is missing.
  -- Also avoid referencing columns that may not exist yet (e.g. role) by using dynamic SQL.

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) then
    execute '
      insert into public.profiles (
        id,
        username,
        first_name,
        last_name,
        created_at,
        updated_at,
        role,
        referral_code
      )
      values ($1,$2,$3,$4,timezone(''utc''::text, now()),timezone(''utc''::text, now()),$5,$6)
    '
    using
      new.id,
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'user_' || substring(new.id::text, 1, 8)),
      coalesce(new.raw_user_meta_data->>'first_name', 'User'),
      coalesce(new.raw_user_meta_data->>'last_name', 'Name'),
      'user',
      public.generate_unique_referral_code();
  else
    execute '
      insert into public.profiles (
        id,
        username,
        first_name,
        last_name,
        created_at,
        updated_at,
        referral_code
      )
      values ($1,$2,$3,$4,timezone(''utc''::text, now()),timezone(''utc''::text, now()),$5)
    '
    using
      new.id,
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'user_' || substring(new.id::text, 1, 8)),
      coalesce(new.raw_user_meta_data->>'first_name', 'User'),
      coalesce(new.raw_user_meta_data->>'last_name', 'Name'),
      public.generate_unique_referral_code();
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
