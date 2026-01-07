-- Fix buy_package_with_balance: user_packages no longer has a unique constraint on (user_id),
-- so ON CONFLICT (user_id) will fail. Allow multiple purchases by inserting a new row.

create or replace function public.buy_package_with_balance(p_package_id uuid)
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
begin
  now_utc := timezone('utc'::text, now());
  actor := auth.uid();

  if actor is null then
    raise exception 'Not authenticated';
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

  if (coalesce(prof.top_up_balance, 0) + coalesce(prof.withdrawable_balance, 0)) < pkg.price then
    raise exception 'Insufficient balance';
  end if;

  remaining_cost := pkg.price;

  -- deduct from top-up first
  if coalesce(prof.top_up_balance, 0) >= remaining_cost then
    new_top_up := prof.top_up_balance - remaining_cost;
    new_withdrawable := prof.withdrawable_balance;
  else
    new_top_up := 0;
    remaining_cost := remaining_cost - coalesce(prof.top_up_balance, 0);
    new_withdrawable := prof.withdrawable_balance - remaining_cost;
  end if;

  update public.profiles
  set top_up_balance = new_top_up,
      withdrawable_balance = new_withdrawable,
      balance = coalesce(new_top_up, 0) + coalesce(new_withdrawable, 0),
      updated_at = now_utc
  where id = actor;

  insert into public.user_packages (user_id, package_id, status, created_at, updated_at)
  values (actor, pkg.id, 'active', now_utc, now_utc)
  returning id into up_id;

  return jsonb_build_object(
    'user_package_id', up_id,
    'package_id', pkg.id,
    'price', pkg.price,
    'top_up_balance', new_top_up,
    'withdrawable_balance', new_withdrawable,
    'balance', coalesce(new_top_up, 0) + coalesce(new_withdrawable, 0)
  );
end;
$$;

revoke all on function public.buy_package_with_balance(uuid) from public;
grant execute on function public.buy_package_with_balance(uuid) to authenticated;
