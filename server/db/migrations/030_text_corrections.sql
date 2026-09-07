alter table photos
  add column if not exists corrections jsonb not null default '[]'::jsonb;

alter table guest_documents
  add column if not exists corrections jsonb not null default '[]'::jsonb;
