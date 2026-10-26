-- ClearFunds IDs (#16): how they are formed, that they follow a post or a
-- tenure, and what enrolment tells people.
begin;
select plan(11);

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

select is((select slug from public.societies where id = 'soc_i'), 'greenvalley', 'the society slug drops CHS-style words and punctuation');
select ok(exists (select 1 from public.logins where clearfunds_id = 'treasurer@greenvalley.com' and person_id = pg_temp.pid('tre')),
  'a post''s ID is its title at the society');
select ok(exists (select 1 from public.logins where clearfunds_id = 'joint-secretary-admin@greenvalley.com'),
  'a custom post''s title becomes a hyphenated ID');

select api_add_tenure('soc_i', api_add_person('soc_i', 'Riya Shah', 'riya@i.test'), (select id from flats where label = 'A-101'), 'owner', '2020-01-01');
select api_add_tenure('soc_i', api_add_person('soc_i', 'Riya Kapoor', 'riya2@i.test'), (select id from flats where label = 'A-101'), 'owner');
select ok(exists (select 1 from public.logins where clearfunds_id = 'riya.a101@greenvalley.com'), 'a resident''s ID is first name and flat');
select ok(exists (select 1 from public.logins where clearfunds_id = 'riya2.a101@greenvalley.com'), 'a clash gets a number on the name');


update public.tenures set ends_on = current_date - 1 where person_id = (select id from people where email = 'riya@i.test');
select is(cf.login_email('riya.a101@greenvalley.com'), null, 'a closed tenure''s ID can no longer sign in');
select ok(exists (select 1 from public.logins where clearfunds_id = 'riya.a101@greenvalley.com'), 'and the ID is kept, never reissued');


-- A holder change moves the ID and enrols the new holder.
update public.committee_seats set unseated_seq = 999 where society_id = 'soc_i' and person_id = pg_temp.pid('tre');
select is(cf.login_email('treasurer@greenvalley.com'), null, 'a vacant post''s ID cannot sign in');
update public.committee_seats set unseated_seq = 1000 where society_id = 'soc_i' and person_id = pg_temp.pid('m1');
insert into public.committee_seats (society_id, person_id, role, seated_seq) values ('soc_i', pg_temp.pid('m1'), 'treasurer', 1001);
select is((select person_id from public.logins where clearfunds_id = 'treasurer@greenvalley.com'), pg_temp.pid('m1'),
  'the post''s ID follows its new holder');
select ok((select body from private.mail_outbox where to_email = 'm1@i.test' order by id desc limit 1)
  like '%Your ClearFunds ID is treasurer@greenvalley.com%never one alone%', 'who is told the ID and the pair rule');

select api_add_tenure('soc_i', api_add_person('soc_i', 'Tom Tenant', 'tom@i.test'), (select id from flats where label = 'A-101'), 'tenant');
select ok((select body from private.mail_outbox where to_email = 'tom@i.test') like '%owner of your flat can see the disputes you raise%',
  'a tenant is told their owner can see their disputes');

select * from finish();
rollback;
