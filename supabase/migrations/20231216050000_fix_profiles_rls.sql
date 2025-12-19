-- Update the trigger function to handle the new schema
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id, 
    username,
    first_name,
    last_name,
    created_at,
    updated_at
  )
  values (
    new.id, 
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop the old trigger and create a new one
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Allow authenticated users to insert their own profile
create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

-- Allow authenticated users to update their own profile
create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- Allow authenticated users to view their own profile
create policy "Users can view own profile."
  on profiles for select
  using ( auth.uid() = id );
