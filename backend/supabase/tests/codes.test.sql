-- Sign-in codes (#16): the same answer for every ID, known or not, and a
-- lock after repeated wrong codes.
begin;
select plan(4);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('m1', gen_random_uuid()), ('res', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@i.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.pid(k text) returns uuid language sql as $$ select cf.person(pg_temp.uid(k), 'soc_i') $$;
select api_open_society(jsonb_build_object('id', 'soc_i', 'name', 'Green Valley Co-op Housing Society',
  'approval_limit_minor', 100000, 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@i.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@i.test', 'role', 'treasurer', 'tasks', '["propose_expenses"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@i.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@i.test', 'post_title', 'Joint Secretary (Admin)')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_i', 1, 'A-101'), ('soc_i', 2, 'B 7');
-- Residents are added the way the seed adds them: as the service.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select api_add_tenure('soc_i', api_add_person('soc_i', 'Riya Shah', 'riya@i.test'), (select id from flats where label = 'A-101'), 'owner');

select is(public.api_auth_request('riya.a101@greenvalley.com'), 'riya@i.test', 'a code for an active ID goes to the personal email');
select is(public.api_auth_request('nobody@greenvalley.com'), null, 'an unknown ID gets no email and no error');
select throws_like($$select public.api_auth_request('nobody@greenvalley.com')$$, '%Wait a minute%',
  'the wait applies to unknown IDs too, so it reveals nothing');
select public.api_auth_result('treasurer@greenvalley.com', false) from generate_series(1, 5);
select throws_like($$select public.api_auth_verify('treasurer@greenvalley.com')$$, '%Too many attempts%',
  'five wrong codes lock the ID for a while');

select * from finish();
rollback;
