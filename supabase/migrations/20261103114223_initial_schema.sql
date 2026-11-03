-- Any table created in public gets row-level security from now on. A table with
-- RLS and no policy returns nothing, which is visible; a table without RLS returns
-- everything, silently. This is tracked here so a database rebuilt from migrations
-- has it too, and it has no exception handler so a failure aborts the CREATE TABLE.
create function public.enable_rls_on_new_table()
returns event_trigger
language plpgsql
set search_path = ''
as $$
declare
  created record;
begin
  for created in
    select object_identity
    from pg_event_trigger_ddl_commands()
    where schema_name = 'public'
      and object_type in ('table', 'partitioned table')
      and command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  loop
    execute format('alter table %s enable row level security', created.object_identity);
  end loop;
end;
$$;

create event trigger enable_rls_on_new_table
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.enable_rls_on_new_table();

-- Clerk owns organizations. This row exists so everything else has a real foreign
-- key to cascade from; the id is Clerk's, and the name stays on the token.
create table public.organizations (
  id text primary key,
  created_at timestamptz not null default now()
);

-- One row per repository, per organization.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  owner text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, owner, name),
  unique (id, organization_id)
);

-- Below this point foreign keys include organization_id, so a child row can't
-- claim a different organization from its parent and slip past that org's policy.
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'fetching', 'selecting', 'parsing', 'storing', 'complete', 'failed')),
  commit_sha text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade
);
create index analyses_project_id_organization_id_idx on public.analyses (project_id, organization_id);
-- Serves the dashboard's list: one organization's analyses, newest first.
create index analyses_organization_id_created_at_idx on public.analyses (organization_id, created_at desc);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  folder text not null,
  line_count integer not null check (line_count >= 0),
  content_hash text not null,
  unique (analysis_id, path),
  unique (id, organization_id),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade
);
create index files_organization_id_idx on public.files (organization_id);
create index files_analysis_id_organization_id_idx on public.files (analysis_id, organization_id);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  kind text not null check (kind in ('import', 're-export', 'dynamic-import', 'require')),
  unique (analysis_id, source_file_id, target_file_id, kind),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade,
  foreign key (source_file_id, organization_id)
    references public.files (id, organization_id) on delete cascade,
  foreign key (target_file_id, organization_id)
    references public.files (id, organization_id) on delete cascade
);
create index edges_organization_id_idx on public.edges (organization_id);
create index edges_analysis_id_organization_id_idx on public.edges (analysis_id, organization_id);
create index edges_source_file_id_organization_id_idx on public.edges (source_file_id, organization_id);
create index edges_target_file_id_organization_id_idx on public.edges (target_file_id, organization_id);

-- Method and pattern are both required: routes are exact or absent.
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null,
  pattern text not null,
  unique (analysis_id, method, pattern),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade,
  foreign key (file_id, organization_id)
    references public.files (id, organization_id) on delete cascade
);
create index routes_organization_id_idx on public.routes (organization_id);
create index routes_analysis_id_organization_id_idx on public.routes (analysis_id, organization_id);
create index routes_file_id_organization_id_idx on public.routes (file_id, organization_id);

-- Keyed on the content of what's explained and on the model, so re-pinning a model
-- invalidates only its own entries.
create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  subject_kind text not null check (subject_kind in ('file', 'folder')),
  subject_path text not null,
  content_hash text not null,
  model text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (analysis_id, subject_kind, subject_path, content_hash, model),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade
);
create index explanations_organization_id_idx on public.explanations (organization_id);
create index explanations_analysis_id_organization_id_idx on public.explanations (analysis_id, organization_id);

-- source records whether the path convention or the model assigned the role.
create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  file_id uuid not null,
  role text not null,
  source text not null check (source in ('convention', 'model')),
  unique (file_id),
  foreign key (file_id, organization_id)
    references public.files (id, organization_id) on delete cascade
);
create index file_roles_organization_id_idx on public.file_roles (organization_id);
create index file_roles_file_id_organization_id_idx on public.file_roles (file_id, organization_id);

-- paths rather than a file reference, because a cycle spans several files.
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  kind text not null check (kind in ('unimported', 'cycle', 'heavily-imported', 'oversized')),
  paths text[] not null check (cardinality(paths) > 0),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade
);
create index insights_organization_id_idx on public.insights (organization_id);
create index insights_analysis_id_organization_id_idx on public.insights (analysis_id, organization_id);

alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

-- The predicate is the whole authorization layer. Clerk's v2 session tokens carry
-- the organization at o.id and v1 tokens at org_id, so this follows the same two
-- places Clerk's own SDK reads. No active organization means null, which matches
-- nothing. The subselect makes Postgres evaluate the claim once, not once per row.
create policy "members read their organization" on public.organizations
  for select to authenticated
  using (id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members read their projects" on public.projects
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members read their analyses" on public.analyses
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members read their files" on public.files
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members read their edges" on public.edges
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members read their routes" on public.routes
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members read their explanations" on public.explanations
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members read their file roles" on public.file_roles
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members read their insights" on public.insights
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

-- Supabase's default privileges hand anon and authenticated everything. Nothing
-- writes through the API yet, so grant only what a policy exists for.
revoke all on
  public.organizations, public.projects, public.analyses, public.files, public.edges,
  public.routes, public.explanations, public.file_roles, public.insights
from anon, authenticated;

grant select on
  public.organizations, public.projects, public.analyses, public.files, public.edges,
  public.routes, public.explanations, public.file_roles, public.insights
to authenticated;

-- Fails the whole migration if anything in public ended up without RLS.
do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ') into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'Tables without row-level security: %', unprotected;
  end if;
end;
$$;
