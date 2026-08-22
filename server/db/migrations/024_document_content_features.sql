alter table photos
  add column if not exists has_table boolean not null default false,
  add column if not exists has_formulas boolean not null default false;

alter table guest_documents
  add column if not exists formatted_content jsonb not null default '{}'::jsonb,
  add column if not exists formatted_at timestamptz,
  add column if not exists has_table boolean not null default false,
  add column if not exists has_formulas boolean not null default false;
