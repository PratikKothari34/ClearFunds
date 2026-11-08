-- Dues visibility (#6 item 6): the committee reads every flat's dues, a
-- resident only their own flat's, and dashboard totals still cover every flat.
begin;
select plan(7);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('own', gen_random_uuid()), ('ten', gen_random_uuid()), ('other', gen_random_uuid()), ('gone', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@d.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', (select id from u where u.k = $1), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_d', 'name', 'Dues CHS', 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@d.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@d.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'S', 'email', 'sec@d.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_d', 1, 'A-1'), ('soc_d', 2, 'A-2');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_d', api_add_person('soc_d', 'Owen Owner', 'own@d.test'), (select id from flats where label = 'A-1'), 'owner');
select api_add_tenure('soc_d', api_add_person('soc_d', 'Tia Tenant', 'ten@d.test'), (select id from flats where label = 'A-1'), 'tenant');
select api_add_tenure('soc_d', api_add_person('soc_d', 'Ola Other', 'other@d.test'), (select id from flats where label = 'A-2'), 'owner');
-- A past owner of A-2 whose tenure has closed.
insert into public.tenures (society_id, flat_id, person_id, kind, starts_on, ends_on, handle)
  values ('soc_d', (select id from flats where label = 'A-2'), api_add_person('soc_d', 'Gil Gone', 'gone@d.test'),
          'owner', cf.today() - 30, cf.today() - 1, 'h_gone');
-- A-1 owes 2,500.00, through the real append path.
select cf.append('soc_d', 'proposal', null, jsonb_build_object('action', 'charge', 'amount_minor', 250000, 'currency', 'INR',
  'counterparty', 'A-1', 'category', 'opening', 'narration', 'Arrears', 'business_date', cf.today()::text, 'flat_id',
  (select id from flats where label = 'A-1'), 'flat_set', 'flat', 'flat_ids', jsonb_build_array((select id from flats where label = 'A-1')),
  'line_amounts', '[250000]'::jsonb, 'remainder_flats', '[]'::jsonb, 'tier', 'committee', 'required', 2, 'seated', 3,
  'limit_minor', 0, 'limit_seq', 1));
select cf.append('soc_d', 'posting', null, jsonb_build_object('proposal_seq',
  (select max(sequence) from chain_entries where society_id = 'soc_d' and kind = 'proposal'),
  'effect', 'charge', 'amount_minor', 250000, 'currency', 'INR'));

grant select on u to authenticated;
set local role authenticated;
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(label, ',' order by ordinal), '') from public.flat_dues where society_id = 'soc_d' $$;

select pg_temp.as_('tre');
select is(pg_temp.seen(), 'A-1,A-2', 'a committee seat reads every flat');
select pg_temp.as_('own');
select is(pg_temp.seen(), 'A-1', 'an owner reads only their own flat');
select is((select outstanding_minor from public.flat_dues where society_id = 'soc_d'), 250000::bigint,
  'with the amount it owes');
select pg_temp.as_('ten');
select is(pg_temp.seen(), 'A-1', 'a resident tenant reads the flat they live in');
select pg_temp.as_('other');
select is(pg_temp.seen(), 'A-2', 'another owner never receives A-1''s dues');
select pg_temp.as_('gone');
select is(pg_temp.seen(), '', 'a closed tenure reads nothing');
select pg_temp.as_('other');
select is(api_summary('soc_d')->>'flats_outstanding', '1',
  'dashboard totals still cover every flat');

select * from finish();
rollback;
