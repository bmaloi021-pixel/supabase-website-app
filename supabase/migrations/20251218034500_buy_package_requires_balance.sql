alter table public.profiles
add column if not exists balance decimal(10,2) not null default 0;

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

  update public.profiles
  set balance = balance - pkg.price,
      updated_at = now_utc
  where id = actor
  returning balance into new_balance;

  insert into public.user_packages (user_id, package_id, status, created_at, updated_at)
  values (actor, pkg.id, 'active', now_utc, now_utc)
  on conflict (user_id) do update
    set package_id = excluded.package_id,
        status = 'active',
        updated_at = now_utc
  returning id into up_id;

  return jsonb_build_object(
    'user_package_id', up_id,
    'package_id', pkg.id,
    'price', pkg.price,
    'balance', new_balance
  );
end;
$$;

revoke all on function public.buy_package_with_balance(uuid) from public;
grant execute on function public.buy_package_with_balance(uuid) to authenticated;
