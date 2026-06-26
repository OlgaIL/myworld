alter table photos
  add column if not exists section text not null default '',
  add column if not exists topic text not null default '';

alter table guest_documents
  add column if not exists section text not null default '',
  add column if not exists topic text not null default '';
