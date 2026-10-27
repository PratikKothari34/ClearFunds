-- Bank statements (#73): credits stored in exact minor units, matched to
-- claims by UTR when read, visible to the committee only, and nothing chained.
begin;
select plan(15);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('r1', gen_random_uuid()), ('r2', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@b.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_b', 'name', 'Bank CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@b.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@b.test', 'role', 'treasurer', 'tasks', '["review_payment_claims"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@b.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_b', 1, 'A-1'), ('soc_b', 2, 'A-2');
create temp table f as select label, id from public.flats where society_id = 'soc_b';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_b', api_add_person('soc_b', 'R1', 'r1@b.test'), (select id from f where label = 'A-1'), 'owner');
select api_add_tenure('soc_b', api_add_person('soc_b', 'R2', 'r2@b.test'), (select id from f where label = 'A-2'), 'owner');
create temp table td as select cf.today() as d;
grant select on u, f, td to authenticated;

-- Two claims: one open, one the committee rejects.
create temp table cl (k text primary key, seq bigint);
grant select, insert on cl to authenticated;
set local role authenticated;
select pg_temp.as_('r1');
insert into cl select 'open', (api_claim_payment('soc_b', jsonb_build_object('flat_id', (select id from f where label = 'A-1'),
  'amount_minor', 1250075, 'currency', 'INR', 'paid_on', (select d from td), 'method', 'upi', 'reference', '412345678901'))->>'seq')::bigint;
select pg_temp.as_('r2');
insert into cl select 'rej', (api_claim_payment('soc_b', jsonb_build_object('flat_id', (select id from f where label = 'A-2'),
  'amount_minor', 500000, 'currency', 'INR', 'paid_on', (select d from td), 'method', 'bank_transfer', 'reference', 'HDFCN52026102700123'))->>'seq')::bigint;
select pg_temp.as_('tre');
select api_reject_claim('soc_b', (select seq from cl where k = 'rej'), 'Not in the bank yet');
reset role;

create temp table chained as select count(*) as n from public.chain_entries where society_id = 'soc_b';
create function pg_temp.store(who text, lines jsonb) returns jsonb language sql as $$
  select api_statement_store(pg_temp.uid(who), 'soc_b', jsonb_build_object('lines', lines, 'skipped', 1)) $$;
create function pg_temp.line(row_ int, amount text, ref text, narr text) returns jsonb language sql as $$
  select jsonb_build_object('row', row_, 'date', cf.today()::text, 'amount', amount, 'reference', ref, 'narration', narr) $$;

select throws_like($$select pg_temp.store('sec', jsonb_build_array(pg_temp.line(2, '100', null, null)))$$,
  '%review payment claims is not one of your tasks%', 'only a holder of review_payment_claims imports');
select throws_like($$select pg_temp.store('tre', jsonb_build_array(pg_temp.line(2, '100', null, null), pg_temp.line(3, '12.505', null, null)))$$,
  '%Row 3: 12.505 is finer than the smallest unit of INR%', 'a fraction of a paisa refuses the import, naming the row');
select is((select count(*)::int from private.statements), 0, 'and stores nothing');
select throws_like($$select pg_temp.store('tre', '[]')$$, '%no credit lines%', 'an empty statement is refused');

select is(pg_temp.store('tre', jsonb_build_array(
    pg_temp.line(2, '12500.75', null, 'UPI/412345678901/A-1 maintenance'),
    pg_temp.line(3, '5000', 'hdfcn52026102700123', 'NEFT from R2'),
    pg_temp.line(4, '999.5', 'XYZ', 'Hall booking')))->>'credits', '3', 'a statement is stored');

select is((select string_agg(amount_minor::text, ',' order by line_no) from private.statement_lines), '1250075,500000,99950',
  'amounts become exact integer paise');
select is((select count(*)::int from public.chain_entries where society_id = 'soc_b'), (select n::int from chained),
  'an import chains nothing');

set local role authenticated;
select pg_temp.as_('pres');
select is((select match->>'status' || ':' || (match->>'amount_matches') from statement_lines where line_no = 1), 'open:true',
  'a UTR inside a UPI narration matches the open claim, amount and all');
select is((select (match->>'claim_seq')::bigint from statement_lines where line_no = 1), (select seq from cl where k = 'open'),
  'it names the claim');
select is((select match->>'status' from statement_lines where line_no = 2), 'rejected',
  'a claim the committee rejected but the bank shows paid surfaces, matched by reference whatever its case');
select is((select match from statement_lines where line_no = 3), null, 'a credit with no claim is unmatched');
select pg_temp.as_('r1');
select is((select count(*)::int from statement_lines), 0, 'a resident sees no statement lines');
reset role;
select ok(not has_function_privilege('authenticated', 'public.api_statement_store(uuid,text,jsonb)', 'execute'),
  'only the edge function stores a statement');

select is(cf.money_text(1250075, 'INR') || ' ' || cf.money_text(5000, 'JPY') || ' ' || cf.money_text(-1234567, 'KWD')
          || ' ' || cf.money_text(7, 'INR'), '₹12,500.75 JPY 5,000 -KWD 1,234.567 ₹0.07',
  'money_text reads the same after moving to exact numeric');
select ok(pg_get_functiondef('cf.money_text(bigint, text)'::regprocedure) !~ '10 \^',
  'and no longer raises 10 to a power in double precision');

select * from finish();
rollback;
