alter table users
  add column if not exists last_processing_at timestamptz,
  add column if not exists first_device_type text,
  add column if not exists first_device_os text,
  add column if not exists first_device_browser text,
  add column if not exists metrika_client_id text,
  add column if not exists documents_created_total integer not null default 0,
  add column if not exists documents_deleted_total integer not null default 0,
  add column if not exists documents_history_complete boolean not null default false;

update users u
set documents_created_total = greatest(
  u.documents_created_total,
  (select count(*)::int from photos p where p.user_id = u.id)
);

alter table users
  alter column documents_history_complete set default true;

alter table users
  drop constraint if exists users_documents_created_total_check,
  drop constraint if exists users_documents_deleted_total_check,
  drop constraint if exists users_first_device_type_check;

alter table users
  add constraint users_documents_created_total_check check (documents_created_total >= 0),
  add constraint users_documents_deleted_total_check check (documents_deleted_total >= 0),
  add constraint users_first_device_type_check check (
    first_device_type is null or first_device_type in ('mobile', 'desktop', 'tablet', 'unknown')
  );

create index if not exists idx_users_metrika_client_id
  on users (metrika_client_id)
  where metrika_client_id is not null;
