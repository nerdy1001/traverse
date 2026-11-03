-- Nothing creates a real analysis until the parser is wired in, so these exist for
-- the dashboard to list. The organization ids are real Clerk organizations in the
-- development instance. The repositories and commits are made up, and the "seed"
-- owner says so. Safe to re-run.
insert into public.organizations (id) values
  ('org_3LavBR4IrfDvVOVpvaLrGZkMwKK'), -- Nerdy's team
  ('org_3LaxOoY9oGGdXWZfb6iQwMRROi6')  -- Traverse Seed B
on conflict (id) do nothing;

insert into public.projects (id, organization_id, owner, name) values
  ('a0000000-0000-4000-8000-000000000001', 'org_3LavBR4IrfDvVOVpvaLrGZkMwKK', 'seed', 'team-a-storefront'),
  ('a0000000-0000-4000-8000-000000000002', 'org_3LavBR4IrfDvVOVpvaLrGZkMwKK', 'seed', 'team-a-billing-api'),
  ('a0000000-0000-4000-8000-000000000003', 'org_3LavBR4IrfDvVOVpvaLrGZkMwKK', 'seed', 'team-a-worker'),
  ('b0000000-0000-4000-8000-000000000001', 'org_3LaxOoY9oGGdXWZfb6iQwMRROi6', 'seed', 'team-b-mobile-app'),
  ('b0000000-0000-4000-8000-000000000002', 'org_3LaxOoY9oGGdXWZfb6iQwMRROi6', 'seed', 'team-b-admin')
on conflict (id) do nothing;

insert into public.analyses (id, organization_id, project_id, status, commit_sha, error_message, created_at) values
  ('a1000000-0000-4000-8000-000000000001', 'org_3LavBR4IrfDvVOVpvaLrGZkMwKK', 'a0000000-0000-4000-8000-000000000001', 'complete', '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d', null, '2026-11-01 09:14:00+00'),
  ('a1000000-0000-4000-8000-000000000002', 'org_3LavBR4IrfDvVOVpvaLrGZkMwKK', 'a0000000-0000-4000-8000-000000000002', 'parsing', '2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e', null, '2026-11-02 16:40:00+00'),
  ('a1000000-0000-4000-8000-000000000003', 'org_3LavBR4IrfDvVOVpvaLrGZkMwKK', 'a0000000-0000-4000-8000-000000000003', 'failed', null, 'Seeded failure: archive could not be fetched.', '2026-11-03 08:05:00+00'),
  ('b1000000-0000-4000-8000-000000000001', 'org_3LaxOoY9oGGdXWZfb6iQwMRROi6', 'b0000000-0000-4000-8000-000000000001', 'complete', '3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f', null, '2026-10-28 11:22:00+00'),
  ('b1000000-0000-4000-8000-000000000002', 'org_3LaxOoY9oGGdXWZfb6iQwMRROi6', 'b0000000-0000-4000-8000-000000000002', 'queued', null, null, '2026-11-03 10:51:00+00')
on conflict (id) do nothing;
