-- Tasks (#15): a task gates who may start work and never approves; only the
-- president changes posts.
begin;
select plan(14);

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

select lives_ok($$select pg_temp.open()$$, 'the society opens');

-- ---- tasks gate who starts work
select throws_like($$select api_propose(pg_temp.uid('m2'), 'soc_s', '{"action":"expense","amount_minor":1000,
    "counterparty":"X","category":"repairs","narration":"Fix"}')$$,
  '%propose expenses is not one of your tasks%', 'a member without the task cannot propose an expense');
select lives_ok($$select api_propose(pg_temp.uid('tre'), 'soc_s', '{"action":"expense","amount_minor":1000,
    "counterparty":"X","category":"repairs","narration":"Fix"}')$$, 'the treasurer, holding it, can');
select is((select body->>'tier' from public.chain_entries where society_id = 'soc_s' and kind = 'proposal'),
  'pair', 'and the proposal still needs the pair: a task never approves');

grant select on u to authenticated;
set local role authenticated;
select pg_temp.as_('m1');
select lives_ok($$select api_add_person('soc_s', 'New Resident', 'nr@s.test')$$,
  'manage_residents lets a member add a person');
select pg_temp.as_('m2');
select throws_like($$select api_add_person('soc_s', 'Other', 'o@s.test')$$,
  '%manage residents is not one of your tasks%', 'without it, a seated member cannot');

-- ---- after open: only the president edits posts
select pg_temp.as_('sec');
select throws_like($$select api_set_post('soc_s', null, 'Sports', null, '[]')$$,
  '%only the president%', 'the secretary cannot change posts');
select pg_temp.as_('pres');
select lives_ok($$select api_set_post('soc_s', null, 'Member – Maintenance', pg_temp.pid('m2'), '["send_dues_reminders"]')$$,
  'the president creates a post for a member');
select throws_like($$select api_set_post('soc_s', (select post_id from public.posts where society_id = 'soc_s'
    and seat_role = 'treasurer'), 'Treasurer', pg_temp.pid('m1'), '[]')$$,
  '%changes only when the seat changes%', 'a fixed post cannot be handed to a member');
select throws_like($$select api_set_post('soc_s', null, 'Helper',
    (select id from public.people where society_id = 'soc_s' and email = 'nr@s.test'), '[]')$$,
  '%must hold that post''s seat%', 'a post''s holder must be seated');
select lives_ok($$select api_tour_done('soc_s')$$, 'the tour can be marked done');
select ok((api_me('soc_s')->>'tour_done_at') is not null, 'and api_me reports it');
reset role;

-- ---- the second post goes too when its holder is unseated
update public.committee_seats set unseated_seq = 999
 where society_id = 'soc_s' and person_id = pg_temp.pid('m2') and unseated_seq is null;
select is((select count(*)::int from public.chain_entries where society_id = 'soc_s' and kind = 'tasks_set'
             and actor is null and body->'holder' = 'null'::jsonb), 2,
  'unseating vacates every post the member held');
select ok(not cf.has_task('soc_s', pg_temp.pid('tre'), 'manage_residents'), 'a task not held is not had');

select * from finish();
rollback;
