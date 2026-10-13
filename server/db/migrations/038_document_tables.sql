alter table photos
  add column table_content jsonb,
  add column table_status text not null default 'not_started',
  add column table_error_code text,
  add column table_extracted_at timestamptz,
  add constraint photos_table_status_check
    check (table_status in ('not_started', 'ready', 'review', 'error', 'no_tables'));

alter table llm_attempt_events drop constraint llm_attempt_events_trigger_check;
alter table llm_attempt_events add constraint llm_attempt_events_trigger_check
  check (trigger in ('upload', 'retry', 'claim', 'tables'));
