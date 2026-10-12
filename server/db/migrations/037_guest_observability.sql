-- Technical history only; deliberately no foreign keys to user content.
create table guest_statistics_collection (id boolean primary key default true check (id), started_at timestamptz not null default now());
insert into guest_statistics_collection default values;
create table guest_activity_events (
  operation_id uuid not null,
  kind text not null check (kind in ('upload','outcome','ttl_document')),
  outcome text check (outcome in ('processed','recognized','no_text','error')),
  occurred_at timestamptz not null default now(),
  primary key (operation_id, kind)
);
create index guest_activity_time on guest_activity_events (occurred_at);
alter table guest_documents add column statistics_upload_id uuid;
alter table guest_documents add column statistics_processing_id uuid;
create function record_guest_activity() returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' or (NEW.statistics_upload_id is not null and NEW.statistics_upload_id is distinct from OLD.statistics_upload_id) then
    NEW.statistics_upload_id := gen_random_uuid();
    NEW.statistics_processing_id := gen_random_uuid();
    insert into guest_activity_events(operation_id,kind) values (NEW.statistics_upload_id,'upload');
  elsif NEW.status = 'processing' and OLD.status is distinct from 'processing' then
    NEW.statistics_processing_id := gen_random_uuid();
  end if;
  if NEW.status in ('processed','recognized','no_text','error') and NEW.statistics_processing_id is not null then
    insert into guest_activity_events(operation_id,kind,outcome)
    values (NEW.statistics_processing_id,'outcome',NEW.status) on conflict do nothing;
  end if;
  return NEW;
end $$;
create trigger guest_activity before insert or update on guest_documents for each row execute function record_guest_activity();
create table guest_cleanup_runs (
  id uuid primary key,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  lock_pid integer,
  finished_at timestamptz,
  state text not null check (state in ('running','success','errors','busy')),
  counters jsonb not null default '{}',
  incomplete boolean not null default false
);
create index guest_cleanup_runs_time on guest_cleanup_runs(started_at);
create table guest_file_deletions (
  operation_key text primary key,
  file_key text not null,
  run_id uuid,
  category text not null check (category in ('ttl','source','artifact')),
  started_at timestamptz not null default now(),
  confirmed_at timestamptz,
  result text not null check (result in ('pending','removed','missing','unknown')),
  incomplete boolean not null default false
);
create index guest_file_deletions_time on guest_file_deletions(confirmed_at);
create index guest_file_deletions_file on guest_file_deletions(file_key, started_at desc);
