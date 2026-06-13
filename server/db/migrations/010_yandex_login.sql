alter table users
  alter column google_id drop not null;

alter table users
  add column if not exists yandex_id text;

create unique index if not exists idx_users_yandex_id
  on users (yandex_id)
  where yandex_id is not null;
