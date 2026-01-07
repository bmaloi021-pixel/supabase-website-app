-- Allow admins to view all commissions

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'commissions'
      and policyname = 'Admins can view all commissions'
  ) then
    create policy "Admins can view all commissions"
    on public.commissions
    for select
    using (public.is_admin(auth.uid()));
  end if;
end
$$;
