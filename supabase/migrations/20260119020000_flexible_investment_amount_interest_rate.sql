alter table public.packages
add column if not exists interest_rate numeric(10,2) not null default 0;

alter table public.user_packages
add column if not exists amount numeric(10,2);

create or replace function public.buy_package_with_balance(p_package_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  pkg public.packages;
  prof public.profiles;
  now_utc timestamp with time zone;
  up_id uuid;
  new_top_up numeric;
  new_withdrawable numeric;
  remaining_cost numeric;
  final_amount numeric;
begin
  now_utc := timezone('utc'::text, now());
  actor := auth.uid();

  if actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null then
    raise exception 'Amount is required';
  end if;

  final_amount := round(p_amount::numeric, 2);

  if final_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  select * into pkg
  from public.packages
  where id = p_package_id;

  if not found then
    raise exception 'Package not found';
  end if;

  select * into prof
  from public.profiles
  where id = actor
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if (coalesce(prof.top_up_balance, 0) + coalesce(prof.withdrawable_balance, 0)) < final_amount then
    raise exception 'Insufficient balance';
  end if;

  remaining_cost := final_amount;

  -- deduct from top-up first
  if coalesce(prof.top_up_balance, 0) >= remaining_cost then
    new_top_up := prof.top_up_balance - remaining_cost;
    new_withdrawable := prof.withdrawable_balance;
    remaining_cost := 0;
  else
    new_top_up := 0;
    remaining_cost := remaining_cost - coalesce(prof.top_up_balance, 0);
    new_withdrawable := prof.withdrawable_balance - remaining_cost;
    remaining_cost := 0;
  end if;

  update public.profiles
  set top_up_balance = new_top_up,
      withdrawable_balance = new_withdrawable,
      balance = coalesce(new_top_up, 0) + coalesce(new_withdrawable, 0),
      updated_at = now_utc
  where id = actor;

  insert into public.user_packages (user_id, package_id, amount, status, created_at, updated_at)
  values (actor, pkg.id, final_amount, 'active', now_utc, now_utc)
  returning id into up_id;

  return jsonb_build_object(
    'user_package_id', up_id,
    'package_id', pkg.id,
    'amount', final_amount,
    'top_up_balance', new_top_up,
    'withdrawable_balance', new_withdrawable,
    'balance', coalesce(new_top_up, 0) + coalesce(new_withdrawable, 0)
  );
end;
$$;

revoke all on function public.buy_package_with_balance(uuid, numeric) from public;
grant execute on function public.buy_package_with_balance(uuid, numeric) to authenticated;

create or replace function public.buy_package_with_balance(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pkg public.packages;
begin
  select * into pkg
  from public.packages
  where id = p_package_id;

  if not found then
    raise exception 'Package not found';
  end if;

  return public.buy_package_with_balance(p_package_id, pkg.price);
end;
$$;

revoke all on function public.buy_package_with_balance(uuid) from public;
grant execute on function public.buy_package_with_balance(uuid) to authenticated;

create or replace function public.withdraw_matured_package()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  up public.user_packages;
  pkg public.packages;
  amt numeric;
  principal numeric;
  now_utc timestamp with time zone;
begin
  now_utc := timezone('utc'::text, now());

  select * into up
  from public.user_packages
  where user_id = auth.uid()
    and status = 'active'
    and withdrawn_at is null
    and matures_at is not null
    and matures_at <= now_utc
  order by matures_at asc, created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'No matured package available to withdraw';
  end if;

  select * into pkg
  from public.packages
  where id = up.package_id;

  if not found then
    raise exception 'Package not found';
  end if;

  principal := coalesce(up.amount, pkg.price);
  amt := principal + (principal * coalesce(pkg.interest_rate, 0)::numeric / 100);

  update public.user_packages
  set withdrawn_at = now_utc,
      updated_at = now_utc
  where id = up.id;

  update public.profiles
  set withdrawable_balance = withdrawable_balance + amt,
      balance = coalesce(top_up_balance, 0) + coalesce(withdrawable_balance + amt, 0),
      updated_at = now_utc
  where id = auth.uid();

  return jsonb_build_object(
    'amount', amt,
    'principal', principal,
    'user_package_id', up.id,
    'package_id', up.package_id
  );
end;
$$;

revoke all on function public.withdraw_matured_package() from public;
grant execute on function public.withdraw_matured_package() to authenticated;

create or replace function public.withdraw_user_package(p_user_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  up public.user_packages;
  pkg public.packages;
  prof public.profiles;
  amt numeric;
  principal numeric;
  now_utc timestamp with time zone;
begin
  now_utc := timezone('utc'::text, now());

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into up
  from public.user_packages
  where id = p_user_package_id
    and user_id = auth.uid()
  limit 1
  for update;

  if not found then
    raise exception 'Package not found';
  end if;

  if up.status is distinct from 'active' then
    raise exception 'Package not active';
  end if;

  if up.withdrawn_at is not null then
    raise exception 'Already withdrawn';
  end if;

  if up.matures_at is null then
    raise exception 'No maturity date';
  end if;

  if up.matures_at > now_utc then
    raise exception 'Package not yet matured';
  end if;

  select * into pkg
  from public.packages
  where id = up.package_id;

  if not found then
    raise exception 'Package not found';
  end if;

  principal := coalesce(up.amount, pkg.price);
  amt := principal + (principal * coalesce(pkg.interest_rate, 0)::numeric / 100);

  select * into prof
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  update public.user_packages
  set withdrawn_at = now_utc,
      updated_at = now_utc
  where id = up.id;

  update public.profiles
  set balance = balance + amt,
      updated_at = now_utc
  where id = auth.uid();

  return jsonb_build_object(
    'amount', amt,
    'principal', principal,
    'user_package_id', up.id,
    'package_id', up.package_id
  );
end;
$$;

revoke all on function public.withdraw_user_package(uuid) from public;
grant execute on function public.withdraw_user_package(uuid) to authenticated;
