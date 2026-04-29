alter table guest_documents
  add column if not exists ocr_provider text,
  add column if not exists processed_at timestamptz,
  add column if not exists claimed_at timestamptz;
