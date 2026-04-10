create table if not exists users (
  id bigserial primary key,
  google_id text not null unique,
  email text,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists photos (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  status text not null default 'uploaded',
  ocr_provider text,
  ai_provider text,
  ocr_text text not null default '',
  title text not null default '',
  summary text not null default '',
  tags jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint photos_status_check check (
    status in ('uploaded', 'processing', 'processed', 'no_text', 'error')
  )
);

create index if not exists idx_users_google_id on users (google_id);
create index if not exists idx_photos_user_created_at on photos (user_id, created_at desc);
create index if not exists idx_photos_status on photos (status);
