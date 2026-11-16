-- What the model said about a file's role, kept apart from file_roles because a re-run
-- clears those. Keyed on content and on the pinned model, so re-pinning one only
-- invalidates its own entries. 'none' is a real answer: the model was asked and no role
-- fitted, and asking again would cost the same to learn the same.
create table public.role_labels (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  content_hash text not null,
  model text not null,
  role text not null
    check (role in ('service', 'repository', 'model', 'util', 'config', 'component', 'hook', 'none')),
  created_at timestamptz not null default now(),
  unique (organization_id, content_hash, model)
);

alter table public.role_labels enable row level security;

create policy "members read their role labels" on public.role_labels
  for select to authenticated
  using (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

create policy "members create their role labels" on public.role_labels
  for insert to authenticated
  with check (organization_id = (select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')));

revoke all on public.role_labels from anon, authenticated;
grant select, insert on public.role_labels to authenticated;

-- Structural roles decide the route table and the entry-point colouring, and convention
-- owns them. Held here as well as in code, so no bug in the app can write one for the model.
alter table public.file_roles
  add constraint file_roles_model_roles_not_structural
    check (source <> 'model' or role in ('service', 'repository', 'model', 'util', 'config', 'component', 'hook'));
