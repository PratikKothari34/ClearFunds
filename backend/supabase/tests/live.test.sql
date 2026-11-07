-- api_summary and api_preview_charge (#103): the figures the dashboard shows.
-- Asserted as rules, not sample totals.
begin;
select plan(25);

create temp table u (k text primary key, id uuid);
insert into u select k, gen_random_uuid() from unnest(array['pres', 'tre', 'sec', 'm1', 'm2', 'out']) k;
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@l.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_l', 'name', 'Live CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@l.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@l.test', 'role', 'treasurer',
      'tasks', '["propose_expenses","raise_monthly_charges"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@l.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@l.test'), jsonb_build_object('name', 'M2', 'email', 'm2@l.test')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_l', 1, 'A-1'), ('soc_l', 2, 'A-2'), ('soc_l', 3, 'A-3');
create function pg_temp.flat(l text) returns text language sql as $$
  select id from public.flats where society_id = 'soc_l' and label = l $$;
create function pg_temp.post(p jsonb) returns bigint language plpgsql as $$
declare
  pseq bigint := (api_propose(pg_temp.uid('tre'), 'soc_l', p)->>'seq')::bigint;
  k text;
  st text;
begin
  foreach k in array array['tre', 'sec', 'pres', 'm1', 'm2'] loop
    perform api_register_key(pg_temp.uid(k), 'soc_l', md5(k) || md5(k));
    st := api_cast(pg_temp.uid(k), 'soc_l', pseq, 'approve',
      (cf.latest_key('soc_l', cf.person(pg_temp.uid(k), 'soc_l'))).sequence, repeat('ab', 64))->>'status';
    exit when st = 'posted';
  end loop;
  return (select min(sequence) from public.chain_entries where society_id = 'soc_l' and kind = 'posting'
           and (body->>'proposal_seq')::bigint = pseq);
end
$$;
create function pg_temp.expense(amt bigint, cat text default 'repairs') returns bigint language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'expense', 'amount_minor', amt, 'counterparty', 'Vendor',
    'category', cat, 'narration', 'work'))
$$;
create function pg_temp.receipt(amt bigint, flat text default null) returns bigint language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'receipt', 'amount_minor', amt, 'counterparty', 'Payer',
    'category', 'dues', 'narration', 'paid', 'flat_id', pg_temp.flat(flat)))
$$;
create function pg_temp.reverse(seq bigint) returns bigint language sql as $$
  select pg_temp.post(jsonb_build_object('action', 'reversal', 'target_seq', seq, 'reason', 'wrong', 'narration', 'fix'))
$$;
create function pg_temp.sum_() returns jsonb language sql as $$ select public.api_summary('soc_l') $$;
create function pg_temp.mon() returns jsonb language sql as $$
  select m from jsonb_array_elements(pg_temp.sum_()->'months') m where m->>'month' = to_char(cf.today(), 'YYYY-MM') $$;
create function pg_temp.mi(f text) returns bigint language sql as $$ select (pg_temp.mon()->>f)::bigint $$;
create function pg_temp.si(f text) returns bigint language sql as $$ select (pg_temp.sum_()->>f)::bigint $$;

select pg_temp.as_('tre');

-- ---- nothing yet: the filter returns null, and coalesce makes it a zero
select is(pg_temp.sum_()->'months', '[]'::jsonb, 'an empty society has no months, not a null');
select is(pg_temp.si('balance_minor') || '/' || pg_temp.si('outstanding_minor') || '/' || pg_temp.si('flats_outstanding')
          || '/' || pg_temp.si('fy_spend_total_minor'), '0/0/0/0', 'and every total is a zero, not a null');

-- ---- money in and money out, separately (issue case 1)
select pg_temp.receipt(700000);
select is(pg_temp.mi('in_minor'), 700000::bigint, 'a receipt lands in money in');
select is(pg_temp.mi('out_minor'), 0::bigint, 'and not in money out');
create temp table seqs (k text primary key, seq bigint);
insert into seqs select 'e', pg_temp.expense(250000);
select is(pg_temp.mi('out_minor'), 250000::bigint, 'an expense lands in money out, as a positive figure');
select is(pg_temp.mi('in_minor'), 700000::bigint, 'and leaves money in alone');
select is(pg_temp.mi('in_minor') - pg_temp.mi('out_minor'), pg_temp.si('balance_minor'),
  'in less out is the balance, in a society one month old');

-- ---- zero (issue case 2): unreachable, so > 0 and < 0 do partition the cash rows
-- These refusals are load-bearing. api_summary splits cash on the sign, so the day a
-- zero-amount entry becomes reachable it silently drops out of both totals, with
-- every figure still plausible. Whoever relaxes a refusal below must handle that.
select throws_like($$select pg_temp.expense(0)$$, '%positive%', 'a zero expense cannot be proposed');
select throws_like($$select pg_temp.receipt(0)$$, '%positive%', 'nor a zero receipt');
select throws_like($$select pg_temp.post(jsonb_build_object('action', 'reversal', 'target_seq', (select seq from seqs where k = 'e'),
    'reason', 'wrong', 'narration', 'fix', 'replacement_amount_minor', 0))$$, '%positive%', 'nor a zero replacement');
select is((select count(*) from public.ledger where society_id = 'soc_l' and is_cash and coalesce(amount_minor, 0) = 0),
  0::bigint, 'so no cash row is left out of both halves');

-- ---- a reversal counts against the side it undoes
select is((pg_temp.sum_()->'fy_spend'->0->>'amount_minor')::bigint, 250000::bigint, 'spend is listed by category');
select pg_temp.reverse((select seq from seqs where k = 'e'));
select is(pg_temp.si('fy_spend_total_minor'), 0::bigint, 'a reversed expense leaves the year''s spend');
select is(pg_temp.sum_()->'fy_spend', '[]'::jsonb, 'and its category, rather than a line of zero');
select is(pg_temp.mi('in_minor') - pg_temp.mi('out_minor'), pg_temp.si('balance_minor'),
  'in less out still is the balance: the reversal is shown gross on the money-in side');

-- ---- how much of each side is reversals: disclosed, not netted
select is(pg_temp.mi('reversed_in_minor'), 250000::bigint, 'the reversed expense is named as such within money in');
select is(pg_temp.mi('reversed_out_minor'), 0::bigint, 'and nothing was reversed out');
insert into seqs select 'r', pg_temp.receipt(40000);
select pg_temp.reverse((select seq from seqs where k = 'r'));
select is(pg_temp.mi('reversed_out_minor'), 40000::bigint, 'a reversed receipt is named within money out');
select ok(pg_temp.mi('reversed_in_minor') <= pg_temp.mi('in_minor') and pg_temp.mi('reversed_out_minor') <= pg_temp.mi('out_minor'),
  'each is a part of its side');
select is(pg_temp.mi('in_minor') - pg_temp.mi('out_minor'), pg_temp.si('balance_minor'), 'and the identity still holds');

-- ---- a credit is not netted against a debt (issue case 4)
select pg_temp.post(jsonb_build_object('action', 'charge', 'amount_minor', 30000, 'flat_set', 'all', 'narration', 'dues'));
select pg_temp.receipt(25000, 'A-1');
select is(pg_temp.si('outstanding_minor'), (select sum(outstanding_minor)::bigint from public.flat_dues
   where society_id = 'soc_l' and outstanding_minor > 0), 'the society''s arrears are the sum of the flats that owe');
select is(pg_temp.si('flats_outstanding') || ' of ' || pg_temp.si('flats'), '2 of 3', 'and the count leaves out the flat in credit');

-- ---- the preview, and who may read
select is((select (a->>'flats')::int * (a->>'base_minor')::bigint + (a->>'extra_flats')::int
             from public.api_preview_charge('soc_l', 'all', 100) a), 100::bigint,
  'a preview accounts for every paisa: base times flats, plus the remainder');
select is(public.api_preview_charge('soc_l', 'all', 0), null, 'nothing to preview for zero');
select pg_temp.as_('out');
select throws_like($$select public.api_summary('soc_l')$$, '%not a member%', 'someone outside the society reads no totals');

select * from finish();
rollback;
