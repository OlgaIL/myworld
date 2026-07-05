alter table users
  add column if not exists processing_mode text;

alter table users
  drop constraint if exists users_processing_mode_check;

alter table users
  add constraint users_processing_mode_check
  check (processing_mode is null or processing_mode in ('fast', 'standard'));
