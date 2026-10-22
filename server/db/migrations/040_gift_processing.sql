alter table users
  add column gift_processing_quota integer not null default 0,
  add column gift_processing_used integer not null default 0,
  add constraint users_gift_processing_check check
    (gift_processing_quota >= 0 and gift_processing_used >= 0 and gift_processing_used <= gift_processing_quota);

create table gift_processing_events (
  id uuid primary key,
  user_id integer not null references users(id) on delete cascade,
  amount integer not null check (amount between 1 and 10000),
  note text not null check (length(btrim(note)) between 1 and 500),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index gift_processing_events_user_created on gift_processing_events(user_id, created_at desc);
