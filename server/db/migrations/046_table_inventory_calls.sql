-- A page overview, up to ten complete table parts, and one targeted repair.
alter table table_processing_attempts
  drop constraint table_processing_attempts_model_calls_check,
  add constraint table_processing_attempts_model_calls_check
    check (model_calls between 0 and 12);
