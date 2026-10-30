alter table table_processing_attempts
  add column model text,
  add column provider text,
  add column model_calls integer not null default 0 check (model_calls between 0 and 1),
  add column input_tokens bigint check (input_tokens >= 0),
  add column output_tokens bigint check (output_tokens >= 0),
  add column estimated_cost_rub numeric(18,8) check (estimated_cost_rub >= 0),
  add column unverified_cells integer not null default 0 check (unverified_cells >= 0);
