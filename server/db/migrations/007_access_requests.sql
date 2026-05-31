create table if not exists access_requests (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  email text not null,
  message text not null default '',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_requests_status_check check (
    status in ('new', 'reviewed', 'approved', 'rejected')
  )
);

create index if not exists idx_access_requests_user_created_at
  on access_requests (user_id, created_at desc);

create index if not exists idx_access_requests_status_created_at
  on access_requests (status, created_at desc);
