-- Create or replace the function to generate unique referral codes
create or replace function public.generate_unique_referral_code()
returns text
language plpgsql
as $$
declare
  code text;
begin
  loop
    -- Generate a random 8-character alphanumeric code
    code := upper(
      array_to_string(
        array(
          select substr(
            'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
            (random() * 32)::int + 1,
            1
          )
          from generate_series(1, 8)
        ),
        ''
      )
    );
    
    -- Make sure the code is unique
    exit when not exists (
      select 1 from public.profiles p 
      where p.referral_code = code
    );
  end loop;
  
  return code;
end;
$$;

-- Ensure all profiles have a referral code
do $$
declare
  v_count integer;
  v_updated_count integer := 0;
  v_profile record;
  v_code text;
  v_batch_size integer := 50; -- Process in smaller batches
  v_processed_count integer := 0;
begin
  -- Check if there are any profiles without valid referral codes
  select count(*) into v_count
  from public.profiles
  where referral_code is null or trim(referral_code) = '';

  if v_count > 0 then
    raise notice 'Found % profiles without valid referral codes. Generating codes...', v_count;
    
    -- Process profiles in batches
    for v_profile in 
      select id from public.profiles 
      where referral_code is null or trim(referral_code) = ''
      order by created_at -- Process oldest first
      limit 1000 -- Safety limit
    loop
      begin
        -- Generate a unique code for each profile
        v_code := public.generate_unique_referral_code();
        
        -- Update the profile with the new code
        update public.profiles
        set referral_code = v_code
        where id = v_profile.id
        and (referral_code is null or trim(referral_code) = '');
        
        -- Count how many we've updated
        get diagnostics v_updated_count = row_count;
        v_processed_count := v_processed_count + 1;
        
        -- Commit every batch to avoid long-running transactions
        if v_processed_count % v_batch_size = 0 then
          commit;
          raise notice 'Processed % profiles...', v_processed_count;
        end if;
      exception when others then
        raise warning 'Error processing profile %: %', v_profile.id, SQLERRM;
      end;
    end loop;
    
    -- Final commit
    commit;
    raise notice 'Successfully processed % profiles, updated % with new referral codes', 
                 v_processed_count, v_updated_count;
  else
    raise notice 'All profiles already have valid referral codes';
  end if;
end $$;

-- Create a function to get a user's referral link
create or replace function public.get_referral_link(user_id uuid)
returns text
language plpgsql
stable
as $$
declare
  v_referral_code text;
  v_site_url text;
begin
  -- Get the referral code
  select referral_code into v_referral_code
  from public.profiles
  where id = user_id;
  
  -- Get site URL from settings or use a default
  begin
    v_site_url := current_setting('app.settings.site_url', true);
  exception when others then
    v_site_url := 'https://yourdomain.com'; -- Replace with your actual domain
  end;
  
  -- Return the full referral link if we have a code
  if v_referral_code is not null and v_referral_code != '' then
    return v_site_url || '/signup?ref=' || v_referral_code;
  else
    return null;
  end if;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.get_referral_link(uuid) to authenticated, service_role;

-- Create a view to easily see users and their referral codes
create or replace view public.user_referral_codes as
select 
  p.id,
  u.email,
  p.referral_code,
  public.get_referral_link(p.id) as referral_link,
  p.created_at
from public.profiles p
join auth.users u on p.id = u.id
where p.referral_code is not null and p.referral_code != '';

-- Grant select on the view to authenticated users
grant select on public.user_referral_codes to authenticated;
