-- Create commissions on approved top-ups (direct referrer)

alter table public.commissions
  add column if not exists top_up_request_id uuid references public.top_up_requests(id) on delete set null;

create unique index if not exists commissions_top_up_request_user_unique
  on public.commissions(top_up_request_id, user_id)
  where top_up_request_id is not null;

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
    set balance = balance + req.amount,
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
