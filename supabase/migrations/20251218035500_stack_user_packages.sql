do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_packages_user_id_key'
  ) then
    alter table public.user_packages drop constraint user_packages_user_id_key;
  end if;
end $$;

create index if not exists user_packages_user_id_status_created_at_idx
on public.user_packages (user_id, status, created_at desc);

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
  new_balance numeric;
  balance_before numeric;
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

  if prof.balance < pkg.price then
    raise exception 'Insufficient balance';
  end if;

  balance_before := prof.balance;
  new_balance := prof.balance - pkg.price;

  if new_balance < 0 then
    raise exception 'Insufficient balance';
  end if;

  update public.profiles
  set balance = new_balance,
      updated_at = now_utc
  where id = actor
  returning balance into new_balance;

  insert into public.user_packages (user_id, package_id, status, created_at, updated_at)
  values (actor, pkg.id, 'active', now_utc, now_utc)
  returning id into up_id;

  return jsonb_build_object(
    'user_package_id', up_id,
    'package_id', pkg.id,
    'price', pkg.price,
    'balance_before', balance_before,
    'balance', new_balance
  );
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

  amt := pkg.price;

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
    'user_package_id', up.id,
    'package_id', up.package_id
  );
end;
$$;

revoke all on function public.withdraw_matured_package() from public;
grant execute on function public.withdraw_matured_package() to authenticated;
