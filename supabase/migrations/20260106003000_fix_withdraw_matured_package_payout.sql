-- Align withdraw_matured_package payout with UI expectation: principal + (principal * commission_rate/100)
-- This matches withdraw_user_package() logic.

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

  if not found then
    raise exception 'Package not found';
  end if;

  amt := pkg.price + (pkg.price * coalesce(pkg.commission_rate, 0)::numeric / 100);

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
    'user_package_id', up.id,
    'package_id', up.package_id
  );
end;
$$;

revoke all on function public.withdraw_matured_package() from public;
grant execute on function public.withdraw_matured_package() to authenticated;
