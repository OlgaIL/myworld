alter table users
  add column if not exists access_expires_at timestamptz;

create index if not exists idx_users_access_expires_at
  on users (access_expires_at);
