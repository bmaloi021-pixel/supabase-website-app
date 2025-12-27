-- Adds proof-of-receipt metadata for top-up requests
alter table top_up_requests
  add column if not exists receipt_path text;

alter table top_up_requests
  add column if not exists receipt_filename text;

alter table top_up_requests
  add column if not exists receipt_mime_type text;

comment on column top_up_requests.receipt_path is 'Path inside Supabase Storage for the uploaded proof of receipt.';
comment on column top_up_requests.receipt_filename is 'Original filename of the uploaded proof of receipt.';
comment on column top_up_requests.receipt_mime_type is 'MIME type of the uploaded proof of receipt.';

-- Ensure we have a private bucket for storing proof uploads
insert into storage.buckets (id, name, public)
values ('top-up-receipts', 'top-up-receipts', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users manage their top-up receipts'
  ) then
    create policy "Users manage their top-up receipts"
    on storage.objects
    for all
    to authenticated
    using (
      bucket_id = 'top-up-receipts'
      and split_part(name, '/', 1) = auth.uid()::text
    )
    with check (
      bucket_id = 'top-up-receipts'
      and split_part(name, '/', 1) = auth.uid()::text
    );
  end if;
end
$$;
