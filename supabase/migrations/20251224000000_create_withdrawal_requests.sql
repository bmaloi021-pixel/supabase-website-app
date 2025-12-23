-- Create withdrawal_requests table for account balance withdrawals
create table if not exists public.withdrawal_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'processing')),
  status_notes text,
  payment_method_info jsonb, -- Store withdrawal destination info
  processed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for better performance
create index if not exists idx_withdrawal_requests_user_id on public.withdrawal_requests(user_id);
create index if not exists idx_withdrawal_requests_status on public.withdrawal_requests(status);
create index if not exists idx_withdrawal_requests_created_at on public.withdrawal_requests(created_at desc);

-- Enable RLS (Row Level Security)
alter table public.withdrawal_requests enable row level security;

-- Create policies
create policy "Users can view their own withdrawal requests"
  on public.withdrawal_requests for select
  using (auth.uid() = user_id);

create policy "Users can create their own withdrawal requests"
  on public.withdrawal_requests for insert
  with check (auth.uid() = user_id);

-- Note: Admin/merchant policies will be added later when role column exists

-- Create updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger set_withdrawal_requests_updated_at
  before update on public.withdrawal_requests
  for each row execute function public.set_updated_at();

-- Grant permissions
grant select, insert on public.withdrawal_requests to authenticated;
grant update on public.withdrawal_requests to service_role;
