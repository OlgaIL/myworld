alter table recognition_improvement_requests
  add column if not exists consent_version text not null default '2026-08-21';
