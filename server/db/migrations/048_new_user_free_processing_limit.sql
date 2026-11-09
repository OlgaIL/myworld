-- New registrations only. Existing personal limits and used balances remain unchanged.
alter table users
  alter column free_processing_limit set default 5;
