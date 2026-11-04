-- GitHub treats names case-insensitively, so one spelling is stored. Without this,
-- Vercel/Next.js and vercel/next.js would each get their own analysis.
alter table public.projects
  add constraint projects_lowercase_name check (owner = lower(owner) and name = lower(name));

alter table public.analyses
  -- What the current stage is doing, in words. Written with every stage change.
  add column stage_message text,
  add column failed_stage text
    check (failed_stage in ('fetching', 'selecting', 'parsing', 'storing')),
  -- A re-run reuses this row, so created_at can't say how old the current run is.
  add column started_at timestamptz not null default now(),
  add column adapter text,
  -- The parser's coverage report as it came out. It is only ever read whole.
  add column coverage jsonb;

update public.analyses
  set failed_stage = 'fetching'
  where status = 'failed' and failed_stage is null;

alter table public.analyses
  -- A failure that doesn't say why, or where, can't be written at all.
  add constraint analyses_failure_explained
    check (status <> 'failed' or (failed_stage is not null and error_message is not null)),
  -- One analysis per repository. Enforced here so two simultaneous submissions
  -- can't both create one.
  add constraint analyses_one_per_project unique (project_id);
