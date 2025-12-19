alter table public.profiles
add column if not exists balance decimal(10,2) not null default 0;

create or replace function public.is_admin_or_merchant(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role in ('admin', 'merchant')
  );
$$;

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
  end if;

  return jsonb_build_object(
    'request_id', req.id,
    'user_id', req.user_id,
    'status', p_status,
    'amount', req.amount
  );
end;
$$;

revoke all on function public.process_top_up_request(uuid, text) from public;
grant execute on function public.process_top_up_request(uuid, text) to authenticated;
