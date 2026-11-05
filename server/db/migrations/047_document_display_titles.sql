-- Archive labels are separate from model titles and copied document contents.
alter table photos add column display_title text;
alter table guest_documents add column display_title text;

create function document_title_key(value text) returns text
language sql immutable parallel safe as $$
  select lower(btrim(regexp_replace(coalesce(value, ''), '[[:space:]]+', ' ', 'g')))
$$;

create function assign_document_display_title() returns trigger
language plpgsql as $$
declare
  owner_column text;
  owner_value text;
  previous_owner text;
  base_title text;
  candidate text;
  number integer := 1;
  occupied boolean;
begin
  owner_column := case when tg_table_name = 'photos' then 'user_id' else 'guest_session_id' end;
  owner_value := to_jsonb(new)->>owner_column;
  base_title := btrim(regexp_replace(coalesce(new.title, ''), '[[:space:]]+', ' ', 'g'));
  if base_title = '' then base_title := 'Запись'; end if;

  if tg_op = 'UPDATE' then
    previous_owner := to_jsonb(old)->>owner_column;
    if previous_owner = owner_value and old.display_title is not null
      and document_title_key(old.title) = document_title_key(new.title) then
      new.display_title := old.display_title;
      return new;
    end if;
  end if;

  -- All creation, reprocessing and guest-to-account transfer paths share this
  -- owner lock. Another account/session has an independent naming namespace.
  perform pg_advisory_xact_lock(763657, hashtext(tg_table_schema || ':' || tg_table_name || ':' || owner_value));
  candidate := base_title;
  if tg_op = 'INSERT' and nullif(btrim(new.display_title), '') is not null then
    candidate := new.display_title; -- Preserve a guest label when it is free.
  end if;

  loop
    execute format('select exists (select 1 from %I.%I where %I::text = $1
      and id::text is distinct from $2 and display_title is not null
      and document_title_key(display_title) = document_title_key($3))',
      tg_table_schema, tg_table_name, owner_column)
      into occupied using owner_value, new.id::text, candidate;
    exit when not occupied;
    number := number + 1;
    candidate := base_title || ' (' || number || ')';
  end loop;
  new.display_title := candidate;
  return new;
end
$$;

create trigger photos_display_title before insert or update of title, user_id on photos
for each row execute function assign_document_display_title();
create trigger guest_documents_display_title before insert or update of title, guest_session_id on guest_documents
for each row execute function assign_document_display_title();

-- Existing documents receive stable labels in upload order. Updating title to
-- itself assigns labels without changing OCR/model/document content.
do $$
declare record_id bigint;
begin
  for record_id in select id from photos order by created_at, id loop
    update photos set title = title where id = record_id;
  end loop;
  for record_id in select id from guest_documents order by created_at, id loop
    update guest_documents set title = title where id = record_id;
  end loop;
end
$$;

create unique index photos_display_title_unique on photos (user_id, document_title_key(display_title))
  where display_title is not null;
create unique index guest_documents_display_title_unique on guest_documents (guest_session_id, document_title_key(display_title))
  where display_title is not null;
