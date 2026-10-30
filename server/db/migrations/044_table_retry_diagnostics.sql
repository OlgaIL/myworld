-- Safe metadata only: no document text, image, or raw model response.
-- Leave historical documents unchanged; an unknown previous model never
-- authorizes a quality retry.
alter table photos add column table_processing_context jsonb;
alter table table_processing_attempts add column validation_diagnostic jsonb;
