-- Private first-OCR data. Kept out of photos-metadata and removed with its owner.
create table document_ocr_layouts (
  id bigserial primary key,
  photo_id bigint unique references photos(id) on delete cascade,
  guest_document_id bigint unique references guest_documents(id) on delete cascade,
  artifact jsonb not null check (jsonb_typeof(artifact) = 'object'),
  created_at timestamptz not null default now(),
  check (num_nonnulls(photo_id, guest_document_id) = 1)
);

alter table photos add column table_retry_after timestamptz;
