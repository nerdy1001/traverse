-- Members can write within the organization on their token. WITH CHECK on update
-- stops a row being moved to another organization, and the composite foreign keys
-- stop a row attaching to another organization's parent.

-- Insert only, so a first analysis can create the row its foreign keys need, and
-- only for the organization on the token. There is no update policy because there
-- is nothing to update. There is no delete policy because the delete cascades
-- through everything the team owns, and that shouldn't be open to every member.
create policy "members create their organization" on public.organizations
  for insert to authenticated
  with check (id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their projects" on public.projects
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members update their projects" on public.projects
  for update to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members delete their projects" on public.projects
  for delete to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their analyses" on public.analyses
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members update their analyses" on public.analyses
  for update to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members delete their analyses" on public.analyses
  for delete to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their files" on public.files
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members update their files" on public.files
  for update to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members delete their files" on public.files
  for delete to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their edges" on public.edges
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members update their edges" on public.edges
  for update to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members delete their edges" on public.edges
  for delete to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their routes" on public.routes
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members update their routes" on public.routes
  for update to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members delete their routes" on public.routes
  for delete to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their explanations" on public.explanations
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members update their explanations" on public.explanations
  for update to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members delete their explanations" on public.explanations
  for delete to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their file roles" on public.file_roles
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members update their file roles" on public.file_roles
  for update to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members delete their file roles" on public.file_roles
  for delete to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their insights" on public.insights
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members update their insights" on public.insights
  for update to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')))
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));
create policy "members delete their insights" on public.insights
  for delete to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

grant insert on public.organizations to authenticated;

grant insert, update, delete on
  public.projects, public.analyses, public.files, public.edges,
  public.routes, public.explanations, public.file_roles, public.insights
to authenticated;
