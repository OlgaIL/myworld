alter table photos
  add column if not exists formatted_content jsonb not null default '{}'::jsonb,
  add column if not exists formatted_at timestamptz;
