-- Fix user_referral_codes view to avoid referencing auth.users (permission denied for table users)

create or replace view public.user_referral_codes as
select 
  p.id,
  p.username,
  p.referral_code,
  public.get_referral_link(p.id) as referral_link,
  p.created_at
from public.profiles p
where p.referral_code is not null and p.referral_code != '';

grant select on public.user_referral_codes to authenticated;
