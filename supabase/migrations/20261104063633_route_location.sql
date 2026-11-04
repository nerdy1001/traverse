-- Two apps in one repository can both serve GET /. That is true of the code, so it
-- can't be a constraint violation: what repeats is a file claiming the same route twice.
alter table public.routes
  drop constraint routes_analysis_id_method_pattern_key,
  add constraint routes_analysis_id_file_id_method_pattern_key unique (analysis_id, file_id, method, pattern),
  -- Where the method was read from, so a route can be checked against the code.
  add column line integer not null check (line > 0);
