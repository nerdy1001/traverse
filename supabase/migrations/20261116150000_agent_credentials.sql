-- The agent reads one analysis with a credential naming that analysis and its
-- organization. Signing happens in here, with a key generated in here, so no
-- process outside Postgres holds anything that can mint one, and nothing in the
-- agent's path holds a key that reads everything. The read surface connects as
-- anon with only the publishable key; the policies below are what let a valid
-- credential see its analysis and nothing else.

-- Not exposed through the API, which is what makes its security-definer functions
-- safe to grant: the only way to call them is from inside a policy or a function.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- One row. Deleting and reinserting it revokes every outstanding credential.
create table private.agent_signing_key (
  only_row boolean primary key default true check (only_row),
  secret bytea not null default extensions.gen_random_bytes(32)
);
alter table private.agent_signing_key enable row level security;
revoke all on private.agent_signing_key from public, anon, authenticated;
insert into private.agent_signing_key default values;

create function private.base64url(data bytea)
returns text
language sql
immutable
set search_path = ''
as $$
  -- encode() wraps base64 every 76 characters; translate drops the newlines.
  select translate(rtrim(encode(data, 'base64'), '='), E'+/\n', '-_')
$$;

create function private.base64url_decode(data text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select decode(rpad(translate(data, '-_', '+/'), length(data) + (4 - length(data) % 4) % 4, '='), 'base64')
$$;

create function private.agent_signature(signing_input text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.base64url(extensions.hmac(convert_to(signing_input, 'utf8'), secret, 'sha256'))
  from private.agent_signing_key
$$;
revoke all on function private.agent_signature(text) from public, anon, authenticated;

-- Ten minutes covers a turn with several lookups; each new message gets a new one.
create function private.sign_agent_credential(analysis uuid, organization text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_seconds bigint := extract(epoch from now())::bigint;
  signing_input text :=
    private.base64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'utf8')) || '.' ||
    private.base64url(convert_to(jsonb_build_object(
      'aud', 'traverse-agent',
      'analysis', analysis,
      'org', organization,
      'iat', now_seconds,
      'exp', now_seconds + 600
    )::text, 'utf8'));
begin
  return signing_input || '.' || private.agent_signature(signing_input);
end;
$$;
revoke all on function private.sign_agent_credential(uuid, text) from public, anon;
grant execute on function private.sign_agent_credential(uuid, text) to authenticated;

-- Security invoker, so whether the asker may see this analysis is decided by the
-- members policy on analyses rather than by a check written here.
create function public.mint_agent_credential(analysis uuid)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  visible uuid;
  organization text;
begin
  select a.id, a.organization_id into visible, organization from public.analyses a where a.id = analysis;
  if visible is null then
    raise exception 'No analysis % visible to this session', analysis using errcode = 'P0002';
  end if;
  return private.sign_agent_credential(visible, organization);
end;
$$;
revoke all on function public.mint_agent_credential(uuid) from public, anon;
grant execute on function public.mint_agent_credential(uuid) to authenticated;

-- The credential's claims when its signature holds and it hasn't expired, else null,
-- which matches no row. The read surface sends it as a request header, and the
-- signature is checked before the payload is decoded, so a forged payload is never
-- parsed.
create function private.agent_credential()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  token text := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-agent-credential';
  parts text[] := string_to_array(token, '.');
  claims jsonb;
begin
  if token is null or cardinality(parts) <> 3 then
    return null;
  end if;
  if private.agent_signature(parts[1] || '.' || parts[2]) is distinct from parts[3] then
    return null;
  end if;
  claims := convert_from(private.base64url_decode(parts[2]), 'utf8')::jsonb;
  if claims ->> 'aud' is distinct from 'traverse-agent'
    or (claims ->> 'exp')::bigint <= extract(epoch from now()) then
    return null;
  end if;
  return claims;
end;
$$;
revoke all on function private.agent_credential() from public, authenticated;
grant execute on function private.agent_credential() to anon;

create function private.agent_analysis()
returns uuid
language sql
stable
set search_path = ''
as $$ select (private.agent_credential() ->> 'analysis')::uuid $$;

create function private.agent_organization()
returns text
language sql
stable
set search_path = ''
as $$ select private.agent_credential() ->> 'org' $$;

revoke all on function private.agent_analysis(), private.agent_organization() from public, authenticated;
grant execute on function private.agent_analysis(), private.agent_organization() to anon;

-- Read only, and only what the map is built from. Both claims are checked, so a row
-- has to belong to the named analysis and to the organization the credential was
-- minted for. The subselects make each claim evaluate once per query, not per row.
create policy "agent reads its credential's analysis" on public.analyses
  for select to anon
  using (id = (select private.agent_analysis()) and organization_id = (select private.agent_organization()));

create policy "agent reads its credential's files" on public.files
  for select to anon
  using (analysis_id = (select private.agent_analysis()) and organization_id = (select private.agent_organization()));

create policy "agent reads its credential's edges" on public.edges
  for select to anon
  using (analysis_id = (select private.agent_analysis()) and organization_id = (select private.agent_organization()));

create policy "agent reads its credential's routes" on public.routes
  for select to anon
  using (analysis_id = (select private.agent_analysis()) and organization_id = (select private.agent_organization()));

-- No analysis column, so the file decides; the files policy above applies inside too.
create policy "agent reads its credential's file roles" on public.file_roles
  for select to anon
  using (
    organization_id = (select private.agent_organization())
    and exists (select 1 from public.files f where f.id = file_roles.file_id)
  );

grant select on public.analyses, public.files, public.edges, public.routes, public.file_roles to anon;
