alter table guest_documents
  add column if not exists ai_provider text,
  add column if not exists title text not null default '',
  add column if not exists summary text not null default '',
  add column if not exists category text not null default '',
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists clean_text text not null default '',
  add column if not exists text_quality text not null default '',
  add column if not exists ai_notes text not null default '';
