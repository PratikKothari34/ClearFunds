-- Every amount stays within what a JSON client reads exactly (#136), and a
-- configured committee threshold raises the required count (#137).
begin;
select plan(16);

create temp table u (k text primary key, id uuid);
insert into u select k, gen_random_uuid() from unnest(array['pres', 'tre', 'sec', 'res']) k;
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@a.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
select api_open_society(jsonb_build_object('id', 'soc_a', 'name', 'Range CHS', 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@a.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@a.test', 'role', 'treasurer',
      'tasks', jsonb_build_array('propose_expenses', 'raise_monthly_charges')),
    jsonb_build_object('name', 'S', 'email', 'sec@a.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1,
    'sha256', repeat('ab', 32))));
insert into public.flats (society_id, ordinal, label, has_parking) values ('soc_a', 1, 'A-101', false);

create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.prop(k text, p jsonb) returns bigint language sql as
  $$ select (api_propose(pg_temp.uid(k), 'soc_a', p)->>'seq')::bigint $$;
create function pg_temp.cast_(k text, seq bigint) returns text language sql as $$
  select api_register_key(pg_temp.uid(k), 'soc_a', md5(k) || md5(k));
  select api_cast(pg_temp.uid(k), 'soc_a', seq, 'approve',
    (cf.latest_key('soc_a', cf.person(pg_temp.uid(k), 'soc_a'))).sequence, repeat('ab', 64))->>'status';
$$;
create function pg_temp.as_user(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.expense(amt numeric) returns jsonb language sql as $$
  select jsonb_build_object('action', 'expense', 'amount_minor', amt, 'counterparty', 'Vendor',
    'category', 'repairs', 'narration', 'Work')
$$;
create temp table s (k text primary key, seq bigint);

-- ---- one bound, one message, on every input
select is(cf.max_minor_text('soc_a'), '₹9,00,71,99,25,47,409.91', 'the bound is 2^53 - 1 minor units, in the society''s currency');
select throws_like($$select pg_temp.prop('tre', pg_temp.expense(9007199254740992))$$,
  'the amount is too large: no amount can be more than ₹9,00,71,99,25,47,409.91',
  'an expense one past the bound is refused as too large, before the encoder');
select throws_like($$select pg_temp.prop('pres', '{"action":"limit_change","amount_minor":9007199254740992}')$$,
  'the limit is too large:%', 'so is a limit');
insert into s values ('small', pg_temp.prop('tre', pg_temp.expense(100)));
select pg_temp.cast_('tre', (select seq from s where k = 'small'));
select pg_temp.cast_('sec', (select seq from s where k = 'small'));
select throws_like(format($$select pg_temp.prop('tre', jsonb_build_object('action', 'reversal', 'target_seq',
    (select sequence from chain_entries where society_id = 'soc_a' and kind = 'posting' and (body->>'proposal_seq')::bigint = %s),
    'reason', 'Wrong figure', 'replacement_amount_minor', 9007199254740992))$$, (select seq from s where k = 'small')),
  'the replacement amount is too large:%', 'so is a replacement amount');

-- A claim and a template are checked as the person who makes them.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.tenures (society_id, flat_id, person_id, kind)
  select 'soc_a', (select id from public.flats where society_id = 'soc_a'),
         api_add_person('soc_a', 'R', 'res@a.test'), 'owner';
select pg_temp.as_user('res');
select throws_like($$select api_claim_payment('soc_a', jsonb_build_object('flat_id',
    (select id from public.flats where society_id = 'soc_a'), 'amount_minor', 9007199254740992, 'currency', 'INR',
    'paid_on', cf.today(), 'method', 'upi', 'reference', 'UTR123456789'))$$,
  'the amount is too large:%', 'so is a payment claim');
select pg_temp.as_user('tre');
select throws_like($$select api_save_template('soc_a', null, '{"name":"Big","amount_minor":9007199254740992}')$$,
  'the amount is too large:%', 'a template above the bound cannot be saved');
select lives_ok($$select api_save_template('soc_a', null, '{"name":"Edge","amount_minor":9007199254740991}')$$,
  'a template at the bound can');
select throws_ok($$insert into private.expense_templates (society_id, name, amount_minor, created_by)
    values ('soc_a', 'Raw', 9007199254740992, cf.person(pg_temp.uid('tre'), 'soc_a'))$$,
  '23514', null, 'nor can one be written around the function');
select set_config('request.jwt.claims', '', true);

-- ---- the money ever posted stays in range, so every sum of it does
select is(cf.posted_total('soc_a'), 100::numeric, 'the posted total counts the posting made so far');
select throws_like($$select pg_temp.prop('tre', pg_temp.expense(9007199254740991))$$,
  '%would pass ₹9,00,71,99,25,47,409.91%', 'a proposal that would take the posted total past the bound is refused');
insert into s values ('fits', pg_temp.prop('tre', pg_temp.expense(9007199254740891)));
insert into s values ('also', pg_temp.prop('tre', pg_temp.expense(50)));
select is(pg_temp.cast_('tre', (select seq from s where k = 'fits')) || pg_temp.cast_('sec', (select seq from s where k = 'fits')),
  'openposted', 'up to the bound, it posts');
select is(cf.posted_total('soc_a'), 9007199254740991::numeric, 'the posted total is now exactly the bound');
select pg_temp.cast_('tre', (select seq from s where k = 'also'));
select throws_like($$select pg_temp.cast_('sec', (select seq from s where k = 'also'))$$,
  '%would pass%', 'two proposals that each fitted cannot both post: the posting is refused');
select is((select count(*)::int from public.ledger where society_id = 'soc_a'), 2,
  'and nothing past the bound is in the ledger');

-- ---- #137: a configured threshold raises the required count, never the floor
update public.societies set committee_threshold = 3 where id = 'soc_a';
select is(cf.required_committee('soc_a'), 3, 'M = 3 needs ceil(2*3/3) = 2, and a threshold of 3 raises it to 3');
insert into s values ('lim', pg_temp.prop('pres', '{"action":"limit_change","amount_minor":500000,"narration":"Raise the limit"}'));
select is((select (body->>'required')::int from chain_entries where society_id = 'soc_a'
            and sequence = (select seq from s where k = 'lim')),
  3, 'and a new proposal snapshots the raised count');

select * from finish();
rollback;
