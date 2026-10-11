-- Extend only the provider constraint; keep all existing attempt rows intact.
alter table llm_attempt_events drop constraint llm_attempt_events_provider_check;
alter table llm_attempt_events add constraint llm_attempt_events_provider_check
  check (provider in ('yandex', 'openai', 'timeweb'));
