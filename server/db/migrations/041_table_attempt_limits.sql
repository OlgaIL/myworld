alter table photos add column table_attempts integer not null default 0
  check (table_attempts between 0 and 3);

-- Earlier per-document attempts were not tracked. A saved unsuccessful result
-- establishes at least one attempt; do not invent historical statistics.
update photos set table_attempts = 1 where table_status in ('review', 'error', 'no_tables');

create table table_processing_attempts (
  id bigserial primary key,
  photo_id bigint references photos(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null default 'running' check (outcome in ('running', 'success', 'failure')),
  result_status text,
  error_code text,
  duration_ms integer check (duration_ms >= 0)
);
create index table_processing_attempts_started_at_idx on table_processing_attempts(started_at);
