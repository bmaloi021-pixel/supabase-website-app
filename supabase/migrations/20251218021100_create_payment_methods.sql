-- Create table for storing non-sensitive payment method details
create extension if not exists pgcrypto;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  type text not null,
  label text,
  provider text,
  account_name text,
  account_number_last4 text,
  phone text,
  is_default boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ensure updated_at trigger function exists
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- RLS
alter table public.payment_methods enable row level security;

-- Policies
drop policy if exists "Users can view their payment methods" on public.payment_methods;
drop policy if exists "Users can insert their own payment methods" on public.payment_methods;
drop policy if exists "Users can update their own payment methods" on public.payment_methods;
drop policy if exists "Users can delete their own payment methods" on public.payment_methods;

create policy "Users can view their payment methods"
  on public.payment_methods for select
  using (auth.uid() = user_id);

create policy "Users can insert their own payment methods"
  on public.payment_methods for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own payment methods"
  on public.payment_methods for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own payment methods"
  on public.payment_methods for delete
  using (auth.uid() = user_id);

-- Indexes
create index if not exists payment_methods_user_id_idx on public.payment_methods(user_id);

-- Ensure only one default payment method per user
create unique index if not exists payment_methods_one_default_per_user
  on public.payment_methods(user_id)
  where is_default;

-- updated_at trigger (relies on public.handle_updated_at created in other migration)
drop trigger if exists handle_payment_methods_updated_at on public.payment_methods;
create trigger handle_payment_methods_updated_at
  before update on public.payment_methods
  for each row execute function public.handle_updated_at();

-- Grants
grant select, insert, update, delete on public.payment_methods to authenticated;
