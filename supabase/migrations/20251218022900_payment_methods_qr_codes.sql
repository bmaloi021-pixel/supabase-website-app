alter table public.payment_methods
add column if not exists qr_code_path text;

insert into storage.buckets (id, name, public)
values ('payment-method-qr-codes', 'payment-method-qr-codes', false)
on conflict (id) do nothing;

drop policy if exists "Owners can view payment method qr codes" on storage.objects;
create policy "Owners can view payment method qr codes"
  on storage.objects for select
  using (
    bucket_id = 'payment-method-qr-codes'
    and (
      public.is_admin(auth.uid())
      or name like (auth.uid()::text || '/%')
    )
  );

drop policy if exists "Owners can upload payment method qr codes" on storage.objects;
create policy "Owners can upload payment method qr codes"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-method-qr-codes'
    and (
      public.is_admin(auth.uid())
      or name like (auth.uid()::text || '/%')
    )
  );

drop policy if exists "Owners can update payment method qr codes" on storage.objects;
create policy "Owners can update payment method qr codes"
  on storage.objects for update
  using (
    bucket_id = 'payment-method-qr-codes'
    and (
      public.is_admin(auth.uid())
      or name like (auth.uid()::text || '/%')
    )
  )
  with check (
    bucket_id = 'payment-method-qr-codes'
    and (
      public.is_admin(auth.uid())
      or name like (auth.uid()::text || '/%')
    )
  );

drop policy if exists "Owners can delete payment method qr codes" on storage.objects;
create policy "Owners can delete payment method qr codes"
  on storage.objects for delete
  using (
    bucket_id = 'payment-method-qr-codes'
    and (
      public.is_admin(auth.uid())
      or name like (auth.uid()::text || '/%')
    )
  );
