-- One user attempt can make one full-page call and at most four isolated
-- table repairs. Keep every actual call visible in metrics; no document data.
alter table table_processing_attempts
  drop constraint table_processing_attempts_model_calls_check,
  add constraint table_processing_attempts_model_calls_check
    check (model_calls between 0 and 5);
