update public.user_packages
set activated_at = coalesce(activated_at, created_at, updated_at)
where activated_at is null;

update public.user_packages up
set matures_at = coalesce(
  up.matures_at,
  coalesce(up.activated_at, up.created_at, up.updated_at)
    + make_interval(days => coalesce(p.maturity_days, 0))
)
from public.packages p
where p.id = up.package_id
  and up.matures_at is null;
