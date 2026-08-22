alter table photos
  add column if not exists has_recognition_errors boolean not null default false;

alter table guest_documents
  add column if not exists has_recognition_errors boolean not null default false;

update photos
set has_recognition_errors = true
where text_quality in ('low_confidence', 'no_meaningful_text')
   or coalesce(ai_notes, '') ~* '(ocr|ошибк.*распозна|неразборчив|нечитаем|непонятн.*символ|искажен)';

update guest_documents
set has_recognition_errors = true
where text_quality in ('low_confidence', 'no_meaningful_text')
   or coalesce(ai_notes, '') ~* '(ocr|ошибк.*распозна|неразборчив|нечитаем|непонятн.*символ|искажен)';
