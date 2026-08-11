alter table users
  add column if not exists acquisition_context jsonb,
  add column if not exists acquisition_captured_at timestamptz;
