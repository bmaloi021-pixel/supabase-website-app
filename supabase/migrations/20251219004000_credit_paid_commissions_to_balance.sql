alter table public.commissions
add column if not exists credited_at timestamp with time zone;

create or replace function public.credit_paid_commission_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_utc timestamp with time zone;
begin
  now_utc := timezone('utc'::text, now());

  if new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid')
     and new.credited_at is null then

    update public.profiles
    set balance = balance + new.amount,
        updated_at = now_utc
    where id = new.user_id;

    update public.commissions
    set credited_at = now_utc,
        updated_at = now_utc
    where id = new.id
      and credited_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists credit_paid_commission_to_balance on public.commissions;
create trigger credit_paid_commission_to_balance
after insert or update of status on public.commissions
for each row
execute function public.credit_paid_commission_to_balance();

do $$
declare
  now_utc timestamp with time zone;
begin
  now_utc := timezone('utc'::text, now());

  update public.profiles p
  set balance = p.balance + s.total,
      updated_at = now_utc
  from (
    select user_id, sum(amount) as total
    from public.commissions
    where status = 'paid'
      and credited_at is null
    group by user_id
  ) s
  where p.id = s.user_id;

  update public.commissions
  set credited_at = now_utc,
      updated_at = now_utc
  where status = 'paid'
    and credited_at is null;
end;
$$;
