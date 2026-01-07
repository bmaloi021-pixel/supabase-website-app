alter table public.profiles
  add column if not exists top_up_balance numeric(10,2) not null default 0,
  add column if not exists withdrawable_balance numeric(10,2) not null default 0;

-- Keep legacy balance column in sync for existing UI/queries
create or replace function public.sync_profile_total_balance(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set balance = coalesce(top_up_balance, 0) + coalesce(withdrawable_balance, 0),
      updated_at = timezone('utc'::text, now())
  where id = p_user_id;
end;
$$;

-- Top-ups should increase spendable top-up balance only
create or replace function public.process_top_up_request(p_request_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.top_up_requests;
  now_utc timestamp with time zone;
  actor uuid;
  ref public.referrals;
  referrer_rate numeric;
  commission_amt numeric;
  commission_inserted boolean := false;
  commission_rowcount integer := 0;
begin
  now_utc := timezone('utc'::text, now());
  actor := auth.uid();

  if actor is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin_or_merchant(actor) then
    raise exception 'Not allowed';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid status';
  end if;

  select * into req
  from public.top_up_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Top-up request not found';
  end if;

  if req.status <> 'pending' then
    raise exception 'Top-up request already processed';
  end if;

  update public.top_up_requests
  set status = p_status,
      merchant_id = actor,
      processed_at = now_utc,
      updated_at = now_utc
  where id = req.id;

  if p_status = 'approved' then
    update public.profiles
    set top_up_balance = top_up_balance + req.amount,
        balance = coalesce(top_up_balance + req.amount, 0) + coalesce(withdrawable_balance, 0),
        updated_at = now_utc
    where id = req.user_id;

    -- Direct referral commission: referrer earns on referred user's approved top-ups
    select * into ref
    from public.referrals
    where referred_id = req.user_id
      and status = 'active'
    limit 1;

    if found then
      select p.commission_rate into referrer_rate
      from public.user_packages up
      join public.packages p on p.id = up.package_id
      where up.user_id = ref.referrer_id
        and up.status = 'active'
      limit 1;

      if referrer_rate is null then
        referrer_rate := 0;
      end if;

      commission_amt := round((req.amount * (referrer_rate / 100.0))::numeric, 2);

      if commission_amt > 0 then
        insert into public.commissions (
          user_id,
          referral_id,
          top_up_request_id,
          amount,
          commission_type,
          level,
          status,
          created_at,
          updated_at
        ) values (
          ref.referrer_id,
          ref.id,
          req.id,
          commission_amt,
          'top_up',
          1,
          'pending',
          now_utc,
          now_utc
        )
        on conflict (top_up_request_id, user_id) do nothing;

        get diagnostics commission_rowcount = row_count;
        commission_inserted := commission_rowcount > 0;

        if commission_inserted then
          update public.referrals
          set commission_earned = commission_earned + commission_amt,
              updated_at = now_utc
          where id = ref.id;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'request_id', req.id,
    'user_id', req.user_id,
    'status', p_status,
    'amount', req.amount,
    'commission_created', commission_inserted,
    'commission_amount', coalesce(commission_amt, 0)
  );
end;
$$;

-- Buying packages should use top-up balance first, then withdrawable if needed
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
    'top_up_balance', new_top_up,
    'withdrawable_balance', new_withdrawable,
    'balance', coalesce(new_top_up, 0) + coalesce(new_withdrawable, 0)
  );
end;
$$;

-- Matured package withdrawals should increase withdrawable earnings
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

  amt := pkg.price;

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

-- Withdraw specific package by id: also credits withdrawable earnings
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

  amt := pkg.price + (pkg.price * coalesce(pkg.commission_rate, 0)::numeric / 100);

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

-- Commissions credited to withdrawable earnings, not spendable top-ups
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
    set withdrawable_balance = withdrawable_balance + new.amount,
        balance = coalesce(top_up_balance, 0) + coalesce(withdrawable_balance + new.amount, 0),
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
