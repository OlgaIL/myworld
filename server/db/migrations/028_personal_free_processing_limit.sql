alter table users
  add column if not exists free_processing_limit integer;

update users
set free_processing_limit = 30
where free_processing_limit is null;

alter table users
  alter column free_processing_limit set default 10,
  alter column free_processing_limit set not null;

alter table users
  drop constraint if exists users_free_processing_limit_check,
  add constraint users_free_processing_limit_check check (free_processing_limit >= 0);

alter table payments
  add column if not exists package_id text;

update payments
set package_id = case package_title
  when 'Мини' then 'mini'
  when 'Стандарт' then 'standard'
  when 'Макси' then 'maxi'
  else package_id
end
where package_id is null;

create index if not exists idx_payments_user_package_status
  on payments (user_id, package_id, status);

create unique index if not exists idx_payments_one_active_start_per_user
  on payments (user_id)
  where package_id = 'start'
    and status in ('pending', 'waiting_for_capture', 'succeeded');
