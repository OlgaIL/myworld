-- An insert into payments holds a FK key-share lock on users. Deletion takes
-- FOR UPDATE before checking payments; RESTRICT also protects direct SQL and
-- the opposite race order. Never cascade a payment away with its account.
alter table payments drop constraint payments_user_id_fkey;
alter table payments add constraint payments_user_id_fkey
  foreign key (user_id) references users(id) on delete restrict;

-- Paid credits can survive incomplete payment history. Serialize creating or
-- changing them with the account lock, and protect direct user deletion too.
create function lock_credit_account() returns trigger language plpgsql as $$
begin
  perform id from users where id = new.user_id for key share;
  return new;
end;
$$;
create trigger lock_credit_account before insert or update on processing_credit_events
  for each row execute function lock_credit_account();

create function prevent_paid_account_deletion() returns trigger language plpgsql as $$
begin
  if exists (select 1 from processing_credit_events where user_id = old.id
    and (source <> 'manual' or payment_id is not null)) then
    raise exception 'ACCOUNT_PAID_CREDITS' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
create trigger prevent_paid_account_deletion before delete on users
  for each row execute function prevent_paid_account_deletion();

-- No account FK: the work must survive its deletion. Store no email/text.
create table account_deletion_jobs (
  id uuid primary key,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  removed_count integer not null default 0,
  preserved_count integer not null default 0
);
create table account_deletion_files (
  id bigserial primary key,
  job_id uuid not null references account_deletion_jobs(id) on delete cascade,
  storage_path text not null,
  attempts integer not null default 0,
  last_code text,
  unique (job_id, storage_path)
);
