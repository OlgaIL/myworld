create table if not exists llm_attempt_events (
  id bigserial primary key,
  started_at timestamptz not null,
  audience text not null check (audience in ('guest', 'free', 'paid')),
  pipeline text not null check (pipeline in ('standard', 'fast')),
  provider text not null check (provider in ('yandex', 'openai')),
  trigger text not null check (trigger in ('upload', 'retry', 'claim')),
  input_kind text not null check (input_kind in ('text', 'image')),
  outcome text not null check (outcome in ('success', 'timeout', 'error')),
  duration_ms integer not null check (duration_ms >= 0)
);

create index if not exists llm_attempt_events_started_at_idx
  on llm_attempt_events (started_at);
