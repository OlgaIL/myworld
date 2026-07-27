create table if not exists payments (
  id bigserial primary key,
  user_id integer not null references users(id) on delete cascade,
  provider text not null default 'yookassa',
  provider_payment_id text unique,
  idempotence_key text not null unique,
  package_title text not null,
  package_amount integer not null,
  amount_value numeric(10, 2) not null,
  currency text not null default 'RUB',
  status text not null default 'pending',
  confirmation_url text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint payments_provider_check check (provider in ('yookassa')),
  constraint payments_status_check check (status in ('pending', 'waiting_for_capture', 'succeeded', 'canceled', 'failed')),
  constraint payments_package_amount_check check (package_amount > 0),
  constraint payments_amount_value_check check (amount_value >= 0)
);

create index if not exists idx_payments_user_created_at
  on payments (user_id, created_at desc);

create index if not exists idx_payments_status_created_at
  on payments (status, created_at desc);
