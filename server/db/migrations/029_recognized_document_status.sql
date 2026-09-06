alter table photos drop constraint if exists photos_status_check;

alter table photos add constraint photos_status_check check (
  status in ('uploaded', 'processing', 'processed', 'recognized', 'no_text', 'error')
);

alter table guest_documents drop constraint if exists guest_documents_status_check;

alter table guest_documents add constraint guest_documents_status_check check (
  status in ('uploaded', 'processing', 'processed', 'recognized', 'no_text', 'error', 'claimed')
);
