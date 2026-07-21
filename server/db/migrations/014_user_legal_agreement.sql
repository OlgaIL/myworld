alter table users
  add column if not exists legal_accepted_at timestamptz,
  add column if not exists legal_version text;

create index if not exists idx_users_legal_accepted_at
  on users (legal_accepted_at);
