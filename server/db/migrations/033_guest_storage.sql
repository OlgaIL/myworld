-- No accumulated documents/files are changed here. The reviewed transition CLI
-- migrates legacy rows, dates and files after its dry-run.
create table if not exists guest_document_claims (
  guest_document_id bigint primary key,
  guest_session_id bigint not null references guest_sessions(id),
  photo_id bigint references photos(id) on delete set null,
  user_id bigint not null references users(id),
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  source_path text
);
create index if not exists idx_guest_claims_photo on guest_document_claims(photo_id);
create index if not exists idx_guest_claims_session on guest_document_claims(guest_session_id);

create table if not exists guest_storage_retirements (
  storage_path text primary key,
  guest_session_id bigint references guest_sessions(id)
);

-- Compatibility for guest cards/links: results come from the single archive
-- document, with the original guest capability and expiration, not a text copy.
create or replace view guest_documents_visible as
  select * from guest_documents
  union all
  select (jsonb_populate_record(null::guest_documents,
    to_jsonb(p) || jsonb_build_object(
      'id', c.guest_document_id, 'guest_session_id', c.guest_session_id,
      'status', 'claimed', 'claimed_photo_id', p.id, 'claimed_at', c.claimed_at,
      'expires_at', c.expires_at
    ))).*
  from guest_document_claims c join photos p on p.id = c.photo_id;
