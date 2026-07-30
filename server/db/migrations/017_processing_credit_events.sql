create table if not exists processing_credit_events (
  id bigserial primary key,
  user_id integer not null references users(id) on delete cascade,
  payment_id bigint references payments(id) on delete set null,
  source text not null,
  package_title text not null,
  amount integer not null,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint processing_credit_events_source_check check (source in ('manual', 'yookassa')),
  constraint processing_credit_events_amount_check check (amount > 0)
);

create unique index if not exists idx_processing_credit_events_payment_id
  on processing_credit_events (payment_id)
  where payment_id is not null;

create index if not exists idx_processing_credit_events_created_at
  on processing_credit_events (created_at desc);

create index if not exists idx_processing_credit_events_user_created_at
  on processing_credit_events (user_id, created_at desc);
