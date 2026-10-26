-- Platform onboarding and the president's setup draft (#15): only a platform
-- admin creates a society, only its president edits the draft, nothing is
-- chained until open, and open turns the draft into the chain, flats and
-- tenures in one go.
begin;
select plan(17);

create temp table u (k text primary key, id uuid);
insert into u values ('plat', gen_random_uuid()), ('pres', gen_random_uuid()), ('other', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@o.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
insert into public.platform_admins (auth_user_id) select id from u where k = 'plat';
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
create temp table soc (id text);

-- ---- a society, as the platform creates it
insert into soc select api_platform_create(pg_temp.uid('plat'), jsonb_build_object('name', 'Neem CHS',
  'city', 'Pune', 'flat_count', 3, 'fy_start_month', 4,
  'president', jsonb_build_object('full_name', 'Asha P', 'personal_email', 'pres@o.test', 'phone', '98')));
create function pg_temp.s() returns text language sql as $$ select id from soc $$;
-- ---- setup, as the president
grant select on u, soc to authenticated;
set local role authenticated;
select pg_temp.as_('other');
select throws_like($$select api_setup_get(pg_temp.s())$$, '%only the president%', 'nobody else sees the draft');
select pg_temp.as_('pres');
select is(jsonb_array_length(api_setup_get(pg_temp.s())->'draft'->'posts'), 3, 'the three fixed posts come pre-filled');
select throws_like($$select api_setup_save(pg_temp.s(), 'posts', '[]')$$, '%cannot be removed%',
  'the fixed posts cannot be removed');
select lives_ok($$select api_setup_save(pg_temp.s(), 'posts',
  (api_setup_get(pg_temp.s())->'draft'->'posts') || '[{"post_id":null,"post_title":"Joint Secretary"}]')$$,
  'a custom post is added');
select ok((api_setup_get(pg_temp.s())#>>'{draft,posts,3,post_id}') ~ '^pst_', 'and gets its id from the server');
select is(api_setup_get(pg_temp.s())->>'status', 'setup', 'saving moves the society to setup');

create temp table post on commit drop as
  select x->>'seat_role' r, x->>'post_id' id from jsonb_array_elements(api_setup_get(pg_temp.s())->'draft'->'posts') x;
select api_setup_save(pg_temp.s(), 'committee', jsonb_build_array(
  jsonb_build_object('post_id', (select id from post where r = 'president'), 'full_name', 'Asha P', 'personal_email', 'pres@o.test'),
  jsonb_build_object('post_id', (select id from post where r = 'treasurer'), 'full_name', 'Ravi T', 'personal_email', 'tre@o.test'),
  jsonb_build_object('post_id', (select id from post where r = 'secretary'), 'full_name', 'Sara S', 'personal_email', 'sec@o.test'),
  jsonb_build_object('post_id', (select id from post where r = 'member'), 'full_name', 'Joe M', 'personal_email', 'joe@o.test')));
select api_setup_save(pg_temp.s(), 'flats', '[{"flat_key":"f1","label":"A-101"},{"flat_key":"f2","label":"A-102","has_parking":true}]');
select api_setup_save(pg_temp.s(), 'residents', '[
  {"person_key":"r1","flat_key":"f1","kind":"owner","resides":false,"full_name":"Own One","personal_email":"o1@o.test"},
  {"person_key":"r2","flat_key":"f1","kind":"owner","resides":false,"full_name":"Own Two","personal_email":"o2@o.test"},
  {"person_key":"r3","flat_key":"f1","kind":"tenant","owner_key":"r2","resides":true,"full_name":"Ten Ant","personal_email":"t@o.test"}]');
select ok(api_setup_get(pg_temp.s())->'problems' @> '[{"message":"Flat A-102 has no owner."}]',
  'a flat with no owner is a problem');
select ok(api_setup_get(pg_temp.s())->'problems' @> '[{"message":"Upload the election minutes."}]',
  'so are missing minutes');
select api_setup_save(pg_temp.s(), 'residents', (api_setup_get(pg_temp.s())->'draft'->'residents') ||
  '[{"person_key":"r4","flat_key":"f2","kind":"owner","full_name":"Ravi T","personal_email":"tre@o.test"}]');
select api_setup_save(pg_temp.s(), 'money', '{"approval_limit_minor":500000,"monthly_charge_minor":250000,"currency":"INR"}');
select api_setup_save(pg_temp.s(), 'tasks', jsonb_build_array(jsonb_build_object(
  'post_id', (select id from post where r = 'treasurer'), 'tasks', '["propose_expenses"]'::jsonb)));
reset role;

-- ---- open (the edge function's calls, as the service)
select lives_ok($$select api_setup_minutes(pg_temp.uid('pres'), pg_temp.s(),
  jsonb_build_object('file_name', 'm.pdf', 'size_bytes', 900, 'sha256', repeat('ef', 32)))$$, 'the minutes are recorded');
select is(jsonb_array_length(cf.setup_problems((select draft from society_setup where society_id = pg_temp.s()),
  (select minutes from society_setup where society_id = pg_temp.s()))), 0, 'the draft has no problems left');
select throws_like($$select api_setup_open(pg_temp.uid('pres'), pg_temp.s(), 'neem chs', '{"sha256":"x"}')$$,
  '%type the society''s name exactly%', 'the confirmation must match the name');
select throws_like($$select api_setup_open(pg_temp.uid('pres'), pg_temp.s(), 'Neem CHS', jsonb_build_object('sha256', repeat('00', 32)))$$,
  '%minutes changed after upload%', 'minutes replaced behind the server''s back are refused');
select lives_ok($$select api_setup_open(pg_temp.uid('pres'), pg_temp.s(), 'Neem CHS', jsonb_build_object('sha256', repeat('ef', 32)))$$,
  'the ledger opens');
select is((select body->>'sha256' from public.chain_entries where society_id = pg_temp.s() and sequence = 2),
  repeat('ef', 32), 'the minutes'' hash is at sequence 2');
select is((select o.person_id from public.tenures t join public.tenures o on o.id = t.parent_tenure_id
            where t.society_id = pg_temp.s() and t.kind = 'tenant'),
  (select id from public.people where society_id = pg_temp.s() and email = 'o2@o.test'),
  'a tenant is held under the joint owner it named, not the first one');
select is((select count(*)::int from public.people where society_id = pg_temp.s() and email = 'tre@o.test'), 1,
  'a committee member who lives here is one person');
select throws_like($$select api_platform_president(pg_temp.uid('plat'), pg_temp.s(),
  '{"full_name":"New","personal_email":"n@o.test"}')$$, '%committee vote%',
  'the platform admin cannot change an open society''s president');

select * from finish();
rollback;
