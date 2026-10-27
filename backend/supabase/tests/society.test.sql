-- The society lifecycle (#15): what opening chains, that nothing writes
-- before it, and that a seat change moves a post's holder in the chain.
begin;
select plan(16);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('m1', gen_random_uuid()), ('m2', gen_random_uuid()), ('res', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@s.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.pid(k text) returns uuid language sql as $$ select cf.person(pg_temp.uid(k), 'soc_s') $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.open(extra jsonb default '{}') returns text language sql as $$
  select api_open_society(jsonb_build_object('id', 'soc_s', 'name', 'Setup CHS', 'approval_limit_minor', 1000000,
    'committee', jsonb_build_array(
      jsonb_build_object('name', 'P', 'email', 'pres@s.test', 'role', 'president'),
      jsonb_build_object('name', 'T', 'email', 'tre@s.test', 'role', 'treasurer',
        'tasks', jsonb_build_array('raise_monthly_charges', 'propose_expenses', 'propose_expenses')),
      jsonb_build_object('name', 'S', 'email', 'sec@s.test', 'role', 'secretary',
        'tasks', jsonb_build_array('respond_to_flags')),
      jsonb_build_object('name', 'M1', 'email', 'm1@s.test', 'post_title', 'Joint Secretary',
        'tasks', jsonb_build_array('manage_residents')),
      jsonb_build_object('name', 'M2', 'email', 'm2@s.test')),
    'minutes', jsonb_build_object('file_name', 'AGM minutes.pdf', 'media_type', 'application/pdf',
      'size_bytes', 4821, 'sha256', repeat('cd', 32))) || extra)
$$;

-- ---- before open
insert into public.societies (id, name) values ('soc_d', 'Draft CHS');
select is((select status from public.societies where id = 'soc_d'), 'draft', 'a new society starts as a draft');
select throws_like($$select api_propose(gen_random_uuid(), 'soc_d', '{"action":"expense"}')$$,
  '%not open yet%', 'a draft society refuses every write');
select throws_like($$select pg_temp.open('{"minutes": null}')$$, '%election minutes%',
  'opening without the minutes is refused');
select throws_like($$select pg_temp.open(jsonb_build_object('committee', jsonb_build_array(
    jsonb_build_object('name', 'A', 'email', 'a@s.test', 'role', 'president'),
    jsonb_build_object('name', 'B', 'email', 'b@s.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'C', 'email', 'c@s.test', 'role', 'treasurer'))))$$,
  '%exactly one president, one treasurer and one secretary%', 'two treasurers are refused');
select throws_like($$select pg_temp.open(jsonb_build_object('committee', jsonb_build_array(
    jsonb_build_object('name', 'A', 'email', 'a@s.test', 'role', 'president'),
    jsonb_build_object('name', 'B', 'email', 'b@s.test', 'role', 'treasurer', 'tasks', '["approve_alone"]'::jsonb),
    jsonb_build_object('name', 'C', 'email', 'c@s.test', 'role', 'secretary'))))$$,
  '%unknown task approve_alone%', 'a task outside the catalogue is refused');
select throws_like($$select cf.tasks('"manage_residents"')$$, '%must be a list%', 'tasks must be a list');
select is((select count(*)::int from public.chain_entries where society_id = 'soc_s'), 0,
  'a refused open leaves nothing chained');

-- ---- open
select lives_ok($$select pg_temp.open()$$, 'the society opens');
select is((select status from public.societies where id = 'soc_s'), 'open', 'and is open');
select is((select kind || ':' || (body->>'purpose') from public.chain_entries where society_id = 'soc_s' and sequence = 2),
  'document_attached:election_minutes', 'sequence 2 is the election minutes');
select is((select actor from public.chain_entries where society_id = 'soc_s' and sequence = 2),
  pg_temp.pid('pres')::text, 'the president attaches the minutes');
select is((select count(*)::int from public.chain_entries where society_id = 'soc_s' and kind = 'tasks_set'
             and actor = pg_temp.pid('pres')::text), 5, 'one tasks_set per post, by the president');
select is((select body->'tasks' from public.chain_entries where society_id = 'soc_s' and kind = 'tasks_set'
             and body->>'seat_role' = 'treasurer'), '["propose_expenses", "raise_monthly_charges"]'::jsonb,
  'tasks are chained distinct and in byte order, whatever order they were given in');
select is((select post_title from public.posts where society_id = 'soc_s' and holder = pg_temp.pid('m1')),
  'Joint Secretary', 'a custom post is a title over a member seat');
select throws_like($$select pg_temp.open()$$, '%already open%', 'a society opens once');

-- ---- an unseat moves the holder, recorded with the actor absent
update public.committee_seats set unseated_seq = 999
 where society_id = 'soc_s' and person_id = pg_temp.pid('m2') and unseated_seq is null;
select is((select count(*)::int from public.chain_entries where society_id = 'soc_s' and kind = 'tasks_set'
             and actor is null and body->'holder' = 'null'::jsonb), 1,
  'unseating vacates the member''s post in the chain, actor absent');

select * from finish();
rollback;
