-- Existing photos remain the independent units of content and accounting.
-- This migration changes neither photo contents nor historical counters.
alter table photos add constraint photos_id_user_unique unique (id, user_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references users(id) on delete cascade,
  title text not null default '',
  display_title text not null,
  summary text not null default '',
  category text not null default '',
  section text not null default '',
  topic text not null default '',
  tags jsonb not null default '[]'::jsonb,
  metadata_source_photo_id bigint references photos(id) on delete set null,
  metadata_state text not null default 'pending' check (metadata_state in ('pending', 'ready')),
  metadata_frozen boolean not null default false,
  structure_version bigint not null default 1 check (structure_version > 0),
  created_at timestamptz not null default now(),
  archive_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (metadata_source_photo_id, user_id) references photos(id, user_id)
    deferrable initially deferred
);
create index documents_user_archive on documents(user_id, archive_at desc, id);
create unique index documents_display_title_unique on documents(user_id, document_title_key(display_title));

create function assign_container_display_title() returns trigger language plpgsql as $$
declare base text; candidate text; suffix integer := 1;
begin
  if tg_op = 'UPDATE' and new.user_id = old.user_id
    and new.display_title is not distinct from old.display_title
    and document_title_key(new.title) = document_title_key(old.title) then return new; end if;
  perform pg_advisory_xact_lock(763658, hashtext(tg_table_schema || ':' || new.user_id::text));
  base := btrim(regexp_replace(coalesce(new.title, ''), '[[:space:]]+', ' ', 'g'));
  if base = '' then base := 'Запись'; end if;
  candidate := coalesce(nullif(btrim(new.display_title), ''), base);
  loop
    exit when not exists(select 1 from documents where user_id = new.user_id
      and id <> new.id and document_title_key(display_title) = document_title_key(candidate));
    suffix := suffix + 1;
    candidate := base || ' (' || suffix || ')';
  end loop;
  new.display_title := candidate;
  return new;
end $$;
create trigger documents_display_title before insert or update of title, display_title, user_id on documents
  for each row execute function assign_container_display_title();

create table document_pages (
  photo_id bigint primary key,
  user_id bigint not null,
  document_id uuid not null,
  position integer not null constraint document_pages_position_check check (position > 0),
  attached_at timestamptz not null default now(),
  foreign key (photo_id, user_id) references photos(id, user_id) on delete cascade deferrable initially deferred,
  foreign key (document_id, user_id) references documents(id, user_id) on delete cascade deferrable initially deferred,
  unique (document_id, position) deferrable initially deferred
);
create index document_pages_document on document_pages(document_id, position);

create table document_aliases (
  old_document_id uuid primary key,
  user_id bigint not null references users(id) on delete cascade,
  anchor_photo_id bigint not null,
  foreign key (anchor_photo_id, user_id) references photos(id, user_id) on delete cascade
);
create table document_operations (
  user_id bigint not null references users(id) on delete cascade,
  operation_id uuid not null,
  kind text not null,
  request_hash text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

-- Upload leases will be used by the upload stage. Structural operations already
-- respect them, so a future multi-request upload cannot lose its target.
create table document_upload_batches (
  id uuid primary key,
  user_id bigint not null references users(id) on delete cascade,
  mode text not null check (mode in ('separate', 'group', 'append', 'replace')),
  target_document_id uuid references documents(id) on delete set null,
  initial_structure_version bigint,
  state text not null default 'active' check (state in ('active', 'completed', 'partial', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  lease_until timestamptz not null,
  foreign key (target_document_id, user_id) references documents(id, user_id)
    deferrable initially deferred
);
create index document_upload_active on document_upload_batches(target_document_id, lease_until) where state = 'active';
create table document_upload_items (
  batch_id uuid not null references document_upload_batches(id) on delete cascade,
  item_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  name text not null,
  size bigint not null check (size >= 0),
  mime_type text not null,
  content_sha256 text,
  photo_id bigint unique references photos(id) on delete set null,
  state text not null default 'pending' check (state in ('pending', 'stored', 'error', 'cancelled')),
  error_code text,
  primary key (batch_id, item_id),
  unique (batch_id, ordinal)
);

insert into documents(id, user_id, title, display_title, summary, category, section, topic, tags,
  metadata_source_photo_id, metadata_state, created_at, archive_at, updated_at)
select gen_random_uuid(), user_id, title, display_title, summary, category, section, topic, tags,
  id, case when status in ('processed', 'no_text') then 'ready' else 'pending' end,
  created_at, created_at, updated_at from photos order by created_at, id;
insert into document_pages(photo_id, user_id, document_id, position)
select metadata_source_photo_id, user_id, id, 1 from documents;

-- Cover every writer, including legacy upload, guest claim and maintenance.
-- No application writer can commit a photo without its single-page container.
create function maintain_photo_container() returns trigger language plpgsql as $$
declare container_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into documents(user_id, title, display_title, summary, category, section, topic, tags,
      metadata_source_photo_id, metadata_state, created_at, archive_at, updated_at)
    values(new.user_id, new.title, new.display_title, new.summary, new.category, new.section, new.topic, new.tags,
      new.id, case when new.status in ('processed', 'no_text') then 'ready' else 'pending' end,
      new.created_at, new.created_at, new.updated_at) returning id into container_id;
    insert into document_pages(photo_id, user_id, document_id, position) values(new.id, new.user_id, container_id, 1);
  else
    -- Once a group has its snapshot, reordering/reprocessing cannot rewrite it.
    update documents d set title = new.title, display_title = new.display_title,
      summary = new.summary, category = new.category, section = new.section,
      topic = new.topic, tags = new.tags,
      metadata_state = case when new.status in ('processed', 'no_text') then 'ready' else d.metadata_state end,
      updated_at = now()
    where d.metadata_source_photo_id = new.id and d.user_id = new.user_id
      and (not d.metadata_frozen or d.metadata_state = 'pending');
  end if;
  return new;
end $$;
create trigger photos_container after insert or update of title, summary, category, section, topic, tags, status on photos
  for each row execute function maintain_photo_container();

-- Deleting a photo through an existing, guarded path also retires its now-empty
-- container. Moving a page uses UPDATE and explicit retirement, never deletion.
create function retire_empty_photo_container() returns trigger language plpgsql as $$
begin
  delete from documents d where d.id = old.document_id
    and not exists(select 1 from document_pages p where p.document_id = d.id);
  return old;
end $$;
create trigger document_pages_retire after delete on document_pages
  for each row execute function retire_empty_photo_container();

create function check_document_integrity() returns trigger language plpgsql as $$
declare photo bigint; containers uuid[];
begin
  if tg_table_name = 'photos' then
    photo := coalesce(new.id, old.id);
    containers := array(select document_id from document_pages where photo_id = photo);
  elsif tg_table_name = 'document_pages' then
    photo := coalesce(new.photo_id, old.photo_id);
    containers := array[new.document_id, old.document_id];
  else
    containers := array[new.id, old.id];
  end if;
  if photo is not null and exists(select 1 from photos p left join document_pages dp
    on dp.photo_id = p.id and dp.user_id = p.user_id where p.id = photo and dp.photo_id is null) then
    raise exception 'DOCUMENT_PAGE_REQUIRED' using errcode = '23514';
  end if;
  if exists(select 1 from documents d left join document_pages dp on dp.document_id = d.id
    where d.id = any(containers)
    group by d.id having count(dp.photo_id) = 0) then
    raise exception 'DOCUMENT_PAGE_COUNT' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger documents_integrity after insert or update on documents
  deferrable initially deferred for each row execute function check_document_integrity();
create constraint trigger document_pages_integrity after insert or update or delete on document_pages
  deferrable initially deferred for each row execute function check_document_integrity();
create constraint trigger photos_container_integrity after insert or update on photos
  deferrable initially deferred for each row execute function check_document_integrity();

-- Manual-review transitions participate in the same account protocol as
-- upload/OCR and structural changes, including admin-initiated transitions.
create function lock_document_review_account() returns trigger language plpgsql as $$
begin
  if not pg_try_advisory_xact_lock_shared(731242, hashtext(new.user_id::text)) then
    raise exception 'ACCOUNT_BUSY' using errcode = '55P03';
  end if;
  return new;
end $$;
create trigger improvement_request_document_lock before insert or update of status on recognition_improvement_requests
  for each row execute function lock_document_review_account();
