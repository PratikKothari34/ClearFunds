-- Dues reminders (#56): only the task holder sends them, each resident of an
-- owing flat hears about that flat alone, and no flat is chased twice a week.
begin;
select plan(13);

select is(cf.money_text(12345678, 'INR'), '₹1,23,456.78', 'rupees use Indian grouping');
select is(cf.money_text(5, 'INR'), '₹0.05', 'paise keep their leading zero');
select is(cf.money_text(1234567, 'JPY'), 'JPY 1,234,567', 'yen has no minor unit: never a fixed /100');
select is(cf.money_text(1234567, 'KWD'), 'KWD 1,234.567', 'dinar has three');
select throws_like($$select cf.money_text(1, 'XXX')$$, '%no exponent known%', 'an unknown currency is refused, not guessed');

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@r.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', (select id from u where u.k = $1), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_r', 'name', 'Remind CHS', 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@r.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@r.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'S', 'email', 'sec@r.test', 'role', 'secretary', 'tasks', '["send_dues_reminders"]'::jsonb)),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_r', 1, 'A-1'), ('soc_r', 2, 'A-2');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_r', api_add_person('soc_r', 'Owen Owner', 'own@r.test'), (select id from flats where label = 'A-1'), 'owner');
select api_add_tenure('soc_r', api_add_person('soc_r', 'Tia Tenant', 'ten@r.test'), (select id from flats where label = 'A-1'), 'tenant');
select api_add_tenure('soc_r', api_add_person('soc_r', 'Pat Paid', 'paid@r.test'), (select id from flats where label = 'A-2'), 'owner');
-- A-1 owes 2,500.00; A-2 owes nothing. Charges are written as the posting
-- and proposal entries the dues view reads, through the real append path.
select cf.append('soc_r', 'proposal', null, jsonb_build_object('action', 'charge', 'amount_minor', 250000, 'currency', 'INR',
  'counterparty', 'A-1', 'category', 'opening', 'narration', 'Arrears', 'business_date', cf.today()::text, 'flat_id',
  (select id from flats where label = 'A-1'), 'flat_set', 'flat', 'flat_ids', jsonb_build_array((select id from flats where label = 'A-1')),
  'line_amounts', '[250000]'::jsonb, 'remainder_flats', '[]'::jsonb, 'tier', 'committee', 'required', 2, 'seated', 3,
  'limit_minor', 0, 'limit_seq', 1));
select cf.append('soc_r', 'posting', null, jsonb_build_object('proposal_seq',
  (select max(sequence) from chain_entries where society_id = 'soc_r' and kind = 'proposal'),
  'effect', 'charge', 'amount_minor', 250000, 'currency', 'INR'));
delete from private.mail_outbox;

grant select on u to authenticated;
set local role authenticated;
select pg_temp.as_('tre');
select throws_like($$select api_send_dues_reminders('soc_r')$$, '%send dues reminders is not one of your tasks%',
  'only the task holder sends reminders');
select pg_temp.as_('sec');
select is(api_send_dues_reminders('soc_r'), '{"flats": 1, "mails": 2, "skipped_recent": 0}'::jsonb,
  'one owing flat, its owner and resident tenant each mailed');
select is(api_send_dues_reminders('soc_r'), '{"flats": 0, "mails": 0, "skipped_recent": 1}'::jsonb,
  'the same flat is not chased again within a week');
reset role;
select is((select array_agg(to_email order by to_email) from private.mail_outbox), array['own@r.test', 'ten@r.test'],
  'nobody at the settled flat is mailed');
select ok((select bool_and(body like '%Flat A-1 owes ₹2,500.00%') from private.mail_outbox), 'the amount is written in rupees');
select ok((select bool_and(body not like '%A-2%' and body not like '%Pat%') from private.mail_outbox),
  'a reminder names no other flat or resident');

-- A dues figure that cannot be read stops the run: the view is replaced in
-- this transaction only, to serve a null for one flat.
create or replace view public.flat_dues as
  select society_id, id as flat_id, label, ordinal, has_parking, 0::bigint as charged_minor, 0::bigint as paid_minor,
         case when label = 'A-2' then null else 100::bigint end as outstanding_minor
    from public.flats;
delete from private.dues_reminders;
delete from private.mail_outbox;
select set_config('request.jwt.claims', json_build_object('sub', (select id from u where k = 'sec'), 'role', 'authenticated')::text, true);
select throws_like($$select api_send_dues_reminders('soc_r')$$, '%could not be read, so no reminders were sent%',
  'one unreadable flat refuses the whole run');
select is((select count(*)::int from private.mail_outbox), 0, 'and nothing was sent to the readable flats either');

select * from finish();
rollback;
