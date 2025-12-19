alter table public.profiles
add column if not exists balance decimal(10,2) not null default 0;

alter table public.packages
add column if not exists maturity_days integer not null default 0;

alter table public.user_packages
add column if not exists activated_at timestamp with time zone,
add column if not exists matures_at timestamp with time zone,
add column if not exists withdrawn_at timestamp with time zone;

create or replace function public.set_user_package_dates()
returns trigger
language plpgsql
as $$
declare
  md integer;
  now_utc timestamp with time zone;
begin
  now_utc := timezone('utc'::text, now());

  if tg_op = 'INSERT' then
    new.created_at := now_utc;
  else
    new.created_at := old.created_at;
  end if;

  new.updated_at := now_utc;

  if new.status = 'active' and (
    tg_op = 'INSERT'
    or old.status is distinct from 'active'
    or new.package_id is distinct from old.package_id
  ) then
    new.activated_at := now_utc;
    select p.maturity_days into md
    from public.packages p
    where p.id = new.package_id;

    if md is null then
      md := 0;
    end if;

    new.matures_at := now_utc + make_interval(days => md);
    new.withdrawn_at := null;
  else
    if tg_op = 'UPDATE' then
      new.activated_at := coalesce(new.activated_at, old.activated_at);
      new.matures_at := coalesce(new.matures_at, old.matures_at);
      new.withdrawn_at := coalesce(new.withdrawn_at, old.withdrawn_at);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_user_package_dates on public.user_packages;
create trigger set_user_package_dates
  before insert or update on public.user_packages
  for each row
  execute function public.set_user_package_dates();

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
begin
  select * into up
  from public.user_packages
  where user_id = auth.uid()
    and status = 'active'
  limit 1
  for update;

  if not found then
    raise exception 'No active package';
  end if;

  if up.withdrawn_at is not null then
    raise exception 'Already withdrawn';
  end if;

  if up.matures_at is null then
    raise exception 'No maturity date';
  end if;

  if up.matures_at > timezone('utc'::text, now()) then
    raise exception 'Package not yet matured';
  end if;

  select * into pkg
  from public.packages
  where id = up.package_id;

  amt := pkg.price;

  update public.user_packages
  set withdrawn_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = up.id;

  update public.profiles
  set balance = balance + amt,
      updated_at = timezone('utc'::text, now())
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
