create table if not exists recognition_improvement_requests (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  photo_id bigint not null references photos(id) on delete cascade,
  status text not null default 'submitted',
  user_comment text not null default '',
  manual_review_consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint recognition_improvement_requests_status_check check (
    status in ('submitted', 'in_review', 'improved', 'not_improvable', 'cancelled')
  ),
  constraint recognition_improvement_requests_comment_length_check check (
    char_length(user_comment) <= 1000
  )
);

create unique index if not exists idx_recognition_improvement_requests_active_photo
  on recognition_improvement_requests (photo_id)
  where status in ('submitted', 'in_review');

create index if not exists idx_recognition_improvement_requests_user_created_at
  on recognition_improvement_requests (user_id, created_at desc);

create index if not exists idx_recognition_improvement_requests_status_created_at
  on recognition_improvement_requests (status, created_at asc);
