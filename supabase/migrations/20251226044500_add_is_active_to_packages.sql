-- Adds an availability flag for investment packages used by the dashboard UI
alter table packages
  add column if not exists is_active boolean not null default true;

comment on column packages.is_active is 'Determines whether the package is available for activation/purchase.';

update packages set is_active = true where is_active is null;
