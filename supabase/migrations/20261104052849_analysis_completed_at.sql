-- When the current map was finished. Left empty on runs that finished before this
-- column existed: started_at would only be a guess at it, and the dashboard would show
-- that guess as fact. Only a complete analysis can have one, so a re-run has to clear it.
alter table public.analyses
  add column completed_at timestamptz,
  add constraint analyses_completed_only_when_complete
    check (status = 'complete' or completed_at is null);
