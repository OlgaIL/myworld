alter table photos
  add column if not exists clean_text text not null default '',
  add column if not exists category text not null default '',
  add column if not exists text_quality text not null default '',
  add column if not exists ai_notes text not null default '';
