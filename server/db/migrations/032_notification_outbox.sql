create table if not exists notification_outbox (
  id bigserial primary key,
  event_type text not null check (event_type in ('user_registered', 'payment_succeeded', 'improvement_requested')),
  entity_id bigint not null,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  sent_at timestamptz,
  last_error text,
  unique (event_type, entity_id)
);

create index if not exists notification_outbox_pending_idx
  on notification_outbox (next_attempt_at, id) where sent_at is null;

create or replace function queue_user_registration_notification()
returns trigger language plpgsql as $$
begin
  insert into notification_outbox (event_type, entity_id)
  values ('user_registered', new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger notify_user_registration
after insert on users
for each row execute function queue_user_registration_notification();

create or replace function queue_payment_notification()
returns trigger language plpgsql as $$
begin
  if new.source = 'yookassa' and new.payment_id is not null then
    insert into notification_outbox (event_type, entity_id)
    values ('payment_succeeded', new.payment_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger notify_payment_succeeded
after insert on processing_credit_events
for each row execute function queue_payment_notification();

create or replace function queue_improvement_notification()
returns trigger language plpgsql as $$
begin
  insert into notification_outbox (event_type, entity_id)
  values ('improvement_requested', new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger notify_improvement_requested
after insert on recognition_improvement_requests
for each row execute function queue_improvement_notification();
