-- Fix admin/merchant role helper functions to avoid RLS recursion issues
-- when used inside RLS policies (e.g. profiles admin listing).

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'admin'
  );
$$;

create or replace function public.is_merchant(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'merchant'
  );
$$;

create or replace function public.is_admin_or_merchant(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role in ('admin', 'merchant')
  );
$$;
