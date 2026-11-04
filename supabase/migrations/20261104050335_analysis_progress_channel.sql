-- Progress reaches the browser as a broadcast on one private channel per analysis:
-- analysis:<uuid>:progress. Realtime has no channel registry to enter this in. The
-- policy below is what declares it: its pattern is the only topic members can join.

-- Publishes the stage and its message, not the row, so a subscriber has nothing to
-- filter and sees no column it wasn't meant to. Security definer because publishing
-- writes to realtime.messages, which whoever updates the row shouldn't need rights on.
create function public.publish_analysis_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'stage', new.status,
      'message', case when new.status = 'failed' then new.error_message else new.stage_message end,
      'failedStage', new.failed_stage
    ),
    'stage',
    'analysis:' || new.id::text || ':progress',
    true
  );
  return new;
end;
$$;

revoke all on function public.publish_analysis_stage() from public, anon, authenticated;

-- On our own table. Only when what's published changed, so recording the commit
-- part-way through a stage doesn't announce anything.
create trigger analyses_publish_stage
  after update of status, stage_message on public.analyses
  for each row
  when (old.status is distinct from new.status or old.stage_message is distinct from new.stage_message)
  execute function public.publish_analysis_stage();

-- Who may subscribe follows from who may read the analysis. The subquery runs as the
-- subscriber, so the policy on public.analyses is what keeps another organization's
-- channel out: its row isn't there to match. The pattern check comes first because
-- the topic is whatever the client asked for, and casting that to uuid could raise.
create policy "members subscribe to their analyses" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and exists (
      select 1
      from public.analyses a
      where a.id = (
        select case
          when realtime.topic() ~ '^analysis:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:progress$'
          then split_part(realtime.topic(), ':', 2)::uuid
        end
      )
    )
  );
