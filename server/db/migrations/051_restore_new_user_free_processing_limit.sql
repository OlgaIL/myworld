-- Restore the allowance for future registrations only; preserve existing accounts.
alter table users
  alter column free_processing_limit set default 10;
