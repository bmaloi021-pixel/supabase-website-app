-- Create a storage bucket for payment method logos
-- Public read so logos can be displayed without auth; admin-only write.

insert into storage.buckets (id, name, public)
values ('payment-method-logos', 'payment-method-logos', true)
on conflict (id) do nothing;

-- Policies for storage.objects
-- Note: bucket_id is the bucket name/id.

-- Public can read logos
drop policy if exists "Public can view payment method logos" on storage.objects;
create policy "Public can view payment method logos"
  on storage.objects for select
  using (bucket_id = 'payment-method-logos');

-- Admins can upload logos
drop policy if exists "Admins can upload payment method logos" on storage.objects;
create policy "Admins can upload payment method logos"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-method-logos'
    and public.is_admin(auth.uid())
  );

-- Admins can update logos
drop policy if exists "Admins can update payment method logos" on storage.objects;
create policy "Admins can update payment method logos"
  on storage.objects for update
  using (
    bucket_id = 'payment-method-logos'
    and public.is_admin(auth.uid())
  )
  with check (
    bucket_id = 'payment-method-logos'
    and public.is_admin(auth.uid())
  );

-- Admins can delete logos
drop policy if exists "Admins can delete payment method logos" on storage.objects;
create policy "Admins can delete payment method logos"
  on storage.objects for delete
  using (
    bucket_id = 'payment-method-logos'
    and public.is_admin(auth.uid())
  );
