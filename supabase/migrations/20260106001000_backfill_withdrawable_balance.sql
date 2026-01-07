do $$
begin
  -- Backfill withdrawable_balance from legacy balance for existing users.
  -- This assumes existing data will be reset for hard launch, and prioritizes making the UI + withdrawals consistent now.
  -- Rule: top_up_balance is non-withdrawable. Since we cannot reliably split historical balance sources,
  -- we treat (balance - top_up_balance) as withdrawable.

  update public.profiles
  set withdrawable_balance = greatest(0, coalesce(balance, 0) - coalesce(top_up_balance, 0)),
      balance = coalesce(top_up_balance, 0) + greatest(0, coalesce(balance, 0) - coalesce(top_up_balance, 0)),
      updated_at = timezone('utc'::text, now())
  where coalesce(withdrawable_balance, 0) = 0
    and coalesce(balance, 0) > 0;
end $$;
