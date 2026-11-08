-- Reading part of the ledger (#102). Each read is checked against the ledger
-- view it narrows, so a page can only ever be a slice of what the view says.
begin;
select plan(39);

create temp table u (k text primary key, id uuid);
insert into u select k, gen_random_uuid()
  from unnest(array['pres', 'tre', 'sec', 'm1', 'm2', 'aud', 'res', 'res2', 'out']) k;
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@p.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_p', 'name', 'Page CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@p.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@p.test', 'role', 'treasurer',
      'tasks', '["propose_expenses","raise_monthly_charges"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@p.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@p.test'), jsonb_build_object('name', 'M2', 'email', 'm2@p.test')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_p', 1, 'A-1'), ('soc_p', 2, 'A-2'), ('soc_p', 3, 'A-3');
create function pg_temp.flat(l text) returns text language sql as $$
  select id from public.flats where society_id = 'soc_p' and label = l $$;
create function pg_temp.post(p jsonb) returns bigint language plpgsql as $$
declare
  pseq bigint := (api_propose(pg_temp.uid('tre'), 'soc_p', p)->>'seq')::bigint;
  k text;
  st text;
begin
  foreach k in array array['tre', 'sec', 'pres', 'm1', 'm2'] loop
    perform api_register_key(pg_temp.uid(k), 'soc_p', md5(k) || md5(k));
    st := api_cast(pg_temp.uid(k), 'soc_p', pseq, 'approve',
      (cf.latest_key('soc_p', cf.person(pg_temp.uid(k), 'soc_p'))).sequence, repeat('ab', 64))->>'status';
    exit when st = 'posted';
  end loop;
  return (select min(sequence) from public.chain_entries where society_id = 'soc_p' and kind = 'posting'
           and (body->>'proposal_seq')::bigint = pseq);
end
$$;
create function pg_temp.expense(amt bigint, payee text, d date default null, cat text default 'repairs') returns bigint
language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'expense', 'amount_minor', amt, 'counterparty', payee,
    'category', cat, 'narration', 'work for ' || payee, 'business_date', coalesce(d, cf.today())))
$$;
create function pg_temp.receipt(amt bigint, flat text) returns bigint language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'receipt', 'amount_minor', amt, 'counterparty', 'Flat ' || flat,
    'category', 'dues', 'narration', 'paid', 'flat_id', pg_temp.flat(flat)))
$$;
create temp table s (k text primary key, seq bigint);

-- ---- a ledger with every kind of row
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_p', api_add_person('soc_p', 'Res', 'res@p.test'), pg_temp.flat('A-1'), 'owner');
select api_add_tenure('soc_p', api_add_person('soc_p', 'Res2', 'res2@p.test'), pg_temp.flat('A-2'), 'owner');
insert into public.auditor_appointments (society_id, person_id, fy, appointment_seq, appointing_set)
  values ('soc_p', api_add_person('soc_p', 'CA Aud', 'aud@p.test'), '2099-00', 1, '{}');
select pg_temp.as_('tre');
insert into s select 'paint', pg_temp.expense(125075, 'Sharma Paints');
select pg_temp.receipt(30000, 'A-1');
insert into s select 'wrong', pg_temp.expense(40000, 'Old Vendor');
select pg_temp.post(jsonb_build_object('action', 'reversal', 'target_seq', (select seq from s where k = 'wrong'),
  'reason', 'entered twice', 'narration', 'fix'));
select pg_temp.post(jsonb_build_object('action', 'charge', 'amount_minor', 90000, 'flat_set', 'all', 'narration', 'dues'));
select pg_temp.expense(5000, 'sharma paints ');
do $$ begin for i in 1..8 loop perform pg_temp.receipt(1000 + i, 'A-2'); end loop; end $$;
select pg_temp.expense(600000, 'Edge Co', cf.today() - 29);
select pg_temp.expense(600000, 'Edge Co');
select pg_temp.expense(600000, 'Edge Co', cf.today() - 30);

create function pg_temp.page(f text default 'all', q text default null, lim int default 200, before bigint default null,
  cats text[] default null) returns jsonb language sql as $$
  select public.api_ledger_page('soc_p', before, lim, f, q, cats) $$;
create function pg_temp.seqs(j jsonb) returns bigint[] language sql as $$
  select coalesce(array_agg((r->>'seq')::bigint order by ord), '{}') from jsonb_array_elements(j->'rows') with ordinality x(r, ord) $$;
create function pg_temp.view_seqs(w text default 'true') returns bigint[] language plpgsql as $$
declare out bigint[];
begin
  execute format('select coalesce(array_agg(seq order by seq desc), ''{}'') from public.ledger l where society_id = %L and (%s)', 'soc_p', w) into out;
  return out;
end $$;

-- ---- paging
select is(pg_temp.seqs(pg_temp.page(lim => 5)), (pg_temp.view_seqs())[1:5], 'a page is the newest rows of the view, newest first');
create function pg_temp.walk(lim int) returns bigint[] language plpgsql as $$
declare acc bigint[] := '{}'; p jsonb; b bigint; n int := 0;
begin
  loop
    p := pg_temp.page(lim => lim, before => b);
    acc := acc || pg_temp.seqs(p);
    b := (p->>'next_before')::bigint;
    n := n + 1;
    exit when b is null or n > 100;
  end loop;
  return acc;
end $$;
select is(pg_temp.walk(7), pg_temp.view_seqs(), 'walking every page gives exactly the view, each row once');
select is(pg_temp.walk(1), pg_temp.view_seqs(), 'and so does a page size of one');
select is(pg_temp.page()->'next_before', 'null'::jsonb, 'the last page says so with a null next_before');
select is(pg_temp.page(lim => cardinality(pg_temp.view_seqs()))->'next_before', 'null'::jsonb,
  'a page exactly as long as what is left is still the last page');
select ok(pg_temp.page(lim => 3)->>'next_before' is not null, 'and a page with more after it says that too');
select is((select (r->>'balance_minor')::numeric from jsonb_array_elements(pg_temp.page(lim => 1)->'rows') r),
          (select balance_minor from public.ledger where society_id = 'soc_p' order by seq desc limit 1),
  'balance_minor is the view''s running balance, not one recomputed over the page');
select is(array(select jsonb_object_keys(pg_temp.page(lim => 1)->'rows'->0) order by 1),
          array(select column_name::text from information_schema.columns
                 where table_schema = 'public' and table_name = 'ledger' order by 1),
  'a row has exactly the columns of the ledger view');

-- ---- filters, as the contract tables them
select is(pg_temp.seqs(pg_temp.page('in')), pg_temp.view_seqs('is_cash and amount_minor > 0'), 'in: cash with a positive amount');
select is(pg_temp.seqs(pg_temp.page('out')), pg_temp.view_seqs('is_cash and amount_minor < 0'), 'out: cash with a negative amount');
select is(pg_temp.seqs(pg_temp.page('charges')), pg_temp.view_seqs('not is_cash'), 'charges: everything that is not cash');
select is(pg_temp.seqs(pg_temp.page('reversed')), pg_temp.view_seqs('reversed_by_seq is not null or reverses_seq is not null'),
  'reversed: both the original and its reversal');
select is(cardinality(pg_temp.seqs(pg_temp.page('in'))) + cardinality(pg_temp.seqs(pg_temp.page('out')))
          + cardinality(pg_temp.seqs(pg_temp.page('charges'))), cardinality(pg_temp.view_seqs()),
  'in, out and charges together cover every row once');
select throws_like($$select pg_temp.page('spent')$$, '%filter is all, in, out%', 'an unknown filter is refused');

-- disputed: by the entry, or by its payee ignoring case and spaces, open only
select pg_temp.as_('res');
create temp table fl (k text primary key, seq bigint);
insert into fl select 'by_seq', api_raise_flag('soc_p', jsonb_build_object('scope', 'entries',
  'target_seqs', jsonb_build_array((select seq from s where k = 'paint')), 'text', 'what was this'));
select pg_temp.as_('res2');
insert into fl select 'by_payee', api_raise_flag('soc_p', jsonb_build_object('scope', 'counterparty',
  'counterparty', 'EDGE CO', 'text', 'too many'));
select pg_temp.as_('tre');
select is(pg_temp.seqs(pg_temp.page('disputed')),
  pg_temp.view_seqs($w$seq = (select seq from s where k = 'paint') or lower(btrim(counterparty)) = 'edge co'$w$),
  'disputed: the flagged entry, and every entry to the flagged payee whatever its case');
select pg_temp.as_('res2');
select api_flag_note('soc_p', (select seq from fl where k = 'by_payee'), 'resolved', 'answered');
select pg_temp.as_('tre');
select is(pg_temp.seqs(pg_temp.page('disputed')), array[(select seq from s where k = 'paint')],
  'a flag its author resolved no longer marks anything');

-- ---- search, as the ledger screen's
select is(pg_temp.seqs(pg_temp.page(q => '   ')), pg_temp.view_seqs(), 'a blank search matches everything');
select is(pg_temp.seqs(pg_temp.page(q => '#' || (select seq from s where k = 'paint'))), array[(select seq from s where k = 'paint')],
  '#n is that entry exactly');
select is(pg_temp.seqs(pg_temp.page(q => 'SHARMA')), pg_temp.view_seqs($w$counterparty ilike '%sharma%'$w$),
  'text matches the payee ignoring case');
select is(pg_temp.seqs(pg_temp.page(q => 'twice')), pg_temp.view_seqs($w$reason ilike '%twice%'$w$), 'and the reason');
select is(pg_temp.seqs(pg_temp.page(q => '₹1,250')), array[(select seq from s where k = 'paint')],
  'a figure as typed, with ₹ and commas, finds its amount by digit prefix');
select is(pg_temp.seqs(pg_temp.page(q => '%')), '{}'::bigint[], 'a % is a character, not a wildcard');
select is(pg_temp.seqs(pg_temp.page(q => 'House upkeep', cats => array['repairs'])), pg_temp.view_seqs($w$category = 'repairs'$w$),
  'a category label the client matched arrives as its stored value');
select is(pg_temp.seqs(pg_temp.page('out', 'sharma')), pg_temp.view_seqs($w$is_cash and amount_minor < 0 and counterparty ilike '%sharma%'$w$),
  'a filter and a search narrow together');

-- ---- refusals
select throws_like($$select pg_temp.page(lim => 0)$$, '%between 1 and 200%', 'a limit of 0 is refused');
select throws_like($$select pg_temp.page(lim => 201)$$, '%between 1 and 200%', 'and 201 is refused, not clamped');
select pg_temp.as_('out');
select throws_like($$select pg_temp.page()$$, '%not a member%', 'someone outside the society reads nothing');
select pg_temp.as_('tre');

-- ---- one flat's statement
select is(pg_temp.seqs(public.api_flat_statement('soc_p', pg_temp.flat('A-2'), null, 200)),
  pg_temp.view_seqs(format('flat_id = %L', pg_temp.flat('A-2'))), 'a flat''s statement is exactly its rows');
select throws_like($$select public.api_flat_statement('soc_p', 'flt_nope', null, 10)$$, '%unknown flat%', 'an unknown flat is refused');

-- ---- recent receipts: never a second door to the owing list
create function pg_temp.receipt_flats() returns text[] language sql as $$
  select coalesce(array_agg(x->>'flat_id' order by x->>'flat_id'), '{}') from jsonb_array_elements(public.api_recent_receipts('soc_p', 6)) x $$;
select is(cardinality(pg_temp.receipt_flats()), 3, 'the committee sees every flat');
select is((select jsonb_array_length(x->'rows') from jsonb_array_elements(public.api_recent_receipts('soc_p', 6)) x
            where x->>'flat_id' = pg_temp.flat('A-2')), 6, 'at most the asked-for number per flat, newest first');
select pg_temp.as_('res');
select is(pg_temp.receipt_flats(), array[pg_temp.flat('A-1')], 'a resident sees only their own flat');
select pg_temp.as_('aud');
select is(cardinality(pg_temp.receipt_flats()), 3, 'an auditor sees every flat');
select pg_temp.as_('tre');

-- ---- payees, and the hint against the aggregate
select ok((select bool_and(x->>'counterparty' <> 'Old Vendor') from jsonb_array_elements(public.api_payees('soc_p', 50)) x),
  'a reversed payment does not make a payee');
-- The aggregate chains overlapping windows into one group (here all three Edge
-- Co payments). The hint is the one window ending on the date, as the contract
-- says, so it is checked against that window, through the same rows.
select is((public.api_structuring_hint('soc_p', ' edge CO ')->>'payments')::int,
          (select count(*)::int from public.ledger where society_id = 'soc_p' and lower(btrim(counterparty)) = 'edge co'
             and effect = 'expense' and tier = 'pair' and reversed_by_seq is null
             and business_date > cf.today() - 30 and business_date <= cf.today()),
  'the hint counts the window ending today, ignoring the payee''s case and spaces');
select is((public.api_structuring_hint('soc_p', 'Edge Co')->>'payments')::int, 2,
  'which includes the day 29 days back and excludes the day 30 days back, as the aggregate''s window does');
select is(public.api_structuring_hint('soc_p', 'Edge Co')->>'since', (cf.today() - 29)::text,
  'since is the window''s first day');
select is((public.api_structuring_hint('soc_p', 'Edge Co', cf.today() - 1)->>'payments')::int, 2,
  'a window ending yesterday holds the two payments before today');
select is((public.api_structuring_hint('soc_p', 'Nobody')->>'payments')::int, 0, 'a payee with nothing is a zero, not a null');

select * from finish();
rollback;
