alter table public.payment_methods
add column if not exists is_public boolean not null default false;

-- Policies
-- Users can always view their own payment methods.
-- Additionally, authenticated users can view PUBLIC payment methods created by merchants/admins.

drop policy if exists "Authenticated can view public payment methods" on public.payment_methods;
create policy "Authenticated can view public payment methods"
  on public.payment_methods for select
  to authenticated
  using (
    is_public = true
  );

-- Tighten insert/update so only merchants/admins can set is_public = true

drop policy if exists "Users can insert their own payment methods" on public.payment_methods;
create policy "Users can insert their own payment methods"
  on public.payment_methods for insert
  with check (
    auth.uid() = user_id
    and (
      is_public = false
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('merchant', 'admin')
      )
    )
  );

drop policy if exists "Users can update their own payment methods" on public.payment_methods;
create policy "Users can update their own payment methods"
  on public.payment_methods for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      is_public = false
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('merchant', 'admin')
      )
    )
  );

-- Storage: allow authenticated users to read QR codes for PUBLIC payment methods
-- (Upload/update/delete remains owner/admin from previous migration)

drop policy if exists "Owners can view payment method qr codes" on storage.objects;
create policy "Owners can view payment method qr codes"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-method-qr-codes'
    and (
      public.is_admin(auth.uid())
      or name like (auth.uid()::text || '/%')
      or exists (
        select 1
        from public.payment_methods pm
        where pm.qr_code_path = storage.objects.name
          and pm.is_public = true
      )
    )
  );
