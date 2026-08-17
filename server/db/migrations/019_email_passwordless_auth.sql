alter table users
  add column if not exists email_verified_at timestamptz;

create table if not exists email_login_codes (
  id bigserial primary key,
  email_normalized text not null,
  code_hash text not null,
  request_ip_hash text not null,
  expires_at timestamptz not null,
  attempts_remaining integer not null default 5,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_login_codes_attempts_check check (attempts_remaining >= 0)
);

create index if not exists idx_email_login_codes_email_created_at
  on email_login_codes (email_normalized, created_at desc);

create index if not exists idx_email_login_codes_ip_created_at
  on email_login_codes (request_ip_hash, created_at desc);

create index if not exists idx_email_login_codes_expires_at
  on email_login_codes (expires_at);
