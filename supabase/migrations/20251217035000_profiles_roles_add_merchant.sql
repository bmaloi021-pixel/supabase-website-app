-- Add merchant role option

-- Update role check constraint to include merchant
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'user', 'merchant'));
