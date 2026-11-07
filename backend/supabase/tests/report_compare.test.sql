-- A year's report beside the year before (#67): the same figures as
-- api_report for both years, every category from either year, and a reversal
-- counted in the year it was posted (AGENTS.md item 7).
begin;
select plan(9);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('own', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@y.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
select api_open_society(jsonb_build_object('id', 'soc_y', 'name', 'Year CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@y.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@y.test', 'role', 'treasurer', 'tasks', '["propose_expenses"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@y.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));

-- Propose as the treasurer and post with the secretary: the pair.
create function pg_temp.post(p jsonb) returns bigint language plpgsql as $$
declare s bigint; k text;
begin
  s := (api_propose(pg_temp.uid('tre'), 'soc_y', p)->>'seq')::bigint;
  foreach k in array array['tre', 'sec'] loop
    perform api_register_key(pg_temp.uid(k), 'soc_y', md5(k) || md5(k));
    perform api_cast(pg_temp.uid(k), 'soc_y', s, 'approve',
      (cf.latest_key('soc_y', cf.person(pg_temp.uid(k), 'soc_y'))).sequence, repeat('ab', 64));
  end loop;
  return (select sequence from chain_entries where society_id = 'soc_y' and kind = 'posting' and (body->>'proposal_seq')::bigint = s);
end $$;
create function pg_temp.spend(category text, amt bigint, d date) returns bigint language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'expense', 'amount_minor', amt, 'counterparty', 'Vendor',
    'category', category, 'narration', category, 'business_date', d)) $$;

create temp table fy as select cf.fy_of('soc_y', cf.today()) as this, cf.fy_of('soc_y', (cf.today() - interval '1 year')::date) as prev;
create temp table posted (k text primary key, seq bigint);
select pg_temp.spend('repairs', 500000, (cf.today() - interval '1 year')::date);
select pg_temp.spend('audit', 200000, (cf.today() - interval '1 year')::date);
insert into posted select 'lift', pg_temp.spend('lift', 90000, (cf.today() - interval '1 year')::date);
select pg_temp.spend('repairs', 700000, cf.today());
select pg_temp.spend('security', 300000, cf.today());
-- Reversed this year: an expense posted last year.
select pg_temp.post(jsonb_build_object('action', 'reversal', 'target_seq', (select seq from posted where k = 'lift'),
  'reason', 'Billed twice', 'narration', 'Reverse the lift bill'));

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temp table c as select api_report_compare('soc_y', (select this from fy)) as r;
create function pg_temp.row_(side text, cat text) returns text language sql as $$
  select (x->>'this_minor') || '/' || (x->>'previous_minor') || '/' || (x->>'change_minor')
    from c, jsonb_array_elements(r->side) x where x->>'category' = cat $$;

select is((select r->>'previous_fy' from c), (select prev from fy), 'the previous year is the one before');
select is(pg_temp.row_('expenditure', 'repairs'), '700000/500000/200000', 'a category in both years, with the change');
select is(pg_temp.row_('expenditure', 'audit'), '0/200000/-200000', 'a category only last year shows 0 this year');
select is(pg_temp.row_('expenditure', 'security'), '300000/0/300000', 'and one only this year shows 0 last year');
select is(pg_temp.row_('expenditure', 'lift'), '-90000/90000/-180000',
  'a reversal counts in the year it was posted, not the year it corrects');
select is((select r->'totals'->'expenditure' from c),
  jsonb_build_object('this_minor', (api_report('soc_y', (select this from fy))->'income_expenditure'->>'total_expenditure_minor')::bigint,
    'previous_minor', (api_report('soc_y', (select prev from fy))->'income_expenditure'->>'total_expenditure_minor')::bigint,
    'change_minor', (api_report('soc_y', (select this from fy))->'income_expenditure'->>'total_expenditure_minor')::bigint
                  - (api_report('soc_y', (select prev from fy))->'income_expenditure'->>'total_expenditure_minor')::bigint),
  'totals are exactly api_report''s for both years');
select is((select string_agg(x->>'category', ',' order by o) from c, jsonb_array_elements(r->'expenditure') with ordinality e(x, o)),
  'repairs,security,audit,lift', 'sorted by this year, then last year, both descending');

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('own'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_like($$select api_report_compare('soc_y', '2025-26')$$, '%not a member%', 'a stranger reads nothing');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_like($$select api_report_compare('soc_y', '2025')$$, '%must look like 2025-26%', 'a malformed year is refused');

select * from finish();
rollback;
