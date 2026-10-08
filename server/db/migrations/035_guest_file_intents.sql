-- Register exact paths before any guest upload/copy starts. No cascading FK:
-- recovery must survive deletion of its document, session or account.
create table guest_file_intents (
  id uuid primary key,
  kind text not null check (kind in ('upload', 'copy')),
  guest_session_id bigint,
  guest_document_id bigint,
  user_id bigint,
  source_path text,
  destination_path text not null,
  temporary_path text,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  constraint guest_file_intent_owner check (guest_session_id is not null or user_id is not null)
);
create index guest_file_intents_expiry on guest_file_intents(expires_at, id);
create index guest_file_intents_session on guest_file_intents(guest_session_id);
create index guest_file_intents_user on guest_file_intents(user_id);

-- Pending survives a crash between atomic claim and conditional enrichment.
alter table guest_document_claims add column enrichment_state text not null default 'pending'
  check (enrichment_state in ('pending', 'done', 'failed'));
