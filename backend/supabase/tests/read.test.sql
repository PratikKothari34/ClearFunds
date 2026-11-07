-- The read model: the ledger view, flat_dues, structuring, the report, years
-- and mismatch reports (#103). A wrong total here still verifies, because every
-- row stays genuine and every hash still links, so these tests are all that
-- stands behind the figures a resident reads.
--
-- They assert rules, not sample figures: that a pair nets to zero, that a credit
-- is not netted against a debt, that the balance sheet balances.
begin;
select plan(41);

create temp table u (k text primary key, id uuid);
insert into u select k, gen_random_uuid() from unnest(array['pres', 'tre', 'sec', 'm1', 'm2', 'aud', 'res', 'res2']) k;
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@r.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;

select api_open_society(jsonb_build_object('id', 'soc_r', 'name', 'Read CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@r.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@r.test', 'role', 'treasurer',
      'tasks', '["propose_expenses","raise_monthly_charges"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@r.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@r.test'), jsonb_build_object('name', 'M2', 'email', 'm2@r.test')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_r', 1, 'A-1'), ('soc_r', 2, 'A-2'), ('soc_r', 3, 'A-3');
create function pg_temp.flat(l text) returns text language sql as $$
  select id from public.flats where society_id = 'soc_r' and label = l $$;

-- Proposes as the treasurer and approves until it posts. Returns the first
-- posting, which for a reversal + replacement is the reversal.
create function pg_temp.post(p jsonb) returns bigint language plpgsql as $$
declare
  pseq bigint := (api_propose(pg_temp.uid('tre'), 'soc_r', p)->>'seq')::bigint;
  k text;
  st text;
begin
  foreach k in array array['tre', 'sec', 'pres', 'm1', 'm2'] loop
    perform api_register_key(pg_temp.uid(k), 'soc_r', md5(k) || md5(k));
    st := api_cast(pg_temp.uid(k), 'soc_r', pseq, 'approve',
      (cf.latest_key('soc_r', cf.person(pg_temp.uid(k), 'soc_r'))).sequence, repeat('ab', 64))->>'status';
    exit when st = 'posted';
  end loop;
  return (select min(sequence) from public.chain_entries where society_id = 'soc_r' and kind = 'posting'
           and (body->>'proposal_seq')::bigint = pseq);
end
$$;
create function pg_temp.expense(amt bigint, payee text default 'Vendor', d date default null) returns bigint
language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'expense', 'amount_minor', amt, 'counterparty', payee,
    'category', 'repairs', 'narration', 'work', 'business_date', coalesce(d, cf.today())))
$$;
create function pg_temp.receipt(amt bigint, flat text default null, d date default null) returns bigint
language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'receipt', 'amount_minor', amt, 'counterparty', 'Payer',
    'category', 'dues', 'narration', 'paid', 'flat_id', pg_temp.flat(flat), 'business_date', coalesce(d, cf.today())))
$$;
create function pg_temp.charge(amt bigint) returns bigint language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'charge', 'amount_minor', amt, 'flat_set', 'all', 'narration', 'dues'))
$$;
create function pg_temp.reverse(seq bigint, repl bigint default null) returns bigint language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'reversal', 'target_seq', seq, 'reason', 'wrong',
    'narration', 'correction', 'replacement_amount_minor', repl))
$$;
create function pg_temp.balance() returns bigint language sql as $$
  select coalesce((select balance_minor from public.ledger where society_id = 'soc_r' order by seq desc limit 1), 0)
$$;
create function pg_temp.row_at(s bigint) returns public.ledger language sql as $$
  select * from public.ledger where society_id = 'soc_r' and seq = s
$$;
create function pg_temp.owes(l text) returns bigint language sql as $$
  select outstanding_minor from public.flat_dues where society_id = 'soc_r' and label = l
$$;
select pg_temp.as_('tre');

-- ---- an empty society: the path where a missing coalesce would surface
select is(public.api_structuring('soc_r'), '[]'::jsonb, 'a society with no entries has no structuring, not a null');
select is((select count(*) from public.ledger where society_id = 'soc_r'), 0::bigint, 'and no ledger rows');
select is((public.api_report('soc_r', cf.fy_of('soc_r', cf.today()))->'balance_sheet'->>'cash_and_bank_minor')::bigint, 0::bigint,
  'and a report of zeros');
select is((select outstanding_minor from public.flat_dues where label = 'A-1' and society_id = 'soc_r'), 0::bigint,
  'a flat with no charge owes zero, not null');

-- ---- the running balance: all five effects, named (issue case 3)
create temp table seqs (k text primary key, seq bigint, before bigint);
-- Reads the balance BEFORE running the statement that posts.
create function pg_temp.keep(k text, stmt text) returns void language plpgsql as $$
declare
  before bigint := pg_temp.balance();
  s bigint;
begin
  execute 'select ' || stmt into s;
  insert into seqs values (k, s, before);
end
$$;
create function pg_temp.s(k text) returns bigint language sql as $$ select seq from seqs where seqs.k = $1 $$;
create function pg_temp.b(k text) returns bigint language sql as $$ select before from seqs where seqs.k = $1 $$;

select pg_temp.keep('r0', $x$pg_temp.receipt(500000)$x$);
select is((pg_temp.row_at(pg_temp.s('r0'))).amount_minor > 0, true, 'a receipt is positive');
select is((pg_temp.row_at(pg_temp.s('r0'))).balance_minor::bigint, (pg_temp.row_at(pg_temp.s('r0'))).amount_minor,
  'and raises the balance by itself');

select pg_temp.keep('e', $x$pg_temp.expense(125075)$x$);
select is((pg_temp.row_at(pg_temp.s('e'))).amount_minor < 0, true, 'an expense is negative');
select is(pg_temp.balance(), pg_temp.b('e') + (pg_temp.row_at(pg_temp.s('e'))).amount_minor, 'and lowers the balance by itself');
select pg_temp.keep('ev', $x$pg_temp.reverse(pg_temp.s('e'))$x$);
select is(pg_temp.balance(), pg_temp.b('e'), 'a reversed expense returns the balance to what it was before the pair');
select is((pg_temp.row_at(pg_temp.s('e'))).reversed_by_seq, pg_temp.s('ev'), 'the original stays, marked reversed');
select is((pg_temp.row_at(pg_temp.s('ev'))).reverses_seq, pg_temp.s('e'), 'and the reversal names it');

select pg_temp.keep('e2', $x$pg_temp.expense(100000)$x$);
select pg_temp.keep('ev2', $x$pg_temp.reverse(pg_temp.s('e2'), 90000)$x$);
select is(pg_temp.b('e2') - pg_temp.balance(), 90000::bigint, 'a reversal + replacement leaves only the replacement');

select pg_temp.keep('c', $x$pg_temp.charge(100000)$x$);
select is(pg_temp.balance(), pg_temp.b('c'), 'a charge moves no cash');
select pg_temp.keep('cv', $x$pg_temp.reverse(pg_temp.s('c'))$x$);
select is(pg_temp.balance(), pg_temp.b('cv'), 'nor does a charge reversal');
select is((select string_agg(effect || '=' || is_cash, ',' order by effect) from
            (select distinct effect, is_cash from public.ledger where society_id = 'soc_r') x),
  'charge=false,charge_reversal=false,expense=true,receipt=true,reversal=true',
  'is_cash holds for exactly the three cash effects, of all five');
select is((select count(*) from public.flat_dues where society_id = 'soc_r' and charged_minor <> 0), 0::bigint,
  'a charge with a remainder, reversed, leaves every flat at exactly zero: lines negated, not recomputed');

-- ---- what a flat owes (issue case 4)
select pg_temp.keep('due', $x$pg_temp.charge(30000)$x$);
select pg_temp.keep('pa', $x$pg_temp.receipt(15000, 'A-1')$x$);
select pg_temp.keep('pb', $x$pg_temp.receipt(10000, 'A-2')$x$);
select pg_temp.keep('pc', $x$pg_temp.receipt(4000, 'A-3')$x$);
select ok(pg_temp.owes('A-1') < 0, 'a flat that overpaid has a negative outstanding: paid in advance, not zero');
select is(pg_temp.owes('A-2'), 0::bigint, 'a flat that paid exactly owes zero');
select ok(pg_temp.owes('A-3') > 0, 'a flat that underpaid owes the difference');
select is((select sum(charged_minor - paid_minor - outstanding_minor) from public.flat_dues where society_id = 'soc_r'),
  0::numeric, 'outstanding is charged minus paid on every flat');
select pg_temp.keep('rv', $x$pg_temp.reverse(pg_temp.s('pc'))$x$);
select is(pg_temp.owes('A-3'), 10000::bigint, 'a reversed receipt puts the arrears back: the reversal carries the flat');
select pg_temp.keep('rr', $x$pg_temp.reverse(pg_temp.s('pb'), 6000)$x$);
select is(pg_temp.owes('A-2'), 4000::bigint, 'and a replaced receipt counts only the replacement');

-- ---- structuring at its window boundary
update public.societies set structuring_window_days = 30 where id = 'soc_r';
create function pg_temp.crossed(payee text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(s), '[]') from jsonb_array_elements(public.api_structuring('soc_r')) s
   where lower(s->>'counterparty') = lower(payee) $$;
-- Each below the 1,000,000 limit; together over it.
select pg_temp.expense(600000, 'Edge Co', cf.today() - 29);
select is(jsonb_array_length(pg_temp.crossed('Edge Co')), 0, 'one below-limit payment is not an aggregate');
select pg_temp.expense(600000, 'Edge Co', cf.today());
select is(jsonb_array_length(pg_temp.crossed('Edge Co')->0->'constituents'), 2, 'a day inside the window: two payments crossed, shown as one');
select is((pg_temp.crossed('Edge Co')->0->>'total_minor')::bigint, 1200000::bigint, 'with their total');
select pg_temp.expense(600000, 'Out Co', cf.today() - 30);
select pg_temp.expense(600000, 'Out Co', cf.today());
select is(jsonb_array_length(pg_temp.crossed('Out Co')), 0, 'exactly the window apart is outside it: days are counted from the later payment');
select pg_temp.expense(500000, 'Flat Co');
select pg_temp.expense(500000, 'flat co ');
select is(jsonb_array_length(pg_temp.crossed('Flat Co')), 0, 'exactly the limit has not crossed it');
select pg_temp.expense(1, 'Flat Co');
select is(jsonb_array_length(pg_temp.crossed('Flat Co')), 1, 'one paisa more has, and spelling the payee differently does not hide it');
select pg_temp.keep('rs', $x$pg_temp.expense(600000, 'Rev Co')$x$);
select pg_temp.expense(600000, 'Rev Co');
select pg_temp.reverse(pg_temp.s('rs'));
select is(jsonb_array_length(pg_temp.crossed('Rev Co')), 0, 'a reversed payment no longer counts towards crossing');

-- ---- the report
create function pg_temp.report(fy text default null) returns jsonb language sql as $$
  select public.api_report('soc_r', coalesce(fy, cf.fy_of('soc_r', cf.today()))) $$;
select is((pg_temp.report()->'balance_sheet'->>'total_assets_minor')::bigint,
          (pg_temp.report()->'balance_sheet'->>'total_funds_and_liabilities_minor')::bigint, 'the balance sheet balances');
select is((pg_temp.report()->'balance_sheet'->>'cash_and_bank_minor')::bigint, pg_temp.balance(),
  'its cash is the ledger''s running balance');
select is((pg_temp.report()->'income_expenditure'->>'surplus_minor')::bigint,
          (pg_temp.report()->'income_expenditure'->>'total_income_minor')::bigint
          - (pg_temp.report()->'income_expenditure'->>'total_expenditure_minor')::bigint, 'surplus is income less expenditure');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.report()->'reversals') r
                   where (r->>'reverses_seq')::bigint = pg_temp.s('e') and r->>'reason' = 'wrong'),
  'reversed entries always appear in the report, with their reason');
select ok((pg_temp.report()->>'true_and_fair') like '%true and fair view%', 'and it carries the true and fair wording');
select is(jsonb_array_length(pg_temp.report()->'structuring') > 0, true, 'the aggregates reach the report');
select throws_like($$select public.api_report('soc_r', 'last year')$$, '%must look like%', 'a malformed year is refused');

-- ---- a closed year: an adjusting entry and years
create function pg_temp.fy_last() returns text language sql as $$
  select cf.fy_of('soc_r', (cf.fy_bounds('soc_r', cf.fy_of('soc_r', cf.today()))).starts - 1) $$;
select pg_temp.keep('old', $x$pg_temp.expense(70000, 'Old Co', (cf.fy_bounds('soc_r', pg_temp.fy_last())).ends)$x$);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.auditor_appointments (society_id, person_id, fy, appointment_seq, appointing_set)
  values ('soc_r', api_add_person('soc_r', 'CA Aud', 'aud@r.test'), pg_temp.fy_last(), 1, '{}');
select pg_temp.as_('tre');
select api_register_key(pg_temp.uid('aud'), 'soc_r', md5('aud') || md5('aud'));
create function pg_temp.close_last() returns void language plpgsql as $$
declare i jsonb := api_close_intent(pg_temp.uid('aud'), 'soc_r', pg_temp.fy_last(), 'qualified', 'Limited evidence.');
begin
  perform api_close_year(pg_temp.uid('aud'), 'soc_r', pg_temp.fy_last(), 'qualified', 'Limited evidence.',
    (i->>'through_seq')::bigint, (i->>'key_seq')::bigint, repeat('ab', 64));
end
$$;
create temp table filed as select pg_temp.report(pg_temp.fy_last())->'income_expenditure' as ie;
select pg_temp.close_last();
select pg_temp.keep('adj', $x$pg_temp.reverse(pg_temp.s('old'))$x$);
select ok(exists (select 1 from jsonb_array_elements(pg_temp.report()->'adjusting_entries') a
                   where (a->>'reverses_seq')::bigint = pg_temp.s('old') and a->>'corrects_fy' = pg_temp.fy_last()
                     and a->>'reason' = 'wrong'),
  'a reversal against a closed year is disclosed by a generated section, naming the year it corrects');
select is(pg_temp.report(pg_temp.fy_last())->'income_expenditure', (select ie from filed),
  'and the closed year''s figures stay as filed');
select is((select y->>'headline' from jsonb_array_elements(public.api_years('soc_r')) y where y->>'fy' = pg_temp.fy_last()),
  'qualified', 'api_years carries the year''s headline opinion');

-- ---- mismatch reports: one per resident, updated rather than duplicated
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_r', api_add_person('soc_r', 'Res', 'res@r.test'), pg_temp.flat('A-1'), 'owner');
select pg_temp.as_('res');
select public.api_report_mismatch('soc_r', 'aa', 5, 'bb', 'first');
select public.api_report_mismatch('soc_r', 'cc', 6, 'dd', 'again');
select is((select count(*) || ':' || max(note) from public.mismatch_reports where society_id = 'soc_r'), '1:again',
  'a second report updates the first, so the figure counts residents');
select pg_temp.as_('tre');
select throws_like($$select public.api_report_mismatch('soc_r', 'aa', 5, 'bb', 'x')$$, '%only a resident%',
  'someone with no tenure cannot report one');

select * from finish();
rollback;
