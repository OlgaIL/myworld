create table if not exists guest_sessions (
  id bigserial primary key,
  session_token text not null unique,
  documents_used integer not null default 0,
  ip_hash text,
  user_agent_hash text,
  converted_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint guest_sessions_documents_used_check check (documents_used >= 0)
);

create table if not exists guest_documents (
  id bigserial primary key,
  guest_session_id bigint not null references guest_sessions(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  status text not null default 'uploaded',
  ocr_provider text,
  ocr_text text not null default '',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz not null,
  constraint guest_documents_status_check check (
    status in ('uploaded', 'processing', 'processed', 'no_text', 'error', 'claimed')
  )
);

create index if not exists idx_guest_sessions_token on guest_sessions (session_token);
create index if not exists idx_guest_documents_session_created_at on guest_documents (guest_session_id, created_at desc);
create index if not exists idx_guest_documents_expires_at on guest_documents (expires_at);
create index if not exists idx_guest_documents_status on guest_documents (status);
