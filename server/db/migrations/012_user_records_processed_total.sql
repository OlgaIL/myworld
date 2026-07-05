alter table users
  add column if not exists records_processed_total integer not null default 0;

alter table users
  drop constraint if exists users_records_processed_total_check;

alter table users
  add constraint users_records_processed_total_check check (records_processed_total >= 0);

update users
set records_processed_total = greatest(
  records_processed_total,
  coalesce((
    select count(*)::int
    from photos
    where photos.user_id = users.id
      and photos.status = 'processed'
  ), 0)
);
