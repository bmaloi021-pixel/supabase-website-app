alter table public.packages
add column if not exists maturity_minutes integer not null default 0;

create or replace function public.set_user_package_dates()
returns trigger
language plpgsql
as $$
declare
  md integer;
  mm integer;
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

    select p.maturity_days, p.maturity_minutes
      into md, mm
    from public.packages p
    where p.id = new.package_id;

    if mm is null then
      mm := 0;
    end if;

    if md is null then
      md := 0;
    end if;

    if mm > 0 then
      new.matures_at := now_utc + make_interval(mins => mm);
    else
      new.matures_at := now_utc + make_interval(days => md);
    end if;

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

update public.packages
set maturity_minutes = 5;

update public.user_packages
set matures_at = timezone('utc'::text, now()) + make_interval(mins => 5),
    updated_at = timezone('utc'::text, now())
where status = 'active'
  and withdrawn_at is null;
