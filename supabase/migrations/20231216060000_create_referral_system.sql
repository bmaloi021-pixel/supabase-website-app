-- Create packages table for different membership levels
create table if not exists public.packages (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  price decimal(10,2) not null,
  commission_rate decimal(5,2) not null, -- percentage commission
  level integer not null, -- package level (1 = basic, 2 = silver, 3 = gold, etc.)
  max_referrals integer, -- maximum number of direct referrals allowed
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create referrals table to track referral relationships
create table if not exists public.referrals (
  id uuid default gen_random_uuid() primary key,
  referrer_id uuid references public.profiles(id) on delete cascade not null, -- who referred them
  referred_id uuid references public.profiles(id) on delete cascade not null, -- who was referred
  package_id uuid references public.packages(id) on delete set null,
  status text not null default 'pending', -- pending, active, expired
  commission_earned decimal(10,2) default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(referred_id) -- each user can only have one referrer
);

-- Create commissions table to track all commissions
create table if not exists public.commissions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  referral_id uuid references public.referrals(id) on delete cascade not null,
  amount decimal(10,2) not null,
  commission_type text not null, -- direct, indirect, bonus
  level integer not null, -- which level in the downline (1 = direct, 2 = second level, etc.)
  status text not null default 'pending', -- pending, paid, cancelled
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create user_packages table to track user's current package
create table if not exists public.user_packages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  package_id uuid references public.packages(id) on delete cascade not null,
  status text not null default 'active', -- active, expired, cancelled
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id) -- each user can only have one active package
);

-- Insert default packages
insert into public.packages (name, description, price, commission_rate, level, max_referrals) values
('Starter', 'Basic membership with 10% commission', 100.00, 10.00, 1, 5),
('Professional', 'Pro membership with 15% commission', 500.00, 15.00, 2, 10),
('Enterprise', 'Enterprise membership with 20% commission', 1000.00, 20.00, 3, 20),
('VIP', 'VIP membership with 25% commission', 5000.00, 25.00, 4, null) -- unlimited referrals
on conflict do nothing;

-- Enable RLS
alter table public.packages enable row level security;
alter table public.referrals enable row level security;
alter table public.commissions enable row level security;
alter table public.user_packages enable row level security;

-- Policies for packages (readable by all, writable by authenticated users)
create policy "Packages are viewable by everyone" on packages for select using (true);
create policy "Authenticated users can insert packages" on packages for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update packages" on packages for update using (auth.role() = 'authenticated');

-- Policies for referrals (users can view their own referrals)
create policy "Users can view their referrals" on referrals for select using (referrer_id = auth.uid() or referred_id = auth.uid());
create policy "Users can insert their referrals" on referrals for insert with check (referrer_id = auth.uid() or referred_id = auth.uid());
create policy "Users can update their referrals" on referrals for update using (referrer_id = auth.uid() or referred_id = auth.uid());

-- Policies for commissions (users can view their commissions)
create policy "Users can view their commissions" on commissions for select using (user_id = auth.uid());
create policy "Users can insert their commissions" on commissions for insert with check (user_id = auth.uid());
create policy "Users can update their commissions" on commissions for update using (user_id = auth.uid());

-- Policies for user_packages (users can view their packages)
create policy "Users can view their packages" on user_packages for select using (user_id = auth.uid());
create policy "Users can insert their packages" on user_packages for insert with check (user_id = auth.uid());
create policy "Users can update their packages" on user_packages for update using (user_id = auth.uid());

-- Create indexes for performance
create index if not exists referrals_referrer_id_idx on public.referrals(referrer_id);
create index if not exists referrals_referred_id_idx on public.referrals(referred_id);
create index if not exists commissions_user_id_idx on public.commissions(user_id);
create index if not exists user_packages_user_id_idx on public.user_packages(user_id);
