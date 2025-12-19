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

  amt := pkg.price;

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
    'user_package_id', up.id,
    'package_id', up.package_id
  );
end;
$$;

revoke all on function public.withdraw_user_package(uuid) from public;
grant execute on function public.withdraw_user_package(uuid) to authenticated;
