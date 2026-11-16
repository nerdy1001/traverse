-- Files no convention identified are labelled by the model between parsing and storing,
-- so the roles are stored with the files rather than patched onto them afterwards.
alter table public.analyses
  drop constraint analyses_status_check,
  add constraint analyses_status_check
    check (status in ('queued', 'fetching', 'selecting', 'parsing', 'labelling', 'storing', 'complete', 'failed')),
  drop constraint analyses_failed_stage_check,
  add constraint analyses_failed_stage_check
    check (failed_stage in ('fetching', 'selecting', 'parsing', 'labelling', 'storing'));
