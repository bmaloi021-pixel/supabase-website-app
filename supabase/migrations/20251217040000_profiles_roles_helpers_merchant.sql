-- Helper functions for merchant role checks

create or replace function public.is_merchant(uid uuid)
returns boolean
language sql
stable
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
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role in ('admin', 'merchant')
  );
$$;
