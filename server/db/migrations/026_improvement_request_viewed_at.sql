alter table recognition_improvement_requests
  add column if not exists viewed_at timestamptz;
