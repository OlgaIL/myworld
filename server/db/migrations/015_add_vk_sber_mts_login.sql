alter table users
  add column if not exists vk_id text,
  add column if not exists sber_id text,
  add column if not exists mts_id text;

create unique index if not exists idx_users_vk_id
  on users (vk_id)
  where vk_id is not null;

create unique index if not exists idx_users_sber_id
  on users (sber_id)
  where sber_id is not null;

create unique index if not exists idx_users_mts_id
  on users (mts_id)
  where mts_id is not null;
