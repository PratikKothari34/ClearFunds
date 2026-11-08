-- The year's headline (AGENTS.md rule 19): the most serious opinion ever received.
-- No later opinion supersedes an earlier one, whoever appointed its auditor.
begin;
select plan(9);

create temp table u (k text primary key, id uuid);
insert into u select k, gen_random_uuid()
  from unnest(array['pres', 'tre', 'sec', 'a1', 'a2', 'a3', 'a4', 'a5']) k;
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@h.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
select api_open_society(jsonb_build_object('id', 'soc_h', 'name', 'Headline CHS', 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@h.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@h.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'S', 'email', 'sec@h.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
create function pg_temp.fy() returns text language sql as $$
  select cf.fy_of('soc_h', (cf.fy_bounds('soc_h', cf.fy_of('soc_h', cf.today()))).starts - 1) $$;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Appoints this auditor for the year under an appointing set, and closes it.
-- Sets are disjoint unless a test says otherwise: that is the case the removed
-- exception fired on.
create function pg_temp.close(k text, n int, appointed_by uuid[], opinion text) returns bigint language plpgsql as $$
declare
  pid uuid := api_add_person('soc_h', k, k || '@h.test');
  i jsonb;
begin
  insert into public.auditor_appointments (society_id, person_id, fy, appointment_seq, appointing_set)
    values ('soc_h', pid, pg_temp.fy(), n, appointed_by);
  perform api_register_key(pg_temp.uid(k), 'soc_h', md5(k) || md5(k));
  i := api_close_intent(pg_temp.uid(k), 'soc_h', pg_temp.fy(), opinion, 'Stated reason ' || n);
  return api_close_year(pg_temp.uid(k), 'soc_h', pg_temp.fy(), opinion, 'Stated reason ' || n,
    (i->>'through_seq')::bigint, (i->>'key_seq')::bigint, repeat('ab', 64));
end
$$;
create function pg_temp.head() returns text language sql as $$
  select cf.year_opinions('soc_h', pg_temp.fy())->>'headline' $$;
create function pg_temp.head_seq() returns bigint language sql as $$
  select (cf.year_opinions('soc_h', pg_temp.fy())->>'headline_seq')::bigint $$;
create temp table s (k text primary key, seq bigint);

select is(pg_temp.head(), null, 'an unaudited year has no headline');

insert into s select 'adverse', pg_temp.close('a1', 101, array[gen_random_uuid()], 'adverse');
select is(pg_temp.head(), 'adverse', 'the first opinion is the headline');

-- The case rule 19 exists for: a committee cannot bury this by appointing again.
select pg_temp.close('a2', 102, array[gen_random_uuid()], 'clean');
select is(pg_temp.head(), 'adverse', 'a later clean from a differently appointed auditor does not supersede it');
select is(pg_temp.head_seq(), (select seq from s where k = 'adverse'), 'and headline_seq stays on the adverse entry');
select is(jsonb_array_length(cf.year_opinions('soc_h', pg_temp.fy())->'history'), 2, 'both opinions stay in the history');
select is((select string_agg((h->>'opinion') || ':' || (h->>'statement'), ',' order by (h->>'seq')::bigint)
             from jsonb_array_elements(cf.year_opinions('soc_h', pg_temp.fy())->'history') h),
  'adverse:Stated reason 101,clean:Stated reason 102', 'each with the auditor''s stated reason');

select pg_temp.close('a3', 103, array[gen_random_uuid()], 'qualified');
select is(pg_temp.head(), 'adverse', 'nor does a less serious one');

insert into s select 'disclaimer', pg_temp.close('a4', 104, array[gen_random_uuid()], 'disclaimer');
select is(pg_temp.head(), 'disclaimer', 'a disclaimer is more serious than adverse, so it takes the headline');

select pg_temp.close('a5', 105, array[gen_random_uuid()], 'disclaimer');
select is(pg_temp.head_seq(), (select seq from s where k = 'disclaimer'), 'of two equally serious, the earlier governs');

select * from finish();
rollback;
