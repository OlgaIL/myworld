alter table guest_documents
  add column if not exists claimed_photo_id bigint references photos(id) on delete set null;

update guest_documents gd
set claimed_photo_id = p.id
from photos p
where gd.status = 'claimed'
  and gd.claimed_photo_id is null
  and p.filename = gd.filename;

create index if not exists idx_guest_documents_claimed_photo_id
  on guest_documents (claimed_photo_id);
