alter table users
  add column if not exists processing_enabled boolean not null default false,
  add column if not exists processing_quota integer not null default 0,
  add column if not exists processing_used integer not null default 0;

alter table users
  drop constraint if exists users_processing_quota_check;

alter table users
  add constraint users_processing_quota_check check (processing_quota >= 0);

alter table users
  drop constraint if exists users_processing_used_check;

alter table users
  add constraint users_processing_used_check check (processing_used >= 0);
