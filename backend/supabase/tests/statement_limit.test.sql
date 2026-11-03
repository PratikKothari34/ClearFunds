-- The auditor's year-close statement (#3): required, bounded in bytes of
-- UTF-8 rather than characters, and refused with the limit when over.
begin;
select plan(6);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('aud', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@a.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
select api_open_society(jsonb_build_object('id', 'soc_a', 'name', 'Audit CHS', 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@a.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@a.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'S', 'email', 'sec@a.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.auditor_appointments (society_id, person_id, fy, appointment_seq, appointing_set)
  values ('soc_a', api_add_person('soc_a', 'CA Aud', 'aud@a.test'), '2024-25', 1, '{}');

create function pg_temp.intent(statement text) returns jsonb language sql as $$
  select api_close_intent((select id from u where k = 'aud'), 'soc_a', '2024-25', 'qualified', statement) $$;

select throws_like($$select pg_temp.intent('   ')$$, '%statement is required%', 'a blank statement is refused');
select lives_ok($$select pg_temp.intent(repeat('a', 16384))$$, '16,384 bytes of Latin text is accepted');
select throws_like($$select pg_temp.intent(repeat('a', 16385))$$,
  '%statement is 16385 bytes; the limit is 16,384 bytes of UTF-8%', 'one byte over is refused, naming both sizes');
-- 'क' is 3 bytes: 5,461 of them is 16,383 bytes, 5,462 is 16,386.
select lives_ok($$select pg_temp.intent(repeat('क', 5461))$$, 'Devanagari is counted in bytes, not characters');
select throws_like($$select pg_temp.intent(repeat('क', 5462))$$, '%16386 bytes%', 'and refused by bytes');
select lives_ok($$select pg_temp.intent('  ' || repeat('a', 16384) || '  ')$$,
  'surrounding spaces are trimmed before counting, as they are before chaining');

select * from finish();
rollback;
