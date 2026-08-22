alter table recognition_improvement_requests
  add column if not exists original_ocr_text text not null default '',
  add column if not exists original_clean_text text not null default '',
  add column if not exists improved_text text not null default '',
  add column if not exists admin_comment text not null default '';

update recognition_improvement_requests rir
set
  original_ocr_text = p.ocr_text,
  original_clean_text = p.clean_text
from photos p
where p.id = rir.photo_id
  and rir.original_ocr_text = ''
  and rir.original_clean_text = '';

alter table recognition_improvement_requests
  drop constraint if exists recognition_improvement_requests_admin_comment_length_check;

alter table recognition_improvement_requests
  add constraint recognition_improvement_requests_admin_comment_length_check check (
    char_length(admin_comment) <= 2000
  );
