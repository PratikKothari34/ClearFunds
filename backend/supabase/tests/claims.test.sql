-- Payment claims (#17): a resident's claim is chained without naming them,
-- becomes money only through a receipt the pair approves, and every ending
-- is on the record.
begin;
select plan(20);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('m1', gen_random_uuid()), ('res', gen_random_uuid()), ('res2', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@c.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.pid(k text) returns uuid language sql as $$ select cf.person(pg_temp.uid(k), 'soc_c') $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.cast_(k text, seq bigint, d text default 'approve') returns text language sql as $$
  select api_register_key(pg_temp.uid(k), 'soc_c', md5(k) || md5(k));
  select api_cast(pg_temp.uid(k), 'soc_c', seq, d,
    (cf.latest_key('soc_c', cf.person(pg_temp.uid(k), 'soc_c'))).sequence, repeat('ab', 64))->>'status';
$$;
select api_open_society(jsonb_build_object('id', 'soc_c', 'name', 'Claim CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@c.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@c.test', 'role', 'treasurer', 'tasks', '["review_payment_claims"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@c.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@c.test')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_c', 1, 'A-1'), ('soc_c', 2, 'A-2');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_c', api_add_person('soc_c', 'Res One', 'res@c.test'), (select id from flats where label = 'A-1'), 'owner');
select api_add_tenure('soc_c', api_add_person('soc_c', 'Res Two', 'res2@c.test'), (select id from flats where label = 'A-2'), 'owner');
create temp table f as select label, id from public.flats where society_id = 'soc_c';
create function pg_temp.claim(ref text, amt bigint default 250000, flat text default 'A-1', method text default 'upi',
  paid text default '2026-10-01') returns jsonb language sql as $$
  select jsonb_build_object('flat_id', (select id from f where label = flat), 'amount_minor', amt, 'currency', 'INR',
    'paid_on', paid, 'method', method, 'reference', ref)
$$;
create temp table s (k text primary key, seq bigint);
grant select, insert on u, f, s to authenticated;

-- ---- a resident claims
set local role authenticated;
select pg_temp.as_('res');
select throws_like($$select api_claim_payment('soc_c', pg_temp.claim('UTR000001', flat => 'A-2'))$$,
  '%only for the flat you hold%', 'a resident claims only for their own flat');
select throws_like($$select api_claim_payment('soc_c', pg_temp.claim('UTR000001', method => 'cash'))$$,
  '%only UPI and bank transfers%', 'cash cannot be claimed');
select throws_like($$select api_claim_payment('soc_c', pg_temp.claim('UTR000001', paid => '2999-01-01'))$$,
  '%not a future one%', 'a payment cannot be dated in the future');
select throws_like($$select api_claim_payment('soc_c', pg_temp.claim('UTR000001', amt => 0))$$,
  '%positive whole number%', 'a claim is for a positive amount');
insert into s select 'c1', (api_claim_payment('soc_c', pg_temp.claim('UTR000001'))->>'seq')::bigint;
select throws_like($$select api_claim_payment('soc_c', pg_temp.claim('utr000001'))$$,
  '%already been claimed%', 'one bank reference, one live claim');
insert into s select 'c2', (api_claim_payment('soc_c', pg_temp.claim('UTR000002', amt => 100))->>'seq')::bigint;
insert into s select 'c3', (api_claim_payment('soc_c', pg_temp.claim('UTR000003'))->>'seq')::bigint;
select is((select count(*)::int from payment_claims), 3, 'the resident sees their flat''s claims');
select pg_temp.as_('res2');
select is((select count(*)::int from payment_claims), 0, 'and no other resident sees them');
select pg_temp.as_('m1');
select throws_like($$select api_reject_claim('soc_c', (select seq from s where k = 'c2'), 'not found')$$,
  '%review payment claims is not one of your tasks%', 'only the reviewer rejects');
select is((select count(*)::int from payment_claims), 3, 'the committee sees every claim');
reset role;

select is((select actor from chain_entries where society_id = 'soc_c' and sequence = (select seq from s where k = 'c1')), null,
  'the claim entry names nobody');
select ok(not exists (select 1 from chain_entries where society_id = 'soc_c' and kind = 'payment_claim'
                       and body::text like '%' || pg_temp.pid('res')::text || '%'), 'not even in its body');

-- ---- rejecting
set local role authenticated;
select pg_temp.as_('tre');
select throws_like($$select api_reject_claim('soc_c', (select seq from s where k = 'c2'), '  ')$$,
  '%say why%', 'a rejection needs a reason');
select lives_ok($$select api_reject_claim('soc_c', (select seq from s where k = 'c2'), 'No such UTR on the statement.')$$,
  'the reviewer rejects with a reason');
reset role;
select is((select actor from chain_entries where society_id = 'soc_c' and kind = 'claim_closed'), pg_temp.pid('tre')::text,
  'a rejection names who made it');

-- ---- receipting
select throws_like($$select api_propose(pg_temp.uid('tre'), 'soc_c', jsonb_build_object('action', 'receipt',
  'amount_minor', 249999, 'currency', 'INR', 'flat_id', (select id from f where label = 'A-1'), 'counterparty', 'A-1',
  'category', 'maintenance', 'narration', 'Maintenance', 'claim_seq', (select seq from s where k = 'c1')))$$,
  '%its flat, amount and currency%', 'a receipt must match its claim');
insert into s select 'r1', (api_propose(pg_temp.uid('tre'), 'soc_c', jsonb_build_object('action', 'receipt',
  'amount_minor', 250000, 'currency', 'INR', 'flat_id', (select id from f where label = 'A-1'), 'counterparty', 'A-1',
  'category', 'maintenance', 'narration', 'Maintenance', 'claim_seq', (select seq from s where k = 'c1')))->>'seq')::bigint;
select is(pg_temp.cast_('tre', (select seq from s where k = 'r1')), 'open', 'the treasurer alone does not receipt it');
select is((select proposal_seq from claims where claim_seq = (select seq from s where k = 'c1')), (select seq from s where k = 'r1'),
  'the claim is linked to its receipt while it waits');
select is(pg_temp.cast_('sec', (select seq from s where k = 'r1')), 'posted', 'the secretary''s approval posts it');
select is((select body->>'outcome' || ':' || (body->>'proposal_seq') from chain_entries where society_id = 'soc_c'
            and kind = 'claim_closed' and actor is null), 'receipted:' || (select seq from s where k = 'r1'),
  'the claim closes as receipted, in the same transaction');

-- ---- a declined receipt reopens its claim
insert into s select 'r3', (api_propose(pg_temp.uid('tre'), 'soc_c', jsonb_build_object('action', 'receipt',
  'amount_minor', 250000, 'currency', 'INR', 'flat_id', (select id from f where label = 'A-1'), 'counterparty', 'A-1',
  'category', 'maintenance', 'narration', 'Maintenance', 'claim_seq', (select seq from s where k = 'c3')))->>'seq')::bigint;
select pg_temp.cast_('sec', (select seq from s where k = 'r3'), 'decline');
select is((select proposal_seq from claims where claim_seq = (select seq from s where k = 'c3')), null,
  'a declined receipt leaves its claim open again');

select * from finish();
rollback;
